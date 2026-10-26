import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { askConversationQuestion, createCourseConversation, getConversationUpload, listConversations, listConversationUploads, uploadConversationDocument, type ConversationUpload, type QuestionCitation } from "../../api/conversations";
import { DocumentRequestError, validateDocument } from "../../api/documents";
import { useAuth } from "../../context/AuthContext";
import type { ChatCitation, ChatMessage, ChatReference, ChatStatus } from "../../types/chat";
import type { TrackedDocument } from "../../types/document";
import DocumentStatus from "../documents/DocumentStatus";
import CourseChat from "./CourseChat";
import { reconcileSelection, selectedDocumentIds } from "./chatReferences";

type SavedSession = { conversationId: number | null; messages: ChatMessage[]; selected: string[] };
const emptySession = (): SavedSession => ({ conversationId: null, messages: [], selected: [] });
function sessionKey(userId: number, courseId: number) { return `studyforge:course-chat:${userId}:${courseId}`; }
function readSession(key: string): SavedSession {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (value && typeof value === "object" && "messages" in value && "selected" in value && "conversationId" in value) {
      const state = value as SavedSession;
      if ((state.conversationId === null || Number.isSafeInteger(state.conversationId)) && Array.isArray(state.messages) && Array.isArray(state.selected)) return state;
    }
  } catch { /* Private browsing or a stale entry: start fresh. */ }
  return emptySession();
}
function saveSession(key: string, state: SavedSession) {
  try { sessionStorage.setItem(key, JSON.stringify(state)); } catch { /* Chat remains active in memory. */ }
}
function problem(cause: unknown, fallback: string) {
  if (cause instanceof DocumentRequestError) {
    if (cause.status === 404) return "This conversation is unavailable or you no longer have access to it.";
    if (cause.status === 401 || cause.status === 403) return "Your session has ended. Sign in again to continue.";
    if (cause.status === 400 && !cause.code) return "The question or selected references are invalid. Refresh references and try again.";
    return cause.message;
  }
  return fallback;
}
function citationView(item: QuestionCitation, references: ChatReference[]): ChatCitation {
  const source = references.find((reference) => reference.documentId === item.document_id);
  const name = source?.name ?? `Document ${item.document_id}`;
  const location = /\.pdf$/i.test(name) ? `Page ${item.page_number}` : /\.pptx$/i.test(name) ? `Slide ${item.page_number}` : "Source excerpt";
  return { id: `${item.chunk_id}:${item.document_id}`, label: `${name} · ${location}`, detail: item.excerpt };
}

export default function ConnectedCourseChat({ courseId, materials }: { courseId: number; materials: TrackedDocument[] }) {
  const { accessToken, user } = useAuth();
  if (!accessToken || !user) return <p role="alert">Sign in to use Course Chat.</p>;
  return <ConnectedChat key={`${user.id}:${courseId}`} courseId={courseId} materials={materials} token={accessToken} userId={user.id} />;
}

function ConnectedChat({ courseId, materials, token, userId }: { courseId: number; materials: TrackedDocument[]; token: string; userId: number }) {
  const key = sessionKey(userId, courseId);
  const [saved, setSaved] = useState(() => readSession(key));
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [uploads, setUploads] = useState<ConversationUpload[]>([]);
  const [loadingReferences, setLoadingReferences] = useState(true);
  const [referenceError, setReferenceError] = useState("");
  const [reload, setReload] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [error, setError] = useState("");
  const [citation, setCitation] = useState<ChatCitation | null>(null);
  const pendingQuestion = useRef<AbortController | null>(null);
  const pendingUpload = useRef<AbortController | null>(null);
  const lastQuestion = useRef<{ text: string; ids: number[] } | null>(null);
  const sequence = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoadingReferences(true); setReferenceError("");
    async function start() {
      try {
        const conversations = await listConversations(token, controller.signal);
        if (controller.signal.aborted) return;
        const matching = conversations.filter((item) => item.course_id === courseId);
        const chosen = matching.find((item) => item.id === (conversationId ?? saved.conversationId)) ?? matching[0] ??
          await createCourseConversation(courseId, token, controller.signal);
        if (controller.signal.aborted) return;
        if (chosen.course_id !== courseId) throw new Error("The returned conversation does not match this course.");
        setConversationId(chosen.id);
        const nextUploads = await listConversationUploads(chosen.id, token, controller.signal);
        if (controller.signal.aborted) return;
        if (nextUploads.some((item) => item.conversation_id !== chosen.id)) throw new Error("The returned uploads do not match this conversation.");
        setConversationId(chosen.id);
        setUploads(nextUploads);
        if (saved.conversationId !== chosen.id) setSaved({ conversationId: chosen.id, messages: [], selected: [] });
        setReady(true); setReferenceError("");
      } catch (cause) {
        if (!controller.signal.aborted) setReferenceError(problem(cause, "Course Chat could not be loaded. Please try again."));
      } finally { if (!controller.signal.aborted) setLoadingReferences(false); }
    }
    void start();
    return () => controller.abort();
  // Reload is only used for an explicit retry. Saved state is read for this course on mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, token, reload]);

  useEffect(() => { if (ready) saveSession(key, { ...saved, conversationId }); }, [key, ready, saved, conversationId]);
  useEffect(() => () => { pendingQuestion.current?.abort(); pendingUpload.current?.abort(); }, []);

  const references: ChatReference[] = [
    ...materials.filter((item) => item.snapshot?.course_id === courseId).map((item) => ({
      id: `course-${item.id}`, documentId: item.id, name: item.name, source: "course" as const,
      status: item.snapshot?.status ?? "PENDING", detail: item.snapshot?.status ?? "Not yet checked", available: item.snapshot?.status === "READY",
    })),
    ...uploads.map((item) => ({
      id: `upload-${item.id}`, documentId: item.id, name: item.name, source: "upload" as const,
      status: item.status, detail: item.status === "FAILED" ? `FAILED · ${item.error?.message ?? "Processing failed"}` : item.status,
      available: item.status === "READY",
    })),
  ];
  const selected = reconcileSelection(references, saved.selected);
  const getStatus = useCallback((documentId: number, access: string, signal: AbortSignal) => getConversationUpload(conversationId!, documentId, access, signal), [conversationId]);
  const statusViews = useMemo(() => conversationId && uploads.filter((item) => item.status !== "READY" && item.status !== "FAILED").map((item) =>
    <DocumentStatus key={`${conversationId}:${item.id}`} tracked={{ id: item.id, name: item.name, snapshot: item }} conversationId={conversationId} accessToken={token}
      getStatus={getStatus} onStatusChange={(next) => setUploads((current) => current.map((upload) => upload.id === next.id ? next : upload))} />
  ), [conversationId, uploads, token, getStatus]);

  async function addDocuments(files: File[]) {
    const file = files[0];
    const validation = validateDocument(file ?? null);
    if (validation) { setUploadError(validation); return; }
    if (!file || !conversationId || !ready || pendingUpload.current) return;
    const controller = new AbortController(); pendingUpload.current = controller;
    setUploading(true); setUploadProgress(0); setUploadError("");
    try {
      const next = await uploadConversationDocument(conversationId, file, token, controller.signal, setUploadProgress);
      if (controller.signal.aborted) return;
      if (next.conversation_id !== conversationId) throw new Error("Upload was saved to a different conversation.");
      setUploads((current) => [next, ...current.filter((item) => item.id !== next.id)]);
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof DocumentRequestError && cause.status === 503 && cause.documentId) {
        try {
          const next = await getConversationUpload(conversationId, cause.documentId, token, controller.signal);
          if (!controller.signal.aborted) setUploads((current) => [next, ...current.filter((item) => item.id !== next.id)]);
        } catch { /* The list retry can recover an upload whose handoff was unconfirmed. */ }
      }
      setUploadError(problem(cause, "The upload could not be confirmed. Check this conversation before uploading again."));
    } finally { if (!controller.signal.aborted) { pendingUpload.current = null; setUploading(false); } }
  }

  async function ask(text: string, ids: number[], append = true) {
    if (pendingQuestion.current || !conversationId || !text.trim() || !ids.length || ids.length > 20) return;
    const eligible = selectedDocumentIds(references, selected);
    if (ids.some((id) => !eligible.includes(id))) return;
    const controller = new AbortController(); pendingQuestion.current = controller;
    lastQuestion.current = { text, ids };
    if (append) setSaved((current) => ({ ...current, messages: [...current.messages, { id: `user-${++sequence.current}`, role: "user", text }] }));
    setStatus("sending"); setError("");
    try {
      const answer = await askConversationQuestion(conversationId, text, ids, token, controller.signal);
      if (controller.signal.aborted) return;
      const message: ChatMessage = answer.status === "ANSWERED" ? {
        id: `assistant-${++sequence.current}`, role: "assistant", text: answer.answer,
        citations: answer.citations.map((item) => citationView(item, references)),
      } : { id: `assistant-${++sequence.current}`, role: "assistant", text: "I couldn’t find enough information in the selected references to answer that question." };
      setSaved((current) => ({ ...current, messages: [...current.messages, message] }));
      setStatus("idle");
    } catch (cause) {
      if (!controller.signal.aborted) { setError(problem(cause, "Pandu could not answer right now. Please try again.")); setStatus("error"); }
    } finally { if (!controller.signal.aborted) pendingQuestion.current = null; }
  }

  return <div className="demo-chat-container">
    <CourseChat courseId={courseId} chatReady={ready && !!conversationId} messages={saved.messages} references={references} selectedReferences={selected} status={status} error={error}
      loadingReferences={loadingReferences} referenceError={referenceError} onRetryReferences={() => setReload((value) => value + 1)}
      uploading={uploading} uploadProgress={uploadProgress} uploadError={uploadError} uploadStatusViews={statusViews}
      onReferencesChange={(ids) => setSaved((current) => ({ ...current, selected: reconcileSelection(references, ids) }))}
      onAddDocuments={(files) => void addDocuments(files)} onSend={(text, ids) => void ask(text, ids)}
      onRetry={() => { if (lastQuestion.current) void ask(lastQuestion.current.text, lastQuestion.current.ids, false); }}
      onStop={() => { pendingQuestion.current?.abort(); pendingQuestion.current = null; setStatus("idle"); }} onCitation={setCitation} />
    {citation && <div className="chat-detail" role="region" aria-label="Citation details"><strong>{citation.label}</strong><p>{citation.detail}</p><button type="button" autoFocus onClick={() => setCitation(null)}>Close citation</button></div>}
  </div>;
}
