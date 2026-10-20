"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toMaxima } from "@/lib/maxima/print";
import { editorContext } from "@/lib/editor/context";
import { type Quiz, type StackQuestion, newQuestion, newUid } from "@/lib/stack/model";
import { type PreviewBuild, buildPreview } from "@/lib/stack/preview";
import { type CasRequest, type CasResult, casExpressions } from "@/lib/stack/maximaprogram";
import { parseQuiz, writeQuiz } from "@/lib/stack/xml";
import type { Category, FileFull, FileInfo, User } from "@/lib/server/store";
import { api, ApiError } from "@/lib/client/api";
import {
  IconBook, IconChat, IconCode, IconCopy, IconDownload, IconFile, IconFlask, IconGear, IconHome, IconInfo,
  IconInput, IconMenu, IconPanel, IconPlus, IconSave, IconText, IconTrash, IconTree, IconUpload, IconVars,
} from "./icons";
import Preview from "./Preview";
import Reference from "./Reference";
import { FeedbackSection, GeneralSection, OptionsSection, QuestionTextSection, VariablesSection, XmlSection } from "./sections/BasicSections";
import InputsSection from "./sections/InputsSection";
import PrtsSection from "./sections/PrtsSection";
import TestsSection from "./sections/TestsSection";
import UserMenu from "./UserMenu";

export type Updater = (fn: (q: StackQuestion) => void) => void;

export interface SectionProps {
  q: StackQuestion;
  update: Updater;
  build: PreviewBuild | null;
  seed: number;
  setSeed: (s: number) => void;
  quiz: Quiz;
}

type SectionId = "general" | "variables" | "text" | "inputs" | "prts" | "feedback" | "options" | "tests" | "xml";

export type CasMode = "auto" | "local" | "maxima";
export interface CasStatus { configured: boolean; loading: boolean; server?: string; error?: string; lastError?: string }
const CAS_MODE_KEY = "stack-editor-cas-mode";

/** Die im Editor geöffnete Datei aus der Datenbank. */
interface OpenFile { id: number; name: string; updatedAt: string }

const draftKey = (userId: number) => `stack-editor-draft-v2-${userId}`;

function randomSeed() {
  return Math.floor(Math.random() * 2_000_000_000) + 1;
}

interface AppProps {
  user: User;
  initialFileId: number | null;
  startNew: boolean;
  initialCategoryId: number | null;
}

export default function StackEditorApp({ user, initialFileId, startNew, initialCategoryId }: AppProps) {
  const [quiz, setQuiz] = useState<Quiz>(() => ({ items: [{ kind: "stack", q: newQuestion() }] }));
  const [sel, setSel] = useState(0);
  const [file, setFile] = useState<OpenFile | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(initialCategoryId);
  const [categories, setCategories] = useState<Category[]>([]);
  const fileName = file?.name ?? null;
  const [dirty, setDirty] = useState(false);
  const [section, setSection] = useState<SectionId>("text");
  const [seed, setSeed] = useState<number>(1);
  const [build, setBuild] = useState<PreviewBuild | null>(null);
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [menu, setMenu] = useState<"open" | null>(null);
  const [showRef, setShowRef] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [previewW, setPreviewW] = useState(44);
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const loaded = useRef(false);
  const [ready, setReady] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const stackItems = useMemo(
    () => quiz.items.map((it, idx) => ({ it, idx })).filter((x) => x.it.kind === "stack"),
    [quiz],
  );
  const current = stackItems[Math.min(sel, stackItems.length - 1)];
  const q = current?.it.kind === "stack" ? current.it.q : null;

  const notify = useCallback((msg: string, err = false) => {
    setToast({ msg, err });
    window.setTimeout(() => setToast(null), err ? 5000 : 2600);
  }, []);

  // ---- Laden ------------------------------------------------------------------

  const refreshFiles = useCallback(async () => {
    try {
      const [f, c] = await Promise.all([
        api<{ files: FileInfo[] }>("/api/files?limit=30"),
        api<{ categories: Category[] }>("/api/categories"),
      ]);
      setFiles(f.files);
      setCategories(c.categories);
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), true);
    }
  }, [notify]);

  /** Lädt XML in den Editor. `meta`: Datei aus der Datenbank, `null` für hochgeladene Inhalte. */
  const loadXml = useCallback((content: string, meta: (OpenFile & { categoryId: number | null }) | null, label?: string) => {
    try {
      const qz = parseQuiz(content);
      if (!qz.items.some((i) => i.kind === "stack")) {
        notify("Die Datei enthält keine STACK-Aufgabe", true);
        return false;
      }
      setQuiz(qz);
      setSel(0);
      setFile(meta && { id: meta.id, name: meta.name, updatedAt: meta.updatedAt });
      if (meta) setCategoryId(meta.categoryId);
      setDirty(false);
      const first = qz.items.find((i) => i.kind === "stack");
      const seeds = first?.kind === "stack" ? first.q.deployedseeds : [];
      setSeed(seeds.length ? Number(seeds[0]) : randomSeed());
      notify(`${meta?.name ?? label ?? "XML"} geladen – ${qz.items.filter((i) => i.kind === "stack").length} STACK-Aufgabe(n)`);
      return true;
    } catch (e) {
      notify(`XML konnte nicht gelesen werden: ${e instanceof Error ? e.message : e}`, true);
      return false;
    }
  }, [notify]);

  const fetchAndLoad = useCallback(async (id: number) => {
    try {
      const { file: f } = await api<{ file: FileFull }>(`/api/files/${id}`);
      return loadXml(f.content, f);
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), true);
      return false;
    }
  }, [loadXml, notify]);

  const openServerFile = useCallback(async (id: number) => {
    setMenu(null);
    if (dirty && !window.confirm("Ungespeicherte Änderungen verwerfen?")) return;
    fetchAndLoad(id);
  }, [dirty, fetchAndLoad]);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    const init = async () => {
      refreshFiles();
      type Draft = { quiz: Quiz; file: OpenFile | null; categoryId: number | null; sel: number; seed: number; dirty: boolean };
      let draft: Draft | null = null;
      try {
        const raw = localStorage.getItem(draftKey(user.id));
        if (raw) draft = JSON.parse(raw) as Draft;
        if (!draft?.quiz?.items?.length) draft = null;
      } catch { /* defekter Entwurf wird ignoriert */ }
      const restore = (d: Draft) => {
        setQuiz(d.quiz);
        setFile(d.file ?? null);
        setCategoryId(d.categoryId ?? null);
        setSel(d.sel ?? 0);
        setSeed(d.seed ?? 1);
        setDirty(!!d.dirty);
        notify("Letzter Arbeitsstand wiederhergestellt");
      };

      if (startNew) {
        setSeed(randomSeed());
        setSection("variables");
        return;
      }
      if (initialFileId !== null) {
        // ungespeicherte Änderungen an genau dieser Datei haben Vorrang
        if (draft?.dirty && draft.file?.id === initialFileId) return restore(draft);
        if (!(await fetchAndLoad(initialFileId))) setSeed(randomSeed());
        return;
      }
      if (draft) return restore(draft);
      const recent = await api<{ files: FileInfo[] }>("/api/files?limit=1").catch(() => ({ files: [] as FileInfo[] }));
      if (recent.files.length) await fetchAndLoad(recent.files[0].id);
      else setSeed(randomSeed());
    };
    init().finally(() => setReady(true));
  }, [refreshFiles, fetchAndLoad, notify, user.id, startNew, initialFileId]);

  // Die Adresse zeigt die geöffnete Datei (Neuladen/Lesezeichen öffnen sie wieder) –
  // erst nach dem ersten Laden, sonst stünde kurz „?new=1“ statt der angeforderten Datei in der Adresse
  useEffect(() => {
    if (!ready) return;
    const url = file ? `/editor?file=${file.id}` : categoryId !== null ? `/editor?new=1&category=${categoryId}` : "/editor?new=1";
    if (window.location.pathname + window.location.search !== url) window.history.replaceState(null, "", url);
    document.title = `${file?.name ?? "Neue Aufgabe"} – STACK-Editor`;
  }, [ready, file, categoryId]);

  // Entwurf automatisch sichern
  useEffect(() => {
    if (!loaded.current) return;
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(draftKey(user.id), JSON.stringify({ quiz, file, categoryId, sel, seed, dirty }));
      } catch { /* Speicher voll o. ä. */ }
    }, 600);
    return () => window.clearTimeout(t);
  }, [quiz, file, categoryId, sel, seed, dirty, user.id]);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // ---- Bearbeiten ------------------------------------------------------------------

  const update: Updater = useCallback((fn) => {
    setQuiz((prev) => {
      const next = structuredClone(prev);
      const items = next.items.map((it, idx) => ({ it, idx })).filter((x) => x.it.kind === "stack");
      const target = items[Math.min(sel, items.length - 1)];
      if (target && target.it.kind === "stack") fn(target.it.q);
      return next;
    });
    setDirty(true);
  }, [sel]);

  // ---- Vorschau berechnen (entprellt) -----------------------------------------------------
  // Lokal sofort; mit Maxima-Server zusätzlich echt gerechnet, wenn eingestellt bzw. lokal nicht möglich.

  const [casMode, setCasModeState] = useState<CasMode>("auto");
  const [casStatus, setCasStatus] = useState<CasStatus>({ configured: false, loading: false });
  const casCache = useRef(new Map<string, CasResult>());
  useEffect(() => {
    try {
      const m = localStorage.getItem(CAS_MODE_KEY);
      if (m === "auto" || m === "local" || m === "maxima") setCasModeState(m);
    } catch { /* Standard: automatisch */ }
    api<{ configured: boolean; reachable?: boolean; server?: string; error?: string }>("/api/maxima")
      .then((s) => setCasStatus((c) => ({ ...c, configured: s.configured, server: s.server, error: s.configured && !s.reachable ? `Maxima-Server nicht erreichbar${s.error ? ` (${s.error})` : ""}` : undefined })))
      .catch(() => { /* ohne Server: lokal */ });
  }, []);
  const setCasMode = useCallback((m: CasMode) => {
    setCasModeState(m);
    try { localStorage.setItem(CAS_MODE_KEY, m); } catch { /* ignorieren */ }
  }, []);

  useEffect(() => {
    if (!q) return;
    let cancelled = false;
    const publish = (b: PreviewBuild) => {
      setBuild(b);
      editorContext.current = {
        variables: b.vars.variables.map((v) => ({ name: v.name, value: toMaxima(v.value) })),
        functions: [...b.env.funcs.keys()],
        inputs: q.inputs.map((i) => i.fields.name),
        prts: q.prts.map((p) => p.name),
      };
    };
    const t = window.setTimeout(async () => {
      let local: PreviewBuild;
      try {
        local = buildPreview(q, seed);
      } catch (e) {
        console.error(e);
        setBuild(null);
        return;
      }
      const useServer = casStatus.configured && (casMode === "maxima" || (casMode === "auto" && local.needsMaxima));
      if (!useServer) {
        publish(local);
        setCasStatus((c) => (c.loading || c.lastError ? { ...c, loading: false, lastError: undefined } : c));
        return;
      }
      const request: CasRequest = {
        questionvariables: q.questionvariables,
        seed,
        simp: q.scalars.questionsimplify !== "0",
        names: local.vars.variables.map((v) => v.name),
        expressions: [...new Set([q.texts.questiontext.text, q.texts.specificfeedback.text, q.texts.generalfeedback.text, q.texts.questionnote.text].flatMap(casExpressions))],
      };
      const key = JSON.stringify(request);
      const cached = casCache.current.get(key);
      if (cached) {
        publish(buildPreview(q, seed, cached));
        return;
      }
      publish(local);
      setCasStatus((c) => ({ ...c, loading: true }));
      try {
        const result = await api<CasResult>("/api/maxima", { body: request });
        if (cancelled) return;
        casCache.current.set(key, result);
        if (casCache.current.size > 40) casCache.current.delete(casCache.current.keys().next().value!);
        publish(buildPreview(q, seed, result));
        setCasStatus((c) => ({ ...c, loading: false, lastError: undefined }));
      } catch (e) {
        if (cancelled) return;
        // Server nicht verfügbar: bei der lokalen Vorschau bleiben, Grund anzeigen
        const msg = e instanceof Error ? e.message : String(e);
        local.issues.unshift({ severity: "warning", where: "Fragevariablen", message: `Maxima-Server: ${msg} – lokale Vorschau wird verwendet` });
        publish({ ...local });
        setCasStatus((c) => ({ ...c, loading: false, lastError: msg }));
      }
    }, 300);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [q, seed, casMode, casStatus.configured]);

  // ---- Speichern ------------------------------------------------------------------------

  const xmlText = useCallback(() => writeQuiz(quiz), [quiz]);

  /** Speichert in der Datenbank; neue Aufgaben fragen einmalig nach dem Dateinamen. Liefert die gespeicherte Datei. */
  const saveToServer = useCallback(async (): Promise<FileInfo | null> => {
    try {
      let saved: FileInfo;
      if (file) {
        const put = (force: boolean) => api<{ file: FileInfo }>(`/api/files/${file.id}`, {
          method: "PUT", body: { content: xmlText(), baseUpdatedAt: file.updatedAt, force },
        });
        try {
          saved = (await put(false)).file;
        } catch (e) {
          if (!(e instanceof ApiError && e.data.conflict)) throw e;
          if (!window.confirm(`${e.message}.\n\nTrotzdem mit deinem Stand überschreiben? (Die andere Fassung bleibt als Version erhalten)`)) return null;
          saved = (await put(true)).file;
        }
      } else {
        const suggestion = (q?.name ?? "stack-aufgabe").replace(/[^\wäöüÄÖÜß() -]+/g, "").trim().replace(/\s+/g, "-") + ".xml";
        const input = window.prompt("Dateiname der neuen Aufgabe:", suggestion);
        if (!input) return null;
        const post = (overwrite: boolean) => api<{ file: FileInfo }>("/api/files", {
          body: { name: input, content: xmlText(), categoryId, overwrite },
        });
        try {
          saved = (await post(false)).file;
        } catch (e) {
          if (!(e instanceof ApiError && e.status === 409)) throw e;
          if (!window.confirm(`${e.message}. Überschreiben? (Die alte Fassung bleibt als Version erhalten)`)) return null;
          saved = (await post(true)).file;
        }
      }
      setFile({ id: saved.id, name: saved.name, updatedAt: saved.updatedAt });
      setCategoryId(saved.categoryId);
      setDirty(false);
      refreshFiles();
      notify(`Gespeichert: ${saved.name}`);
      return saved;
    } catch (e) {
      notify(e instanceof Error ? e.message : "Speichern fehlgeschlagen", true);
      return null;
    }
  }, [file, categoryId, q, xmlText, notify, refreshFiles]);

  /** Kategorie wechseln – bei gespeicherten Dateien sofort in der Datenbank. */
  const changeCategory = useCallback(async (id: number | null) => {
    setCategoryId(id);
    if (!file) return;
    try {
      await api(`/api/files/${file.id}`, { method: "PUT", body: { categoryId: id } });
      notify(`Kategorie: ${categories.find((c) => c.id === id)?.name ?? "ohne"}`);
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), true);
    }
  }, [file, categories, notify]);

  const download = useCallback((name?: string) => {
    const blob = new Blob([xmlText()], { type: "application/xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name ?? fileName ?? `${(q?.name ?? "stack").replace(/[^\w-]+/g, "_")}.xml`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [xmlText, fileName, q]);

  /** Erst in der Datenbank speichern, dann die XML-Datei für den Moodle-Import herunterladen. */
  const saveAndDownload = useCallback(async () => {
    const saved = await saveToServer();
    if (saved) download(saved.name);
  }, [saveToServer, download]);

  const copyXml = useCallback(async () => {
    await navigator.clipboard.writeText(xmlText());
    notify("XML in die Zwischenablage kopiert");
  }, [xmlText, notify]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (e.shiftKey) saveAndDownload();
        else saveToServer();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [saveToServer, saveAndDownload]);

  const readLocalFile = useCallback((f: File) => {
    if (dirty && !window.confirm("Ungespeicherte Änderungen verwerfen?")) return;
    f.text().then((t) => loadXml(t, null, f.name));
  }, [dirty, loadXml]);

  // Drag & Drop von XML-Dateien
  useEffect(() => {
    const over = (e: DragEvent) => { if (e.dataTransfer?.types.includes("Files")) { e.preventDefault(); setDragOver(true); } };
    const leave = (e: DragEvent) => { if (!e.relatedTarget) setDragOver(false); };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) readLocalFile(f);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [readLocalFile]);

  // ---- Fragen in der Datei verwalten ----------------------------------------------------------

  const addQuestion = (copy: boolean) => {
    setQuiz((prev) => {
      const next = structuredClone(prev);
      const nq = copy && q ? { ...structuredClone(q), uid: newUid(), name: `${q.name} (Kopie)`, comment: "" } : newQuestion();
      next.items.push({ kind: "stack", q: nq });
      return next;
    });
    setSel(stackItems.length);
    setDirty(true);
  };
  const deleteQuestion = () => {
    if (!current || stackItems.length < 2) return;
    if (!window.confirm(`Aufgabe „${q?.name}“ aus der Datei entfernen?`)) return;
    setQuiz((prev) => ({ items: prev.items.filter((_, i) => i !== current.idx) }));
    setSel(Math.max(0, sel - 1));
    setDirty(true);
  };
  const newFile = () => {
    setMenu(null);
    if (dirty && !window.confirm("Ungespeicherte Änderungen verwerfen?")) return;
    setQuiz({ items: [{ kind: "stack", q: newQuestion() }] });
    setSel(0);
    setFile(null);
    setDirty(false);
    setSeed(randomSeed());
    setSection("variables");
  };

  // ---- Resizer -----------------------------------------------------------------------------------

  const onResize = (e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    el.classList.add("dragging");
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const w = 100 - (ev.clientX / window.innerWidth) * 100;
      setPreviewW(Math.min(70, Math.max(24, w)));
    };
    const up = () => {
      el.classList.remove("dragging");
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  // ---- Navigation --------------------------------------------------------------------------------

  const issueCount = (where: (w: string) => boolean) => {
    const list = build?.issues.filter((i) => where(i.where)) ?? [];
    return { err: list.filter((i) => i.severity === "error").length, warn: list.filter((i) => i.severity === "warning").length };
  };
  const nav: { id: SectionId; label: string; icon: React.ReactNode; count?: number; issues?: { err: number; warn: number } }[] = q
    ? [
        { id: "general", label: "Allgemein", icon: <IconInfo />, issues: issueCount((w) => w === "Fragenotiz") },
        { id: "variables", label: "Fragevariablen", icon: <IconVars />, issues: issueCount((w) => w === "Fragevariablen") },
        { id: "text", label: "Fragetext", icon: <IconText />, issues: issueCount((w) => w === "Fragetext") },
        { id: "inputs", label: "Eingaben", icon: <IconInput />, count: q.inputs.length, issues: issueCount((w) => w.startsWith("Eingabe")) },
        { id: "prts", label: "Rückmeldebäume", icon: <IconTree />, count: q.prts.length, issues: issueCount((w) => w.startsWith("PRT")) },
        { id: "feedback", label: "Feedback", icon: <IconChat />, issues: issueCount((w) => w.includes("Feedback")) },
        { id: "options", label: "Optionen", icon: <IconGear /> },
        { id: "tests", label: "Tests & Varianten", icon: <IconFlask />, count: q.qtests.length },
        { id: "xml", label: "XML", icon: <IconCode /> },
      ]
    : [];

  const props: SectionProps | null = q ? { q, update, build, seed, setSeed, quiz } : null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="menu">
          <button className={`tbtn burger${menu ? " on" : ""}`} aria-haspopup="menu" aria-expanded={!!menu} aria-label="Menü"
            title="Menü" onClick={() => { setMenu(menu ? null : "open"); if (!menu) refreshFiles(); }}>
            <IconMenu />
          </button>
          {menu === "open" && (
            <>
              <div className="menu-veil" onClick={() => setMenu(null)} />
              <nav className="burger-pop" aria-label="Hauptmenü">
                <a className="mi" href="/"><span><IconHome /> Dashboard</span></a>
                <div className="burger-sep">Datei</div>
                <button className="mi" onClick={newFile}><span><IconPlus /> Neue Aufgabe</span></button>
                <button className="mi" onClick={() => { setMenu(null); fileInput.current?.click(); }}><span><IconUpload /> XML hochladen …</span><small>oder ins Fenster ziehen</small></button>
                <button className="mi" onClick={() => { setMenu(null); saveToServer(); }}><span><IconSave /> Speichern</span><kbd>Strg+S</kbd></button>
                <button className="mi" onClick={() => { setMenu(null); saveAndDownload(); }}><span><IconDownload /> Speichern &amp; Download</span><kbd>Strg+Umschalt+S</kbd></button>
                <button className="mi" onClick={() => { setMenu(null); copyXml(); }}><span><IconCopy /> XML kopieren</span></button>
                <div className="burger-sep">Kategorie</div>
                <div className="burger-field">
                  <select className="sel" value={categoryId ?? ""} onChange={(e) => changeCategory(e.target.value ? Number(e.target.value) : null)} aria-label="Kategorie dieser Datei">
                    <option value="">Ohne Kategorie</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="burger-sep">Ansicht</div>
                <button className="mi" onClick={() => { setMenu(null); setShowRef(true); }}><span><IconBook /> Funktionsreferenz</span></button>
                <button className="mi" role="menuitemcheckbox" aria-checked={showPreview} onClick={() => setShowPreview(!showPreview)}>
                  <span><IconPanel /> Vorschau</span>{showPreview ? <span className="mi-state on">an</span> : <span className="mi-state">aus</span>}
                </button>
                <div className="burger-sep">Zuletzt bearbeitet</div>
                {files.length === 0 && <div className="mi muted-mi"><small>Noch keine Dateien gespeichert</small></div>}
                <div className="menu-scroll short">
                  {files.slice(0, 10).map((f) => (
                    <button key={f.id} className={`mi${file?.id === f.id ? " current" : ""}`} onClick={() => openServerFile(f.id)} title={`${f.name}${f.categoryName ? ` (${f.categoryName})` : ""}`}>
                      <span className="mi-file"><IconFile /><span className="mi-file-name">{f.questions[0] ?? f.name}</span></span>
                      <small>{new Date(f.updatedAt).toLocaleDateString("de-DE")}</small>
                    </button>
                  ))}
                </div>
                <a className="mi" href="/"><span className="muted-link">Alle Dateien im Dashboard …</span></a>
              </nav>
            </>
          )}
        </div>
        <input ref={fileInput} type="file" accept=".xml,application/xml,text/xml" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) readLocalFile(f); e.target.value = ""; }} />
        <a className="brand" href="/" title="Zum Dashboard">
          <div className="brand-mark">S</div>
          <span className="brand-text">STACK-Editor</span>
        </a>
        <div className="doc-title">
          <span className="filename">
            {fileName ? <b>{fileName}</b> : <i>nicht gespeichert</i>}
            {dirty && <span className="dirty-dot" title="Ungespeicherte Änderungen" />}
          </span>
          <span className="doc-cat" title="Kategorie (im Menü änderbar)">{categories.find((c) => c.id === categoryId)?.name ?? "Ohne Kategorie"}</span>
        </div>
        <div className="spacer" />
        <button className="tbtn primary" onClick={() => saveToServer()} title="In der Datenbank speichern (Strg+S)"><IconSave /> Speichern</button>
        <UserMenu user={user} notify={notify} />
      </header>

      <div className={`workspace ${showPreview ? "" : "no-preview"}`} style={{ ["--preview-w" as string]: `${previewW}%` }}>
        <aside className="sidebar">
          <div className="qlist">
            <select value={Math.min(sel, stackItems.length - 1)} onChange={(e) => setSel(Number(e.target.value))} title="Aufgabe in dieser Datei">
              {stackItems.map((s, i) => (
                <option key={s.it.kind === "stack" ? s.it.q.uid : i} value={i}>
                  {i + 1}. {s.it.kind === "stack" ? s.it.q.name || "(ohne Namen)" : ""}
                </option>
              ))}
            </select>
            <div className="row">
              <button className="btn small" onClick={() => addQuestion(false)} title="Neue Aufgabe in dieser Datei"><IconPlus /> Neu</button>
              <button className="btn small" onClick={() => addQuestion(true)} title="Aufgabe duplizieren"><IconCopy /> Kopie</button>
              <button className="btn small danger" disabled={stackItems.length < 2} onClick={deleteQuestion} title="Aufgabe entfernen"><IconTrash /></button>
            </div>
          </div>
          <nav className="nav">
            {nav.map((n) => (
              <button key={n.id} className={`nav-item ${section === n.id ? "active" : ""}`} onClick={() => setSection(n.id)}>
                {n.icon}
                {n.label}
                {n.issues && n.issues.err > 0 ? <span className="badge err">{n.issues.err}</span>
                  : n.issues && n.issues.warn > 0 ? <span className="badge warn">{n.issues.warn}</span>
                  : n.count !== undefined ? <span className="count">{n.count}</span> : null}
              </button>
            ))}
          </nav>
          <div className="sidebar-foot">
            Strg+Leertaste: Vervollständigung<br />
            Maus über Funktion: Hilfe
          </div>
        </aside>

        <main className="main">
          {props && section === "general" && <GeneralSection {...props} />}
          {props && section === "variables" && <VariablesSection {...props} />}
          {props && section === "text" && <QuestionTextSection {...props} />}
          {props && section === "inputs" && <InputsSection {...props} />}
          {props && section === "prts" && <PrtsSection {...props} />}
          {props && section === "feedback" && <FeedbackSection {...props} />}
          {props && section === "options" && <OptionsSection {...props} />}
          {props && section === "tests" && <TestsSection {...props} />}
          {props && section === "xml" && <XmlSection {...props} xml={xmlText()} onCopy={copyXml} onDownload={() => download()} />}
        </main>

        {showPreview && <div className="resizer" onPointerDown={onResize} />}
        {showPreview && q && (
          <Preview q={q} build={build} seed={seed} setSeed={setSeed} update={update} onNavigate={(s) => setSection(s as SectionId)}
            casMode={casMode} setCasMode={setCasMode} casStatus={casStatus} />
        )}
      </div>

      {showRef && <Reference onClose={() => setShowRef(false)} notify={notify} />}
      {toast && <div className={`toast ${toast.err ? "err" : ""}`}>{toast.msg}</div>}
      {dragOver && <div className="dropzone">XML-Datei hier ablegen</div>}
    </div>
  );
}
