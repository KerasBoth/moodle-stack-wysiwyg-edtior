"use client";

import { useMemo, useState } from "react";
import type { QTest, StackQuestion } from "@/lib/stack/model";
import { buildPreview, runQuestionTests } from "@/lib/stack/preview";
import type { SectionProps } from "../App";
import { MaximaEditor } from "../editors/CodeEditors";
import { IconDice, IconFlask, IconPlus, IconTrash, IconX } from "../icons";
import { SectionHead, Select } from "./BasicSections";

function defaultTest(q: StackQuestion, n: number): QTest {
  return {
    testcase: String(n),
    description: "Musterlösung erhält volle Punktzahl",
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
  const [runAll, setRunAll] = useState<{ seed: string; passed: number; total: number; failed: string[] }[] | null>(null);

  const notes = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of q.deployedseeds) {
      try {
        m.set(s, stripTags(buildPreview(q, Number(s)).noteHtml));
      } catch {
        m.set(s, "Fehler");
      }
    }
    return m;
  }, [q]);
  const noteCounts = new Map<string, number>();
  for (const n of notes.values()) noteCounts.set(n, (noteCounts.get(n) ?? 0) + 1);

  const addRandomSeeds = (count: number) => update((x) => {
    const seen = new Set(x.deployedseeds.map((s) => notes.get(s)));
    let tries = 0, added = 0;
    while (added < count && tries++ < count * 20) {
      const s = String(Math.floor(Math.random() * 2_000_000_000) + 1);
      const note = stripTags(buildPreview(x, Number(s)).noteHtml);
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
        failed: out.filter((o) => !o.passed).map((o) => `Test ${o.testcase}: ${o.rows.filter((r) => !r.passed).map((r) => `${r.prt} (ist ${r.actualScore ?? "–"}/${r.actualNote})`).join(", ")}${o.inputErrors.join("; ")}`),
      };
    }));
  };

  const inputNames: [string, string][] = q.inputs.map((i) => [i.fields.name, i.fields.name]);
  const prtNames: [string, string][] = q.prts.map((p) => [p.name, p.name]);

  return (
    <div className="section">
      <SectionHead title="Tests & Varianten" desc="Bereitgestellte Varianten (deployed seeds) und automatische Fragetests" />

      <div className="card">
        <div className="card-head">
          <h3>Varianten</h3>
          <span className="sub" title="Die Vorschau nutzt einen eigenen Zufallsgenerator. Zu einem Seed gehören in Moodle andere Zufallswerte als hier – die Varianten sind aber gleich verteilt.">{q.deployedseeds.length} bereitgestellt · Fragenotizen müssen verschieden sein · lokale Zufallswerte ≠ Moodle ⓘ</span>
          <div className="right">
            <button className="btn small" disabled={q.deployedseeds.includes(String(seed))} onClick={() => update((x) => { x.deployedseeds.push(String(seed)); })}><IconPlus /> Aktueller Seed</button>
            <button className="btn small" onClick={() => addRandomSeeds(5)}><IconDice /> 5 zufällige</button>
            <button className="btn small danger" disabled={!q.deployedseeds.length} onClick={() => window.confirm("Alle Varianten entfernen?") && update((x) => { x.deployedseeds = []; })}>Alle entfernen</button>
          </div>
        </div>
        <div className="card-body" style={{ padding: 0, maxHeight: 300, overflow: "auto" }}>
          {q.deployedseeds.length === 0 ? <div className="empty" style={{ margin: 12 }}>Keine Varianten – Moodle erzeugt dann zufällige.</div> : (
            <table className="vt">
              <thead><tr><th style={{ width: 40 }}>#</th><th style={{ width: 130 }}>Seed</th><th>Fragenotiz</th><th style={{ width: 80 }}></th></tr></thead>
              <tbody>
                {q.deployedseeds.map((s, i) => {
                  const note = notes.get(s) ?? "";
                  const dup = (noteCounts.get(note) ?? 0) > 1;
                  return (
                    <tr key={s + i} style={String(seed) === s ? { background: "var(--accent-soft)" } : undefined}>
                      <td>{i + 1}</td>
                      <td className="name"><button className="btn ghost small mono" onClick={() => setSeed(Number(s))} title="In der Vorschau anzeigen">{s}</button></td>
                      <td className="val">{note} {dup && <span className="chip warn">doppelt</span>}</td>
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
          <h3>Fragetests</h3>
          <span className="sub">Testeingaben sind Maxima-Ausdrücke und dürfen Fragevariablen nutzen</span>
          <div className="right">
            <button className="btn small" onClick={() => update((x) => { x.qtests.push(defaultTest(x, Math.max(0, ...x.qtests.map((t) => Number(t.testcase) || 0)) + 1)); })}><IconPlus /> Test</button>
            <button className="btn small primary" disabled={!q.qtests.length} onClick={runEverything}><IconFlask /> Alle Varianten testen</button>
          </div>
        </div>
        <div className="card-body">
          {runAll && (
            <div style={{ marginBottom: 14 }}>
              <div className="flow">
                {runAll.map((r) => (
                  <button key={r.seed} className={`chip ${r.passed === r.total ? "accent" : "err"}`} style={{ cursor: "pointer" }}
                    title={r.failed.join("\n") || "alle bestanden"} onClick={() => setSeed(Number(r.seed))}>
                    {r.seed}: {r.passed}/{r.total}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                {runAll.every((r) => r.passed === r.total) ? "✔ Alle Tests in allen Varianten bestanden (lokale Auswertung)." : "Rot markierte Varianten anklicken, um sie in der Vorschau zu öffnen."}
              </div>
            </div>
          )}
          {q.qtests.length === 0 && <div className="empty">Noch keine Tests. „+ Test“ legt einen Test mit der Musterlösung an.</div>}
          {q.qtests.map((t, ti) => {
            const setT = (fn: (x: QTest) => void) => update((x) => fn(x.qtests[ti]));
            return (
              <div className="node" key={ti}>
                <div className="node-head">
                  <span className="node-num">{t.testcase}</span>
                  <input className="inp" value={t.description} onChange={(e) => setT((x) => { x.description = e.target.value; })} />
                  <button className="btn small danger" onClick={() => update((x) => { x.qtests.splice(ti, 1); })}><IconTrash /></button>
                </div>
                <div className="node-body">
                  <div className="flabel" style={{ marginBottom: 6 }}>Eingaben</div>
                  {t.inputs.map((inp, ii) => (
                    <div key={ii} style={{ display: "grid", gridTemplateColumns: "130px 1fr 32px", gap: 8, marginBottom: 6 }}>
                      <Select value={inp.name} onChange={(v) => setT((x) => { x.inputs[ii].name = v; })} options={inputNames} />
                      <MaximaEditor mode="expr" value={inp.value} onChange={(v) => setT((x) => { x.inputs[ii].value = v; })} />
                      <button className="btn small ghost danger" onClick={() => setT((x) => { x.inputs.splice(ii, 1); })}><IconX /></button>
                    </div>
                  ))}
                  <button className="btn small" onClick={() => setT((x) => {
                    const free = q.inputs.find((i) => !x.inputs.some((y) => y.name === i.fields.name));
                    x.inputs.push({ name: free?.fields.name ?? q.inputs[0]?.fields.name ?? "ans1", value: "" });
                  })}><IconPlus /> Eingabe</button>

                  <div className="flabel" style={{ margin: "14px 0 6px" }}>Erwartete Ergebnisse</div>
                  <table className="vt">
                    <thead><tr><th>PRT</th><th>Punkte</th><th>Strafe</th><th>Antwortnotiz</th><th></th></tr></thead>
                    <tbody>
                      {t.expected.map((ex, ei) => (
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
                  })}><IconPlus /> Erwartung</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
