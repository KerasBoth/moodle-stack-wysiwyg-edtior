// Daten für die grafische Darstellung der Rückmeldebäume:
// Zuordnung Teilaufgabe → Eingabe → PRT und das Layout eines einzelnen Baums.

import type { Msg } from "../i18n/index.ts";
import type { Prt, StackQuestion } from "./model.ts";
import { usedInputs } from "./preview.ts";

const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

const stripCas = (s: string) => s
  .replace(/\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/g, " ")
  .replace(/\[\[[^\]]*\]\]|\{[@#][\s\S]*?[@#]\}/g, " ")
  .replace(/<[^>]*>/g, " ")
  .replace(/&nbsp;/g, " ")
  .replace(/&[a-z]+;/g, " ")
  .replace(/\s+/g, " ")
  .replace(/\s+([.,;:!?)])/g, "$1")
  .trim()
  .replace(/\s*[:=]$/, "");

/** Markierung einer Teilaufgabe am Absatzanfang, z. B. „a)“, „(b)“, „2.“ */
const PART_RE = /^\(?([a-z]|\d{1,2})[).]\s/i;

/**
 * Beschreibung einer Eingabe aus dem Fragetext: der lesbare Text ihres Absatzes vor dem Platzhalter,
 * sonst der nächste vorherige Absatz ohne eigene Eingabe. Gehört sie zu einer Teilaufgabe („c) …“),
 * wird diese vorangestellt.
 */
function describePosition(html: string, pos: number): string | Msg {
  let before = html.slice(0, pos);
  // Eingabe in einer Grafik: Beschreibung aus dem Text vor dem Block; Code-Blöcke nie als Text lesen
  const open = before.lastIndexOf("[[jsxgraph");
  const inGraph = open >= 0 && before.indexOf("[[/jsxgraph]]", open) < 0;
  if (inGraph) before = before.slice(0, open);
  before = before.replace(/\[\[\s*jsxgraph[\s\S]*?\[\[\s*\/jsxgraph\s*\]\]|<script[\s\S]*?<\/script>/gi, " ");
  const segments = before.split(/<p[\s>]|<br\s*\/?>|<li[\s>]|\n/);
  const current = inGraph ? "" : stripCas(segments[segments.length - 1]);
  let label = current;
  let part = PART_RE.test(current) ? current : "";
  for (let k = segments.length - 2; k >= 0 && (!label || !part); k--) {
    const raw = segments[k];
    const text = stripCas(raw);
    if (!text) continue;
    if (!part && PART_RE.test(text)) part = text;
    if (!label && !/\[\[\s*input:/.test(raw)) label = text;
    if (/\[\[\s*input:/.test(raw) && PART_RE.test(text)) break; // vorherige Teilaufgabe mit eigener Eingabe
  }
  const partShort = part.length > 26 ? `${part.slice(0, 24).trimEnd()} …` : part;
  if (inGraph) {
    // Eingabe in einer Grafik: Beschriftung als Meldung (übersetzt die Oberfläche)
    const graph: Msg = part || !label
      ? { key: "lib.prtgraph.graph" }
      : { key: "lib.prtgraph.inGraph", params: { label: shorten(label, 44) } };
    return part ? { key: "lib.prtgraph.withPart", params: { part: partShort, label: graph } } : graph;
  }
  let out = label;
  if (part && label !== part && !PART_RE.test(label)) out = `${partShort} › ${label}`;
  return shorten(out, 56);
}

function shorten(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 2).trimEnd()} …` : s;
}

export interface InputEntry {
  name: string;
  type: string;
  /** Beschreibung aus dem Fragetext, z. B. „a) Definitionsbereich“; bei Eingaben in Grafiken eine Meldung. */
  label: string | Msg;
  /** Position im Fragetext (-1 = nicht im Text). */
  position: number;
  prts: string[];
}

export interface PrtEntry {
  name: string;
  weight: string;
  nodeCount: number;
  tests: string[];
  inputs: string[];
}

export interface PrtOverviewData {
  inputs: InputEntry[];
  prts: PrtEntry[];
  edges: { input: string; prt: string }[];
}

export function prtOverview(q: StackQuestion): PrtOverviewData {
  const text = q.texts.questiontext.text;
  const prtInputs = new Map(q.prts.map((p) => [p.name, usedInputs(p, q)]));
  const inputs: InputEntry[] = q.inputs.map((i) => {
    const name = i.fields.name;
    const m = new RegExp(`\\[\\[\\s*input:${name}\\s*\\]\\]`).exec(text);
    return {
      name,
      type: i.fields.type,
      label: m ? describePosition(text, m.index) : "",
      position: m ? m.index : -1,
      prts: q.prts.filter((p) => prtInputs.get(p.name)!.includes(name)).map((p) => p.name),
    };
  });
  // Reihenfolge wie im Fragetext, nicht platzierte Eingaben ans Ende
  inputs.sort((a, b) => (a.position < 0 ? 1 : 0) - (b.position < 0 ? 1 : 0) || a.position - b.position || natural(a.name, b.name));
  const order = new Map(inputs.map((i, k) => [i.name, k]));
  const prts: PrtEntry[] = q.prts.map((p) => ({
    name: p.name,
    weight: p.value,
    nodeCount: p.nodes.length,
    tests: [...new Set(p.nodes.map((n) => n.fields.answertest))],
    inputs: prtInputs.get(p.name)!,
  }));
  // PRTs nach ihrer ersten Eingabe ordnen, damit sich möglichst wenige Linien kreuzen
  const rank = (p: PrtEntry) => (p.inputs.length ? Math.min(...p.inputs.map((n) => order.get(n) ?? 1e9)) : 1e9);
  prts.sort((a, b) => rank(a) - rank(b) || natural(a.name, b.name));
  const edges = prts.flatMap((p) => p.inputs.map((input) => ({ input, prt: p.name })));
  return { inputs, prts, edges };
}

// ---- Layout eines Baums ------------------------------------------------------------------

export interface TreeNodeBox {
  kind: "node";
  id: string; // Knotenname ("0", "1" …)
  index: number; // Position in prt.nodes
  x: number; // Mitte, in Spalteneinheiten
  depth: number;
  reachable: boolean;
}
export interface TreeEndBox {
  kind: "end";
  id: string; // z. B. "0-true"
  x: number;
  depth: number;
  branch: "true" | "false";
  score: string; // z. B. "= 1"
  note: string;
}
export interface TreeEdge {
  from: string; // Knotenname
  to: string; // Knotenname oder End-ID
  branch: "true" | "false";
  /** Rückwärts-/Querverweis auf einen schon platzierten Knoten. */
  cross: boolean;
}
export interface TreeLayout {
  nodes: TreeNodeBox[];
  ends: TreeEndBox[];
  edges: TreeEdge[];
  columns: number;
  depth: number;
}

/**
 * Ordnet den PRT als Baum an: Kinder eines Knotens sind wahr- und falsch-Ziel (Knoten oder „Ende“).
 * Blätter bekommen fortlaufende Spalten, innere Knoten stehen mittig über ihren Kindern.
 * Ziele, die schon an anderer Stelle stehen, werden als Querverweis gezeichnet.
 */
export function layoutPrt(prt: Prt): TreeLayout {
  const byName = new Map(prt.nodes.map((n, i) => [n.fields.name, i]));
  const placed = new Set<string>();
  const nodes: TreeNodeBox[] = [];
  const ends: TreeEndBox[] = [];
  const edges: TreeEdge[] = [];
  let column = 0;
  let maxDepth = 0;

  const visit = (name: string, depth: number, reachable: boolean): number => {
    placed.add(name);
    maxDepth = Math.max(maxDepth, depth);
    const index = byName.get(name)!;
    const f = prt.nodes[index].fields;
    const childXs: number[] = [];
    for (const branch of ["true", "false"] as const) {
      const next = f[`${branch}nextnode`];
      if (next !== "-1" && byName.has(next)) {
        if (placed.has(next)) {
          edges.push({ from: name, to: next, branch, cross: true });
        } else {
          edges.push({ from: name, to: next, branch, cross: false });
          childXs.push(visit(next, depth + 1, reachable));
        }
      } else {
        const id = `${name}-${branch}`;
        const mode = f[`${branch}scoremode`] || "=";
        ends.push({ kind: "end", id, x: column, depth: depth + 1, branch, score: `${mode} ${f[`${branch}score`] || "0"}`, note: f[`${branch}answernote`] ?? "" });
        maxDepth = Math.max(maxDepth, depth + 1);
        childXs.push(column++);
        edges.push({ from: name, to: id, branch, cross: false });
      }
    }
    // Knoten ohne eigene Kinder (beide Zweige Querverweise) brauchen trotzdem Platz
    let x: number;
    if (childXs.length) x = (Math.min(...childXs) + Math.max(...childXs)) / 2;
    else { x = column + 0.5; column += 2; }
    nodes.push({ kind: "node", id: name, index, x, depth, reachable });
    return x;
  };

  if (prt.nodes.length) visit(prt.nodes[0].fields.name, 0, true);
  // Vom ersten Knoten aus nicht erreichbare Knoten trotzdem zeigen
  for (const n of prt.nodes) if (!placed.has(n.fields.name)) visit(n.fields.name, 0, false);

  return { nodes, ends, edges, columns: Math.max(column, 1), depth: maxDepth };
}
