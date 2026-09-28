import { useState } from "react";

import { generateStudyGuide, StudyGuideError } from "../../api/studyGuide";
import type { StudyGuide } from "../../types/studyGuide";

type Props = {
  documentId: number;
  /** Document status from the documents API: PENDING, PROCESSING, READY, FAILED. */
  documentStatus: string;
  accessToken: string;
};

export function StudyGuidePanel({
  documentId,
  documentStatus,
  accessToken,
}: Props) {
  const [guide, setGuide] = useState<StudyGuide | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReady = documentStatus === "READY";

  async function handleGenerate() {
    // Guard as well as disable: a disabled button is a UI convenience,
    // not a guarantee. Generation costs money, so double-submits matter.
    if (isLoading || !isReady) return;

    setIsLoading(true);
    setError(null);

    try {
      setGuide(await generateStudyGuide(documentId, accessToken));
    } catch (err) {
      setError(
        err instanceof StudyGuideError
          ? err.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="study-guide">
      <button
        type="button"
        onClick={handleGenerate}
        disabled={!isReady || isLoading}
      >
        {isLoading ? "Generating…" : guide ? "Regenerate notes" : "Generate notes"}
      </button>

      {!isReady && (
        <p className="study-guide__hint">
          Notes become available once this document has finished processing.
        </p>
      )}

      {error && (
        <p className="study-guide__error" role="alert">
          {error}
        </p>
      )}

      {guide && (
        <div className="study-guide__result">
          <h3>Key concepts</h3>
          <ul>
            {guide.key_concepts.map((concept) => (
              <li key={concept}>{concept}</li>
            ))}
          </ul>

          <h3>Important points</h3>
          <ul>
            {guide.important_points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>

          <h3>Summary</h3>
          <p>{guide.summary}</p>
        </div>
      )}
    </section>
  );
}