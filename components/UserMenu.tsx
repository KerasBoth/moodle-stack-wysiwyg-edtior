"use client";

// Benutzermenü in der Kopfleiste: Passwort ändern, Benutzerverwaltung (Admin), Abmelden.

import { useCallback, useEffect, useState } from "react";
import type { User } from "@/lib/server/store";
import { formatDate } from "@/lib/i18n";
import { api, logoutAndLeave } from "@/lib/client/api";
import { personName } from "@/lib/people";
import { IconLogout, IconPlus, IconTrash, IconUser } from "./icons";
import { useDialogs } from "./Dialogs";
import { useLocale, useT } from "./I18nProvider";
import { Modal } from "./Modal";

type Notify = (msg: string, err?: boolean) => void;

export default function UserMenu({ user, notify }: { user: User; notify: Notify }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<"password" | "users" | null>(null);

  return (
    <div className="menu">
      <button className="tbtn" onClick={() => setOpen(!open)} title={t("users.user")}>
        <IconUser /> {user.username}
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 49 }} onClick={() => setOpen(false)} />
          <div className="menu-pop right">
            <div className="label">{t(user.isAdmin ? "users.signedInAsAdmin" : "users.signedInAs", { name: user.username })}</div>
            <button className="mi" onClick={() => { setOpen(false); setDialog("password"); }}><span>{t("users.changePasswordMenu")}</span></button>
            {user.isAdmin && <button className="mi" onClick={() => { setOpen(false); setDialog("users"); }}><span>{t("users.userAdminMenu")}</span></button>}
            <hr />
            <button className="mi" onClick={logoutAndLeave}><span><IconLogout style={{ width: 14, verticalAlign: -2 }} /> {t("users.logout")}</span></button>
          </div>
        </>
      )}
      {dialog === "password" && <PasswordDialog onClose={() => setDialog(null)} notify={notify} />}
      {dialog === "users" && <UsersDialog self={user} onClose={() => setDialog(null)} notify={notify} />}
    </div>
  );
}

function PasswordDialog({ onClose, notify }: { onClose: () => void; notify: Notify }) {
  const t = useT();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api("/api/auth/password", { body: { current, password } });
      notify(t("users.passwordChanged"));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  return (
    <Modal title={t("users.changePassword")} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field"><label>{t("users.currentPassword")}</label><input className="inp" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoFocus /></div>
        <div className="field"><label>{t("users.newPassword")} <span className="hint">{t("login.minLength")}</span></label><input className="inp" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
        {error && <div className="issue error">{error}</div>}
        <div className="modal-actions"><button type="button" className="btn" onClick={onClose}>{t("common.cancel")}</button><button className="btn primary">{t("common.save")}</button></div>
      </form>
    </Modal>
  );
}

type UserRow = User & { fileCount: number; categoryCount: number };

function UsersDialog({ self, onClose, notify }: { self: User; onClose: () => void; notify: Notify }) {
  const dialogs = useDialogs();
  const t = useT();
  const locale = useLocale();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ users: UserRow[] }>("/api/users").then((j) => setUsers(j.users)).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api("/api/users", { body: { username, password, isAdmin, firstName, lastName } });
      notify(t("users.userCreated", { name: username }));
      setUsername(""); setPassword(""); setFirstName(""); setLastName(""); setIsAdmin(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  const reset = async (u: User) => {
    const pw = await dialogs.prompt({
      title: t("users.setPasswordTitle", { name: u.username }), label: t("users.newPasswordMin"), type: "password",
      confirmLabel: t("users.setPassword"),
      validate: ({ value }) => (value.length < 8 ? t("users.atLeast8") : null),
    });
    if (!pw) return;
    try {
      await api(`/api/users/${u.id}`, { method: "PATCH", body: { password: pw } });
      notify(t("users.passwordSet", { name: u.username }));
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), true);
    }
  };
  const rename = async (u: UserRow) => {
    const v = await dialogs.form({
      title: t("users.renameTitle", { name: u.username }), confirmLabel: t("common.save"),
      fields: [
        { name: "firstName", label: t("users.firstName"), initial: u.firstName },
        { name: "lastName", label: t("users.lastName"), initial: u.lastName },
      ],
    });
    if (!v) return;
    const first = v.firstName, last = v.lastName;
    try {
      await api(`/api/users/${u.id}`, { method: "PATCH", body: { firstName: first, lastName: last } });
      notify(t("users.nameSet", { name: u.username }));
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), true);
    }
  };
  const remove = async (u: UserRow) => {
    const text = u.fileCount === 0 && u.categoryCount === 0
      ? t("users.deleteConfirm", { name: u.username })
      : t("users.deleteWithData", {
          name: u.username,
          questions: t("users.questions", { count: u.fileCount }),
          categories: t("users.categories", { count: u.categoryCount }),
        });
    if (!(await dialogs.confirm({ title: t("users.deleteTitle"), message: text, confirmLabel: t("common.delete"), danger: true }))) return;
    try {
      await api(`/api/users/${u.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), true);
    }
  };

  return (
    <Modal title={t("users.userAdmin")} onClose={onClose} wide>
      <table className="vt">
        <thead><tr><th>{t("users.colUser")}</th><th>{t("users.colName")}</th><th>{t("users.colRole")}</th><th>{t("users.colCreated")}</th><th /></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td><b>{u.username}</b>{u.id === self.id && <span className="chip" style={{ marginLeft: 6 }}>{t("users.you")}</span>}</td>
              <td>{personName(u) === u.username ? "–" : personName(u)}</td>
              <td>{u.isAdmin ? <span className="chip accent">{t("users.admin")}</span> : t("users.roleUser")}</td>
              <td>{formatDate(locale, u.createdAt)}</td>
              <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                <button className="btn small" onClick={() => rename(u)}>{t("users.changeName")}</button>{" "}
                <button className="btn small" onClick={() => reset(u)}>{t("users.setPassword")}</button>{" "}
                <button className="btn small danger" disabled={u.id === self.id} onClick={() => remove(u)} title={t("common.delete")}><IconTrash /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form onSubmit={add} className="user-add">
        <h4>{t("users.newUser")}</h4>
        <div className="grid3">
          <div className="field"><label>{t("users.firstName")} <span className="hint">{t("users.optional")}</span></label><input className="inp" value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
          <div className="field"><label>{t("users.lastName")} <span className="hint">{t("users.optional")}</span></label><input className="inp" value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
        </div>
        <div className="grid3">
          <div className="field"><label>{t("login.username")}</label><input className="inp" value={username} onChange={(e) => setUsername(e.target.value)} required /></div>
          <div className="field"><label>{t("login.password")}</label><input className="inp" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
          <div className="field"><label>&nbsp;</label><label className="check"><input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} /> {t("users.administrator")}</label></div>
        </div>
        {error && <div className="issue error">{error}</div>}
        <button className="btn primary"><IconPlus /> {t("users.create")}</button>
      </form>
    </Modal>
  );
}
