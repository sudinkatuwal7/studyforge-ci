import { useEffect, useRef } from "react";
import { DEFAULT_NOTES_OPTIONS, DETAIL_LEVELS, NOTE_FORMATS, NOTE_TYPES, type CourseNotes, type NotesSection } from "../../types/notes";
import "./NotesView.css";

// onCreateNew is the course Notes tab's way back to generation; the note page has none.
type Props = { notes: CourseNotes; onCreateNew?: () => void };

function labelOf<T extends string>(choices: { value: T; label: string }[], value: T): string {
  return choices.find((choice) => choice.value === value)?.label ?? value;
}

// Bullets are a list; paragraphs are prose. Same saved shape, different reading.
function Points({ section, paragraphs }: { section: NotesSection; paragraphs: boolean }) {
  if (paragraphs) {
    return <div className="notes-paragraphs">
      {section.points.map((point, pointIndex) => <p key={pointIndex}>{point}</p>)}
    </div>;
  }
  return <ul>
    {section.points.map((point, pointIndex) => <li key={pointIndex}>{point}</li>)}
  </ul>;
}

export default function NotesView({ notes, onCreateNew }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  // The Generate button that had focus is gone, so start keyboard and screen reader users here.
  useEffect(() => heading.current?.focus(), []);

  // Older API responses have no options field during a staggered deployment.
  const { note_type, detail_level, format } = notes.options ?? DEFAULT_NOTES_OPTIONS;
  const paragraphs = format === "paragraphs";
  // A summary leads with its takeaways; outlines and glossaries with their concepts.
  const pointsFirst = note_type === "summary";

  return <article className="notes-result" aria-label="Study notes">
    <h3 ref={heading} tabIndex={-1}>{notes.title}</h3>
    <p className="notes-sources">From {notes.source_documents.map((document) => document.name).join(", ")}</p>
    <p className="notes-options-used">
      {[labelOf(NOTE_TYPES, note_type), labelOf(DETAIL_LEVELS, detail_level), labelOf(NOTE_FORMATS, format)].join(" · ")}
    </p>
    <p className="notes-overview">{notes.overview}</p>

    {notes.sections.map((section, index) => {
      const concepts = section.key_concepts.length > 0 && <>
        <h5>Key concepts</h5>
        <dl>
          {section.key_concepts.map((concept, conceptIndex) => <div key={conceptIndex}>
            <dt>{concept.term}</dt>
            <dd>{concept.explanation}</dd>
          </div>)}
        </dl>
      </>;
      const points = section.points.length > 0 && <>
        <h5>{paragraphs ? "Explanation" : "Important points"}</h5>
        <Points section={section} paragraphs={paragraphs} />
      </>;
      return <section key={index} className="notes-section">
        <h4>{section.heading}</h4>
        {pointsFirst ? <>{points}{concepts}</> : <>{concepts}{points}</>}
      </section>;
    })}

    {onCreateNew && <button type="button" onClick={onCreateNew}>Create new notes</button>}
  </article>;
}
