"use client";
import { X } from "lucide-react";
import { useEffect, useRef } from "react";

/**
 * Accessible modal built on the native <dialog> element:
 * focus is trapped, Escape closes it, and the page behind is inert.
 */
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose(); // click on the backdrop
      }}
      aria-label={title}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-line bg-surface p-0 text-ink shadow-xl"
    >
      {open && (
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-xl font-semibold">{title}</h2>
            <button type="button" onClick={onClose} className="btn-ghost -mt-1 -mr-2 min-h-9 px-2" aria-label="Close">
              <X size={18} aria-hidden />
            </button>
          </div>
          <div className="mt-3">{children}</div>
        </div>
      )}
    </dialog>
  );
}
