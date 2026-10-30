import { useEffect, useRef } from "react";
import type { CourseNotes } from "../../types/notes";

type Props = { notes: CourseNotes; onCreateNew: () => void };

export default function NotesView({ notes, onCreateNew }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  // The Generate button that had focus is gone, so start keyboard and screen reader users here.
  useEffect(() => heading.current?.focus(), []);

  return <article className="notes-result" aria-label="Study notes">
    <h3 ref={heading} tabIndex={-1}>{notes.title}</h3>
    <p className="notes-sources">From {notes.source_documents.map((document) => document.name).join(", ")}</p>
    <p className="notes-overview">{notes.overview}</p>

    {notes.sections.map((section, index) => <section key={index} className="notes-section">
      <h4>{section.heading}</h4>
      {section.key_concepts.length > 0 && <>
        <h5>Key concepts</h5>
        <dl>
          {section.key_concepts.map((concept, conceptIndex) => <div key={conceptIndex}>
            <dt>{concept.term}</dt>
            <dd>{concept.explanation}</dd>
          </div>)}
        </dl>
      </>}
      {section.points.length > 0 && <>
        <h5>Important points</h5>
        <ul>
          {section.points.map((point, pointIndex) => <li key={pointIndex}>{point}</li>)}
        </ul>
      </>}
    </section>)}

    <button type="button" onClick={onCreateNew}>Create new notes</button>
  </article>;
}
