// Rendert STACK-CASText (Fragetext, Feedback …) zu HTML für die Vorschau.

import { type Ctx, type Env, Env as EnvClass, evaluate, truth } from "../maxima/eval.ts";
import { parseExpression } from "../maxima/parser.ts";
import { type PrintOptions, toMaxima, toTex } from "../maxima/print.ts";
import type { Expr } from "../maxima/types.ts";

export interface JsxBlock {
  id: string;
  code: string;
  /** JS-Variablenname -> Eingabename (aus input-ref-ansX="var") */
  inputRefs: Record<string, string>;
  width: string;
  height: string;
}

export interface CasTextOptions {
  print: PrintOptions;
  placeholder: (kind: "input" | "validation" | "feedback", name: string) => string;
  idPrefix?: string;
  /** Vom Maxima-Server berechnete {@…@}/{#…#}-Inhalte (Quelltext → Wert/LaTeX). */
  cas?: Map<string, { value: string; tex: string }>;
}

export interface CasTextResult {
  html: string;
  jsx: JsxBlock[];
  errors: string[];
}

// ---- Blockstruktur -------------------------------------------------------------

type Node =
  | { t: "text"; v: string }
  | { t: "ph"; kind: "input" | "validation" | "feedback"; name: string }
  | { t: "block"; name: string; attrs: Record<string, string>; children: Node[]; raw?: string; branches?: Branch[] };

interface Branch { test: string | null; children: Node[] }

const RAW_BLOCKS = new Set(["comment", "escape", "jsxgraph", "geogebra", "parsons", "textdownload", "javascript"]);
const SELF_CLOSING = new Set(["define", "else", "elif", "debug", "include", "quid", "commonstring"]);

const TAG_RE = /\[\[\s*(\/?)([a-zA-Z_]+)(?::([\w]+))?((?:\s+[\w-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*\]\]/g;

function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1]] = m[2] ?? m[3] ?? "";
  return out;
}

export function parseCasText(src: string): { nodes: Node[]; errors: string[] } {
  const errors: string[] = [];
  const root: Node & { t: "block" } = { t: "block", name: "#root", attrs: {}, children: [] };
  const stack: (Node & { t: "block" })[] = [root];
  let pos = 0;
  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  const top = () => stack[stack.length - 1];
  const pushText = (v: string) => { if (v) top().children.push({ t: "text", v }); };

  while ((m = TAG_RE.exec(src))) {
    pushText(src.slice(pos, m.index));
    pos = m.index + m[0].length;
    const [, close, name, id, attrStr] = m;
    if (!close && (name === "input" || name === "validation" || name === "feedback") && id) {
      top().children.push({ t: "ph", kind: name, name: id });
      continue;
    }
    if (close) {
      // Schließt den passenden offenen Block
      const idx = [...stack].reverse().findIndex((b) => b.name === name);
      if (idx < 0) { errors.push(`[[/${name}]] ohne öffnenden Block`); continue; }
      stack.length = stack.length - idx - 1;
      continue;
    }
    const attrs = parseAttrs(attrStr ?? "");
    if (RAW_BLOCKS.has(name)) {
      const closeTag = new RegExp(`\\[\\[\\s*/${name}\\s*\\]\\]`, "g");
      closeTag.lastIndex = pos;
      const cm = closeTag.exec(src);
      if (!cm) { errors.push(`[[${name}]] wird nicht geschlossen`); top().children.push({ t: "block", name, attrs, children: [], raw: src.slice(pos) }); pos = src.length; break; }
      top().children.push({ t: "block", name, attrs, children: [], raw: src.slice(pos, cm.index) });
      pos = cm.index + cm[0].length;
      TAG_RE.lastIndex = pos;
      continue;
    }
    if (name === "else" || name === "elif") {
      const b = top();
      if (b.name !== "if") { errors.push(`[[${name}]] außerhalb von [[if]]`); continue; }
      b.branches!.push({ test: name === "else" ? null : attrs.test ?? "false", children: [] });
      b.children = b.branches![b.branches!.length - 1].children;
      continue;
    }
    if (SELF_CLOSING.has(name)) {
      top().children.push({ t: "block", name, attrs, children: [] });
      continue;
    }
    const block: Node & { t: "block" } = { t: "block", name, attrs, children: [] };
    if (name === "if") {
      block.branches = [{ test: attrs.test ?? "false", children: block.children }];
    }
    top().children.push(block);
    stack.push(block);
  }
  pushText(src.slice(pos));
  for (const b of stack.slice(1)) errors.push(`[[${b.name}]] wird nicht geschlossen`);
  return { nodes: root.children, errors };
}

// ---- Rendering --------------------------------------------------------------------

/** Trennt "expr, simp=false" an Kommas auf oberster Ebene. */
function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let depth = 0, cur = "", inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      cur += c;
      if (c === "\\") { cur += s[++i] ?? ""; continue; }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    if ("([{".includes(c)) depth++;
    if (")]}".includes(c)) depth--;
    if (c === "," && depth === 0) { parts.push(cur); cur = ""; continue; }
    cur += c;
  }
  parts.push(cur);
  return parts;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

class Renderer {
  mathDepth = 0; // >0: innerhalb von \( \) oder \[ \]
  jsx: JsxBlock[] = [];
  errors: string[] = [];
  jsxCounter = 0;

  constructor(public env: Env, public ctx: Ctx, public opts: CasTextOptions) {}

  evalExpr(src: string, env: Env): Expr {
    const parts = splitTopLevel(src);
    let simp: boolean | null = null;
    let exprSrc = src;
    if (parts.length > 1) {
      const opts = parts.slice(1).map((p) => p.trim());
      if (opts.every((o) => /^simp\s*=\s*(true|false)$/.test(o))) {
        simp = /true/.test(opts[opts.length - 1]);
        exprSrc = parts[0];
      }
    }
    const e = parseExpression(exprSrc);
    if (simp === null) return evaluate(e, env, this.ctx);
    const prev = this.ctx.simp;
    this.ctx.simp = simp;
    try {
      return evaluate(e, env, this.ctx);
    } finally {
      this.ctx.simp = prev;
    }
  }

  errorSpan(msg: string): string {
    this.errors.push(msg);
    return `<span class="stack-error" title="${escapeHtml(msg)}">⚠ ${escapeHtml(msg)}</span>`;
  }

  trackMath(text: string) {
    for (const m of text.matchAll(/\\\(|\\\)|\\\[|\\\]|\$\$/g)) {
      if (m[0] === "\\(" || m[0] === "\\[") this.mathDepth++;
      else if (m[0] === "\\)" || m[0] === "\\]") this.mathDepth = Math.max(0, this.mathDepth - 1);
      else this.mathDepth = this.mathDepth > 0 ? this.mathDepth - 1 : 1;
    }
  }

  renderText(text: string, env: Env): string {
    let out = "";
    let pos = 0;
    const re = /\{@([\s\S]*?)@\}|\{#([\s\S]*?)#\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const before = text.slice(pos, m.index);
      this.trackMath(before);
      out += before;
      pos = m.index + m[0].length;
      // Ergebnis des Maxima-Servers verwenden (nur außerhalb von foreach/define mit lokalen Variablen)
      const server = env === this.env ? this.opts.cas?.get((m[1] ?? m[2]).trim()) : undefined;
      if (server && (m[1] === undefined || server.tex)) {
        if (m[1] !== undefined) out += this.mathDepth > 0 ? `{${server.tex}}` : `\\(${server.tex}\\)`;
        else out += escapeHtml(/^".*"$/s.test(server.value) ? server.value.slice(1, -1) : server.value);
        continue;
      }
      try {
        if (m[1] !== undefined) {
          const v = this.evalExpr(m[1], env);
          const tex = toTex(v, this.opts.print);
          out += this.mathDepth > 0 ? `{${tex}}` : `\\(${tex}\\)`;
        } else {
          const v = this.evalExpr(m[2], env);
          out += escapeHtml(v.k === "str" ? v.v : toMaxima(v));
        }
      } catch (e) {
        out += this.errorSpan(`${m[0]}: ${e instanceof Error ? e.message : e}`);
      }
    }
    const rest = text.slice(pos);
    this.trackMath(rest);
    return out + rest;
  }

  /** Ersetzt {#...#} in JavaScript-Code (JSXGraph). */
  substituteRaw(code: string, env: Env): string {
    return code.replace(/\{#([\s\S]*?)#\}/g, (_, src: string) => {
      try {
        const v = this.evalExpr(src, env);
        return v.k === "str" ? JSON.stringify(v.v).slice(1, -1) : toMaxima(v);
      } catch (e) {
        this.errors.push(`{#${src}#}: ${e instanceof Error ? e.message : e}`);
        return "NaN";
      }
    });
  }

  renderNodes(nodes: Node[], env: Env): string {
    return nodes.map((n) => this.renderNode(n, env)).join("");
  }

  renderNode(n: Node, env: Env): string {
    if (n.t === "text") return this.renderText(n.v, env);
    if (n.t === "ph") return this.opts.placeholder(n.kind, n.name);
    const a = n.attrs;
    switch (n.name) {
      case "if": {
        for (const br of n.branches ?? []) {
          if (br.test === null) return this.renderNodes(br.children, env);
          try {
            const v = this.evalExpr(br.test, env);
            const t = truth(v);
            if (t === null) return this.errorSpan(`[[if test="${br.test}"]] ist weder true noch false`);
            if (t) return this.renderNodes(br.children, env);
          } catch (e) {
            return this.errorSpan(`[[if test="${br.test}"]]: ${e instanceof Error ? e.message : e}`);
          }
        }
        return "";
      }
      case "foreach": {
        const local = new EnvClass(env);
        try {
          const lists = Object.entries(a).map(([k, src]) => {
            const v = this.evalExpr(src, env);
            if (v.k !== "list" && v.k !== "set") throw new Error(`${k} ist keine Liste`);
            return [k, v.items] as const;
          });
          const len = Math.min(...lists.map(([, it]) => it.length));
          let out = "";
          for (let i = 0; i < len; i++) {
            for (const [k, items] of lists) local.vars.set(k, items[i]);
            out += this.renderNodes(n.children, local);
          }
          return out;
        } catch (e) {
          return this.errorSpan(`[[foreach]]: ${e instanceof Error ? e.message : e}`);
        }
      }
      case "define": {
        for (const [k, src] of Object.entries(a)) {
          try {
            env.vars.set(k, this.evalExpr(src, env));
          } catch (e) {
            return this.errorSpan(`[[define ${k}]]: ${e instanceof Error ? e.message : e}`);
          }
        }
        return "";
      }
      case "comment": return "";
      case "escape": return escapeHtml(a.value ?? n.raw ?? "");
      case "lang": {
        const codes = (a.code ?? "").split(",").map((c) => c.trim());
        return codes.includes("de") || codes.includes("other") ? this.renderNodes(n.children, env) : "";
      }
      case "hint":
        return `<details class="stack-hint"><summary>${escapeHtml(a.title ?? "Hinweis")}</summary>${this.renderNodes(n.children, env)}</details>`;
      case "todo":
        return `<div class="stack-todo">TODO: ${this.renderNodes(n.children, env)}</div>`;
      case "debug": {
        const rows = [...this.env.vars.entries()]
          .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td><code>${escapeHtml(toMaxima(v))}</code></td></tr>`)
          .join("");
        return `<table class="stack-debug">${rows}</table>`;
      }
      case "jsxgraph": {
        const id = `${this.opts.idPrefix ?? "stack"}-jxg-${this.jsxCounter++}`;
        const inputRefs: Record<string, string> = {};
        for (const [k, v] of Object.entries(a)) {
          const mm = /^input-ref-(\w+)$/.exec(k);
          if (mm) inputRefs[v] = mm[1];
        }
        const width = a.width ?? "500px";
        const height = a.height ?? "400px";
        this.jsx.push({ id, code: this.substituteRaw(n.raw ?? "", env), inputRefs, width, height });
        return `<div id="${id}" class="jxgbox stack-jsxgraph" style="width:${escapeHtml(width)};height:${escapeHtml(height)}"></div>`;
      }
      case "geogebra":
      case "parsons":
      case "textdownload":
      case "javascript":
        return `<div class="stack-unsupported">[[${n.name}]] – in der lokalen Vorschau nicht verfügbar</div>`;
      default:
        // Formatierungsblöcke (markdown, htmlformat, moodleformat, demarkdown …): Inhalt durchreichen
        return this.renderNodes(n.children, env);
    }
  }
}

export function renderCasText(src: string, env: Env, ctx: Ctx, opts: CasTextOptions): CasTextResult {
  const { nodes, errors } = parseCasText(src);
  const r = new Renderer(env, ctx, opts);
  const html = r.renderNodes(nodes, env);
  return { html, jsx: r.jsx, errors: [...errors, ...r.errors] };
}

/** Findet alle Platzhalter im CASText – für Konsistenzprüfungen im Editor. */
export function findPlaceholders(src: string): { kind: string; name: string; index: number }[] {
  const out: { kind: string; name: string; index: number }[] = [];
  for (const m of src.matchAll(/\[\[\s*(input|validation|feedback):(\w+)\s*\]\]/g)) {
    out.push({ kind: m[1], name: m[2], index: m.index ?? 0 });
  }
  return out;
}
