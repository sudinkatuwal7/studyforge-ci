import { useEffect, useId, useRef, useState, type DragEvent, type SubmitEvent } from "react";
import { DocumentRequestError, uploadDocument, validateDocument } from "../../api/documents";
import { useAuth } from "../../context/AuthContext";
import type { TrackedDocument } from "../../types/document";
import DocumentStatus from "./DocumentStatus";
import "./documents.css";
import StudyGuidePanel from "../notes/StudyGuidePanel";

type Props = { courseId: number; onDocumentSaved?: (document: TrackedDocument) => void };

export default function DocumentUpload({ courseId, onDocumentSaved }: Props) {
  const { accessToken, user } = useAuth();
  if (!Number.isSafeInteger(courseId) || courseId <= 0) return <p role="alert">Choose a course before uploading a document.</p>;
  if (!user) return <p role="alert">Sign in to upload a document.</p>;

  // Changing course or account discards stale UI and cancels its outstanding requests.
  return <UploadForm key={`${user.id}:${courseId}`} courseId={courseId} accessToken={accessToken} onDocumentSaved={onDocumentSaved} />;
}

function UploadForm({ courseId, accessToken, onDocumentSaved }: Props & { accessToken: string | null }) {
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [rejectedToken, setRejectedToken] = useState<string | null>(null);
  const authFailed = !!accessToken && rejectedToken === accessToken;
  const [tracked, setTracked] = useState<TrackedDocument | null>(null);
  const upload = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => () => { upload.current?.abort(); }, []);

  const locked = submitting || !!tracked || !accessToken || authFailed;

  function chooseFile(selected: File | null) {
    setFile(selected);
    setError(selected ? validateDocument(selected) ?? "" : "");
  }

  function dropFile(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (locked) return;
    const dropped = event.dataTransfer.files;
    if (dropped.length > 1) {
      setFile(null);
      setError("Drop one PDF, DOCX, or PPTX file at a time.");
      return;
    }
    chooseFile(dropped[0] ?? null);
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (upload.current || tracked) return;
    const validation = validateDocument(file);
    if (validation) { setError(validation); return; }
    if (!file || !accessToken || authFailed) { setError("Sign in again to upload a document."); return; }

    const controller = new AbortController();
    upload.current = controller;
    setError("");
    setSubmitting(true);
    try {
      const document = await uploadDocument(courseId, file, accessToken, controller.signal);
      if (controller.signal.aborted) return;
      if (document.course_id !== courseId) throw new Error("Unexpected course in upload response.");
      setTracked({ id: document.id, name: document.name, snapshot: document });
      onDocumentSaved?.({ id: document.id, name: document.name, snapshot: document, sizeBytes: file.size });
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof DocumentRequestError) {
        if (cause.status === 401 || cause.status === 403) {
          setRejectedToken(accessToken);
          setError("Your session has ended. Sign in again to upload a document.");
        } else if (cause.status === 404) {
          setError("This course is unavailable or you no longer have access to it.");
        } else if (cause.status === 503 && cause.documentId) {
          setError(cause.message);
          setTracked({ id: cause.documentId, name: file.name, snapshot: null });
          onDocumentSaved?.({ id: cause.documentId, name: file.name, snapshot: null, sizeBytes: file.size });
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
      <form onSubmit={handleSubmit} aria-busy={submitting}>
        <div
          className={dragging ? "document-drop document-drop-active" : "document-drop"}
          onDragEnter={(event) => { event.preventDefault(); if (!locked) setDragging(true); }}
          onDragOver={(event) => { event.preventDefault(); if (!locked) setDragging(true); }}
          onDragLeave={(event) => {
            event.preventDefault();
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
          }}
          onDrop={dropFile}
        >
          <button type="button" className="document-add-link" aria-expanded={linkOpen} disabled={locked} onClick={() => setLinkOpen((open) => !open)}>Add from link</button>
          <CloudUploadIcon />
          <h2 id={`${inputId}-heading`}>Upload course materials</h2>
          <p id={`${inputId}-hint`} className="document-upload-hint">Supported file types (PDF, DOCX, PPTX up to 20 MiB)</p>
          <button type="button" className="document-choose" disabled={locked} onClick={() => fileInput.current?.click()}>Choose files</button>
          <input ref={fileInput} id={inputId} className="document-file-input" type="file" tabIndex={-1} aria-label="Document file" accept=".pdf,.docx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation" disabled={locked}
            aria-describedby={`${inputId}-hint${error ? ` ${inputId}-error` : ""}`}
            onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} />
          {linkOpen && <label className="document-link-field" htmlFor={`${inputId}-link`}>Material link
            <input id={`${inputId}-link`} type="url" inputMode="url" value={link} placeholder="https://" disabled={locked} onChange={(event) => setLink(event.target.value)} />
          </label>}
          {file && <p>Selected: {file.name}</p>}
          <button type="submit" className="document-submit" disabled={locked}>{submitting ? "Uploading…" : "Upload document"}</button>
        </div>
      </form>
      {error && <p id={`${inputId}-error`} className="document-error" role="alert">{error}</p>}
      {tracked && <>
        {!onDocumentSaved && <>
          <DocumentStatus key={tracked.id} tracked={tracked} courseId={courseId} accessToken={accessToken} />
          <StudyGuidePanel documentId={tracked.id} documentName={tracked.name} accessToken={accessToken} />
        </>}
        <button type="button" onClick={() => {
          setTracked(null);
          setFile(null);
          setError("");
          // The file input is uncontrolled; clear it when beginning a separate upload.
          if (fileInput.current) fileInput.current.value = "";
        }} className="document-another">Upload another document</button>
      </>}
    </section>
  );
}

function CloudUploadIcon() {
  return (
    <svg className="document-cloud" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" d="M16.5 33h-2a8.5 8.5 0 1 1 1.7-16.8A10 10 0 0 1 34.6 22H36a7 7 0 0 1 .8 14" />
      <path fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" d="M24 20v14M18.5 25.5 24 20l5.5 5.5" />
    </svg>
  );
}
