import { useEffect, useId, useRef, useState } from "react";
import { StudyGuideError, generateStudyGuide } from "../../api/studyGuide";
import type { StudyGuide } from "../../types/studyGuide";

type Props = {
  documentId: number;
  documentName: string;
  accessToken: string | null;
};

// One value instead of three useStates, so a stale guide can never sit
// next to a fresh error message.
type PanelState =
  | { status: "idle" }
  | { status: "generating" }
  | { status: "ready"; guide: StudyGuide }
  | { status: "error"; message: string };

// The API layer reports what went wrong; this decides what the student reads.
function messageFor(cause: unknown): string {
  if (cause instanceof StudyGuideError) {
    if (cause.status === 401 || cause.status === 403) {
      return "Your session has ended. Sign in again to generate study notes.";
    }
    if (cause.status === 404) {
      return "This document is unavailable or you no longer have access to it.";
    }
    if (cause.status === 409 && cause.code === "DOCUMENT_HAS_NO_TEXT") {
      return "No readable text was found in this document. Image-only content is not supported yet.";
    }
    if (cause.status === 409) {
      return "This document is still being processed. Try again once it is ready.";
    }
  }
  return "Study notes could not be generated. Please try again.";
}

export default function StudyGuidePanel({ documentId, documentName, accessToken }: Props) {
  const headingId = useId();
  const [state, setState] = useState<PanelState>({ status: "idle" });
  const pending = useRef<AbortController | null>(null);

  // Abandon an in-flight request if the student navigates away mid-generation.
  useEffect(() => () => { pending.current?.abort(); }, []);

  async function handleGenerate() {
    // Generating costs money on the real model, so one request at a time.
    // The disabled button covers the common case; this covers the rest.
    if (pending.current || !accessToken) return;

    const controller = new AbortController();
    pending.current = controller;
    setState({ status: "generating" });

    try {
      const guide = await generateStudyGuide(documentId, accessToken, controller.signal);
      if (!controller.signal.aborted) setState({ status: "ready", guide });
    } catch (cause) {
      if (!controller.signal.aborted) {
        setState({ status: "error", message: messageFor(cause) });
      }
    } finally {
      if (!controller.signal.aborted) pending.current = null;
    }
  }

  const busy = state.status === "generating";

  return (
    <section className="study-guide" aria-labelledby={headingId}>
      <h3 id={headingId}>Study notes</h3>

      <button
        type="button"
        onClick={handleGenerate}
        disabled={busy || !accessToken}
        aria-busy={busy}
      >
        {busy
          ? "Generating…"
          : state.status === "ready"
            ? "Generate again"
            : "Generate study notes"}
      </button>

      {!accessToken && <p role="alert">Sign in to generate study notes.</p>}
      {busy && <p role="status">Reading {documentName} and writing your notes…</p>}
      {state.status === "error" && (
        <p className="document-error" role="alert">{state.message}</p>
      )}

      {state.status === "ready" && (
        <div className="study-guide-result">
          <h4>Key concepts</h4>
          <ul>
            {state.guide.key_concepts.map((item) => <li key={item}>{item}</li>)}
          </ul>

          <h4>Important points</h4>
          <ul>
            {state.guide.important_points.map((item) => <li key={item}>{item}</li>)}
          </ul>

          <h4>Summary</h4>
          <p>{state.guide.summary}</p>
        </div>
      )}
    </section>
  );
}
