"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toMaxima } from "@/lib/maxima/print";
import { escapeHtml } from "@/lib/stack/castext";
import { buildFrameDocument } from "@/lib/stack/frame";
import type { StackQuestion } from "@/lib/stack/model";
import {
  type PreviewBuild, type RawAnswer, evaluateAllPrts, runQuestionTests, teacherAnswers, validateInput,
} from "@/lib/stack/preview";
import type { CasMode, CasStatus, Updater } from "./App";
import { IconCheck, IconDice, IconEye, IconPlus, IconWand } from "./icons";

interface Props {
  q: StackQuestion;
  build: PreviewBuild | null;
  seed: number;
  setSeed: (s: number) => void;
  update: Updater;
  onNavigate: (section: string) => void;
  casMode: CasMode;
  setCasMode: (m: CasMode) => void;
  casStatus: CasStatus;
}

type Tab = "preview" | "vars" | "issues" | "tests";

export default function Preview({ q, build, seed, setSeed, update, onNavigate, casMode, setCasMode, casStatus }: Props) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("preview");
  const [checked, setChecked] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);
  const [showNotes, setShowNotes] = useState(true);
  const [showGeneral, setShowGeneral] = useState(false);
  const answers = useRef<Record<string, RawAnswer>>({});
  const buildRef = useRef(build);
  buildRef.current = build;
  const qRef = useRef(q);
  qRef.current = q;
  const checkedRef = useRef(checked);
  checkedRef.current = checked;

  const srcDoc = useMemo(() => buildFrameDocument(), []);

  const post = useCallback((msg: Record<string, unknown>) => {
    iframe.current?.contentWindow?.postMessage({ __stackHost: true, ...msg }, "*");
  }, []);

  const fragment = useCallback((selector: string, html: string) => post({ type: "fragment", selector, html }), [post]);

  const runCheck = useCallback(() => {
    const b = buildRef.current, qq = qRef.current;
    if (!b) return;
    const { prts } = evaluateAllPrts(b, qq, answers.current);
    let total = 0, max = 0;
    for (const r of prts) {
      max += r.weight;
      let html = "";
      if (r.status === "evaluated" || r.status === "error") {
        total += r.score * r.weight;
        html = r.html;
        if (showNotesRef.current) {
          html += `<div class="stack-prt-meta">${escapeHtml(r.name)}: Punkte ${r.score.toFixed(2)} · Notiz ${escapeHtml(r.notes.join(" | ") || "–")}${r.approximate ? " · (lokal angenähert)" : ""}</div>`;
        }
        if (r.errors.length) html += `<div class="stack-error">${r.errors.map(escapeHtml).join("<br>")}</div>`;
      } else if (r.status === "invalid") {
        html = `<div class="stack-prt incorrect">Ihre Antwort ist ungültig oder unvollständig.</div>`;
      }
      fragment(`[data-feedback="${r.name}"]`, html);
    }
    const grade = Number(qq.scalars.defaultgrade) || 1;
    const score = max ? (total / max) * grade : 0;
    fragment("#stack-score", `<div class="score"><b>Bewertung:</b> ${score.toFixed(2).replace(".", ",")} von ${grade} Punkten (ohne Strafabzug)</div>`);
    fragment("#stack-specific", qq.texts.specificfeedback.text.trim() ? `<h4>Spezifisches Feedback</h4>${b.specificFeedbackHtml}` : "");
    // Feedback-Platzhalter im spezifischen Feedback erneut befüllen
    if (qq.texts.specificfeedback.text.includes("[[feedback:")) window.setTimeout(() => {
      const again = evaluateAllPrts(b, qq, answers.current);
      for (const r of again.prts) if (r.status === "evaluated") fragment(`#stack-specific [data-feedback="${r.name}"]`, r.html);
    }, 0);
  }, [fragment]);

  const showNotesRef = useRef(showNotes);
  showNotesRef.current = showNotes;

  // Das iframe kann vor der Hydration fertig geladen sein – daher aktiv anpingen
  useEffect(() => {
    if (ready) return;
    const ping = () => post({ type: "ping" });
    ping();
    const t = window.setInterval(ping, 300);
    return () => window.clearInterval(t);
  }, [ready, post]);

  // Nachrichten aus dem iframe
  useEffect(() => {
    const h = (ev: MessageEvent) => {
      if (ev.source !== iframe.current?.contentWindow) return;
      const m = ev.data;
      if (!m || !m.__stackPreview) return;
      if (m.type === "ready") setReady(true);
      if (m.type === "answer") {
        answers.current = { ...answers.current, [m.name]: m.raw };
        const b = buildRef.current;
        if (b) fragment(`[data-validation="${m.name}"]`, validateInput(b, m.name, m.raw).html);
      }
      if (m.type === "action") {
        if (m.action === "check") { setChecked(true); runCheck(); }
        if (m.action === "fill") fillTeacherAnswers();
        if (m.action === "reset") {
          answers.current = {};
          setChecked(false);
          renderNow(false);
        }
      }
    };
    window.addEventListener("message", h);
    return () => window.removeEventListener("message", h);
  });

  const renderNow = useCallback((isChecked: boolean) => {
    const b = buildRef.current, qq = qRef.current;
    if (!b || !ready) return;
    const grade = qq.scalars.defaultgrade || "1";
    const penalty = Number(qq.scalars.penalty || 0) * 100;
    const ta = teacherAnswers(b);
    const answersTable = showAnswers
      ? `<div class="section answers"><h4>Musterlösung</h4><table><tr><th>Eingabe</th><th>Antwort</th><th>Maxima</th></tr>${ta
          .map((t) => `<tr><td><b>${escapeHtml(t.name)}</b></td><td>${t.html}</td><td><code>${escapeHtml(t.source)}</code></td></tr>`)
          .join("")}</table></div>`
      : "";
    const html = `
      <div class="que">
        <div class="info"><span><b>${escapeHtml(qq.name)}</b></span><span>Seed ${b.seed}</span><span>Erreichbar: ${escapeHtml(grade)} Pkt.</span><span>Strafabzug: ${penalty.toFixed(0)} %</span></div>
        <div class="info"><span>Fragenotiz: ${b.noteHtml || "<i>leer</i>"}</span></div>
        <div class="content">
          <div class="formulation">${b.questionHtml}
            <div class="actions">
              <button class="btn" data-action="check">Prüfen</button>
              <button class="btn secondary" data-action="fill" title="Musterlösung in alle Felder eintragen">Musterlösung einsetzen</button>
              <button class="btn secondary" data-action="reset">Zurücksetzen</button>
            </div>
            <div id="stack-score"></div>
          </div>
          <div id="stack-specific" class="section specific" style="${isChecked && qq.texts.specificfeedback.text.trim() ? "" : "display:none"}"></div>
          ${showGeneral && qq.texts.generalfeedback.text.trim() ? `<div class="section general"><h4>Allgemeines Feedback</h4>${b.generalFeedbackHtml}</div>` : ""}
          ${answersTable}
        </div>
      </div>`;
    post({ type: "render", html, jsx: b.jsx, answers: answers.current });
    for (const [name, raw] of Object.entries(answers.current)) {
      fragment(`[data-validation="${name}"]`, validateInput(b, name, raw).html);
    }
    if (isChecked) runCheck();
  }, [ready, showAnswers, showGeneral, post, fragment, runCheck]);

  useEffect(() => { renderNow(checkedRef.current); }, [build, renderNow, showNotes]);

  // Neue Variante/Frage: Antworten verwerfen
  useEffect(() => {
    answers.current = {};
    setChecked(false);
  }, [seed, q.uid]);

  const fillTeacherAnswers = useCallback(() => {
    const b = buildRef.current;
    if (!b) return;
    const next: Record<string, RawAnswer> = {};
    for (const info of Object.values(b.inputs)) {
      if (!info.tans) continue;
      if (info.choices) {
        const idx = info.choices.map((c, i) => (c.correct ? String(i) : null)).filter((x): x is string => x !== null);
        next[info.name] = info.type === "checkbox" ? idx : idx[0] ?? "";
      } else if (info.type === "matrix" && info.tans.k === "call") {
        next[info.name] = info.tans.args.map((r) => (r.k === "list" ? r.items.map(toMaxima) : [toMaxima(r)]));
      } else if (info.type === "string" || info.type === "notes") {
        next[info.name] = info.tans.k === "str" ? info.tans.v : toMaxima(info.tans);
      } else if (info.type === "textarea" || info.type === "equiv") {
        next[info.name] = info.tans.k === "list" ? info.tans.items.map(toMaxima).join("\n") : toMaxima(info.tans);
      } else {
        next[info.name] = toMaxima(info.tans);
      }
    }
    answers.current = next;
    post({ type: "setAnswers", answers: next });
    for (const [name, raw] of Object.entries(next)) fragment(`[data-validation="${name}"]`, validateInput(b, name, raw).html);
    setChecked(true);
    runCheck();
  }, [post, fragment, runCheck]);

  // ---- Varianten ----
  const seeds = q.deployedseeds;
  const isDeployed = seeds.includes(String(seed));
  const reroll = () => setSeed(Math.floor(Math.random() * 2_000_000_000) + 1);

  const tests = useMemo(() => (build && tab === "tests" ? runQuestionTests(q, build) : []), [build, q, tab]);
  const issues = build?.issues ?? [];
  const errCount = issues.filter((i) => i.severity === "error").length;

  return (
    <section className="preview">
      <div className="preview-bar">
        <span className="title">Vorschau</span>
        <select value={String(seed)} onChange={(e) => setSeed(Number(e.target.value))} title="Variante (Seed)">
          {!isDeployed && <option value={String(seed)}>Seed {seed}</option>}
          {seeds.map((s, i) => <option key={s} value={s}>Variante {i + 1} · {s}</option>)}
        </select>
        <button className="btn small" onClick={reroll} title="Zufällige neue Variante"><IconDice /> Neu würfeln</button>
        <CasSwitch mode={casMode} setMode={setCasMode} status={casStatus} active={build?.cas ?? "local"} needs={!!build?.needsMaxima} />
        {!isDeployed && (
          <button className="btn small" title="Diesen Seed als Variante speichern" onClick={() => update((qq) => { qq.deployedseeds.push(String(seed)); })}>
            <IconPlus /> Variante
          </button>
        )}
        <span style={{ flex: 1 }} />
        <label className="check" title="Musterlösung unter der Aufgabe anzeigen"><input type="checkbox" checked={showAnswers} onChange={(e) => setShowAnswers(e.target.checked)} /> <IconEye style={{ width: 14 }} /> Lösung</label>
        <label className="check" title="Punkte und Antwortnotizen der PRTs anzeigen"><input type="checkbox" checked={showNotes} onChange={(e) => setShowNotes(e.target.checked)} /> Notizen</label>
        <label className="check" title="Allgemeines Feedback anzeigen"><input type="checkbox" checked={showGeneral} onChange={(e) => setShowGeneral(e.target.checked)} /> Allg. FB</label>
      </div>
      <div className="tabs">
        <button className={`tab ${tab === "preview" ? "active" : ""}`} onClick={() => setTab("preview")}>Aufgabe</button>
        <button className={`tab ${tab === "vars" ? "active" : ""}`} onClick={() => setTab("vars")}>Variablen <span className="count">{build?.vars.variables.length ?? 0}</span></button>
        <button className={`tab ${tab === "issues" ? "active" : ""}`} onClick={() => setTab("issues")}>
          Probleme {issues.length > 0 && <span className={`badge ${errCount ? "err" : "warn"}`}>{issues.length}</span>}
        </button>
        <button className={`tab ${tab === "tests" ? "active" : ""}`} onClick={() => setTab("tests")}>Fragetests</button>
        <span style={{ flex: 1 }} />
        <button className="btn small ghost" style={{ alignSelf: "center" }} onClick={fillTeacherAnswers} title="Musterlösung einsetzen und prüfen"><IconWand /> Lösung prüfen</button>
        <button className="btn small ghost" style={{ alignSelf: "center" }} onClick={() => { setChecked(true); runCheck(); }}><IconCheck /> Prüfen</button>
      </div>
      <div className="preview-body">
        <iframe
          ref={iframe}
          title="Aufgabenvorschau"
          srcDoc={srcDoc}
          sandbox="allow-scripts allow-same-origin"
          style={{ visibility: tab === "preview" ? "visible" : "hidden" }}
          onLoad={() => setReady(true)}
        />
        {tab === "vars" && (
          <div className="preview-scroll">
            {!build ? <div className="empty">Keine Auswertung</div> : (
              <table className="vt">
                <thead><tr><th>Variable</th><th>Wert (Seed {build.seed})</th></tr></thead>
                <tbody>
                  {build.vars.variables.map((v) => (
                    <tr key={v.name}><td className="name">{v.name}</td><td className="val">{toMaxima(v.value)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            {build && build.vars.variables.length === 0 && <div className="empty">Keine Variablen definiert</div>}
          </div>
        )}
        {tab === "issues" && (
          <div className="preview-scroll">
            {issues.length === 0 && <div className="empty">Keine Probleme gefunden 🎉</div>}
            {issues.map((i, k) => (
              <div key={k} className={`issue ${i.severity}`}>
                <b>{i.where}</b>
                <span>{i.message}</span>
              </div>
            ))}
            <p style={{ fontSize: 12, color: "var(--ink-3)" }}>
              Hinweis: Die Vorschau rechnet mit einem lokalen Maxima-Nachbau. Spezielle CAS-Funktionen (solve, factor, limit …) werden
              nur näherungsweise oder gar nicht ausgewertet – maßgeblich ist immer das Verhalten in Moodle.
            </p>
          </div>
        )}
        {tab === "tests" && (
          <div className="preview-scroll">
            {q.qtests.length === 0 && (
              <div className="empty">
                Keine Fragetests vorhanden. <button className="btn small" onClick={() => onNavigate("tests")}>Tests anlegen</button>
              </div>
            )}
            {tests.map((t) => (
              <div key={t.testcase} className="test-row">
                <div className="th">
                  Test {t.testcase} <span className={t.passed ? "pass" : "fail"}>{t.passed ? "✔ bestanden" : "✘ fehlgeschlagen"}</span>
                </div>
                {t.inputErrors.map((e, i) => <div key={i} className="issue error" style={{ margin: 6 }}>{e}</div>)}
                <table>
                  <thead><tr><th>PRT</th><th>Punkte erw.</th><th>Punkte ist</th><th>Notiz erw.</th><th>Notiz ist</th><th></th></tr></thead>
                  <tbody>
                    {t.rows.map((r) => (
                      <tr key={r.prt} title={r.errors.join("\n")}>
                        <td className="mono">{r.prt}</td>
                        <td>{r.expectedScore || "–"}</td>
                        <td>{r.actualScore === null ? "–" : r.actualScore.toFixed(2)}</td>
                        <td className="mono">{r.expectedNote || "–"}</td>
                        <td className="mono">{r.actualNote || "–"}</td>
                        <td className={r.passed ? "pass" : "fail"}>{r.passed ? "✔" : "✘"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/** Wahl der Rechen-Engine: lokale Nachbildung oder echter Maxima-Server. */
function CasSwitch({ mode, setMode, status, active, needs }: { mode: CasMode; setMode: (m: CasMode) => void; status: CasStatus; active: "local" | "maxima"; needs: boolean }) {
  if (!status.configured) {
    return needs
      ? <span className="cas-badge local" title="Für Funktionen wie solve, factor oder limit kann ein Maxima-Server eingerichtet werden (MAXIMA_URL in .env).">lokal</span>
      : null;
  }
  const err = status.lastError ?? status.error;
  const label = status.loading ? "rechnet …" : active === "maxima" ? "Maxima" : "lokal";
  const title = [
    active === "maxima" ? `Gerechnet mit Maxima${status.server ? ` auf ${status.server}` : ""}` : "Gerechnet mit der lokalen Nachbildung",
    err ? `Problem: ${err}` : "",
    "Automatisch: Maxima nur, wenn die lokale Vorschau etwas nicht berechnen kann.",
  ].filter(Boolean).join("\n");
  return (
    <span className="cas-switch" title={title}>
      <span className={`cas-badge ${status.loading ? "busy" : err ? "err" : active}`}>{label}</span>
      <select value={mode} onChange={(e) => setMode(e.target.value as CasMode)} aria-label="Rechnen mit">
        <option value="auto">Automatisch</option>
        <option value="maxima">Immer Maxima</option>
        <option value="local">Nur lokal</option>
      </select>
    </span>
  );
}
