"use client";

import { useMemo, useState } from "react";
import type { QTest, StackQuestion } from "@/lib/stack/model";
import { localizeHtml } from "@/lib/stack/msghtml";
import { buildPreview, runQuestionTests } from "@/lib/stack/preview";
import type { SectionProps } from "../App";
import { MaximaEditor } from "../editors/CodeEditors";
import { useDialogs } from "../Dialogs";
import { IconDice, IconFlask, IconPlus, IconTrash, IconX } from "../icons";
import { SectionHead, Select } from "./BasicSections";
import { useT } from "../I18nProvider";

function defaultTest(q: StackQuestion, n: number): QTest {
  return {
    testcase: String(n),
    description: "Musterlösung erhält volle Punktzahl", // Inhalt (ins XML), nicht übersetzen
    inputs: q.inputs.map((i) => ({
      name: i.fields.name,
      value: ["dropdown", "radio"].includes(i.fields.type) ? `first(mcq_correct(${i.fields.tans}))`
        : i.fields.type === "checkbox" ? `mcq_correct(${i.fields.tans})` : i.fields.tans,
    })),
    expected: q.prts.map((p) => ({
      name: p.name,
      expectedscore: "1.0000000",
      expectedpenalty: "0.0000000",
      expectedanswernote: p.nodes[0]?.fields.trueanswernote ?? "",
    })),
  };
}

function stripTags(html: string) {
  return html.replace(/<[^>]*>/g, "").replace(/\\\(|\\\)/g, "").trim();
}

export default function TestsSection({ q, update, seed, setSeed }: SectionProps) {
  const t = useT();
  const dialogs = useDialogs();
  const [runAll, setRunAll] = useState<{ seed: string; passed: number; total: number; failed: string[] }[] | null>(null);

  const notes = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of q.deployedseeds) {
      try {
        m.set(s, stripTags(localizeHtml(buildPreview(q, Number(s)).noteHtml, t)));
      } catch {
        m.set(s, t("common.error"));
      }
    }
    return m;
  }, [q, t]);
  const noteCounts = new Map<string, number>();
  for (const n of notes.values()) noteCounts.set(n, (noteCounts.get(n) ?? 0) + 1);

  const addRandomSeeds = (count: number) => update((x) => {
    const seen = new Set(x.deployedseeds.map((s) => notes.get(s)));
    let tries = 0, added = 0;
    while (added < count && tries++ < count * 20) {
      const s = String(Math.floor(Math.random() * 2_000_000_000) + 1);
      const note = stripTags(localizeHtml(buildPreview(x, Number(s)).noteHtml, t));
      if (seen.has(note)) continue;
      seen.add(note);
      x.deployedseeds.push(s);
      added++;
    }
  });

  const runEverything = () => {
    const seeds = q.deployedseeds.length ? q.deployedseeds : [String(seed)];
    setRunAll(seeds.map((s) => {
      const b = buildPreview(q, Number(s));
      const out = runQuestionTests(q, b);
      return {
        seed: s,
        passed: out.filter((o) => o.passed).length,
        total: out.length,
        failed: out.filter((o) => !o.passed).map((o) => t("sections.tests.failedTest", {
          testcase: o.testcase,
          rows: o.rows.filter((r) => !r.passed).map((r) => t("sections.tests.failedRow", { prt: r.prt, score: r.actualScore ?? "–", note: r.actualNote })).join(", "),
        }) + o.inputErrors.map((e) => t(e)).join("; ")),
      };
    }));
  };

  const inputNames: [string, string][] = q.inputs.map((i) => [i.fields.name, i.fields.name]);
  const prtNames: [string, string][] = q.prts.map((p) => [p.name, p.name]);

  return (
    <div className="section">
      <SectionHead title={t("editor.nav.tests")} desc={t("sections.tests.desc")} />

      <div className="card">
        <div className="card-head">
          <h3>{t("sections.tests.variants")}</h3>
          <span className="sub" title={t("sections.tests.variantsInfoTitle")}>{t("sections.tests.variantsInfo", { count: q.deployedseeds.length })}</span>
          <div className="right">
            <button className="btn small" disabled={q.deployedseeds.includes(String(seed))} onClick={() => update((x) => { x.deployedseeds.push(String(seed)); })}><IconPlus /> {t("sections.tests.addCurrentSeed")}</button>
            <button className="btn small" onClick={() => addRandomSeeds(5)}><IconDice /> {t("sections.tests.addRandom", { count: 5 })}</button>
            <button className="btn small danger" disabled={!q.deployedseeds.length} onClick={async () => {
              if (await dialogs.confirm({ title: t("sections.tests.removeAllTitle"), message: t("sections.tests.removeAllMessage"), confirmLabel: t("sections.tests.removeAll"), danger: true })) update((x) => { x.deployedseeds = []; });
            }}>{t("sections.tests.removeAll")}</button>
          </div>
        </div>
        <div className="card-body" style={{ padding: 0, maxHeight: 300, overflow: "auto" }}>
          {q.deployedseeds.length === 0 ? <div className="empty" style={{ margin: 12 }}>{t("sections.tests.noVariants")}</div> : (
            <table className="vt">
              <thead><tr><th style={{ width: 40 }}>#</th><th style={{ width: 130 }}>{t("sections.tests.seed")}</th><th>{t("sections.general.questionNote")}</th><th style={{ width: 80 }}></th></tr></thead>
              <tbody>
                {q.deployedseeds.map((s, i) => {
                  const note = notes.get(s) ?? "";
                  const dup = (noteCounts.get(note) ?? 0) > 1;
                  return (
                    <tr key={s + i} style={String(seed) === s ? { background: "var(--accent-soft)" } : undefined}>
                      <td>{i + 1}</td>
                      <td className="name"><button className="btn ghost small mono" onClick={() => setSeed(Number(s))} title={t("sections.tests.showInPreview")}>{s}</button></td>
                      <td className="val">{note} {dup && <span className="chip warn">{t("sections.tests.duplicate")}</span>}</td>
                      <td><button className="btn small ghost danger" onClick={() => update((x) => { x.deployedseeds.splice(i, 1); })}><IconX /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>{t("sections.tests.questionTests")}</h3>
          <span className="sub">{t("sections.tests.questionTestsSub")}</span>
          <div className="right">
            <button className="btn small" onClick={() => update((x) => { x.qtests.push(defaultTest(x, Math.max(0, ...x.qtests.map((qt) => Number(qt.testcase) || 0)) + 1)); })}><IconPlus /> {t("sections.tests.addTest")}</button>
            <button className="btn small primary" disabled={!q.qtests.length} onClick={runEverything}><IconFlask /> {t("sections.tests.runAll")}</button>
          </div>
        </div>
        <div className="card-body">
          {runAll && (
            <div style={{ marginBottom: 14 }}>
              <div className="flow">
                {runAll.map((r) => (
                  <button key={r.seed} className={`chip ${r.passed === r.total ? "accent" : "err"}`} style={{ cursor: "pointer" }}
                    title={r.failed.join("\n") || t("sections.tests.allPassedTitle")} onClick={() => setSeed(Number(r.seed))}>
                    {r.seed}: {r.passed}/{r.total}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                {t(runAll.every((r) => r.passed === r.total) ? "sections.tests.allPassed" : "sections.tests.clickFailed")}
              </div>
            </div>
          )}
          {q.qtests.length === 0 && <div className="empty">{t("sections.tests.noTests")}</div>}
          {q.qtests.map((qt, ti) => {
            const setT = (fn: (x: QTest) => void) => update((x) => fn(x.qtests[ti]));
            return (
              <div className="node" key={ti}>
                <div className="node-head">
                  <span className="node-num">{qt.testcase}</span>
                  <input className="inp" value={qt.description} onChange={(e) => setT((x) => { x.description = e.target.value; })} />
                  <button className="btn small danger" onClick={() => update((x) => { x.qtests.splice(ti, 1); })}><IconTrash /></button>
                </div>
                <div className="node-body">
                  <div className="flabel" style={{ marginBottom: 6 }}>{t("editor.nav.inputs")}</div>
                  {qt.inputs.map((inp, ii) => (
                    <div key={ii} style={{ display: "grid", gridTemplateColumns: "130px 1fr 32px", gap: 8, marginBottom: 6 }}>
                      <Select value={inp.name} onChange={(v) => setT((x) => { x.inputs[ii].name = v; })} options={inputNames} />
                      <MaximaEditor mode="expr" value={inp.value} onChange={(v) => setT((x) => { x.inputs[ii].value = v; })} />
                      <button className="btn small ghost danger" onClick={() => setT((x) => { x.inputs.splice(ii, 1); })}><IconX /></button>
                    </div>
                  ))}
                  <button className="btn small" onClick={() => setT((x) => {
                    const free = q.inputs.find((i) => !x.inputs.some((y) => y.name === i.fields.name));
                    x.inputs.push({ name: free?.fields.name ?? q.inputs[0]?.fields.name ?? "ans1", value: "" });
                  })}><IconPlus /> {t("sections.inputs.add")}</button>

                  <div className="flabel" style={{ margin: "14px 0 6px" }}>{t("sections.tests.expected")}</div>
                  <table className="vt">
                    <thead><tr><th>{t("sections.tests.prt")}</th><th>{t("sections.prts.score")}</th><th>{t("sections.prts.penalty")}</th><th>{t("sections.prts.answerNote")}</th><th></th></tr></thead>
                    <tbody>
                      {qt.expected.map((ex, ei) => (
                        <tr key={ei}>
                          <td style={{ width: 120 }}><Select value={ex.name} onChange={(v) => setT((x) => { x.expected[ei].name = v; })} options={prtNames} /></td>
                          <td style={{ width: 110 }}><input className="inp" value={ex.expectedscore} onChange={(e) => setT((x) => { x.expected[ei].expectedscore = e.target.value; })} /></td>
                          <td style={{ width: 110 }}><input className="inp" value={ex.expectedpenalty} onChange={(e) => setT((x) => { x.expected[ei].expectedpenalty = e.target.value; })} /></td>
                          <td><input className="inp mono" value={ex.expectedanswernote} onChange={(e) => setT((x) => { x.expected[ei].expectedanswernote = e.target.value; })} /></td>
                          <td style={{ width: 40 }}><button className="btn small ghost danger" onClick={() => setT((x) => { x.expected.splice(ei, 1); })}><IconX /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button className="btn small" style={{ marginTop: 6 }} onClick={() => setT((x) => {
                    const free = q.prts.find((p) => !x.expected.some((y) => y.name === p.name));
                    x.expected.push({ name: free?.name ?? q.prts[0]?.name ?? "prt1", expectedscore: "1.0000000", expectedpenalty: "0.0000000", expectedanswernote: "" });
                  })}><IconPlus /> {t("sections.tests.addExpectation")}</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
