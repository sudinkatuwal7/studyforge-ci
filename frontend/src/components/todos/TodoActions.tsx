import { type SubmitEvent, useId, useState } from "react";
import { deleteTodo, updateTodoTitle } from "../../api/todos";
import { useAuth } from "../../context/AuthContext";
import type { TodoItem } from "../../types/todo";
import ConfirmDeleteDialog from "../shared/ConfirmDeleteDialog";

export default function TodoActions({ todo, disabled = false, onUpdated, onDeleted, onBusyChange }: {
  todo: TodoItem;
  disabled?: boolean;
  onUpdated: (todo: TodoItem) => void;
  onDeleted: (todoId: number) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { accessToken } = useAuth();
  const id = useId();
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [title, setTitle] = useState(todo.title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function startBusy() { setBusy(true); onBusyChange?.(true); setError(""); }
  function finishBusy() { setBusy(false); onBusyChange?.(false); }

  async function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || disabled) return;
    const trimmed = title.trim();
    if (!trimmed || trimmed.length > 200 || [...trimmed].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) {
      setError("Use a task title of 1 to 200 characters without control characters.");
      return;
    }
    startBusy();
    try {
      onUpdated(await updateTodoTitle(accessToken, todo.id, trimmed));
      setMode("view");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the task.");
    } finally {
      finishBusy();
    }
  }

  async function remove() {
    if (busy || disabled) return;
    startBusy();
    try {
      await deleteTodo(accessToken, todo.id);
      finishBusy();
      onDeleted(todo.id);
    } catch {
      setError("Could not delete the task. Please try again.");
      finishBusy();
    }
  }

  return <div className="todo-actions">
    {mode === "view" && <>
      <button type="button" disabled={disabled} aria-label={`Edit ${todo.title}`} onClick={() => { setTitle(todo.title); setError(""); setMode("edit"); }}>Edit</button>
      <button type="button" disabled={disabled} aria-label={`Delete ${todo.title}`} onClick={() => { setError(""); setMode("delete"); }}>Delete</button>
    </>}
    {mode === "edit" && <form onSubmit={save}>
      <label htmlFor={`${id}-title`}>Edit task {todo.title}</label>
      <input id={`${id}-title`} value={title} maxLength={200} autoFocus disabled={busy} onChange={(event) => { setTitle(event.target.value); setError(""); }} />
      <button type="submit" disabled={busy || disabled}>{busy ? "Saving..." : "Save"}</button>
      <button type="button" disabled={busy} onClick={() => { setMode("view"); setError(""); }}>Cancel</button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>}
    {mode === "delete" && <ConfirmDeleteDialog
      title={`Delete task ${todo.title}?`}
      description="This task will be permanently removed."
      busy={busy} error={error}
      onCancel={() => { setMode("view"); setError(""); }}
      onConfirm={() => void remove()}
    />}
  </div>;
}
