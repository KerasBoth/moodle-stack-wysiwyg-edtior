"use client";

// Startseite nach der Anmeldung: zuletzt bearbeitete Aufgaben und Kategorien mit ihren ersten 5 Aufgaben.

import { useCallback, useEffect, useRef, useState } from "react";
import type { DashboardData, FileInfo, User } from "@/lib/server/store";
import { api, ApiError, relTime } from "@/lib/client/api";
import { IconClock, IconFile, IconPencil, IconPlus, IconSearch, IconShare, IconTag, IconTrash, IconUpload, IconX } from "./icons";
import { personName } from "@/lib/people";
import { UNNAMED_QUESTION } from "@/lib/filename";
import { useDialogs } from "./Dialogs";
import { useLocale, useT } from "./I18nProvider";
import LanguageSwitcher from "./LanguageSwitcher";
import ShareDialog, { ROLE_LABELS } from "./ShareDialog";
import UserMenu from "./UserMenu";

const PER_CATEGORY = 5;

function editorUrl(f: { id: number }) {
  return `/editor?file=${f.id}`;
}

// „[…]“ im übersetzten Text wird zum Link
function withLink(text: string, href: string): React.ReactNode {
  const m = /^(.*)\[(.*)\](.*)$/s.exec(text);
  return m ? <>{m[1]}<a href={href}>{m[2]}</a>{m[3]}</> : text;
}

export default function Dashboard({ user }: { user: User }) {
  const dialogs = useDialogs();
  const t = useT();
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
    const timer = window.setTimeout(() => {
      api<{ files: FileInfo[] }>(`/api/files?q=${encodeURIComponent(q)}&limit=50`).then((j) => setResults(j.files)).catch(() => {});
    }, 200);
    return () => window.clearTimeout(timer);
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
    run(async () => { await api("/api/categories", { body: { name } }); setNewCat(""); }, t("dashboard.categoryCreated", { name }));
  };
  const renameCategory = async (id: number, old: string) => {
    const answer = await dialogs.prompt({
      title: t("dashboard.renameCategoryTitle"), label: t("dashboard.name"), initial: old, confirmLabel: t("dashboard.rename"),
      validate: ({ value }) => (value.trim() ? null : t("dashboard.enterName")),
    });
    const name = answer?.trim();
    if (!name || name === old) return;
    run(() => api(`/api/categories/${id}`, { method: "PATCH", body: { name } }));
  };
  const deleteCategory = async (id: number, name: string, count: number) => {
    const msg = count
      ? t("dashboard.deleteCategoryWithFiles", { name, count, none: t("common.uncategorized") })
      : t("dashboard.deleteCategoryConfirm", { name });
    if (!(await dialogs.confirm({ title: t("dashboard.deleteCategoryTitle"), message: msg, confirmLabel: t("common.delete"), danger: true }))) return;
    run(() => api(`/api/categories/${id}`, { method: "DELETE" }), t("dashboard.categoryDeleted"));
  };
  const deleteFile = async (f: FileInfo) => {
    if (!(await dialogs.confirm({
      title: t("dashboard.deleteFileTitle"), message: t("dashboard.deleteFileConfirm", { name: f.name }), confirmLabel: t("common.delete"), danger: true,
    }))) return;
    run(() => api(`/api/files/${f.id}`, { method: "DELETE" }), t("dashboard.fileDeleted", { name: f.name }));
    setResults((r) => r && r.filter((x) => x.id !== f.id));
  };
  const upload = async (files: FileList, categoryId: number | null) => {
    for (const file of Array.from(files)) {
      const content = await file.text();
      const send = (overwrite: boolean) => api("/api/files", { body: { name: file.name, content, categoryId, overwrite } });
      try {
        await send(false);
        notify(t("dashboard.uploaded", { name: file.name }));
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          if (!(await dialogs.confirm({
            title: t("dashboard.overwriteTitle"), message: t("dashboard.overwriteConfirm", { name: file.name }), confirmLabel: t("common.overwrite"), danger: true,
          }))) continue;
          try { await send(true); notify(t("dashboard.overwritten", { name: file.name })); } catch (e2) { notify((e2 as Error).message, true); }
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
          ? [{ key: "none", id: null, name: t("common.uncategorized"), count: data.uncategorized.fileCount, files: data.uncategorized.files }]
          : []),
      ]
    : [];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">S</div>
          {t("common.appName")} <small>{t("common.forMoodle")}</small>
        </div>
        <span className="topnav-active">{t("dashboard.title")}</span>
        <a className="tbtn" href="/editor">{t("dashboard.editor")}</a>
        <div className="spacer" />
        <a className="tbtn primary" href="/editor?new=1"><IconPlus /> {t("dashboard.newQuestion")}</a>
        <LanguageSwitcher />
        <UserMenu user={user} notify={notify} />
      </header>

      <div className="dash-scroll">
        <div className="dash">
          <div className="dash-head">
            <div>
              <h1>{t("dashboard.hello", { name: personName(user) })}</h1>
              <p>
                {data
                  ? t("dashboard.summary", {
                      files: t("dashboard.files", { count: data.totalFiles }),
                      categories: t("dashboard.inCategories", { count: data.categories.length }),
                    })
                  : t("common.loading")}
              </p>
            </div>
            <div className="search">
              <IconSearch />
              <input className="inp" placeholder={t("dashboard.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
              {search && <button className="btn ghost small" onClick={() => setSearch("")} aria-label={t("dashboard.clearSearch")}><IconX /></button>}
            </div>
          </div>

          {results ? (
            <section className="card">
              <div className="card-head">
                <h3>{t("dashboard.searchResults")}</h3>
                <span className="sub">{t("dashboard.hits", { count: results.length, query: search.trim() })}</span>
              </div>
              {results.length
                ? <FileRows files={results} showCategory onDelete={deleteFile} onShare={setSharing} />
                : <div className="card-body muted">{t("dashboard.noResults")}</div>}
            </section>
          ) : (
            <section className="card">
              <div className="card-head"><IconClock className="head-ico" /><h3>{t("dashboard.recent")}</h3></div>
              {data && data.recent.length === 0 && (
                <div className="card-body muted">{withLink(t("dashboard.emptyRecent"), "/editor?new=1")}</div>
              )}
              {data && data.recent.length > 0 && <FileRows files={data.recent} showCategory onDelete={deleteFile} onShare={setSharing} />}
            </section>
          )}

          {data && data.shared.length > 0 && (
            <section className="card">
              <div className="card-head"><IconShare className="head-ico" /><h3>{t("dashboard.sharedWithMe")}</h3><span className="chip">{data.shared.length}</span></div>
              <FileRows files={data.shared} showCategory onDelete={deleteFile} onShare={setSharing} />
            </section>
          )}

          <div className="dash-section-head">
            <h2><IconTag className="head-ico" /> {t("dashboard.categories")}</h2>
            <form className="cat-add" onSubmit={addCategory}>
              <input className="inp" placeholder={t("dashboard.newCategoryPlaceholder")} value={newCat} onChange={(e) => setNewCat(e.target.value)} maxLength={80} />
              <button className="btn primary" disabled={!newCat.trim()}><IconPlus /> {t("common.add")}</button>
            </form>
          </div>

          {data && groups.length === 0 && <div className="empty">{t("dashboard.noCategories")}</div>}

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
                        <button className="btn ghost small" title={t("dashboard.rename")} onClick={() => renameCategory(g.id!, g.name)}><IconPencil /></button>
                        <button className="btn ghost small danger" title={t("dashboard.deleteCategory")} onClick={() => deleteCategory(g.id!, g.name, g.count)}><IconTrash /></button>
                      </div>
                    )}
                  </div>
                  {list.length
                    ? <FileRows files={list} onDelete={deleteFile} onShare={setSharing} />
                    : <div className="card-body muted">{t("dashboard.noQuestionsInCategory")}</div>}
                  <div className="cat-foot">
                    {g.id !== null && <a className="btn small" href={`/editor?new=1&category=${g.id}`}><IconPlus /> {t("dashboard.newQuestion")}</a>}
                    <UploadButton onFiles={(fl) => upload(fl, g.id)} />
                    {g.count > PER_CATEGORY && (
                      <button className="btn small ghost more" onClick={() => toggleAll(g.key)}>
                        {all ? t("dashboard.showLess") : t("dashboard.showAll", { count: g.count })}
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
  const t = useT();
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button className="btn small" onClick={() => ref.current?.click()} title={t("dashboard.uploadXmlTitle")}><IconUpload /> {t("dashboard.uploadXml")}</button>
      <input ref={ref} type="file" accept=".xml,application/xml,text/xml" multiple hidden onChange={(e) => { if (e.target.files?.length) onFiles(e.target.files); e.target.value = ""; }} />
    </>
  );
}

function FileRows({ files, showCategory, onDelete, onShare }: { files: FileInfo[]; showCategory?: boolean; onDelete: (f: FileInfo) => void; onShare: (f: FileInfo) => void }) {
  const t = useT();
  const locale = useLocale();
  return (
    <ul className="file-rows">
      {files.map((f) => (
        <li key={f.id}>
          <a href={editorUrl(f)} className={`file-row ${f.role === "owner" ? "has-actions" : ""}`} title={t("dashboard.open", { name: f.name })}>
            <IconFile className="file-ico" />
            <span className="file-main">
              <span className="file-q">
                {f.questions[0] === UNNAMED_QUESTION ? t("editor.sidebar.unnamed") : f.questions[0] ?? f.name}
                {f.questions.length > 1 && <span className="more-q"> {t("dashboard.moreQuestions", { count: f.questions.length - 1 })}</span>}
              </span>
              <span className="file-name">{f.name}</span>
            </span>
            {f.role !== "owner" ? (
              <span className="chip accent">{f.ownerName} · {t(ROLE_LABELS[f.role])}</span>
            ) : (
              showCategory && <span className="chip">{f.categoryName ?? t("common.uncategorized")}</span>
            )}
            <span className="file-meta">{f.updatedBy ? `${f.updatedBy} · ` : ""}{relTime(f.updatedAt, locale, t)}</span>
          </a>
          {f.role === "owner" && (
            <span className="row-del">
              <button className="btn ghost small" title={t("dialogs.share.share")} onClick={() => onShare(f)}><IconShare /></button>
              <button className="btn ghost small danger" title={t("common.delete")} onClick={() => onDelete(f)}><IconTrash /></button>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
