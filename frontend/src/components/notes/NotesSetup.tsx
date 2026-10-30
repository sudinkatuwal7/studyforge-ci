import type { TrackedDocument } from "../../types/document";
import { materialReferences, reconcileSelection, selectedDocumentIds } from "../chat/chatReferences";
import MaterialPicker from "../documents/MaterialPicker";

type Props = {
  materials: TrackedDocument[];
  selected: string[];
  onSelectedChange: (selected: string[]) => void;
  busy: boolean;
  error: string;
  onGenerate: (documentIds: number[]) => void;
};

export default function NotesSetup({ materials, selected, onSelectedChange, busy, error, onGenerate }: Props) {
  const references = materialReferences(materials);
  // Re-derived on every render, so a material that was deleted or stopped
  // being READY drops out of the selection without any extra effect.
  const effective = reconcileSelection(references, selected);
  const readyCount = references.filter((item) => item.available).length;

  return <form className="quiz-setup" onSubmit={(event) => {
    event.preventDefault();
    if (!busy && effective.length) onGenerate(selectedDocumentIds(references, effective));
  }}>
    <h3>Study notes</h3>
    <p>Choose one or more materials to combine into organized notes.</p>

    <MaterialPicker materials={materials} selected={effective} onSelectedChange={onSelectedChange} disabled={busy}
      emptyMessage="Upload a material in the Materials tab to create notes."
      notReadyMessage="None of your materials are ready yet. Notes can be generated once processing finishes." />

    {!effective.length && readyCount > 0 && <p className="quiz-hint">Select at least one material.</p>}
    {error && <p role="alert" className="quiz-error">{error}</p>}
    <button type="submit" disabled={busy || !effective.length}>{busy ? "Generating notes..." : "Generate notes"}</button>
    {busy && <p role="status">Reading your materials and writing your notes. Long selections can take a few minutes.</p>}
  </form>;
}
