"use client";

// Gemeinsamer Modal-Rahmen. Modulweiter Stapel: nur das oberste Modal reagiert auf Escape,
// und isModalOpen() zeigt an, ob irgendein Modal offen ist (z. B. für Strg+S).

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconX } from "./icons";

const stack: symbol[] = [];

/** true, solange irgendein Modal offen ist. */
export function isModalOpen(): boolean {
  return stack.length > 0;
}

export function Modal({ title, ariaLabel, onClose, children, wide, className }: { title: React.ReactNode; ariaLabel?: string; onClose: () => void; children: React.ReactNode; wide?: boolean; className?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Element, das vor dem Öffnen den Fokus hatte (beim ersten Render, noch vor autoFocus).
  const [opener] = useState<Element | null>(() => (typeof document !== "undefined" ? document.activeElement : null));

  useEffect(() => {
    const node = rootRef.current;
    const id = Symbol("modal");
    stack.push(id);
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape" && stack[stack.length - 1] === id) onCloseRef.current();
    };
    window.addEventListener("keydown", h);
    return () => {
      window.removeEventListener("keydown", h);
      const i = stack.indexOf(id);
      if (i >= 0) stack.splice(i, 1);
      // Fokus nur bei echtem Unmount zurückgeben (StrictMode simuliert das Cleanup bei noch verbundenem DOM).
      if (node && !node.isConnected && opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [opener]);

  // Portal nach document.body: später geöffnete Modals liegen so immer später im DOM und damit oben.
  return createPortal(
    <div className="modal-backdrop" ref={rootRef} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? "wide" : ""} ${className ?? ""}`.trim()} role="dialog" aria-modal="true" aria-label={ariaLabel ?? (typeof title === "string" ? title : undefined)}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn ghost small" onClick={onClose} aria-label="Schließen"><IconX /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
