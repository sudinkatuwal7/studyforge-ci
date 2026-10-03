import { useEffect, useId, useRef, useState, type SubmitEvent } from "react";
import { DocumentRequestError, uploadDocument, validatePdf } from "../../api/documents";
import { useAuth } from "../../context/AuthContext";
import type { TrackedDocument } from "../../types/document";
import DocumentStatus from "./DocumentStatus";
import "./documents.css";

type Props = { courseId: number };

export default function DocumentUpload({ courseId }: Props) {
  const { accessToken, user } = useAuth();
  if (!Number.isSafeInteger(courseId) || courseId <= 0) return <p role="alert">Choose a course before uploading a PDF.</p>;
  if (!user) return <p role="alert">Sign in to upload a PDF.</p>;

  // Changing course or account discards stale UI and cancels its outstanding requests.
  return <UploadForm key={`${user.id}:${courseId}`} courseId={courseId} accessToken={accessToken} />;
}

function UploadForm({ courseId, accessToken }: Props & { accessToken: string | null }) {
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [rejectedToken, setRejectedToken] = useState<string | null>(null);
  const authFailed = !!accessToken && rejectedToken === accessToken;
  const [tracked, setTracked] = useState<TrackedDocument | null>(null);
  const upload = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => () => { upload.current?.abort(); }, []);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (upload.current || tracked) return;
    const validation = validatePdf(file);
    if (validation) { setError(validation); return; }
    if (!file || !accessToken || authFailed) { setError("Sign in again to upload a PDF."); return; }

    const controller = new AbortController();
    upload.current = controller;
    setError("");
    setSubmitting(true);
    try {
      const document = await uploadDocument(courseId, file, accessToken, controller.signal);
      if (controller.signal.aborted) return;
      if (document.course_id !== courseId) throw new Error("Unexpected course in upload response.");
      setTracked({ id: document.id, name: document.name, snapshot: document });
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof DocumentRequestError) {
        if (cause.status === 401 || cause.status === 403) {
          setRejectedToken(accessToken);
          setError("Your session has ended. Sign in again to upload a PDF.");
        } else if (cause.status === 404) {
          setError("This course is unavailable or you no longer have access to it.");
        } else if (cause.status === 503 && cause.documentId) {
          setError(cause.message);
          setTracked({ id: cause.documentId, name: file.name, snapshot: null });
        } else if (cause.status >= 500 && cause.code !== "UPLOAD_UNAVAILABLE") {
          setError("The upload could not be confirmed. It may already have been saved. Check your course before uploading this file again.");
        } else {
          setError(cause.message);
        }
      } else {
        setError("The upload could not be confirmed. It may already have been saved. Check your course before uploading this file again.");
      }
    } finally {
      if (!controller.signal.aborted) {
        upload.current = null;
        setSubmitting(false);
      }
    }
  }

  return (
    <section className="document-upload" aria-labelledby={`${inputId}-heading`}>
      <h2 id={`${inputId}-heading`}>Upload a PDF</h2>
      <form onSubmit={handleSubmit} aria-busy={submitting}>
        <label htmlFor={inputId}>PDF file</label>
        <input ref={fileInput} id={inputId} type="file" accept=".pdf,application/pdf" disabled={submitting || !!tracked || !accessToken || authFailed}
          aria-describedby={`${inputId}-hint${error ? ` ${inputId}-error` : ""}`}
          onChange={(event) => {
            const selected = event.target.files?.[0] ?? null;
            setFile(selected);
            setError(selected ? validatePdf(selected) ?? "" : "");
          }} />
        <p id={`${inputId}-hint`}>One PDF, up to 20 MiB. Encrypted PDFs are not supported. The server checks the file before saving it.</p>
        {file && <p>Selected: {file.name}</p>}
        <button type="submit" disabled={submitting || !!tracked || !accessToken || authFailed}>{submitting ? "Uploading…" : "Upload PDF"}</button>
      </form>
      {error && <p id={`${inputId}-error`} className="document-error" role="alert">{error}</p>}
      {tracked && <>
        <DocumentStatus key={tracked.id} tracked={tracked} courseId={courseId} accessToken={accessToken} />
        <button type="button" onClick={() => {
          setTracked(null);
          setFile(null);
          setError("");
          // The file input is uncontrolled; clear it when beginning a separate upload.
          if (fileInput.current) fileInput.current.value = "";
        }}>Upload another PDF</button>
      </>}
    </section>
  );
}
