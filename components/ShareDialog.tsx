"use client";

// Teilen-Dialog: Aufgabe mit anderen Benutzern teilen (Lesen oder Bearbeiten) und Freigaben verwalten.

import { useCallback, useEffect, useState } from "react";
import type { FileInfo, Share, ShareRole } from "@/lib/server/store";
import { personLabel, personName, type Person } from "@/lib/people";
import { api } from "@/lib/client/api";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "./I18nProvider";
import { IconShare, IconTrash } from "./icons";
import { Modal } from "./Modal";

export const ROLE_LABELS: Record<ShareRole, MessageKey> = {
  read: "dialogs.share.roleRead",
  edit: "dialogs.share.roleEdit",
};
const ROLES: ShareRole[] = ["read", "edit"];

export default function ShareDialog({ file, onClose, notify }: { file: FileInfo; onClose: () => void; notify: (msg: string, err?: boolean) => void }) {
  const t = useT();
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
    if (await put(id, role, person ? t("dialogs.share.sharedWithToast", { name: personName(person) }) : undefined)) setUserId("");
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
    <Modal title={t("dialogs.share.title", { name: file.name })} onClose={onClose} wide>
      <form onSubmit={add} className="user-add">
        <div className="grid3">
          <div className="field">
            <label>{t("dialogs.share.user")}</label>
            <select className="inp" value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">{t("dialogs.share.chooseUser")}</option>
              {available.map((p) => <option key={p.id} value={p.id}>{personLabel(p)}</option>)}
            </select>
          </div>
          <div className="field">
            <label>{t("dialogs.share.permission")}</label>
            <select className="inp" value={role} onChange={(e) => setRole(e.target.value as ShareRole)}>
              {ROLES.map((r) => <option key={r} value={r}>{t(ROLE_LABELS[r])}</option>)}
            </select>
          </div>
          <div className="field"><label>&nbsp;</label><button className="btn primary" disabled={!userId}><IconShare /> {t("dialogs.share.share")}</button></div>
        </div>
      </form>
      {error && <div className="issue error">{error}</div>}
      {shares.length ? (
        <table className="vt">
          <thead><tr><th>{t("dialogs.share.sharedWith")}</th><th>{t("dialogs.share.permission")}</th><th /></tr></thead>
          <tbody>
            {shares.map((s) => (
              <tr key={s.id}>
                <td><b>{personName(s)}</b> <span className="muted">{s.username}</span></td>
                <td>
                  <select className="inp" value={s.role} onChange={(e) => put(s.id, e.target.value as ShareRole)}>
                    {ROLES.map((r) => <option key={r} value={r}>{t(ROLE_LABELS[r])}</option>)}
                  </select>
                </td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <button className="btn small danger" onClick={() => remove(s)} title={t("dialogs.share.removeShare")}><IconTrash /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">{t("dialogs.share.notShared")}</p>
      )}
    </Modal>
  );
}
