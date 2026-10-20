// Kopiert MathJax, JSXGraph und die MathLive-Schriften nach public/vendor, damit die Vorschau offline funktioniert.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nm = join(root, "node_modules");
const out = join(root, "public", "vendor");

const copies = [
  ["mathjax/es5", "mathjax"],
  ["jsxgraph/distrib/jsxgraphcore.js", "jsxgraph/jsxgraphcore.js"],
  ["jsxgraph/distrib/jsxgraph.css", "jsxgraph/jsxgraph.css"],
  ["mathlive/fonts", "mathlive/fonts"],
];

for (const [from, to] of copies) {
  const src = join(nm, from);
  if (!existsSync(src)) {
    console.warn(`[copy-vendor] nicht gefunden: ${src}`);
    continue;
  }
  const dest = join(out, to);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
}
console.log("[copy-vendor] MathJax, JSXGraph & MathLive-Schriften nach public/vendor kopiert");
