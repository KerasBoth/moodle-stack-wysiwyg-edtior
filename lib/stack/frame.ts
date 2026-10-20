// HTML-Dokument für das Vorschau-iframe. Es wird einmal geladen und danach
// per postMessage mit neuem Inhalt versorgt (kein Neuladen von MathJax).

export const FRAME_STYLE = `
:root { color-scheme: light; }
html, body { margin: 0; background: #fff; }
body { font: 15px/1.55 "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif; color: #1d2125; padding: 18px 22px 40px; }
.que { border: 1px solid #dee2e6; border-radius: 6px; background: #fff; }
.que .info { background: #f8f9fa; border-bottom: 1px solid #dee2e6; padding: 8px 14px; font-size: 13px; color: #5c6670; display:flex; gap:14px; flex-wrap:wrap; }
.que .info b { color: #1d2125; }
.que .content { padding: 14px 18px; }
.formulation { background: #e7f3f5; border-radius: 4px; padding: 12px 16px; color: #001a1e; }
.formulation p { margin: 0 0 .7em; }
.stack-input, .stack-textarea, .stack-matrix input { font: 14px/1.3 ui-monospace, "Cascadia Code", Consolas, monospace; padding: 4px 6px; border: 1px solid #8f959e; border-radius: 4px; background: #fff; }
.stack-input:focus, .stack-textarea:focus, .stack-select:focus { outline: 2px solid #0f6cbf55; border-color: #0f6cbf; }
.stack-select { font: inherit; padding: 3px 6px; border: 1px solid #8f959e; border-radius: 4px; background: #fff; }
.stack-choices { display: inline-flex; flex-direction: column; gap: 2px; vertical-align: top; }
.stack-choice { display: flex; align-items: center; gap: 6px; }
.stack-matrix { display: inline-table; border-left: 2px solid #333; border-right: 2px solid #333; border-radius: 4px; padding: 2px; vertical-align: middle; }
.stack-validation:empty, .stack-feedback:empty { display: none; }
.stack-validation { display: block; margin: 6px 0; }
.stack-valid { border: 1px solid #c6d9e8; background: #f4f9fd; border-radius: 4px; padding: 6px 10px; font-size: 13.5px; }
.stack-vars { color: #5c6670; font-size: 12.5px; }
.stack-invalid { border: 1px solid #f0b4b4; background: #fdf3f3; color: #8a1f1f; border-radius: 4px; padding: 6px 10px; font-size: 13.5px; }
.stack-invalid code { color: #5c1414; }
.stack-feedback { display: block; margin: 6px 0; }
.stack-prt { border-radius: 4px; padding: 8px 12px; }
.stack-prt.correct { background: #e6f4ea; border: 1px solid #a8d5b5; }
.stack-prt.partially { background: #fff6e0; border: 1px solid #f0d28a; }
.stack-prt.incorrect { background: #fdecea; border: 1px solid #f2b8b5; }
.stack-prt-fb { margin-top: 4px; }
.stack-prt-meta { font-size: 12px; color: #5c6670; margin-top: 4px; font-family: ui-monospace, Consolas, monospace; }
.stack-error { color: #b00020; background: #fde8eb; border-radius: 3px; padding: 0 4px; font-size: 13px; font-family: ui-monospace, Consolas, monospace; }
.stack-unsupported, .stack-todo { border: 1px dashed #b5a46a; background: #fffbea; padding: 8px; border-radius: 4px; font-size: 13px; color: #6b5a1e; }
.stack-hint summary { cursor: pointer; color: #0f6cbf; }
.stack-jsxgraph { max-width: 100%; margin: 8px 0; border: 1px solid #dee2e6; border-radius: 4px; }
.section { margin-top: 14px; }
.section h4 { margin: 0 0 6px; font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: #5c6670; }
.specific { background: #fcefdc; border-radius: 4px; padding: 10px 14px; }
.general { background: #f0f0f0; border-radius: 4px; padding: 10px 14px; }
.answers table { border-collapse: collapse; font-size: 14px; }
.answers td, .answers th { border: 1px solid #dee2e6; padding: 4px 10px; text-align: left; }
.answers th { background: #f8f9fa; font-weight: 600; }
.answers code { font-size: 12px; color: #5c6670; }
.btn { font: inherit; background: #0f6cbf; color: #fff; border: 0; border-radius: 4px; padding: 7px 16px; cursor: pointer; }
.btn:hover { background: #0c589c; }
.btn.secondary { background: #ced4da; color: #1d2125; }
.btn.secondary:hover { background: #b8bfc6; }
.actions { margin-top: 14px; display: flex; gap: 8px; }
.score { margin-top: 12px; font-size: 13.5px; color: #1d2125; }
.fa { font-style: normal; font-family: inherit; }
.fa-check:before { content: "✔"; }
.fa-times:before { content: "✘"; }
.fa-adjust:before { content: "◐"; }
.fa-question:before { content: "?"; }
mjx-container[display="true"] { margin: .4em 0 !important; }
`;

const FRAME_SCRIPT = String.raw`
(function () {
  var boards = [];
  var send = function (msg) { parent.postMessage(Object.assign({ __stackPreview: true }, msg), "*"); };

  function typeset(el) {
    if (!window.MathJax || !MathJax.typesetPromise) return;
    try { MathJax.typesetClear && MathJax.typesetClear([el]); } catch (e) {}
    MathJax.typesetPromise([el]).catch(function (e) { console.warn("MathJax:", e); });
  }

  function rawValue(name) {
    var matrix = document.querySelector('[data-stack-matrix="' + name + '"]');
    if (matrix) {
      var rows = +matrix.dataset.rows, cols = +matrix.dataset.cols, out = [];
      for (var i = 0; i < rows; i++) { var r = []; for (var j = 0; j < cols; j++) { var c = matrix.querySelector('[data-r="' + i + '"][data-c="' + j + '"]'); r.push(c ? c.value : ""); } out.push(r); }
      return out;
    }
    var els = document.querySelectorAll('[data-stack-input="' + name + '"]');
    if (!els.length) return "";
    var first = els[0];
    if (first.type === "radio") { for (var k = 0; k < els.length; k++) if (els[k].checked) return els[k].value; return ""; }
    if (first.type === "checkbox") { var sel = []; for (var m = 0; m < els.length; m++) if (els[m].checked) sel.push(els[m].value); return sel; }
    return first.value;
  }

  function setRawValue(name, v) {
    var matrix = document.querySelector('[data-stack-matrix="' + name + '"]');
    if (matrix && Array.isArray(v)) {
      v.forEach(function (row, i) { (row || []).forEach(function (cell, j) { var c = matrix.querySelector('[data-r="' + i + '"][data-c="' + j + '"]'); if (c) c.value = cell; }); });
      return;
    }
    var els = document.querySelectorAll('[data-stack-input="' + name + '"]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.type === "radio") el.checked = el.value === v;
      else if (el.type === "checkbox") el.checked = Array.isArray(v) && v.indexOf(el.value) >= 0;
      else el.value = v == null ? "" : v;
    }
  }

  function onChange(ev) {
    var t = ev.target;
    var name = t.getAttribute("data-stack-input") || t.getAttribute("data-matrix-cell");
    if (!name) return;
    send({ type: "answer", name: name, raw: rawValue(name) });
  }
  document.addEventListener("input", onChange);
  document.addEventListener("change", onChange);

  document.addEventListener("click", function (ev) {
    var a = ev.target.closest && ev.target.closest("[data-action]");
    if (a) { ev.preventDefault(); send({ type: "action", action: a.getAttribute("data-action") }); }
  });

  // ---- STACK-JSXGraph-Bindings (vereinfachte Nachbildung) ----
  function fire(el) { el.dispatchEvent(new Event("input", { bubbles: true })); }
  function round(x) { return Math.round(x * 1e6) / 1e6; }
  function parsePair(s) { var m = /^\s*\[\s*([-+0-9.eE]+)\s*,\s*([-+0-9.eE]+)\s*\]\s*$/.exec(s || ""); return m ? [parseFloat(m[1]), parseFloat(m[2])] : null; }
  var stack_jxg = {
    bind_point: function (ref, p) {
      var el = document.getElementById(ref); if (!el) return;
      var init = parsePair(el.value); if (init && p.setPosition) { try { p.setPosition(JXG.COORDS_BY_USER, init); p.board.update(); } catch (e) {} }
      var last = "";
      var upd = function () { var v = "[" + round(p.X()) + "," + round(p.Y()) + "]"; if (v !== last) { last = v; el.value = v; fire(el); } };
      p.board.on("update", upd); p.on && p.on("drag", upd);
    },
    bind_point_dual: function (ref, p) { stack_jxg.bind_point(ref, p); },
    bind_point_relative: function (ref, p) { stack_jxg.bind_point(ref, p); },
    bind_point_direction: function (ref, p) { stack_jxg.bind_point(ref, p); },
    bind_slider: function (ref, s) {
      var el = document.getElementById(ref); if (!el) return;
      if (el.value !== "" && !isNaN(+el.value)) { try { s.setValue(+el.value); s.board.update(); } catch (e) {} }
      var last = "";
      var upd = function () { var v = String(round(s.Value())); if (v !== last) { last = v; el.value = v; fire(el); } };
      s.board.on("update", upd);
    },
    bind_list_of: function (ref, list) {
      var el = document.getElementById(ref); if (!el || !list.length) return;
      var last = "";
      var upd = function () {
        var v = "[" + list.map(function (o) { return o.Value ? String(round(o.Value())) : "[" + round(o.X()) + "," + round(o.Y()) + "]"; }).join(",") + "]";
        if (v !== last) { last = v; el.value = v; fire(el); }
      };
      list[0].board.on("update", upd);
    },
    custom_bind: function (ref, serializer, deserializer, objects) {
      var el = document.getElementById(ref); if (!el) return;
      try { if (el.value) deserializer(el.value); } catch (e) {}
      var last = "";
      var upd = function () { var v = serializer(); if (v !== last) { last = v; el.value = v; fire(el); } };
      (objects || []).forEach(function (o) { o.board && o.board.on("update", upd); });
    },
    define_group: function () {},
    starts_moved: function () { return false; },
    serialize_object: function (o) { return o.Value ? o.Value() : [o.X(), o.Y()]; },
  };
  window.stack_jxg = stack_jxg;

  function runJsx(blocks) {
    boards.forEach(function (b) { try { JXG.JSXGraph.freeBoard(b); } catch (e) {} });
    boards = [];
    if (!blocks.length) return;
    if (!window.JXG) { blocks.forEach(function (b) { var d = document.getElementById(b.id); if (d) d.innerHTML = '<div class="stack-error">JSXGraph konnte nicht geladen werden</div>'; }); return; }
    var origInit = JXG.JSXGraph.initBoard;
    JXG.JSXGraph.initBoard = function () { var b = origInit.apply(this, arguments); boards.push(b); return b; };
    blocks.forEach(function (b) {
      var refNames = Object.keys(b.inputRefs);
      var refIds = refNames.map(function (r) { return "stackinput_" + b.inputRefs[r]; });
      try {
        var fn = new Function(["divid", "stack_jxg", "JXG"].concat(refNames).join(","), b.code);
        fn.apply(window, [b.id, stack_jxg, JXG].concat(refIds));
      } catch (e) {
        var d = document.getElementById(b.id);
        if (d) { var err = document.createElement("div"); err.className = "stack-error"; err.textContent = "JSXGraph-Fehler: " + e.message; d.parentNode.insertBefore(err, d.nextSibling); }
        send({ type: "jsxerror", message: String(e && e.message || e) });
      }
    });
    JXG.JSXGraph.initBoard = origInit;
  }

  window.addEventListener("message", function (ev) {
    var m = ev.data;
    if (!m || !m.__stackHost) return;
    var root = document.getElementById("root");
    if (m.type === "ping") { send({ type: "ready" }); return; }
    if (m.type === "render") {
      var scroll = document.scrollingElement.scrollTop;
      root.innerHTML = m.html;
      Object.keys(m.answers || {}).forEach(function (k) { setRawValue(k, m.answers[k]); });
      runJsx(m.jsx || []);
      typeset(root);
      document.scrollingElement.scrollTop = scroll;
    } else if (m.type === "fragment") {
      var el = document.querySelector(m.selector);
      if (el) { el.innerHTML = m.html; typeset(el); }
    } else if (m.type === "setAnswers") {
      Object.keys(m.answers || {}).forEach(function (k) { setRawValue(k, m.answers[k]); });
    }
  });

  window.MathJax = window.MathJax || {};
  send({ type: "ready" });
})();
`;

export function buildFrameDocument(): string {
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/vendor/jsxgraph/jsxgraph.css">
<style>${FRAME_STYLE}</style>
<script>
window.MathJax = {
  tex: { inlineMath: [["\\\\(", "\\\\)"]], displayMath: [["\\\\[", "\\\\]"], ["$$", "$$"]], processEscapes: true },
  options: { skipHtmlTags: ["script", "noscript", "style", "textarea", "pre", "code", "select", "option"] },
  chtml: { scale: 1.02 },
  startup: { typeset: false }
};
</script>
<script src="/vendor/mathjax/tex-chtml-full.js" async></script>
<script src="/vendor/jsxgraph/jsxgraphcore.js"></script>
</head><body><div id="root"><p style="color:#5c6670">Vorschau wird geladen …</p></div>
<script>${FRAME_SCRIPT}</script>
</body></html>`;
}
