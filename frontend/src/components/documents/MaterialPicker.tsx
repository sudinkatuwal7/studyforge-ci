import type { TrackedDocument } from "../../types/document";
import { materialReferences, selectAllReferences, toggleReference } from "../chat/chatReferences";

type Props = {
  materials: TrackedDocument[];
  // Already reconciled by the caller, which also needs it to enable its submit button.
  selected: string[];
  onSelectedChange: (selected: string[]) => void;
  disabled: boolean;
  emptyMessage: string;
  notReadyMessage: string;
};

// The course-material checklist shared by Quiz and Notes generation.
export default function MaterialPicker({ materials, selected, onSelectedChange, disabled, emptyMessage, notReadyMessage }: Props) {
  const references = materialReferences(materials);
  const readyCount = references.filter((item) => item.available).length;

  return <fieldset disabled={disabled}>
    <legend>Materials</legend>
    {materials.length === 0 && <p>{emptyMessage}</p>}
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
