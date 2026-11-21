import { type SubmitEvent, useId, useState } from "react";
import { NotesRequestError, updateNotes } from "../../api/notes";
import type { CourseNotes, NotesChanges, NotesSection } from "../../types/notes";
import "./NotesEditor.css";

type Props = {
  notes: CourseNotes;
  accessToken: string;
  onSaved: (notes: CourseNotes) => void;
  onCancel: () => void;
};

// Each item carries a key that survives adding and removing, so React keeps
// focus and typing on the item the student is actually editing.
type DraftConcept = { key: number; term: string; explanation: string };
type DraftPoint = { key: number; text: string };
type DraftSection = { key: number; heading: string; concepts: DraftConcept[]; points: DraftPoint[] };
type Draft = { title: string; overview: string; sections: DraftSection[]; nextKey: number };

function toDraft(notes: CourseNotes): Draft {
  let key = 0;
  const sections = notes.sections.map((section) => ({
    key: ++key,
    heading: section.heading,
    concepts: section.key_concepts.map((concept) => ({ key: ++key, ...concept })),
    points: section.points.map((text) => ({ key: ++key, text })),
  }));
  return { title: notes.title, overview: notes.overview, sections, nextKey: key + 1 };
}

function toSections(draft: Draft): NotesSection[] {
  return draft.sections.map((section) => ({
    heading: section.heading,
    key_concepts: section.concepts.map(({ term, explanation }) => ({ term, explanation })),
    points: section.points.map((point) => point.text),
  }));
}

function sentence(text: string): string {
  const trimmed = text.trim().replace(/\.$/, "");
  return trimmed ? `${trimmed[0].toUpperCase()}${trimmed.slice(1)}.` : "";
}

// The backend checks edits with the rules generated notes follow; its reason is shown as given.
function saveErrorMessage(cause: unknown): string {
  const fallback = "Your changes could not be saved. Please try again.";
  if (!(cause instanceof NotesRequestError)) return fallback;
  if (cause.code === "NOTES_INVALID_CONTENT") {
    return `These notes could not be saved. ${sentence(cause.detail) || "Check that every section has a heading and some content."}`;
  }
  if (cause.status === 400 && cause.detail) return `The title could not be saved. ${sentence(cause.detail)}`;
  if (cause.status === 401) return "Your session has ended. Sign in again to save your changes.";
  if (cause.status === 404) return "These notes no longer exist. They may have been deleted in another tab.";
  return fallback;
}

export default function NotesEditor({ notes, accessToken, onSaved, onCancel }: Props) {
  const id = useId();
  const [draft, setDraft] = useState(() => toDraft(notes));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const paragraphs = notes.options?.format === "paragraphs";
  const pointName = paragraphs ? "paragraph" : "point";

  function change(update: (current: Draft) => Draft) {
    setDraft(update);
    setError("");
  }

  function changeSection(index: number, update: (section: DraftSection) => DraftSection) {
    change((current) => ({
      ...current,
      sections: current.sections.map((section, at) => (at === index ? update(section) : section)),
    }));
  }

  // Adds an item with the next free key.
  function addTo(index: number, add: (section: DraftSection, key: number) => DraftSection) {
    change((current) => ({
      ...current,
      nextKey: current.nextKey + 1,
      sections: current.sections.map((section, at) => (at === index ? add(section, current.nextKey) : section)),
    }));
  }

  async function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const title = draft.title.trim();
    if (!title) {
      setError("Give these notes a title.");
      return;
    }

    // PATCH only what changed, so a title-only edit never resends the content.
    const changes: NotesChanges = {};
    const sections = toSections(draft);
    if (title !== notes.title) changes.title = title;
    if (draft.overview !== notes.overview) changes.overview = draft.overview;
    if (JSON.stringify(sections) !== JSON.stringify(notes.sections)) changes.sections = sections;
    if (Object.keys(changes).length === 0) {
      onCancel();
      return;
    }

    setBusy(true);
    setError("");
    try {
      onSaved(await updateNotes(notes.id, changes, accessToken));
    } catch (cause) {
      // The draft is kept, so the student can fix it and save again.
      setError(saveErrorMessage(cause));
      setBusy(false);
    }
  }

  return (
    <form className="notes-editor" aria-label="Edit notes" onSubmit={save}>
      <label htmlFor={`${id}-title`}>Title</label>
      <input
        id={`${id}-title`}
        value={draft.title}
        maxLength={255}
        autoFocus
        disabled={busy}
        onChange={(event) => { const title = event.target.value; change((current) => ({ ...current, title })); }}
      />

      <label htmlFor={`${id}-overview`}>Overview</label>
      <textarea
        id={`${id}-overview`}
        value={draft.overview}
        rows={4}
        disabled={busy}
        onChange={(event) => { const overview = event.target.value; change((current) => ({ ...current, overview })); }}
      />

      {draft.sections.map((section, index) => {
        const number = index + 1;
        return (
          <fieldset key={section.key} className="notes-editor-section" disabled={busy}>
            <legend>Section {number}</legend>
            <label htmlFor={`${id}-${section.key}-heading`}>Heading</label>
            <input
              id={`${id}-${section.key}-heading`}
              value={section.heading}
              onChange={(event) => { const heading = event.target.value; changeSection(index, (current) => ({ ...current, heading })); }}
            />

            {section.concepts.map((concept, conceptIndex) => (
              <fieldset key={concept.key} className="notes-editor-item">
                <legend>Key concept {conceptIndex + 1}</legend>
                <label htmlFor={`${id}-${concept.key}-term`}>Term</label>
                <input
                  id={`${id}-${concept.key}-term`}
                  value={concept.term}
                  onChange={(event) => {
                    const term = event.target.value;
                    changeSection(index, (current) => ({
                      ...current,
                      concepts: current.concepts.map((item) => (item.key === concept.key ? { ...item, term } : item)),
                    }));
                  }}
                />
                <label htmlFor={`${id}-${concept.key}-explanation`}>Explanation</label>
                <textarea
                  id={`${id}-${concept.key}-explanation`}
                  value={concept.explanation}
                  rows={2}
                  onChange={(event) => {
                    const explanation = event.target.value;
                    changeSection(index, (current) => ({
                      ...current,
                      concepts: current.concepts.map((item) => (item.key === concept.key ? { ...item, explanation } : item)),
                    }));
                  }}
                />
                <button
                  type="button"
                  aria-label={`Remove key concept ${conceptIndex + 1}`}
                  onClick={() => changeSection(index, (current) => ({
                    ...current,
                    concepts: current.concepts.filter((item) => item.key !== concept.key),
                  }))}
                >
                  Remove
                </button>
              </fieldset>
            ))}
            <button type="button" onClick={() => addTo(index, (current, key) => ({
              ...current, concepts: [...current.concepts, { key, term: "", explanation: "" }],
            }))}>
              Add key concept
            </button>

            {section.points.map((point, pointIndex) => (
              <div key={point.key} className="notes-editor-item">
                <label htmlFor={`${id}-${point.key}-point`}>{paragraphs ? "Paragraph" : "Point"} {pointIndex + 1}</label>
                <textarea
                  id={`${id}-${point.key}-point`}
                  value={point.text}
                  rows={paragraphs ? 4 : 2}
                  onChange={(event) => {
                    const text = event.target.value;
                    changeSection(index, (current) => ({
                      ...current,
                      points: current.points.map((item) => (item.key === point.key ? { ...item, text } : item)),
                    }));
                  }}
                />
                <button
                  type="button"
                  aria-label={`Remove ${pointName} ${pointIndex + 1}`}
                  onClick={() => changeSection(index, (current) => ({
                    ...current,
                    points: current.points.filter((item) => item.key !== point.key),
                  }))}
                >
                  Remove
                </button>
              </div>
            ))}
            <button type="button" onClick={() => addTo(index, (current, key) => ({
              ...current, points: [...current.points, { key, text: "" }],
            }))}>
              Add {pointName}
            </button>

            <button
              type="button"
              className="notes-editor-remove-section"
              aria-label={`Remove section ${number}`}
              onClick={() => change((current) => ({
                ...current,
                sections: current.sections.filter((item) => item.key !== section.key),
              }))}
            >
              Remove section
            </button>
          </fieldset>
        );
      })}

      <button
        type="button"
        disabled={busy}
        onClick={() => change((current) => ({
          ...current,
          nextKey: current.nextKey + 2,
          sections: [...current.sections, {
            key: current.nextKey, heading: "", concepts: [], points: [{ key: current.nextKey + 1, text: "" }],
          }],
        }))}
      >
        Add section
      </button>

      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="notes-editor-actions">
        <button type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
        <button type="button" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
