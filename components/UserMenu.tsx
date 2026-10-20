"use client";

// Benutzermenü in der Kopfleiste: Passwort ändern, Benutzerverwaltung (Admin), Abmelden.

import { useCallback, useEffect, useState } from "react";
import type { User } from "@/lib/server/store";
import { api, logoutAndLeave } from "@/lib/client/api";
import { personName } from "@/lib/people";
import { IconLogout, IconPlus, IconTrash, IconUser } from "./icons";
import { Modal } from "./Modal";

type Notify = (msg: string, err?: boolean) => void;

export default function UserMenu({ user, notify }: { user: User; notify: Notify }) {
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<"password" | "users" | null>(null);

  return (
    <div className="menu">
      <button className="tbtn" onClick={() => setOpen(!open)} title="Benutzer">
        <IconUser /> {user.username}
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 49 }} onClick={() => setOpen(false)} />
          <div className="menu-pop right">
            <div className="label">Angemeldet als {user.username}{user.isAdmin ? " (Admin)" : ""}</div>
            <button className="mi" onClick={() => { setOpen(false); setDialog("password"); }}><span>Passwort ändern …</span></button>
            {user.isAdmin && <button className="mi" onClick={() => { setOpen(false); setDialog("users"); }}><span>Benutzerverwaltung …</span></button>}
            <hr />
            <button className="mi" onClick={logoutAndLeave}><span><IconLogout style={{ width: 14, verticalAlign: -2 }} /> Abmelden</span></button>
          </div>
        </>
      )}
      {dialog === "password" && <PasswordDialog onClose={() => setDialog(null)} notify={notify} />}
      {dialog === "users" && <UsersDialog self={user} onClose={() => setDialog(null)} notify={notify} />}
    </div>
  );
}

function PasswordDialog({ onClose, notify }: { onClose: () => void; notify: Notify }) {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api("/api/auth/password", { body: { current, password } });
      notify("Passwort geändert");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  return (
    <Modal title="Passwort ändern" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field"><label>Aktuelles Passwort</label><input className="inp" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoFocus /></div>
        <div className="field"><label>Neues Passwort <span className="hint">mind. 8 Zeichen</span></label><input className="inp" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
        {error && <div className="issue error">{error}</div>}
        <div className="modal-actions"><button type="button" className="btn" onClick={onClose}>Abbrechen</button><button className="btn primary">Speichern</button></div>
      </form>
    </Modal>
  );
}

type UserRow = User & { fileCount: number; categoryCount: number };

function UsersDialog({ self, onClose, notify }: { self: User; onClose: () => void; notify: Notify }) {
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
      notify(`Benutzer ${username} angelegt`);
      setUsername(""); setPassword(""); setFirstName(""); setLastName(""); setIsAdmin(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  const reset = async (u: User) => {
    const pw = window.prompt(`Neues Passwort für ${u.username} (mind. 8 Zeichen):`);
    if (!pw) return;
    try {
      await api(`/api/users/${u.id}`, { method: "PATCH", body: { password: pw } });
      notify(`Passwort für ${u.username} gesetzt`);
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), true);
    }
  };
  const rename = async (u: UserRow) => {
    const first = window.prompt(`Vorname für ${u.username}:`, u.firstName);
    if (first === null) return;
    const last = window.prompt(`Nachname für ${u.username}:`, u.lastName);
    if (last === null) return;
    try {
      await api(`/api/users/${u.id}`, { method: "PATCH", body: { firstName: first, lastName: last } });
      notify(`Name für ${u.username} gesetzt`);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), true);
    }
  };
  const remove = async (u: UserRow) => {
    const text = u.fileCount === 0 && u.categoryCount === 0
      ? `Benutzer „${u.username}“ löschen?`
      : `Benutzer „${u.username}“ und seine ${u.fileCount} Aufgabe(n) und ${u.categoryCount} Kategorie(n) endgültig löschen? Seine Aufgaben verschwinden auch für Personen, mit denen er sie geteilt hat. Mit ihm geteilte Aufgaben anderer bleiben erhalten.`;
    if (!window.confirm(text)) return;
    try {
      await api(`/api/users/${u.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), true);
    }
  };

  return (
    <Modal title="Benutzerverwaltung" onClose={onClose} wide>
      <table className="vt">
        <thead><tr><th>Benutzer</th><th>Name</th><th>Rolle</th><th>Angelegt</th><th /></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td><b>{u.username}</b>{u.id === self.id && <span className="chip" style={{ marginLeft: 6 }}>du</span>}</td>
              <td>{personName(u) === u.username ? "–" : personName(u)}</td>
              <td>{u.isAdmin ? <span className="chip accent">Admin</span> : "Benutzer"}</td>
              <td>{new Date(u.createdAt).toLocaleDateString("de-DE")}</td>
              <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                <button className="btn small" onClick={() => rename(u)}>Name ändern</button>{" "}
                <button className="btn small" onClick={() => reset(u)}>Passwort setzen</button>{" "}
                <button className="btn small danger" disabled={u.id === self.id} onClick={() => remove(u)} title="Löschen"><IconTrash /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form onSubmit={add} className="user-add">
        <h4>Neuer Benutzer</h4>
        <div className="grid3">
          <div className="field"><label>Vorname <span className="hint">optional</span></label><input className="inp" value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
          <div className="field"><label>Nachname <span className="hint">optional</span></label><input className="inp" value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
        </div>
        <div className="grid3">
          <div className="field"><label>Benutzername</label><input className="inp" value={username} onChange={(e) => setUsername(e.target.value)} required /></div>
          <div className="field"><label>Passwort</label><input className="inp" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
          <div className="field"><label>&nbsp;</label><label className="check"><input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} /> Administrator</label></div>
        </div>
        {error && <div className="issue error">{error}</div>}
        <button className="btn primary"><IconPlus /> Anlegen</button>
      </form>
    </Modal>
  );
}
