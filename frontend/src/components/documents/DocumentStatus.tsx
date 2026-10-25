import { useEffect, useRef, useState } from "react";
import { DocumentRequestError, getDocument } from "../../api/documents";
import type { StudyDocument, TrackedDocument } from "../../types/document";
import type { ConversationUpload } from "../../api/conversations";

const POLL_DELAY_MS = 2000;
const MAX_FAILURES = 3;

type StatusDocument = StudyDocument | ConversationUpload;
function isTerminal(document: StatusDocument | null) {
  return document?.status === "READY" || document?.status === "FAILED";
}

type Props<T extends StatusDocument> = {
  tracked: TrackedDocument | { id: number; name: string; snapshot: T | null };
  courseId?: number; conversationId?: number; accessToken: string | null;
  onStatusChange?: (document: T) => void;
  getStatus?: (id: number, token: string, signal: AbortSignal) => Promise<T>;
};

export default function DocumentStatus<T extends StatusDocument>({ tracked, courseId, conversationId, accessToken, onStatusChange, getStatus }: Props<T>) {
  const [document, setDocument] = useState<StatusDocument | null>(tracked.snapshot);
  // Keep the latest callback available without restarting the status polling loop.
  const notify = useRef(onStatusChange);
  useEffect(() => { notify.current = onStatusChange; }, [onStatusChange]);
  const latest = useRef(tracked.snapshot);
  const [notice, setNotice] = useState("");
  const [canRefresh, setCanRefresh] = useState(!tracked.snapshot);
  const [checking, setChecking] = useState(false);
  const [refreshRequest, setRefreshRequest] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let failures = 0;

    if (!accessToken) return;
    if (isTerminal(latest.current)) return;
    // A saved-upload 503 requires an explicit status check, never another upload.
    if (!tracked.snapshot && refreshRequest === 0) return;

    const token = accessToken;

    async function poll() {
      controller = new AbortController();
      setCanRefresh(false);
      setChecking(true);
      try {
        const next = getStatus ? await getStatus(tracked.id, token, controller.signal) : await getDocument(tracked.id, token, controller.signal);
        if (cancelled) return;
        if (next.id !== tracked.id || (conversationId !== undefined ?
          !("conversation_id" in next) || next.conversation_id !== conversationId : next.course_id !== courseId)) {
          throw new Error("The returned document does not match this source.");
        }
        failures = 0;
        latest.current = next;
        setDocument(next);
        // Share the fresh status with Notes and Pandu's course-material references.
        notify.current?.(next as T);
        setNotice("");
        if (!isTerminal(next)) timer = setTimeout(poll, POLL_DELAY_MS);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof DocumentRequestError && (error.status === 401 || error.status === 403)) {
          setNotice("Your session has ended. Sign in again to check this document.");
        } else if (error instanceof DocumentRequestError && error.status === 404) {
          setNotice("This document is unavailable or you no longer have access to it.");
        } else if (error instanceof DocumentRequestError && error.status < 500) {
          setNotice(error.message);
        } else {
          failures += 1;
          if (failures >= MAX_FAILURES) {
            setNotice("Status updates paused after three connection failures. Refresh to try again; your last known status is unchanged.");
            setCanRefresh(true);
          } else {
            setNotice("Could not check the latest status. Retrying shortly; your last known status is unchanged.");
            timer = setTimeout(poll, POLL_DELAY_MS);
          }
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    timer = setTimeout(poll, refreshRequest > 0 || !latest.current ? 0 : POLL_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller?.abort();
    };
  }, [accessToken, courseId, conversationId, tracked.id, tracked.snapshot, refreshRequest, getStatus]);

  return (
    <section className="document-status" aria-label="Uploaded document">
      <h3>{document?.name ?? tracked.name}</h3>
      <div role="status" aria-live="polite">
        <p>Status: <strong>{document?.status ?? "Not yet checked"}</strong></p>
        {document?.status === "PENDING" && <p>Your document is saved and waiting to be processed.</p>}
        {document?.status === "PROCESSING" && <p>Your document is being processed.</p>}
        {document?.status === "READY" && <p>Your document is ready.</p>}
        {document?.status === "FAILED" && <p className="document-error">{document.error?.message}</p>}
        {!accessToken ? <p className="document-error">Your session has ended. Sign in again to check this document.</p> : notice && <p className="document-error">{notice}</p>}
        {checking && accessToken && <p>Checking status…</p>}
      </div>
      {canRefresh && accessToken && <button type="button" disabled={checking} onClick={() => {
        setNotice("");
        setCanRefresh(false);
        setRefreshRequest((value) => value + 1);
      }}>Refresh status</button>}
    </section>
  );
}
