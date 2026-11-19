import { useEffect, useId, useRef } from "react";
import "./ConfirmDeleteDialog.css";

export default function ConfirmDeleteDialog({
  title, description, busy, error, onCancel, onConfirm,
}: {
  title: string;
  description: string;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    dialog.querySelector<HTMLButtonElement>(".confirm-delete-cancel")?.focus();
    return () => {
      if (dialog.open && typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    };
  }, []);

  return <dialog ref={ref} className="confirm-delete-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} onCancel={(event) => {
    event.preventDefault();
    if (!busy) onCancel();
  }}>
    <h3 id={`${id}-title`}>{title}</h3>
    <p id={`${id}-description`}>{description}</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="confirm-delete-actions">
      <button className="confirm-delete-cancel" type="button" disabled={busy} onClick={onCancel}>Cancel</button>
      <button className="confirm-delete-confirm" type="button" disabled={busy} onClick={onConfirm}>{busy ? "Deleting..." : "Delete"}</button>
    </div>
  </dialog>;
}
