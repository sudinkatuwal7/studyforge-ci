import { QUIZ_LENGTHS, type QuizLength } from "../../types/quiz";
import type { TrackedDocument } from "../../types/document";
import {
  reconcileSelection,
  selectAllReferences,
  selectedDocumentIds,
  toggleReference,
  type SelectableReference,
} from "../chat/chatReferences";

type Props = {
  materials: TrackedDocument[];
  selected: string[];
  onSelectedChange: (selected: string[]) => void;
  length: QuizLength;
  onLengthChange: (length: QuizLength) => void;
  busy: boolean;
  error: string;
  onGenerate: (documentIds: number[]) => void;
};

// Only READY materials have text to quiz on, so the others stay visible but disabled.
function toReferences(materials: TrackedDocument[]): (SelectableReference & { name: string; status: string })[] {
  return materials.map((item) => ({
    id: String(item.id),
    documentId: item.id,
    available: item.snapshot?.status === "READY",
    name: item.name,
    status: item.snapshot?.status ?? "PENDING",
  }));
}

export default function QuizSetup({ materials, selected, onSelectedChange, length, onLengthChange, busy, error, onGenerate }: Props) {
  const references = toReferences(materials);
  // Re-derived on every render, so a material that was deleted or stopped
  // being READY drops out of the selection without any extra effect.
  const effective = reconcileSelection(references, selected);
  const readyCount = references.filter((item) => item.available).length;

  return <form className="quiz-setup" onSubmit={(event) => {
    event.preventDefault();
    if (!busy && effective.length) onGenerate(selectedDocumentIds(references, effective));
  }}>
    <h3>Generate a quiz</h3>
    <p>Choose the materials to be quizzed on and how many questions you want.</p>

    <fieldset disabled={busy}>
      <legend>Materials</legend>
      {materials.length === 0 && <p>Upload a material in the Materials tab to create a quiz.</p>}
      {materials.length > 0 && readyCount === 0 && <p>None of your materials are ready yet. Quizzes can be generated once processing finishes.</p>}
      {readyCount > 1 && <div className="quiz-setup-bulk">
        <button type="button" onClick={() => onSelectedChange(selectAllReferences(references, effective))}>Select all</button>
        <button type="button" onClick={() => onSelectedChange([])} disabled={!effective.length}>Clear</button>
      </div>}
      <ul className="quiz-material-list">
        {references.map((item) => <li key={item.id}>
          <label>
            <input type="checkbox" checked={effective.includes(item.id)} disabled={!item.available}
              onChange={() => onSelectedChange(toggleReference(references, effective, item.id))} />
            <span>{item.name}</span>
            {!item.available && <small>{item.status === "FAILED" ? "Processing failed" : "Still processing"}</small>}
          </label>
        </li>)}
      </ul>
    </fieldset>

    <fieldset disabled={busy}>
      <legend>Number of questions</legend>
      <div className="quiz-length">
        {QUIZ_LENGTHS.map((option) => <label key={option}>
          <input type="radio" name="quiz-length" value={option} checked={length === option} onChange={() => onLengthChange(option)} />
          {option} questions
        </label>)}
      </div>
    </fieldset>

    {!effective.length && readyCount > 0 && <p className="quiz-hint">Select at least one material.</p>}
    {error && <p role="alert" className="quiz-error">{error}</p>}
    <button type="submit" disabled={busy || !effective.length}>{busy ? "Generating quiz..." : "Generate quiz"}</button>
    {busy && <p role="status">Writing your questions. This can take several seconds.</p>}
  </form>;
}
