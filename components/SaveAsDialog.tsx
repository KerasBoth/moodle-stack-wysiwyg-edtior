"use client";

// „Speichern unter …“: Dateiname eingeben; bei vorhandenem Namen Überschreiben anbieten.

import { useId, useState } from "react";
import { useT } from "./I18nProvider";
import { Modal } from "./Modal";

export default function SaveAsDialog({ initialName, onSave, onClose }: {
  initialName: string;
  onSave: (name: string, overwrite: boolean) => Promise<{ error?: string; exists?: boolean }>;
  onClose: () => void;
}) {
  const t = useT();
  const [name, setName] = useState(initialName);
  const [message, setMessage] = useState<string | null>(null);
  const [exists, setExists] = useState(false);
  const [busy, setBusy] = useState(false);
  const uid = useId();

  const submit = async (overwrite: boolean) => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    try {
      const r = await onSave(n, overwrite);
      if (r.exists) { setExists(true); setMessage(r.error ?? t("dialogs.saveAs.exists", { name: n })); }
      else if (r.error) { setExists(false); setMessage(r.error); }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t("dialogs.saveAs.title")} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); submit(false); }}>
        <div className="field">
          <label htmlFor={`${uid}-name`}>{t("dialogs.saveAs.fileName")}</label>
          <input id={`${uid}-name`} className="inp" value={name} autoFocus onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => { setName(e.target.value); setMessage(null); setExists(false); }} />
        </div>
        {message && <div className="issue error">{message}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>{t("common.cancel")}</button>
          {exists && <button type="button" className="btn danger" disabled={busy} onClick={() => submit(true)}>{t("common.overwrite")}</button>}
          <button type="submit" className="btn primary" disabled={busy || !name.trim()}>{t("common.save")}</button>
        </div>
      </form>
    </Modal>
  );
}
