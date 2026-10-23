"use client";

// Grafik-Editor für [[jsxgraph]]: Zeichenfläche einstellen, Punkte, Regler, Funktionen, Strecken und
// Texte anlegen, Punkte/Regler an Eingaben binden. Live-Vorschau mit JSXGraph.

import { useEffect, useMemo, useRef, useState } from "react";
import { editorContext } from "@/lib/editor/context";
import { useDialogs } from "../Dialogs";
import { Modal } from "../Modal";
import {
  COLORS, type JsxElement, type JsxModel, generateJsx, newElement, newModel,
} from "@/lib/stack/jsxbuilder";
import { IconChart, IconCode, IconDown, IconPlus, IconTrash, IconUp } from "../icons";
import { useT } from "../I18nProvider";
import { LocalizedError, type MessageKey, type Msg } from "@/lib/i18n";
import { withParts } from "./richText";

export interface JsxApplyResult {
  code: string;
  /** Eingaben, die es in der Aufgabe noch nicht gibt (mit passendem Typ der Bindung). */
  newInputs: { name: string; kind: "point" | "slider" | "list" }[];
  /** Alle gebundenen Eingaben. */
  boundInputs: string[];
  hideInputs: boolean;
}

const KIND_LABEL: Record<JsxElement["kind"], MessageKey> = {
  point: "jsx.kinds.point", slider: "jsx.kinds.slider", function: "jsx.kinds.function", line: "jsx.kinds.line",
  text: "jsx.kinds.text", code: "jsx.kinds.code",
};

// ---- JSXGraph einmalig laden -----------------------------------------------------------------------

type JXGType = { JSXGraph: { initBoard: (...a: unknown[]) => unknown; freeBoard: (b: unknown) => void } };
let jxgPromise: Promise<JXGType> | null = null;
function loadJxg(): Promise<JXGType> {
  const w = window as unknown as { JXG?: JXGType };
  if (w.JXG) return Promise.resolve(w.JXG);
  if (!jxgPromise) {
    jxgPromise = new Promise((resolve, reject) => {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "/vendor/jsxgraph/jsxgraph.css";
      document.head.appendChild(css);
      const s = document.createElement("script");
      s.src = "/vendor/jsxgraph/jsxgraphcore.js";
      s.onload = () => (w.JXG ? resolve(w.JXG) : reject(new LocalizedError("jsx.preview.unavailable")));
      s.onerror = () => reject(new LocalizedError("jsx.preview.loadFailed"));
      document.head.appendChild(s);
    });
  }
  return jxgPromise;
}

/** {#var#} für die Vorschau durch aktuelle Werte der Fragevariablen ersetzen. */
function substituteCas(code: string): { code: string; missing: string[] } {
  const vars = new Map(editorContext.current.variables.map((v) => [v.name, v.value]));
  const missing: string[] = [];
  const out = code.replace(/\{#([\s\S]*?)#\}/g, (_, expr: string) => {
    const name = expr.trim();
    const v = vars.get(name);
    if (v !== undefined && /^[-+0-9.eE/ ()]+$/.test(v)) return `(${v})`;
    if (/^[-+0-9.eE]+$/.test(name)) return `(${name})`;
    missing.push(name);
    return "(1)";
  });
  return { code: out, missing: [...new Set(missing)] };
}

// ---- Vorschau ------------------------------------------------------------------------------------------

type Patch = Partial<JsxElement>;

/* eslint-disable @typescript-eslint/no-explicit-any -- JSXGraph-Objekte sind untypisiert */
/**
 * Macht die Elemente der Vorschau ziehbar und schreibt die neue Lage ins Modell zurück:
 * Punkte (x/y), Regler (Knopf → Startwert, Endpunkte/Linie → Position) und Funktionen (Verschiebung).
 * Nur Felder mit festen Zahlen werden überschrieben; Terme wie „a+1“ bleiben unangetastet.
 */
function attachDragging(board: any, objects: Record<string, any>, model: JsxModel, onMove: (id: string, p: Patch) => void) {
  const isNum = (v: string | undefined) => v === undefined || /^\s*-?\d+(\.\d+)?\s*$/.test(v);
  const [l, , r] = model.bbox.map(Number);
  const res = Math.pow(10, Math.floor(Math.log10(Math.max(Math.abs(r - l), 1e-6) / 50)));
  const round = (v: number, step = res) => {
    const d = Math.max(0, -Math.floor(Math.log10(step)) + (String(step).includes("5") ? 1 : 0));
    return String(+(Math.round(v / step) * step).toFixed(Math.min(d, 6)));
  };
  const moved = new Map<string, () => Patch>();
  const markOnDrag = (obj: any, id: string, patch: () => Patch) => obj?.on?.("drag", () => moved.set(id, patch));

  for (const el of model.elements) {
    const o = objects[el.name];
    if (!o) continue;
    if (el.kind === "point" && !el.fixed && isNum(el.x) && isNum(el.y)) {
      const snap = Number(el.snap) > 0 ? Number(el.snap) : res;
      markOnDrag(o, el.id, () => ({ x: round(o.X(), snap), y: round(o.Y(), snap) }));
    }
    if (el.kind === "slider") {
      const step = Number(el.step) > 0 ? Number(el.step) : res;
      if (isNum(el.start)) markOnDrag(o, el.id, () => ({ start: round(o.Value(), step) }));
      if ([el.x1, el.y1, el.x2, el.y2].every(isNum)) {
        const pos = () => ({ x1: round(o.point1.X()), y1: round(o.point1.Y()), x2: round(o.point2.X()), y2: round(o.point2.Y()) });
        for (const part of [o.point1, o.point2, o.baseline]) {
          try { part?.setAttribute({ fixed: false, frozen: false }); } catch { /* ältere JSXGraph-Version */ }
          markOnDrag(part, el.id, pos);
        }
      }
    }
  }

  // Funktionsgraphen sind in JSXGraph nicht ziehbar – eigene Verschiebung per Maus
  const funcs = model.elements.filter((e) => e.kind === "function" && isNum(e.dx) && isNum(e.dy) && objects[e.name]);
  const others = model.elements.filter((e) => e.kind !== "function").map((e) => objects[e.name]).filter(Boolean);
  let drag: { el: JsxElement & { kind: "function" }; curve: any; origY: (t: number) => number; start: number[]; dx: number; dy: number } | null = null;
  board.on("down", (e: any) => {
    const [px, py] = board.getMousePosition(e);
    if (others.some((o) => { try { return o.hasPoint(px, py); } catch { return false; } })) return;
    for (const el of funcs) {
      const curve = objects[el.name];
      if (el.kind === "function" && curve.hasPoint(px, py)) {
        drag = { el, curve, origY: curve.Y, start: board.getUsrCoordsOfMouse(e), dx: 0, dy: 0 };
        board.containerObj.style.cursor = "grabbing";
        return;
      }
    }
  });
  board.on("move", (e: any) => {
    if (!drag) return;
    const [x, y] = board.getUsrCoordsOfMouse(e);
    const d = drag;
    d.dx = x - d.start[0];
    d.dy = y - d.start[1];
    d.curve.Y = (t: number) => d.origY(t - d.dx) + d.dy;
    board.update();
  });
  board.on("up", () => {
    if (drag) {
      const { el, dx, dy } = drag;
      board.containerObj.style.cursor = "";
      drag = null;
      if (Math.abs(dx) > res / 2 || Math.abs(dy) > res / 2) {
        onMove(el.id, { dx: round(Number(el.dx || 0) + dx), dy: round(Number(el.dy || 0) + dy) });
      }
    }
    if (moved.size) {
      const all = [...moved.entries()];
      moved.clear();
      for (const [id, patch] of all) onMove(id, patch());
    }
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function Preview({ code, width, height, model, onMove }: {
  code: string; width: string; height: string; model: JsxModel; onMove: (id: string, p: Patch) => void;
}) {
  const t = useT();
  const host = useRef<HTMLDivElement>(null);
  // aktuelles Modell/Callback ohne Neuaufbau der Vorschau
  const latest = useRef({ model, onMove });
  latest.current = { model, onMove };
  // Fehler aus dem Grafik-Code (Text von JSXGraph/Browser) oder eigene Meldung (Msg, beim Anzeigen übersetzt)
  const [error, setError] = useState<string | Msg | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [missing, setMissing] = useState<string[]>([]);

  useEffect(() => {
    let board: unknown = null;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      loadJxg().then((JXG) => {
        if (cancelled || !host.current) return;
        host.current.innerHTML = "";
        const div = document.createElement("div");
        div.id = `jsxb-${Math.random().toString(36).slice(2)}`;
        div.className = "jxgbox";
        div.style.width = width;
        div.style.height = height;
        host.current.appendChild(div);
        const refs = [...code.matchAll(/input-ref-(\w+)="(\w+)"/g)].map((m) => ({ input: m[1], ref: m[2] }));
        const body = code.replace(/^\[\[jsxgraph[^\]]*\]\]/, "").replace(/\[\[\/jsxgraph\]\]\s*$/, "");
        const sub = substituteCas(body);
        setMissing(sub.missing);
        const vals: Record<string, string> = {};
        const show = (ref: string, v: string) => {
          const input = refs.find((r) => r.ref === ref)?.input ?? ref;
          if (vals[input] === v) return;
          vals[input] = v;
          setValues({ ...vals });
        };
        const r6 = (x: number) => Math.round(x * 1e4) / 1e4;
        type Pt = { X: () => number; Y: () => number; Value?: () => number; board: { on: (e: string, f: () => void) => void } };
        const fmt = (o: Pt) => (o.Value ? String(r6(o.Value())) : `[${r6(o.X())},${r6(o.Y())}]`);
        const stackJxg = {
          bind_point: (ref: string, p: Pt) => { const u = () => show(ref, fmt(p)); p.board.on("update", u); u(); },
          bind_slider: (ref: string, s: Pt) => { const u = () => show(ref, fmt(s)); s.board.on("update", u); u(); },
          bind_list_of: (ref: string, list: Pt[]) => { const u = () => show(ref, `[${list.map(fmt).join(",")}]`); list[0]?.board.on("update", u); u(); },
        };
        const orig = JXG.JSXGraph.initBoard;
        JXG.JSXGraph.initBoard = (...args: unknown[]) => (board = orig.apply(JXG.JSXGraph, args));
        try {
          // Elemente für das Ziehen zurückgeben (nur in der Vorschau)
          const names = latest.current.model.elements.map((e) => e.name).filter((n) => /^[A-Za-z_]\w*$/.test(n));
          const ret = `
return {${names.map((n) => `${JSON.stringify(n)}: typeof ${n} !== "undefined" ? ${n} : null`).join(", ")}};`;
          const fn = new Function("divid", "stack_jxg", "JXG", ...refs.map((r) => r.ref), sub.code + ret);
          const objects = fn(div.id, stackJxg, JXG, ...refs.map((r) => r.ref)) as Record<string, unknown>;
          if (board) attachDragging(board, objects, latest.current.model, (id, p) => latest.current.onMove(id, p));
          setError(null);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        } finally {
          JXG.JSXGraph.initBoard = orig;
        }
        setValues({ ...vals });
      }).catch((e) => setError(e instanceof LocalizedError ? e.msg : e instanceof Error ? e.message : String(e)));
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      const JXG = (window as unknown as { JXG?: JXGType }).JXG;
      if (board && JXG) { try { JXG.JSXGraph.freeBoard(board); } catch { /* ignorieren */ } }
    };
  }, [code, width, height]);

  return (
    <div className="jsxb-preview">
      <div className="jsxb-board" ref={host} />
      {error && <div className="issue error"><b>{t("common.error")}</b> {typeof error === "string" ? error : t(error)}</div>}
      {missing.length > 0 && <div className="issue info">{t("jsx.preview.replaced", { names: missing.map((m) => `{#${m}#}`).join(", ") })}</div>}
      {Object.keys(values).length > 0 && (
        <div className="jsxb-values">
          <span className="jsxb-values-label">{t("jsx.preview.values")}</span>
          {Object.entries(values).map(([k, v]) => <span key={k} className="jsxb-value"><span className="tok tok-input">{k}</span> = <code>{v}</code></span>)}
        </div>
      )}
    </div>
  );
}

// ---- Formular-Bausteine ------------------------------------------------------------------------------

function F({ label, err, children, wide }: { label: string; err?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`jsxb-f${wide ? " wide" : ""}${err ? " has-err" : ""}`}>
      <span>{label}</span>
      {children}
      {err && <em>{err}</em>}
    </label>
  );
}

function ColorPick({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const t = useT();
  return (
    <div className="jsxb-colors" role="radiogroup" aria-label={t("jsx.color")}>
      <button type="button" role="radio" aria-checked={value === ""} title={t("jsx.defaultColorTitle")} aria-label={t("jsx.defaultColor")}
        className={`jsxb-color std${value === "" ? " on" : ""}`} onClick={() => onChange("")} />
      {COLORS.map((c) => (
        <button key={c.value} type="button" role="radio" aria-checked={value === c.value} title={t(c.label)} aria-label={t(c.label)}
          className={`jsxb-color${value === c.value ? " on" : ""}`} style={{ background: c.value }} onClick={() => onChange(c.value)} />
      ))}
    </div>
  );
}

// ---- Dialog ---------------------------------------------------------------------------------------------

export default function JsxBuilder({ initial, inputs, notice, onApply, onClose }: {
  initial: JsxModel | null;
  inputs: { name: string; type: string }[];
  notice?: string;
  onApply: (r: JsxApplyResult) => void;
  onClose: () => void;
}) {
  const [model, setModel] = useState<JsxModel>(() => initial ?? newModel());
  const [openId, setOpenId] = useState<string | null>(null);
  const [created, setCreated] = useState<string[]>([]);
  const [hideInputs, setHideInputs] = useState(true);
  const [showCode, setShowCode] = useState(false);
  const t = useT();
  const gen = useMemo(() => generateJsx(model), [model]);
  const err = (id: string, field: string) => {
    const m = gen.errors.find((e) => e.id === id && e.field === field)?.msg;
    return m && t(m);
  };

  const dialogs = useDialogs();

  const set = (fn: (m: JsxModel) => void) => setModel((m) => { const n = structuredClone(m); fn(n); return n; });
  const setEl = (id: string, patch: Partial<JsxElement>) => set((m) => {
    const i = m.elements.findIndex((e) => e.id === id);
    if (i >= 0) m.elements[i] = { ...m.elements[i], ...patch } as JsxElement;
  });
  const add = (kind: JsxElement["kind"]) => {
    const e = newElement(model, kind);
    set((m) => { m.elements.push(e); });
    setOpenId(e.id);
  };
  const move = (id: string, d: -1 | 1) => set((m) => {
    const i = m.elements.findIndex((e) => e.id === id);
    const j = i + d;
    if (i < 0 || j < 0 || j >= m.elements.length) return;
    [m.elements[i], m.elements[j]] = [m.elements[j], m.elements[i]];
  });

  const inputNames = [...inputs.map((i) => i.name), ...created.filter((c) => !inputs.some((i) => i.name === c))];
  const allNames = new Set(inputNames);
  const createInput = async (elId: string) => {
    let n = 1;
    while (allNames.has(`ans${n}`)) n++;
    const answer = await dialogs.prompt({
      title: t("jsx.newInput.title"),
      label: t("jsx.newInput.label"),
      initial: `ans${n}`,
      mono: true,
      confirmLabel: t("jsx.newInput.create"),
      validate: ({ value }) => (/^[A-Za-z][A-Za-z0-9_]*$/.test(value.trim()) ? null : t("jsx.newInput.invalid")),
    });
    const name = answer?.trim();
    if (!name) return;
    if (!allNames.has(name)) setCreated((c) => [...c, name]);
    setEl(elId, { input: name } as Partial<JsxElement>);
  };
  const inputPick = (el: JsxElement & { input: string }) => (
    <F label={t("jsx.bindInput")} wide>
      <select className="sel" value={el.input} onChange={(e) => {
        if (e.target.value === "__new") createInput(el.id);
        else setEl(el.id, { input: e.target.value } as Partial<JsxElement>);
      }}>
        <option value="">{t("jsx.noInput")}</option>
        {inputNames.map((n) => (
          <option key={n} value={n}>{n}{created.includes(n) && !inputs.some((i) => i.name === n) ? ` (${t("jsx.inputIsNew")})` : ` (${inputs.find((i) => i.name === n)?.type ?? ""})`}</option>
        ))}
        <option value="__new">{t("jsx.createInput")}</option>
      </select>
    </F>
  );

  const points = model.elements.filter((e) => e.kind === "point").map((e) => e.name);
  const apply = () => {
    if (gen.errors.length) return;
    const bound = [...new Set(gen.bindings.map((b) => b.input))];
    const newInputs = bound.filter((n) => !inputs.some((i) => i.name === n)).map((name) => {
      const bs = gen.bindings.filter((b) => b.input === name);
      return { name, kind: bs.length > 1 ? "list" as const : bs[0].kind };
    });
    onApply({ code: gen.code, newInputs, boundInputs: bound, hideInputs });
  };

  const [l, top, r, b] = model.bbox;
  const setBox = (i: number, v: string) => set((m) => { m.bbox[i] = v; });

  return (
    <Modal className="jsxb" ariaLabel={t("jsx.title")} onClose={onClose} title={<><IconChart className="head-ico" /> {t("jsx.title")} <small>JSXGraph</small></>}>
        <div className="jsxb-body">
          <div className="jsxb-form">
            {notice && <div className="issue info">{notice}</div>}
            <section className="jsxb-sec">
              <h4>{t("jsx.board.heading")}</h4>
              <div className="jsxb-grid">
                <F label={t("jsx.board.width")} err={err("board", "width")}><input className="inp" value={model.width} onChange={(e) => set((m) => { m.width = e.target.value; })} /></F>
                <F label={t("jsx.board.height")} err={err("board", "height")}><input className="inp" value={model.height} onChange={(e) => set((m) => { m.height = e.target.value; })} /></F>
              </div>
              {model.boardInCode ? (
                <p className="jsxb-hint">
                  {model.boardVar
                    ? withParts(t("jsx.board.inCode"), { code: <code>{model.boardVar} = JXG.JSXGraph.initBoard(…)</code> })
                    : t("jsx.board.allCode")}
                </p>
              ) : (<>
              <div className="jsxb-grid" style={{ marginTop: 8 }}>
                <F label={t("jsx.board.xFrom")} err={err("board", "bbox0")}><input className="inp mono" value={l} onChange={(e) => setBox(0, e.target.value)} /></F>
                <F label={t("jsx.board.xTo")} err={err("board", "bbox2")}><input className="inp mono" value={r} onChange={(e) => setBox(2, e.target.value)} /></F>
                <F label={t("jsx.board.yFrom")} err={err("board", "bbox3")}><input className="inp mono" value={b} onChange={(e) => setBox(3, e.target.value)} /></F>
                <F label={t("jsx.board.yTo")} err={err("board", "bbox1")}><input className="inp mono" value={top} onChange={(e) => setBox(1, e.target.value)} /></F>
              </div>
              <div className="jsxb-checks">
                <label className="check"><input type="checkbox" checked={model.axis} onChange={(e) => set((m) => { m.axis = e.target.checked; })} /> {t("jsx.board.axis")}</label>
                <label className="check"><input type="checkbox" checked={model.grid} onChange={(e) => set((m) => { m.grid = e.target.checked; })} /> {t("jsx.board.grid")}</label>
                <label className="check"><input type="checkbox" checked={model.keepAspect} onChange={(e) => set((m) => { m.keepAspect = e.target.checked; })} /> {t("jsx.board.keepAspect")}</label>
              </div>
              </>)}
            </section>

            <section className="jsxb-sec">
              <h4>{t("jsx.elements.heading")}</h4>
              <div className="jsxb-add">
                {(["point", "slider", "function", "line", "text", "code"] as const).map((k) => (
                  <button key={k} type="button" className="btn small" onClick={() => add(k)}
                    disabled={(k === "line" && points.length < 2) || (k !== "code" && model.boardVar === "")}
                    title={k !== "code" && model.boardVar === "" ? t("jsx.elements.onlyCode")
                      : k === "line" && points.length < 2 ? t("jsx.elements.needTwoPoints") : undefined}>
                    <IconPlus /> {t(KIND_LABEL[k])}
                  </button>
                ))}
              </div>
              {model.elements.length === 0 && <div className="empty">{t("jsx.elements.empty")}</div>}
              {model.elements.map((el, i) => {
                const open = openId === el.id;
                const hasErr = gen.errors.some((e) => e.id === el.id);
                const summary = el.kind === "point" ? `(${el.x} | ${el.y})` : el.kind === "slider" ? `${el.min} … ${el.max}` : el.kind === "function" ? `f(x) = ${el.term}${Number(el.dx || 0) || Number(el.dy || 0) ? ` ${t("jsx.elements.shifted", { dx: el.dx || 0, dy: el.dy || 0 })}` : ""}` : el.kind === "line" ? `${el.p1} – ${el.p2}` : el.kind === "text" ? el.text : el.code.split("\n").find((l) => l.trim())?.trim() ?? "";
                return (
                  <div key={el.id} className={`jsxb-el${open ? " open" : ""}${hasErr ? " err" : ""}`}>
                    <div className="jsxb-el-head">
                      <button type="button" className="jsxb-el-toggle" onClick={() => setOpenId(open ? null : el.id)} aria-expanded={open}>
                        <i className="jsxb-dot" style={{ background: "color" in el && el.color ? el.color : "var(--ink-3)" }} />
                        <b>{el.name}</b>
                        <span className="jsxb-kind">{t(KIND_LABEL[el.kind])}</span>
                        <span className="jsxb-sum">{summary}</span>
                        {"input" in el && el.input && <span className="tok tok-input">{el.input}</span>}
                      </button>
                      <button type="button" className="btn ghost small" title={t("sections.moveUp")} disabled={i === 0} onClick={() => move(el.id, -1)}><IconUp /></button>
                      <button type="button" className="btn ghost small" title={t("sections.moveDown")} disabled={i === model.elements.length - 1} onClick={() => move(el.id, 1)}><IconDown /></button>
                      <button type="button" className="btn ghost small danger" title={t("jsx.elements.remove")} onClick={() => set((m) => { m.elements = m.elements.filter((x) => x.id !== el.id); })}><IconTrash /></button>
                    </div>
                    {open && (
                      <div className="jsxb-grid">
                        {el.kind === "code" ? (
                          <F label={t("jsx.fields.code")} wide>
                            <textarea className="inp mono jsxb-codearea" spellCheck={false} rows={Math.min(14, Math.max(3, el.code.split("\n").length + 1))}
                              value={el.code} onChange={(e) => setEl(el.id, { code: e.target.value })} />
                          </F>
                        ) : (
                          <F label={t("jsx.fields.name")} err={err(el.id, "name")}><input className="inp mono" value={el.name} onChange={(e) => setEl(el.id, { name: e.target.value })} /></F>
                        )}
                        {el.kind === "point" && <>
                          <F label="x" err={err(el.id, "x")}><input className="inp mono" value={el.x} onChange={(e) => setEl(el.id, { x: e.target.value })} /></F>
                          <F label="y" err={err(el.id, "y")}><input className="inp mono" value={el.y} onChange={(e) => setEl(el.id, { y: e.target.value })} /></F>
                          <F label={t("jsx.fields.snap")} err={err(el.id, "snap")}><input className="inp mono" placeholder={t("jsx.fields.snapFree")} value={el.snap} onChange={(e) => setEl(el.id, { snap: e.target.value })} /></F>
                          <div className="jsxb-checks wide">
                            <label className="check"><input type="checkbox" checked={el.fixed} onChange={(e) => setEl(el.id, { fixed: e.target.checked })} /> {t("jsx.fields.fixed")}</label>
                            <label className="check"><input type="checkbox" checked={el.showLabel} onChange={(e) => setEl(el.id, { showLabel: e.target.checked })} /> {t("jsx.fields.showName")}</label>
                          </div>
                          {inputPick(el)}
                        </>}
                        {el.kind === "slider" && <>
                          <F label={t("jsx.fields.label")}><input className="inp" placeholder={el.name} value={el.label} onChange={(e) => setEl(el.id, { label: e.target.value })} /></F>
                          <F label={t("jsx.fields.min")} err={err(el.id, "min")}><input className="inp mono" value={el.min} onChange={(e) => setEl(el.id, { min: e.target.value })} /></F>
                          <F label={t("jsx.fields.start")} err={err(el.id, "start")}><input className="inp mono" value={el.start} onChange={(e) => setEl(el.id, { start: e.target.value })} /></F>
                          <F label={t("jsx.fields.max")} err={err(el.id, "max")}><input className="inp mono" value={el.max} onChange={(e) => setEl(el.id, { max: e.target.value })} /></F>
                          <F label={t("jsx.fields.step")} err={err(el.id, "step")}><input className="inp mono" placeholder={t("jsx.fields.stepless")} value={el.step} onChange={(e) => setEl(el.id, { step: e.target.value })} /></F>
                          <F label={t("jsx.fields.posStart")} err={err(el.id, "x1") ?? err(el.id, "y1")}>
                            <span className="jsxb-pair"><input className="inp mono" value={el.x1} onChange={(e) => setEl(el.id, { x1: e.target.value })} /><input className="inp mono" value={el.y1} onChange={(e) => setEl(el.id, { y1: e.target.value })} /></span>
                          </F>
                          <F label={t("jsx.fields.posEnd")} err={err(el.id, "x2") ?? err(el.id, "y2")}>
                            <span className="jsxb-pair"><input className="inp mono" value={el.x2} onChange={(e) => setEl(el.id, { x2: e.target.value })} /><input className="inp mono" value={el.y2} onChange={(e) => setEl(el.id, { y2: e.target.value })} /></span>
                          </F>
                          {inputPick(el)}
                        </>}
                        {el.kind === "function" && <>
                          <F label="f(x) =" err={err(el.id, "term")} wide><input className="inp mono" value={el.term} onChange={(e) => setEl(el.id, { term: e.target.value })} /></F>
                          <F label={t("jsx.fields.fromX")} err={err(el.id, "from")}><input className="inp mono" placeholder="−∞" value={el.from} onChange={(e) => setEl(el.id, { from: e.target.value })} /></F>
                          <F label={t("jsx.fields.toX")} err={err(el.id, "to")}><input className="inp mono" placeholder="∞" value={el.to} onChange={(e) => setEl(el.id, { to: e.target.value })} /></F>
                          <F label={t("jsx.fields.shiftX")} err={err(el.id, "dx")}><input className="inp mono" value={el.dx ?? "0"} onChange={(e) => setEl(el.id, { dx: e.target.value })} /></F>
                          <F label={t("jsx.fields.shiftY")} err={err(el.id, "dy")}><input className="inp mono" value={el.dy ?? "0"} onChange={(e) => setEl(el.id, { dy: e.target.value })} /></F>
                          <F label={t("jsx.fields.lineWidth")} err={err(el.id, "width")}><input className="inp mono" value={el.width} onChange={(e) => setEl(el.id, { width: e.target.value })} /></F>
                          <div className="jsxb-checks"><label className="check"><input type="checkbox" checked={el.dashed} onChange={(e) => setEl(el.id, { dashed: e.target.checked })} /> {t("jsx.fields.dashed")}</label></div>
                        </>}
                        {el.kind === "line" && <>
                          <F label={t("jsx.fields.lineType")}>
                            <select className="sel" value={el.type} onChange={(e) => setEl(el.id, { type: e.target.value as "segment" | "line" | "arrow" })}>
                              <option value="segment">{t("jsx.fields.segment")}</option><option value="line">{t("jsx.fields.line")}</option><option value="arrow">{t("jsx.fields.arrow")}</option>
                            </select>
                          </F>
                          <F label={t("jsx.fields.fromPoint")} err={err(el.id, "p1")}>
                            <select className="sel" value={el.p1} onChange={(e) => setEl(el.id, { p1: e.target.value })}>
                              <option value="">–</option>{points.map((p) => <option key={p} value={p}>{p}</option>)}
                            </select>
                          </F>
                          <F label={t("jsx.fields.toPoint")}>
                            <select className="sel" value={el.p2} onChange={(e) => setEl(el.id, { p2: e.target.value })}>
                              <option value="">–</option>{points.map((p) => <option key={p} value={p}>{p}</option>)}
                            </select>
                          </F>
                          <div className="jsxb-checks"><label className="check"><input type="checkbox" checked={el.dashed} onChange={(e) => setEl(el.id, { dashed: e.target.checked })} /> {t("jsx.fields.dashed")}</label></div>
                        </>}
                        {el.kind === "text" && <>
                          <F label={t("jsx.fields.text")} wide><input className="inp" value={el.text} onChange={(e) => setEl(el.id, { text: e.target.value })} /></F>
                          <F label="x" err={err(el.id, "x")}><input className="inp mono" value={el.x} onChange={(e) => setEl(el.id, { x: e.target.value })} /></F>
                          <F label="y" err={err(el.id, "y")}><input className="inp mono" value={el.y} onChange={(e) => setEl(el.id, { y: e.target.value })} /></F>
                          <F label={t("jsx.fields.fontSize")} err={err(el.id, "size")}><input className="inp mono" value={el.size} onChange={(e) => setEl(el.id, { size: e.target.value })} /></F>
                        </>}
                        {"color" in el && <F label={t("jsx.color")} wide><ColorPick value={el.color} onChange={(c) => setEl(el.id, { color: c } as Partial<JsxElement>)} /></F>}
                      </div>
                    )}
                  </div>
                );
              })}
              <p className="jsxb-hint">
                {withParts(t("jsx.termsHint"), {
                  examples: <><code>x^2</code>, <code>sqrt(x)</code>, <code>sin(x)</code>, <code>%pi</code></>,
                  slider: <code>a</code>,
                  coord: <code>A_x</code>,
                  casvar: <code>{"{#name#}"}</code>,
                })}
              </p>
            </section>
          </div>

          <div className="jsxb-side">
            <Preview code={gen.errors.length ? "" : gen.code} width={model.width} height={model.height} model={model} onMove={setEl} />
            <p className="jsxb-hint drag-hint">{t("jsx.dragHint")}</p>
            {gen.errors.length > 0 && <div className="issue warning">{t("jsx.checkFields", { count: gen.errors.length })}</div>}
            <button type="button" className="btn small ghost" onClick={() => setShowCode(!showCode)}><IconCode /> {showCode ? t("jsx.hideCode") : t("jsx.showCode")}</button>
            {showCode && <pre className="jsxb-code">{gen.code}</pre>}
          </div>
        </div>
        <div className="jsxb-foot">
          {gen.bindings.length > 0 && (
            <label className="check" title={t("jsx.hideInputsTitle")}>
              <input type="checkbox" checked={hideInputs} onChange={(e) => setHideInputs(e.target.checked)} /> {t("jsx.hideInputs")}
            </label>
          )}
          <div className="spacer" />
          <button type="button" className="btn" onClick={onClose}>{t("common.cancel")}</button>
          <button type="button" className="btn primary" disabled={gen.errors.length > 0} onClick={apply}>
            {initial ? t("jsx.update") : t("jsx.insert")}
          </button>
        </div>
    </Modal>
  );
}
