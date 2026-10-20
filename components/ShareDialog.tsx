"use client";

// Teilen-Dialog: Aufgabe mit anderen Benutzern teilen (Lesen oder Bearbeiten) und Freigaben verwalten.

import { useCallback, useEffect, useState } from "react";
import type { FileInfo, Share, ShareRole } from "@/lib/server/store";
import { personLabel, personName, type Person } from "@/lib/people";
import { api } from "@/lib/client/api";
import { IconShare, IconTrash } from "./icons";
import { Modal } from "./UserMenu";

const ROLES: { value: ShareRole; label: string }[] = [
  { value: "read", label: "Lesen" },
  { value: "edit", label: "Bearbeiten" },
];

export default function ShareDialog({ file, onClose, notify }: { file: FileInfo; onClose: () => void; notify: (msg: string, err?: boolean) => void }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [shares, setShares] = useState<Share[]>([]);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<ShareRole>("read");
  const [error, setError] = useState<string | null>(null);
  const fail = (err: unknown) => setError(err instanceof Error ? err.message : String(err));

  const load = useCallback(() => {
    const failed = (err: unknown) => setError(err instanceof Error ? err.message : String(err));
    api<{ people: Person[] }>("/api/people").then((j) => setPeople(j.people)).catch(failed);
    api<{ shares: Share[] }>(`/api/files/${file.id}/shares`).then((j) => setShares(j.shares)).catch(failed);
  }, [file.id]);
  useEffect(load, [load]);

  const available = people.filter((p) => !shares.some((s) => s.id === p.id));

  const put = async (id: number, r: ShareRole, ok?: string) => {
    setError(null);
    try {
      const j = await api<{ shares: Share[] }>(`/api/files/${file.id}/shares`, { method: "PUT", body: { userId: id, role: r } });
      setShares(j.shares);
      if (ok) notify(ok);
      return true;
    } catch (err) {
      fail(err);
      return false;
    }
  };
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = Number(userId);
    if (!id) return;
    const person = people.find((p) => p.id === id);
    if (await put(id, role, person ? `Mit ${personName(person)} geteilt` : undefined)) setUserId("");
  };
  const remove = async (s: Share) => {
    setError(null);
    try {
      const j = await api<{ shares: Share[] }>(`/api/files/${file.id}/shares/${s.id}`, { method: "DELETE" });
      setShares(j.shares);
    } catch (err) {
      fail(err);
    }
  };

  return (
    <Modal title={`„${file.name}“ teilen`} onClose={onClose} wide>
      <form onSubmit={add} className="user-add">
        <div className="grid3">
          <div className="field">
            <label>Benutzer</label>
            <select className="inp" value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Benutzer wählen …</option>
              {available.map((p) => <option key={p.id} value={p.id}>{personLabel(p)}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Berechtigung</label>
            <select className="inp" value={role} onChange={(e) => setRole(e.target.value as ShareRole)}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div className="field"><label>&nbsp;</label><button className="btn primary" disabled={!userId}><IconShare /> Teilen</button></div>
        </div>
      </form>
      {error && <div className="issue error">{error}</div>}
      {shares.length ? (
        <table className="vt">
          <thead><tr><th>Geteilt mit</th><th>Berechtigung</th><th /></tr></thead>
          <tbody>
            {shares.map((s) => (
              <tr key={s.id}>
                <td><b>{personName(s)}</b> <span className="muted">{s.username}</span></td>
                <td>
                  <select className="inp" value={s.role} onChange={(e) => put(s.id, e.target.value as ShareRole)}>
                    {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <button className="btn small danger" onClick={() => remove(s)} title="Freigabe entfernen"><IconTrash /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">Noch mit niemandem geteilt.</p>
      )}
    </Modal>
  );
}
