import type { ReactNode } from "react";
import type { MaterialsLoadState, TrackedDocument } from "../../types/document";
import { materialReferences, selectAllReferences, toggleReference } from "../chat/chatReferences";
import EmptyState from "../shared/EmptyState";

type Props = {
  materials: TrackedDocument[];
  // Whether `materials` is the loaded list; while it is not, an empty list is not "no materials".
  state?: MaterialsLoadState;
  // Already reconciled by the caller, which also needs it to enable its submit button.
  selected: string[];
  onSelectedChange: (selected: string[]) => void;
  disabled: boolean;
  emptyMessage: string;
  // The next step when there are no materials (and the way to retry when they failed to load).
  emptyAction?: ReactNode;
  notReadyMessage: string;
};

// The course-material checklist shared by Quiz and Notes generation.
export default function MaterialPicker({ materials, state = "ready", selected, onSelectedChange, disabled, emptyMessage, emptyAction, notReadyMessage }: Props) {
  const references = materialReferences(materials);
  const readyCount = references.filter((item) => item.available).length;
  const none = materials.length === 0;

  return <fieldset disabled={disabled}>
    <legend>Materials</legend>
    {none && state === "loading" && <p role="status">Loading materials...</p>}
    {none && state === "error" && <div className="material-load-error">
      <p className="form-error" role="alert">Materials could not be loaded. Open Materials to try again.</p>
      {emptyAction}
    </div>}
    {none && state === "ready" && <EmptyState message={emptyMessage}>{emptyAction}</EmptyState>}
    {materials.length > 0 && readyCount === 0 && <p>{notReadyMessage}</p>}
    {readyCount > 1 && <div className="quiz-setup-bulk">
      <button type="button" onClick={() => onSelectedChange(selectAllReferences(references, selected))}>Select all</button>
      <button type="button" onClick={() => onSelectedChange([])} disabled={!selected.length}>Clear</button>
    </div>}
    <ul className="quiz-material-list">
      {references.map((item) => <li key={item.id}>
        <label>
          <input type="checkbox" checked={selected.includes(item.id)} disabled={!item.available}
            onChange={() => onSelectedChange(toggleReference(references, selected, item.id))} />
          <span>{item.name}</span>
          {!item.available && <small>{item.status === "FAILED" ? "Processing failed" : "Still processing"}</small>}
        </label>
      </li>)}
    </ul>
  </fieldset>;
}
