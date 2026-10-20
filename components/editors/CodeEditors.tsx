"use client";

import { xml } from "@codemirror/lang-xml";
import { EditorView, keymap, placeholder as cmPlaceholder } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import CodeMirror, { type BasicSetupOptions } from "@uiw/react-codemirror";
import { useEffect, useMemo, useRef } from "react";
import { forceLinting } from "@codemirror/lint";
import { acceptCompletion } from "@codemirror/autocomplete";
import { casTextExtensions } from "@/lib/editor/castext";
import { type ExternalDiagnostic, maximaExtensions } from "@/lib/editor/maxima";

const blockSetup: BasicSetupOptions = {
  lineNumbers: true,
  foldGutter: false,
  autocompletion: false,
  highlightActiveLine: true,
  highlightActiveLineGutter: true,
  bracketMatching: true,
  closeBrackets: true,
  indentOnInput: true,
  searchKeymap: true,
  tabSize: 2,
};

const singleSetup: BasicSetupOptions = {
  ...blockSetup,
  lineNumbers: false,
  highlightActiveLine: false,
  highlightActiveLineGutter: false,
  foldGutter: false,
};

// Tab übernimmt den markierten (zu Beginn den ersten) Vorschlag der offenen Vervollständigung;
// ohne offene Liste bleibt Tab beim normalen Einrücken.
const tabAccepts = Prec.highest(keymap.of([{ key: "Tab", run: acceptCompletion }]));

// Einzeilige Felder: Enter erzeugt keinen Zeilenumbruch
const noEnter = Prec.highest(keymap.of([{ key: "Enter", run: (v) => singleLineGuard(v) }]));
function singleLineGuard(view: EditorView): boolean {
  // Wenn die Vervollständigung offen ist, übernimmt sie Enter (höhere Priorität dort nicht nötig)
  return !view.dom.querySelector(".cm-tooltip-autocomplete");
}

interface MaximaProps {
  value: string;
  onChange: (v: string) => void;
  mode?: "block" | "expr";
  minHeight?: string;
  maxHeight?: string;
  placeholder?: string;
  diagnostics?: ExternalDiagnostic[];
  onView?: (v: EditorView) => void;
}

export function MaximaEditor({ value, onChange, mode = "block", minHeight, maxHeight, placeholder, diagnostics, onView }: MaximaProps) {
  const diagRef = useRef<ExternalDiagnostic[]>([]);
  diagRef.current = diagnostics ?? [];
  const viewRef = useRef<EditorView | null>(null);
  const diagKey = JSON.stringify(diagnostics ?? []);
  useEffect(() => {
    if (viewRef.current) forceLinting(viewRef.current);
  }, [diagKey]);
  const extensions = useMemo(
    () => [
      tabAccepts,
      ...maximaExtensions({ mode, getExternal: () => diagRef.current }),
      ...(mode === "expr" ? [noEnter] : []),
      ...(placeholder ? [cmPlaceholder(placeholder)] : []),
    ],
    [mode, placeholder],
  );
  return (
    <div className={`cmwrap ${mode === "expr" ? "single" : ""}`}>
      <CodeMirror
        value={value}
        onChange={onChange}
        extensions={extensions}
        basicSetup={mode === "expr" ? singleSetup : blockSetup}
        minHeight={minHeight ?? (mode === "expr" ? undefined : "120px")}
        maxHeight={maxHeight}
        theme="light"
        onCreateEditor={(v) => { viewRef.current = v; onView?.(v); }}
      />
    </div>
  );
}

interface CasProps {
  value: string;
  onChange: (v: string) => void;
  minHeight?: string;
  maxHeight?: string;
  placeholder?: string;
  compact?: boolean;
  onView?: (v: EditorView) => void;
}

export function CasTextEditor({ value, onChange, minHeight, maxHeight, placeholder, compact, onView }: CasProps) {
  const extensions = useMemo(
    () => [
      tabAccepts,
      ...casTextExtensions(),
      ...(placeholder ? [cmPlaceholder(placeholder)] : []),
    ],
    [placeholder],
  );
  return (
    <div className="cmwrap">
      <CodeMirror
        value={value}
        onChange={onChange}
        extensions={extensions}
        basicSetup={compact ? { ...blockSetup, lineNumbers: false, highlightActiveLine: false } : blockSetup}
        minHeight={minHeight ?? "80px"}
        maxHeight={maxHeight}
        theme="light"
        onCreateEditor={(v) => onView?.(v)}
      />
    </div>
  );
}

export function XmlViewer({ value }: { value: string }) {
  const extensions = useMemo(() => [xml(), EditorView.lineWrapping], []);
  return (
    <div className="cmwrap">
      <CodeMirror value={value} editable={false} readOnly extensions={extensions} basicSetup={{ ...blockSetup, foldGutter: true }} theme="light" />
    </div>
  );
}

/** Fügt Text in einen Editor ein; markierter Text wird ggf. umschlossen (Marker "|"). */
export function insertSnippet(view: EditorView | null, snippet: string) {
  if (!view) return;
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const [before, after = ""] = snippet.split("|");
  const text = before + selected + after;
  view.dispatch({
    changes: { from, to, insert: text },
    selection: selected ? { anchor: from, head: from + text.length } : { anchor: from + before.length },
    scrollIntoView: true,
  });
  view.focus();
}
