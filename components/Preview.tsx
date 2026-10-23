"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toMaxima } from "@/lib/maxima/print";
import { escapeHtml } from "@/lib/stack/castext";
import { buildFrameDocument, frameTexts } from "@/lib/stack/frame";
import type { StackQuestion } from "@/lib/stack/model";
import { localizeHtml } from "@/lib/stack/msghtml";
import {
  type PreviewBuild, type RawAnswer, evaluateAllPrts, issueWhere, runQuestionTests, teacherAnswers, validateInput,
} from "@/lib/stack/preview";
import type { CasMode, CasStatus, Updater } from "./App";
import { useLocale, useT } from "./I18nProvider";
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
  const t = useT();
  const locale = useLocale();
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

  // Das iframe wird nur einmal geladen (Texte der Sprache beim Laden); spätere Sprachwechsel kommen mit „render“
  const initialTexts = useRef(frameTexts(t, locale));
  const srcDoc = useMemo(() => buildFrameDocument(initialTexts.current), []);

  const post = useCallback((msg: Record<string, unknown>) => {
    iframe.current?.contentWindow?.postMessage({ __stackHost: true, ...msg }, "*");
  }, []);

  // Meldungen der Bibliothek stehen als Marken im HTML und werden erst hier übersetzt
  const fragment = useCallback(
    (selector: string, html: string) => post({ type: "fragment", selector, html: localizeHtml(html, t) }),
    [post, t],
  );

  const runCheck = useCallback(() => {
    const b = buildRef.current, qq = qRef.current;
    if (!b) return;
    const { prts } = evaluateAllPrts(b, qq, answers.current);
    // Zahlen im Vorschau-Rahmen einheitlich im Format der Sprache (0,50 bzw. 0.50)
    const num2 = (x: number) => x.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    let total = 0, max = 0;
    for (const r of prts) {
      max += r.weight;
      let html = "";
      if (r.status === "evaluated" || r.status === "error") {
        total += r.score * r.weight;
        html = r.html;
        if (showNotesRef.current) {
          const meta = t("preview.frame.prtMeta", { name: r.name, score: num2(r.score), note: r.notes.join(" | ") || "–" });
          html += `<div class="stack-prt-meta">${escapeHtml(meta)}${r.approximate ? ` · ${escapeHtml(t("preview.frame.approximate"))}` : ""}</div>`;
        }
        if (r.errors.length) html += `<div class="stack-error">${r.errors.map((e) => escapeHtml(t(e))).join("<br>")}</div>`;
      } else if (r.status === "invalid") {
        html = `<div class="stack-prt incorrect">${escapeHtml(t("preview.frame.invalid"))}</div>`;
      }
      fragment(`[data-feedback="${r.name}"]`, html);
    }
    const grade = Number(qq.scalars.defaultgrade) || 1;
    const score = max ? (total / max) * grade : 0;
    fragment("#stack-score", `<div class="score"><b>${escapeHtml(t("preview.frame.gradeLabel"))}</b> ${escapeHtml(t("preview.frame.grade", { score: num2(score), grade: grade.toLocaleString(locale) }))}</div>`);
    fragment("#stack-specific", qq.texts.specificfeedback.text.trim() ? `<h4>${escapeHtml(t("preview.frame.specificFeedback"))}</h4>${b.specificFeedbackHtml}` : "");
    // Feedback-Platzhalter im spezifischen Feedback erneut befüllen
    if (qq.texts.specificfeedback.text.includes("[[feedback:")) window.setTimeout(() => {
      const again = evaluateAllPrts(b, qq, answers.current);
      for (const r of again.prts) if (r.status === "evaluated") fragment(`#stack-specific [data-feedback="${r.name}"]`, r.html);
    }, 0);
  }, [fragment, t, locale]);

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
    const gradeText = Number.isFinite(Number(grade)) ? Number(grade).toLocaleString(locale) : grade;
    const penaltyText = (Number(qq.scalars.penalty || 0) * 100).toLocaleString(locale, { maximumFractionDigits: 0 });
    const ta = teacherAnswers(b);
    // Texte des Vorschau-Rahmens: übersetzt und HTML-maskiert (nur Anzeige, nicht im XML)
    const tx = (key: Parameters<typeof t>[0], params?: Parameters<typeof t>[1]) => escapeHtml(t(key, params));
    const answersTable = showAnswers
      ? `<div class="section answers"><h4>${tx("preview.frame.workedSolution")}</h4><table><tr><th>${tx("preview.frame.input")}</th><th>${tx("preview.frame.answer")}</th><th>${tx("preview.frame.maxima")}</th></tr>${ta
          .map((a) => `<tr><td><b>${escapeHtml(a.name)}</b></td><td>${a.html}</td><td><code>${escapeHtml(a.source)}</code></td></tr>`)
          .join("")}</table></div>`
      : "";
    const html = `
      <div class="que">
        <div class="info"><span><b>${escapeHtml(qq.name)}</b></span><span>${tx("preview.frame.seed", { seed: b.seed })}</span><span>${tx("preview.frame.reachable", { grade: gradeText })}</span><span>${tx("preview.frame.penalty", { penalty: penaltyText })}</span></div>
        <div class="info"><span>${tx("preview.frame.questionNote")} ${b.noteHtml || `<i>${tx("preview.frame.empty")}</i>`}</span></div>
        <div class="content">
          <div class="formulation">${b.questionHtml}
            <div class="actions">
              <button class="btn" data-action="check">${tx("preview.frame.check")}</button>
              <button class="btn secondary" data-action="fill" title="${tx("preview.frame.fillTitle")}">${tx("preview.frame.fill")}</button>
              <button class="btn secondary" data-action="reset">${tx("preview.frame.reset")}</button>
            </div>
            <div id="stack-score"></div>
          </div>
          <div id="stack-specific" class="section specific" style="${isChecked && qq.texts.specificfeedback.text.trim() ? "" : "display:none"}"></div>
          ${showGeneral && qq.texts.generalfeedback.text.trim() ? `<div class="section general"><h4>${tx("preview.frame.generalFeedback")}</h4>${b.generalFeedbackHtml}</div>` : ""}
          ${answersTable}
        </div>
      </div>`;
    post({ type: "render", html: localizeHtml(html, t), jsx: b.jsx, answers: answers.current, texts: frameTexts(t, locale) });
    for (const [name, raw] of Object.entries(answers.current)) {
      fragment(`[data-validation="${name}"]`, validateInput(b, name, raw).html);
    }
    if (isChecked) runCheck();
  }, [ready, showAnswers, showGeneral, post, fragment, runCheck, t, locale]);

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
        <span className="title">{t("preview.title")}</span>
        <select value={String(seed)} onChange={(e) => setSeed(Number(e.target.value))} title={t("preview.variantSeed")}>
          {!isDeployed && <option value={String(seed)}>{t("preview.seed", { seed })}</option>}
          {seeds.map((s, i) => <option key={s} value={s}>{t("preview.variant", { n: i + 1, seed: s })}</option>)}
        </select>
        <button className="btn small" onClick={reroll} title={t("preview.rerollTitle")}><IconDice /> {t("preview.reroll")}</button>
        <CasSwitch mode={casMode} setMode={setCasMode} status={casStatus} active={build?.cas ?? "local"} needs={!!build?.needsMaxima} />
        {!isDeployed && (
          <button className="btn small" title={t("preview.saveSeedTitle")} onClick={() => update((qq) => { qq.deployedseeds.push(String(seed)); })}>
            <IconPlus /> {t("preview.addVariant")}
          </button>
        )}
        <span style={{ flex: 1 }} />
        <label className="check" title={t("preview.showSolutionTitle")}><input type="checkbox" checked={showAnswers} onChange={(e) => setShowAnswers(e.target.checked)} /> <IconEye style={{ width: 14 }} /> {t("preview.solution")}</label>
        <label className="check" title={t("preview.showNotesTitle")}><input type="checkbox" checked={showNotes} onChange={(e) => setShowNotes(e.target.checked)} /> {t("preview.notes")}</label>
        <label className="check" title={t("preview.showGeneralTitle")}><input type="checkbox" checked={showGeneral} onChange={(e) => setShowGeneral(e.target.checked)} /> {t("preview.generalShort")}</label>
      </div>
      <div className="tabs">
        <button className={`tab ${tab === "preview" ? "active" : ""}`} onClick={() => setTab("preview")}>{t("preview.tabs.question")}</button>
        <button className={`tab ${tab === "vars" ? "active" : ""}`} onClick={() => setTab("vars")}>{t("preview.tabs.variables")} <span className="count">{build?.vars.variables.length ?? 0}</span></button>
        <button className={`tab ${tab === "issues" ? "active" : ""}`} onClick={() => setTab("issues")}>
          {t("preview.tabs.issues")} {issues.length > 0 && <span className={`badge ${errCount ? "err" : "warn"}`}>{issues.length}</span>}
        </button>
        <button className={`tab ${tab === "tests" ? "active" : ""}`} onClick={() => setTab("tests")}>{t("preview.tabs.tests")}</button>
        <span style={{ flex: 1 }} />
        <button className="btn small ghost" style={{ alignSelf: "center" }} onClick={fillTeacherAnswers} title={t("preview.checkSolutionTitle")}><IconWand /> {t("preview.checkSolution")}</button>
        <button className="btn small ghost" style={{ alignSelf: "center" }} onClick={() => { setChecked(true); runCheck(); }}><IconCheck /> {t("preview.check")}</button>
      </div>
      <div className="preview-body">
        <iframe
          ref={iframe}
          title={t("preview.iframeTitle")}
          srcDoc={srcDoc}
          sandbox="allow-scripts allow-same-origin"
          style={{ visibility: tab === "preview" ? "visible" : "hidden" }}
          onLoad={() => setReady(true)}
        />
        {tab === "vars" && (
          <div className="preview-scroll">
            {!build ? <div className="empty">{t("preview.noEvaluation")}</div> : (
              <table className="vt">
                <thead><tr><th>{t("preview.variable")}</th><th>{t("preview.valueSeed", { seed: build.seed })}</th></tr></thead>
                <tbody>
                  {build.vars.variables.map((v) => (
                    <tr key={v.name}><td className="name">{v.name}</td><td className="val">{toMaxima(v.value)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            {build && build.vars.variables.length === 0 && <div className="empty">{t("preview.noVariables")}</div>}
          </div>
        )}
        {tab === "issues" && (
          <div className="preview-scroll">
            {issues.length === 0 && <div className="empty">{t("preview.noIssues")}</div>}
            {issues.map((i, k) => (
              <div key={k} className={`issue ${i.severity}`}>
                <b>{t(issueWhere(i))}</b>
                <span>{t(i.message)}</span>
              </div>
            ))}
            <p style={{ fontSize: 12, color: "var(--ink-3)" }}>{t("preview.localNote")}</p>
          </div>
        )}
        {tab === "tests" && (
          <div className="preview-scroll">
            {q.qtests.length === 0 && (
              <div className="empty">
                {t("preview.noTests")} <button className="btn small" onClick={() => onNavigate("tests")}>{t("preview.createTests")}</button>
              </div>
            )}
            {tests.map((tc) => (
              <div key={tc.testcase} className="test-row">
                <div className="th">
                  {t("preview.test", { n: tc.testcase })} <span className={tc.passed ? "pass" : "fail"}>{tc.passed ? t("preview.passed") : t("preview.failed")}</span>
                </div>
                {tc.inputErrors.map((e, i) => <div key={i} className="issue error" style={{ margin: 6 }}>{t(e)}</div>)}
                <table>
                  <thead><tr>
                    <th>{t("preview.testTable.prt")}</th><th>{t("preview.testTable.expectedScore")}</th><th>{t("preview.testTable.actualScore")}</th>
                    <th>{t("preview.testTable.expectedNote")}</th><th>{t("preview.testTable.actualNote")}</th><th></th>
                  </tr></thead>
                  <tbody>
                    {tc.rows.map((r) => (
                      <tr key={r.prt} title={r.errors.map((e) => t(e)).join("\n")}>
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
  const t = useT();
  if (!status.configured) {
    return needs
      ? <span className="cas-badge local" title={t("preview.cas.setupHint")}>{t("preview.cas.local")}</span>
      : null;
  }
  const unreachable = status.unreachable
    ? status.unreachable.detail
      ? t("preview.cas.unreachableDetail", { error: status.unreachable.detail })
      : t("preview.cas.unreachable")
    : undefined;
  const err = status.lastError ?? unreachable;
  const label = status.loading ? t("preview.cas.computing") : active === "maxima" ? t("preview.cas.maxima") : t("preview.cas.local");
  const title = [
    active === "maxima"
      ? status.server ? t("preview.cas.computedMaximaOn", { server: status.server }) : t("preview.cas.computedMaxima")
      : t("preview.cas.computedLocal"),
    err ? t("preview.cas.problem", { error: err }) : "",
    t("preview.cas.autoHint"),
  ].filter(Boolean).join("\n");
  return (
    <span className="cas-switch" title={title}>
      <span className={`cas-badge ${status.loading ? "busy" : err ? "err" : active}`}>{label}</span>
      <select value={mode} onChange={(e) => setMode(e.target.value as CasMode)} aria-label={t("preview.cas.computeWith")}>
        <option value="auto">{t("preview.cas.auto")}</option>
        <option value="maxima">{t("preview.cas.alwaysMaxima")}</option>
        <option value="local">{t("preview.cas.localOnly")}</option>
      </select>
    </span>
  );
}
