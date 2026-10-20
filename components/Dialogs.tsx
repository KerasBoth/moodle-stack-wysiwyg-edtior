"use client";

// In-App-Dialoge (Ersatz für die Browser-Dialoge prompt, confirm und alert): confirm, prompt, form.

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Modal, isModalOpen as modalOpen } from "./Modal";

export interface ConfirmOptions { title: string; message: React.ReactNode; confirmLabel: string; danger?: boolean }
export interface FieldSpec { name: string; label: string; initial?: string; type?: "text" | "password"; mono?: boolean; placeholder?: string }
export interface FormOptions {
  title: string; message?: React.ReactNode; fields: FieldSpec[]; confirmLabel: string;
  /** Fehlermeldung zurückgeben hält den Dialog offen und zeigt sie an; null = ok. */
  validate?: (values: Record<string, string>) => string | null;
}
export interface Dialogs {
  confirm(o: ConfirmOptions): Promise<boolean>;
  prompt(o: Omit<FormOptions, "fields"> & { label: string; initial?: string; type?: "text" | "password"; mono?: boolean; placeholder?: string }): Promise<string | null>;
  form(o: FormOptions): Promise<Record<string, string> | null>;
}

/** true, solange irgendein Modal offen ist (für Strg+S). */
export function isModalOpen(): boolean {
  return modalOpen();
}

type Item =
  | { id: number; kind: "confirm"; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { id: number; kind: "form"; opts: FormOptions; resolve: (v: Record<string, string> | null) => void };

const Ctx = createContext<Dialogs | null>(null);

export function useDialogs(): Dialogs {
  const d = useContext(Ctx);
  if (!d) throw new Error("useDialogs() muss innerhalb von <DialogProvider> verwendet werden.");
  return d;
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const nextId = useRef(1);

  const remove = useCallback((id: number) => setItems((l) => l.filter((x) => x.id !== id)), []);

  const form = useCallback((opts: FormOptions) => new Promise<Record<string, string> | null>((resolve) => {
    setItems((l) => [...l, { id: nextId.current++, kind: "form", opts, resolve }]);
  }), []);
  const confirm = useCallback((opts: ConfirmOptions) => new Promise<boolean>((resolve) => {
    setItems((l) => [...l, { id: nextId.current++, kind: "confirm", opts, resolve }]);
  }), []);
  const prompt = useCallback<Dialogs["prompt"]>(async (o) => {
    const { label, initial, type, mono, placeholder, ...rest } = o;
    const r = await form({ ...rest, fields: [{ name: "value", label, initial, type, mono, placeholder }] });
    return r ? r.value : null;
  }, [form]);

  const api = useMemo<Dialogs>(() => ({ confirm, prompt, form }), [confirm, prompt, form]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {items.map((it) =>
        it.kind === "confirm" ? (
          <ConfirmDialog key={it.id} opts={it.opts} done={(v) => { remove(it.id); it.resolve(v); }} />
        ) : (
          <FormDialog key={it.id} opts={it.opts} done={(v) => { remove(it.id); it.resolve(v); }} />
        ),
      )}
    </Ctx.Provider>
  );
}

function ConfirmDialog({ opts, done }: { opts: ConfirmOptions; done: (v: boolean) => void }) {
  return (
    <Modal title={opts.title} onClose={() => done(false)}>
      <form onSubmit={(e) => { e.preventDefault(); done(true); }}>
        <div className="field">{opts.message}</div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={() => done(false)}>Abbrechen</button>
          <button type="submit" className={opts.danger ? "btn danger" : "btn primary"} autoFocus>{opts.confirmLabel}</button>
        </div>
      </form>
    </Modal>
  );
}

function FormDialog({ opts, done }: { opts: FormOptions; done: (v: Record<string, string> | null) => void }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(opts.fields.map((f) => [f.name, f.initial ?? ""])));
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = opts.validate ? opts.validate(values) : null;
    if (err) { setError(err); return; }
    done(values);
  };

  return (
    <Modal title={opts.title} onClose={() => done(null)}>
      <form onSubmit={submit}>
        {opts.message && <div className="field">{opts.message}</div>}
        {opts.fields.map((f, i) => (
          <div className="field" key={f.name}>
            <label>{f.label}</label>
            <input
              className={f.mono ? "inp mono" : "inp"}
              type={f.type ?? "text"}
              placeholder={f.placeholder}
              value={values[f.name]}
              autoFocus={i === 0}
              onFocus={i === 0 ? (e) => e.currentTarget.select() : undefined}
              onChange={(e) => { setValues({ ...values, [f.name]: e.target.value }); setError(null); }}
            />
          </div>
        ))}
        {error && <div className="issue error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={() => done(null)}>Abbrechen</button>
          <button type="submit" className="btn primary">{opts.confirmLabel}</button>
        </div>
      </form>
    </Modal>
  );
}
