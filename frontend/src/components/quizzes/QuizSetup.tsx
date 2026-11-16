import { QUIZ_LENGTHS, type QuizLength } from "../../types/quiz";
import type { TrackedDocument } from "../../types/document";
import type { QuizMode } from "../../types/survival";
import { materialReferences, reconcileSelection, selectedDocumentIds } from "../chat/chatReferences";
import MaterialPicker from "../documents/MaterialPicker";
import "./survival.css";

const MODES: { value: QuizMode; label: string; hint: string }[] = [
  { value: "regular", label: "Regular quiz", hint: "Answer every question, then submit for a score." },
  { value: "survival", label: "Survival", hint: "One question at a time with 3 lives. A wrong answer costs a life." },
];

type Props = {
  mode: QuizMode;
  onModeChange: (mode: QuizMode) => void;
  materials: TrackedDocument[];
  selected: string[];
  onSelectedChange: (selected: string[]) => void;
  length: QuizLength;
  onLengthChange: (length: QuizLength) => void;
  busy: boolean;
  error: string;
  onGenerate: (documentIds: number[]) => void;
};

export default function QuizSetup({ mode, onModeChange, materials, selected, onSelectedChange, length, onLengthChange, busy, error, onGenerate }: Props) {
  const references = materialReferences(materials);
  // Re-derived on every render, so a material that was deleted or stopped
  // being READY drops out of the selection without any extra effect.
  const effective = reconcileSelection(references, selected);
  const readyCount = references.filter((item) => item.available).length;
  const labels = mode === "survival" ? ["Start Survival", "Starting game..."] : ["Generate quiz", "Generating quiz..."];
  const action = busy ? labels[1] : labels[0];

  return <form className="quiz-setup" onSubmit={(event) => {
    event.preventDefault();
    if (!busy && effective.length) onGenerate(selectedDocumentIds(references, effective));
  }}>
    <h3>Generate a quiz</h3>
    <p>Choose the materials to be quizzed on and how many questions you want.</p>

    <fieldset disabled={busy}>
      <legend>Quiz type</legend>
      <div className="quiz-mode">
        {MODES.map((option) => <label key={option.value}>
          <input type="radio" name="quiz-mode" value={option.value} checked={mode === option.value} onChange={() => onModeChange(option.value)} />
          <span><strong>{option.label}</strong> <small>{option.hint}</small></span>
        </label>)}
      </div>
    </fieldset>

    <MaterialPicker materials={materials} selected={effective} onSelectedChange={onSelectedChange} disabled={busy}
      emptyMessage="Upload a material in the Materials tab to create a quiz."
      notReadyMessage="None of your materials are ready yet. Quizzes can be generated once processing finishes." />

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
    <button type="submit" disabled={busy || !effective.length}>{action}</button>
    {busy && <p role="status">Writing your questions. This can take several seconds.</p>}
  </form>;
}
