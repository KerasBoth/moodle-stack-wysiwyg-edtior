"use client";

// Startseite nach der Anmeldung: zuletzt bearbeitete Aufgaben und Kategorien mit ihren ersten 5 Aufgaben.

import { useCallback, useEffect, useRef, useState } from "react";
import type { DashboardData, FileInfo, User } from "@/lib/server/store";
import { api, ApiError, relTime } from "@/lib/client/api";
import { IconClock, IconFile, IconPencil, IconPlus, IconSearch, IconShare, IconTag, IconTrash, IconUpload, IconX } from "./icons";
import { personName } from "@/lib/people";
import ShareDialog from "./ShareDialog";
import UserMenu from "./UserMenu";

const PER_CATEGORY = 5;

function editorUrl(f: { id: number }) {
  return `/editor?file=${f.id}`;
}

export default function Dashboard({ user }: { user: User }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);
  const [newCat, setNewCat] = useState("");
  const [search, setSearch] = useState("");
  const [sharing, setSharing] = useState<FileInfo | null>(null);
  const [results, setResults] = useState<FileInfo[] | null>(null);
  const [expanded, setExpanded] = useState<Record<string, FileInfo[]>>({});
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  const notify = useCallback((msg: string, err = false) => {
    setToast({ msg, err });
    window.setTimeout(() => setToast(null), err ? 5000 : 2600);
  }, []);

  const load = useCallback(async () => {
    try {
      const d = await api<DashboardData>("/api/dashboard");
      setData(d);
      // aufgeklappte Kategorien aktuell halten
      for (const key of Object.keys(expandedRef.current)) {
        api<{ files: FileInfo[] }>(`/api/files?category=${key}`)
          .then((j) => setExpanded((p) => (key in p ? { ...p, [key]: j.files } : p)))
          .catch(() => {});
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), true);
    }
  }, [notify]);
  useEffect(() => { load(); }, [load]);

  // Suche (entprellt)
  useEffect(() => {
    const q = search.trim();
    if (!q) { setResults(null); return; }
    const t = window.setTimeout(() => {
      api<{ files: FileInfo[] }>(`/api/files?q=${encodeURIComponent(q)}&limit=50`).then((j) => setResults(j.files)).catch(() => {});
    }, 200);
    return () => window.clearTimeout(t);
  }, [search]);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) notify(ok);
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), true);
    }
  };

  const addCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newCat.trim();
    if (!name) return;
    run(async () => { await api("/api/categories", { body: { name } }); setNewCat(""); }, `Kategorie „${name}“ angelegt`);
  };
  const renameCategory = (id: number, old: string) => {
    const name = window.prompt("Neuer Name der Kategorie:", old)?.trim();
    if (!name || name === old) return;
    run(() => api(`/api/categories/${id}`, { method: "PATCH", body: { name } }));
  };
  const deleteCategory = (id: number, name: string, count: number) => {
    const msg = count
      ? `Kategorie „${name}“ löschen? Die ${count} Aufgabe(n) darin bleiben erhalten und stehen danach unter „Ohne Kategorie“.`
      : `Kategorie „${name}“ löschen?`;
    if (!window.confirm(msg)) return;
    run(() => api(`/api/categories/${id}`, { method: "DELETE" }), "Kategorie gelöscht");
  };
  const deleteFile = (f: FileInfo) => {
    if (!window.confirm(`„${f.name}“ endgültig löschen?`)) return;
    run(() => api(`/api/files/${f.id}`, { method: "DELETE" }), `${f.name} gelöscht`);
    setResults((r) => r && r.filter((x) => x.id !== f.id));
  };
  const upload = async (files: FileList, categoryId: number | null) => {
    for (const file of Array.from(files)) {
      const content = await file.text();
      const send = (overwrite: boolean) => api("/api/files", { body: { name: file.name, content, categoryId, overwrite } });
      try {
        await send(false);
        notify(`${file.name} hochgeladen`);
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          if (!window.confirm(`${file.name} existiert bereits. Überschreiben?`)) continue;
          try { await send(true); notify(`${file.name} überschrieben`); } catch (e2) { notify((e2 as Error).message, true); }
        } else {
          notify(`${file.name}: ${(e as Error).message}`, true);
        }
      }
    }
    load();
  };
  const toggleAll = async (key: string) => {
    if (expanded[key]) {
      setExpanded(({ [key]: _, ...rest }) => rest);
      return;
    }
    try {
      const j = await api<{ files: FileInfo[] }>(`/api/files?category=${key}`);
      setExpanded((p) => ({ ...p, [key]: j.files }));
    } catch (e) {
      notify((e as Error).message, true);
    }
  };

  const groups = data
    ? [
        ...data.categories.map((c) => ({ key: String(c.id), id: c.id as number | null, name: c.name, count: c.fileCount, files: c.files })),
        ...(data.uncategorized.fileCount
          ? [{ key: "none", id: null, name: "Ohne Kategorie", count: data.uncategorized.fileCount, files: data.uncategorized.files }]
          : []),
      ]
    : [];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">S</div>
          STACK-Editor <small>für Moodle</small>
        </div>
        <span className="topnav-active">Dashboard</span>
        <a className="tbtn" href="/editor">Editor</a>
        <div className="spacer" />
        <a className="tbtn primary" href="/editor?new=1"><IconPlus /> Neue Aufgabe</a>
        <UserMenu user={user} notify={notify} />
      </header>

      <div className="dash-scroll">
        <div className="dash">
          <div className="dash-head">
            <div>
              <h1>Hallo, {personName(user)}</h1>
              <p>{data ? `${data.totalFiles} Aufgabendatei(en) in ${data.categories.length} Kategorie(n)` : "Lade …"}</p>
            </div>
            <div className="search">
              <IconSearch />
              <input className="inp" placeholder="Aufgaben suchen (Datei- oder Fragename) …" value={search} onChange={(e) => setSearch(e.target.value)} />
              {search && <button className="btn ghost small" onClick={() => setSearch("")} aria-label="Suche leeren"><IconX /></button>}
            </div>
          </div>

          {results ? (
            <section className="card">
              <div className="card-head"><h3>Suchergebnisse</h3><span className="sub">{results.length} Treffer für „{search.trim()}“</span></div>
              {results.length ? <FileRows files={results} showCategory onDelete={deleteFile} onShare={setSharing} /> : <div className="card-body muted">Keine Aufgaben gefunden.</div>}
            </section>
          ) : (
            <section className="card">
              <div className="card-head"><IconClock className="head-ico" /><h3>Zuletzt bearbeitet</h3></div>
              {data && data.recent.length === 0 && (
                <div className="card-body muted">Noch keine Aufgaben. Lege eine <a href="/editor?new=1">neue Aufgabe</a> an oder lade XML-Dateien in eine Kategorie hoch.</div>
              )}
              {data && data.recent.length > 0 && <FileRows files={data.recent} showCategory onDelete={deleteFile} onShare={setSharing} />}
            </section>
          )}

          {data && data.shared.length > 0 && (
            <section className="card">
              <div className="card-head"><IconShare className="head-ico" /><h3>Mit mir geteilt</h3><span className="chip">{data.shared.length}</span></div>
              <FileRows files={data.shared} showCategory onDelete={deleteFile} onShare={setSharing} />
            </section>
          )}

          <div className="dash-section-head">
            <h2><IconTag className="head-ico" /> Kategorien</h2>
            <form className="cat-add" onSubmit={addCategory}>
              <input className="inp" placeholder="Neue Kategorie …" value={newCat} onChange={(e) => setNewCat(e.target.value)} maxLength={80} />
              <button className="btn primary" disabled={!newCat.trim()}><IconPlus /> Hinzufügen</button>
            </form>
          </div>

          {data && groups.length === 0 && <div className="empty">Noch keine Kategorien. Lege oben die erste an, z. B. „Analysis“ oder „Lineare Algebra“.</div>}

          <div className="cat-grid">
            {groups.map((g) => {
              const all = expanded[g.key];
              const list = all ?? g.files;
              return (
                <section key={g.key} className={`card cat-card ${g.id === null ? "uncat" : ""}`}>
                  <div className="card-head">
                    <h3 title={g.name}>{g.name}</h3>
                    <span className="chip">{g.count}</span>
                    {g.id !== null && (
                      <div className="right">
                        <button className="btn ghost small" title="Umbenennen" onClick={() => renameCategory(g.id!, g.name)}><IconPencil /></button>
                        <button className="btn ghost small danger" title="Kategorie löschen" onClick={() => deleteCategory(g.id!, g.name, g.count)}><IconTrash /></button>
                      </div>
                    )}
                  </div>
                  {list.length ? <FileRows files={list} onDelete={deleteFile} onShare={setSharing} /> : <div className="card-body muted">Noch keine Aufgaben in dieser Kategorie.</div>}
                  <div className="cat-foot">
                    {g.id !== null && <a className="btn small" href={`/editor?new=1&category=${g.id}`}><IconPlus /> Neue Aufgabe</a>}
                    <UploadButton onFiles={(fl) => upload(fl, g.id)} />
                    {g.count > PER_CATEGORY && (
                      <button className="btn small ghost more" onClick={() => toggleAll(g.key)}>
                        {all ? "Weniger anzeigen" : `Alle ${g.count} anzeigen`}
                      </button>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </div>

      {sharing && <ShareDialog file={sharing} onClose={() => setSharing(null)} notify={notify} />}
      {toast && <div className={`toast ${toast.err ? "err" : ""}`}>{toast.msg}</div>}
    </div>
  );
}

function UploadButton({ onFiles }: { onFiles: (f: FileList) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button className="btn small" onClick={() => ref.current?.click()} title="Moodle-XML-Dateien in diese Kategorie hochladen"><IconUpload /> XML hochladen</button>
      <input ref={ref} type="file" accept=".xml,application/xml,text/xml" multiple hidden onChange={(e) => { if (e.target.files?.length) onFiles(e.target.files); e.target.value = ""; }} />
    </>
  );
}

function FileRows({ files, showCategory, onDelete, onShare }: { files: FileInfo[]; showCategory?: boolean; onDelete: (f: FileInfo) => void; onShare: (f: FileInfo) => void }) {
  return (
    <ul className="file-rows">
      {files.map((f) => (
        <li key={f.id}>
          <a href={editorUrl(f)} className={`file-row ${f.role === "owner" ? "has-actions" : ""}`}title={`${f.name} öffnen`}>
            <IconFile className="file-ico" />
            <span className="file-main">
              <span className="file-q">
                {f.questions[0] ?? f.name}
                {f.questions.length > 1 && <span className="more-q"> +{f.questions.length - 1} weitere</span>}
              </span>
              <span className="file-name">{f.name}</span>
            </span>
            {f.role !== "owner" ? (
              <span className="chip accent">{f.ownerName} · {f.role === "edit" ? "Bearbeiten" : "Lesen"}</span>
            ) : (
              showCategory && <span className="chip">{f.categoryName ?? "Ohne Kategorie"}</span>
            )}
            <span className="file-meta">{f.updatedBy ? `${f.updatedBy} · ` : ""}{relTime(f.updatedAt)}</span>
          </a>
          {f.role === "owner" && (
            <span className="row-del">
              <button className="btn ghost small" title="Teilen" onClick={() => onShare(f)}><IconShare /></button>
              <button className="btn ghost small danger" title="Löschen" onClick={() => onDelete(f)}><IconTrash /></button>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
