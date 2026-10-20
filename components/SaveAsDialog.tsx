"use client";

// „Speichern unter …“: Dateiname eingeben; bei vorhandenem Namen Überschreiben anbieten.

import { useId, useState } from "react";
import { Modal } from "./Modal";

export default function SaveAsDialog({ initialName, onSave, onClose }: {
  initialName: string;
  onSave: (name: string, overwrite: boolean) => Promise<{ error?: string; exists?: boolean }>;
  onClose: () => void;
}) {
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
      if (r.exists) { setExists(true); setMessage(r.error ?? `${n} existiert bereits.`); }
      else if (r.error) { setExists(false); setMessage(r.error); }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Speichern unter" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); submit(false); }}>
        <div className="field">
          <label htmlFor={`${uid}-name`}>Dateiname</label>
          <input id={`${uid}-name`} className="inp" value={name} autoFocus onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => { setName(e.target.value); setMessage(null); setExists(false); }} />
        </div>
        {message && <div className="issue error">{message}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Abbrechen</button>
          {exists && <button type="button" className="btn danger" disabled={busy} onClick={() => submit(true)}>Überschreiben</button>}
          <button type="submit" className="btn primary" disabled={busy || !name.trim()}>Speichern</button>
        </div>
      </form>
    </Modal>
  );
}
