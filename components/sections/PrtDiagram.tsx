"use client";

// Grafische Darstellung der Rückmeldebäume:
// PrtOverview zeigt, welche Teilaufgabe/Eingabe in welchem PRT ausgewertet wird,
// PrtTree zeichnet einen einzelnen Baum mit wahr/falsch-Zweigen.

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Prt, StackQuestion } from "@/lib/stack/model";
import { layoutPrt, prtOverview } from "@/lib/stack/prtgraph";

// ---- Übersicht: Teilaufgabe → Eingabe → PRT ------------------------------------------------

type Hover = { kind: "input" | "prt"; name: string } | null;

export function PrtOverview({ q, selected, onSelect }: { q: StackQuestion; selected: string | null; onSelect: (prt: string) => void }) {
  const data = useMemo(() => prtOverview(q), [q]);
  const box = useRef<HTMLDivElement>(null);
  const inputEls = useRef(new Map<string, HTMLElement>());
  const prtEls = useRef(new Map<string, HTMLElement>());
  const [paths, setPaths] = useState<{ input: string; prt: string; d: string; x1: number; y1: number; x2: number; y2: number }[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<Hover>(null);

  // Linien aus den gemessenen Positionen der Kästen berechnen
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const base = el.getBoundingClientRect();
      setSize({ w: base.width, h: base.height });
      setPaths(data.edges.flatMap((e) => {
        const a = inputEls.current.get(e.input)?.getBoundingClientRect();
        const b = prtEls.current.get(e.prt)?.getBoundingClientRect();
        if (!a || !b) return [];
        const x1 = a.right - base.left, y1 = a.top + a.height / 2 - base.top;
        const x2 = b.left - base.left, y2 = b.top + b.height / 2 - base.top;
        const dx = Math.max(30, (x2 - x1) / 2);
        return [{ ...e, x1, y1, x2, y2, d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}` }];
      }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [data]);

  const active = (e: { input: string; prt: string }) =>
    !hover ? null : hover.kind === "input" ? e.input === hover.name : e.prt === hover.name;
  const related = (kind: "input" | "prt", name: string) => {
    if (!hover) return null;
    if (hover.kind === kind) return hover.name === name;
    return data.edges.some((e) => (kind === "input" ? e.input === name && e.prt === hover.name : e.prt === name && e.input === hover.name));
  };

  if (!data.inputs.length && !data.prts.length) return <div className="empty">Noch keine Eingaben und Rückmeldebäume.</div>;

  return (
    <div className="pmap" ref={box}>
      <svg className="pmap-lines" width={size.w} height={size.h} aria-hidden>
        {paths.map((p) => {
          const on = active(p);
          return (
            <g key={`${p.input}-${p.prt}`} className={`pmap-edge${on === true ? " on" : on === false ? " off" : ""}${p.prt === selected ? " sel" : ""}`}>
              <path d={p.d} />
              <circle cx={p.x1} cy={p.y1} r={3.5} />
              <circle cx={p.x2} cy={p.y2} r={3.5} />
            </g>
          );
        })}
      </svg>
      <div className="pmap-col">
        <div className="pmap-head">Teilaufgabe und Eingabe</div>
        {data.inputs.map((i) => {
          const r = related("input", i.name);
          return (
            <div key={i.name} ref={(el) => { if (el) inputEls.current.set(i.name, el); else inputEls.current.delete(i.name); }}
              className={`pmap-input${r === true ? " on" : r === false ? " off" : ""}`}
              onMouseEnter={() => setHover({ kind: "input", name: i.name })} onMouseLeave={() => setHover(null)}>
              <span className={`pmap-label${i.label ? "" : " none"}`}>{i.label || (i.position < 0 ? "nicht im Fragetext" : "ohne Beschriftung")}</span>
              <span className="pmap-chips">
                <span className="tok tok-input">{i.name}</span>
                <span className="pmap-type">{i.type}</span>
                {!i.prts.length && <span className="chip warn" title="Keine PRT wertet diese Eingabe aus">nicht bewertet</span>}
              </span>
            </div>
          );
        })}
      </div>
      <div className="pmap-gap" />
      <div className="pmap-col">
        <div className="pmap-head">Rückmeldebaum</div>
        {data.prts.map((p) => {
          const r = related("prt", p.name);
          return (
            <button key={p.name} type="button" ref={(el) => { if (el) prtEls.current.set(p.name, el); else prtEls.current.delete(p.name); }}
              className={`pmap-prt${p.name === selected ? " sel" : ""}${r === true ? " on" : r === false ? " off" : ""}`}
              onMouseEnter={() => setHover({ kind: "prt", name: p.name })} onMouseLeave={() => setHover(null)}
              onClick={() => onSelect(p.name)} title={`Baum von ${p.name} anzeigen`}>
              <span className="pmap-label" title={p.tests.join(", ")}>
                {p.nodeCount} Knoten: {p.tests.join(", ")}
              </span>
              <span className="pmap-chips">
                <span className="tok tok-feedback">{p.name}</span>
                <span className="pmap-meta">Gewicht {Number(p.weight) || p.weight}</span>
                {!p.inputs.length && <span className="chip warn">keine Eingabe</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---- Einzelner Baum -------------------------------------------------------------------------------

const SLOT = 104;
const NODE_W = 184;
const NODE_H = 60;
const END_W = 92;
const END_H = 38;
const ROW = 112;
const PAD = 18;

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function PrtTree({ prt, onNode }: { prt: Prt; onNode?: (index: number) => void }) {
  const layout = useMemo(() => layoutPrt(prt), [prt]);
  // seitlicher Platz für außen herumgeführte Querverweise
  const side = layout.edges.some((e) => e.cross) ? 64 : 0;
  const width = Math.max(layout.columns * SLOT, NODE_W) + PAD * 2 + side * 2;
  const height = layout.depth * ROW + NODE_H + PAD * 2;
  const cx = (x: number) => PAD + side + (x + 0.5) * SLOT + Math.max(0, (NODE_W - layout.columns * SLOT) / 2);
  const top = (depth: number) => PAD + depth * ROW;
  const nodePos = new Map(layout.nodes.map((n) => [n.id, { x: cx(n.x), y: top(n.depth) }]));
  const endPos = new Map(layout.ends.map((e) => [e.id, { x: cx(e.x), y: top(e.depth) + (NODE_H - END_H) / 2 }]));
  const uid = `prt-${prt.name}`;

  return (
    <div className="ptree-scroll">
      <svg className="ptree" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img"
        aria-label={`Baumdiagramm ${prt.name}: ${prt.nodes.length} Knoten`}>
        <defs>
          {(["true", "false"] as const).map((b) => (
            <marker key={b} id={`${uid}-arrow-${b}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className={`ptree-arrow ${b}`} />
            </marker>
          ))}
        </defs>

        {layout.edges.map((e) => {
          const from = nodePos.get(e.from)!;
          const target = nodePos.get(e.to) ?? endPos.get(e.to)!;
          const side = e.branch === "true" ? -1 : 1;
          let d: string, sx: number, sy: number, label: { x: number; y: number };
          if (e.cross) {
            // Querverweis: seitlich aus dem Knoten heraus, außen herum und seitlich in den Zielknoten
            sx = from.x + side * NODE_W / 2;
            sy = from.y + NODE_H / 2;
            const tx = target.x + side * (NODE_W / 2 + 2), ty = target.y + NODE_H / 2;
            const ox = side * (Math.abs(sx - tx) / 2 + 34);
            d = `M${sx},${sy} C${sx + ox},${sy} ${tx + ox},${ty} ${tx},${ty}`;
            label = { x: sx + side * 6, y: sy + 15 };
          } else {
            sx = from.x + side * NODE_W / 4;
            sy = from.y + NODE_H;
            const tx = target.x, ty = target.y;
            const my = (sy + ty) / 2;
            d = `M${sx},${sy} C${sx},${my} ${tx},${my} ${tx},${ty - 2}`;
            label = { x: sx + side * 6, y: sy + 15 };
          }
          return (
            <g key={`${e.from}-${e.branch}`} className={`ptree-edge ${e.branch}${e.cross ? " cross" : ""}`}>
              <path d={d} markerEnd={`url(#${uid}-arrow-${e.branch})`} />
              <text x={label.x} y={label.y} textAnchor={side < 0 ? "end" : "start"}>{e.branch === "true" ? "wahr" : "falsch"}</text>
            </g>
          );
        })}

        {layout.ends.map((e) => {
          const p = endPos.get(e.id)!;
          return (
            <g key={e.id} className={`ptree-end ${e.branch}`} transform={`translate(${p.x - END_W / 2},${p.y})`}>
              <title>{`Ende${e.note ? ` – Antwortnotiz ${e.note}` : ""}`}</title>
              <rect width={END_W} height={END_H} rx={END_H / 2} />
              <text x={END_W / 2} y={15} textAnchor="middle" className="ptree-end-label">Ende</text>
              <text x={END_W / 2} y={30} textAnchor="middle" className="ptree-end-score">{e.score}</text>
            </g>
          );
        })}

        {layout.nodes.map((n) => {
          const p = nodePos.get(n.id)!;
          const f = prt.nodes[n.index].fields;
          const cmp = `${short(f.sans || "?", 14)} ↔ ${short(f.tans || "?", 14)}`;
          return (
            <g key={n.id} className={`ptree-node${n.reachable ? "" : " unreachable"}${onNode ? " clickable" : ""}`}
              transform={`translate(${p.x - NODE_W / 2},${p.y})`} onClick={() => onNode?.(n.index)}
              tabIndex={onNode ? 0 : undefined} onKeyDown={(e) => { if (onNode && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onNode(n.index); } }}>
              <title>{`Knoten ${Number(n.id) + 1}${f.description ? `: ${f.description}` : ""}\n${f.answertest}(${f.sans}, ${f.tans}${f.testoptions ? `, ${f.testoptions}` : ""})${n.reachable ? "" : "\nNicht vom ersten Knoten aus erreichbar"}`}</title>
              <rect width={NODE_W} height={NODE_H} rx={9} />
              <circle cx={20} cy={20} r={11} className="ptree-num" />
              <text x={20} y={24} textAnchor="middle" className="ptree-num-text">{Number(n.id) + 1}</text>
              <text x={38} y={25} className="ptree-test">{short(f.description || f.answertest, 18)}</text>
              <text x={12} y={47} className="ptree-cmp">{cmp}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
