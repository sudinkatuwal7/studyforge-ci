import type { MaterialsLoadState, TrackedDocument } from "../../types/document";
import { DETAIL_LEVELS, NOTE_FORMATS, NOTE_TYPES, type NotesOptions } from "../../types/notes";
import { materialReferences, reconcileSelection, selectedDocumentIds } from "../chat/chatReferences";
import MaterialPicker from "../documents/MaterialPicker";
import GoToMaterialsLink from "../courses/GoToMaterialsLink";

type Props = {
  courseId: number;
  materialsState: MaterialsLoadState;
  materials: TrackedDocument[];
  selected: string[];
  onSelectedChange: (selected: string[]) => void;
  options: NotesOptions;
  onOptionsChange: (options: NotesOptions) => void;
  busy: boolean;
  error: string;
  onGenerate: (documentIds: number[], options: NotesOptions) => void;
};

type ChoiceGroupProps<K extends keyof NotesOptions> = {
  name: K;
  legend: string;
  choices: { value: NotesOptions[K]; label: string; help: string }[];
  options: NotesOptions;
  onOptionsChange: (options: NotesOptions) => void;
  disabled: boolean;
};

// One radio group per option. Fixed choices only: there is no free-text input.
function ChoiceGroup<K extends keyof NotesOptions>({ name, legend, choices, options, onOptionsChange, disabled }: ChoiceGroupProps<K>) {
  return <fieldset disabled={disabled}>
    <legend>{legend}</legend>
    <div className="notes-options">
      {choices.map((choice) => <label key={choice.value}>
        <input type="radio" name={`notes-${name}`} value={choice.value} checked={options[name] === choice.value}
          onChange={() => onOptionsChange({ ...options, [name]: choice.value })} />
        <span>{choice.label}<small>{choice.help}</small></span>
      </label>)}
    </div>
  </fieldset>;
}

export default function NotesSetup({ courseId, materials, materialsState, selected, onSelectedChange, options, onOptionsChange, busy, error, onGenerate }: Props) {
  const references = materialReferences(materials);
  // Re-derived on every render, so a material that was deleted or stopped
  // being READY drops out of the selection without any extra effect.
  const effective = reconcileSelection(references, selected);
  const readyCount = references.filter((item) => item.available).length;
  const groups = { options, onOptionsChange, disabled: busy };

  return <form className="quiz-setup" onSubmit={(event) => {
    event.preventDefault();
    if (!busy && effective.length) onGenerate(selectedDocumentIds(references, effective), options);
  }}>
    <h3>Study notes</h3>
    <p>Choose one or more materials to combine into one set of notes, then choose how they are written.</p>

    <MaterialPicker materials={materials} state={materialsState} selected={effective} onSelectedChange={onSelectedChange} disabled={busy}
      emptyMessage="No materials yet. Upload one in Materials to create notes."
      emptyAction={<GoToMaterialsLink courseId={courseId} />}
      notReadyMessage="None of your materials are ready yet. Notes can be generated once processing finishes." />

    <ChoiceGroup name="note_type" legend="Note type" choices={NOTE_TYPES} {...groups} />
    <ChoiceGroup name="detail_level" legend="Detail level" choices={DETAIL_LEVELS} {...groups} />
    <ChoiceGroup name="format" legend="Format" choices={NOTE_FORMATS} {...groups} />

    {!effective.length && readyCount > 0 && <p className="quiz-hint">Select at least one material.</p>}
    {error && <p role="alert" className="quiz-error">{error}</p>}
    <button type="submit" disabled={busy || !effective.length}>{busy ? "Generating notes..." : "Generate notes"}</button>
    {busy && <p role="status">Reading your materials and writing your notes. Long selections can take a few minutes.</p>}
  </form>;
}
