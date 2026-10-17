"use client";
import { useEffect, useId, useRef, useState } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { confirmationTexts } from "@/lib/i18n";
import type { Lang } from "@/lib/world";
import { notifyModalChange } from "@/platform/render-visibility";

/** One visible confirmation, one request, and feedback until the server accepts it. */
export default function ConfirmAction({ title, description, lang, busy, error, onConfirm, onCancel }: {
  title: string;
  description: string;
  lang: Lang;
  busy: boolean;
  error?: string;
  onConfirm: () => Promise<boolean>;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), locked = useRef(false);
  const [sending, setSending] = useState(false), [failed, setFailed] = useState(false);
  const id = useId(), tx = confirmationTexts(lang);
  const pending = sending || busy;
  useEffect(() => {
    const el = dialog.current!;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    el.showModal();
    notifyModalChange();
    return () => {
      el.close();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
      notifyModalChange();
    };
  }, []);

  async function submit() {
    if (locked.current || busy) return;
    locked.current = true;
    setSending(true);
    setFailed(false);
    try {
      if (await onConfirm()) onCancel();
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      locked.current = false;
      setSending(false);
    }
  }

  return (
    <dialog className="ui-confirm ui-panel" ref={dialog} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
      onKeyDown={(e) => e.stopPropagation()} onKeyUp={(e) => e.stopPropagation()}
      onCancel={(e) => { e.preventDefault(); if (!pending) onCancel(); }}>
      <CircleAlert className="ui-confirm-icon" aria-hidden="true" />
      <h2 className="ui-dialog-title" id={`${id}-title`}>{title}</h2>
      <p id={`${id}-description`}>{description}</p>
      <div className="ui-confirm-status" role="status" aria-live="polite">
        {pending && <><LoaderCircle className="ui-pending-icon" aria-hidden="true" /> {sending ? tx.sending : tx.waiting}</>}
      </div>
      {failed && <p className="ui-confirm-error" role="alert">{error || tx.failed}</p>}
      <div className="ui-confirm-actions">
        <button type="button" className="ui-button" disabled={pending} autoFocus onClick={onCancel}>{tx.cancel}</button>
        <button type="button" className="ui-button is-destructive" disabled={pending} aria-busy={sending} onClick={() => void submit()}>{title}</button>
      </div>
    </dialog>
  );
}
