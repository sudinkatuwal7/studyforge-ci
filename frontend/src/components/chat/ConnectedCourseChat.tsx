import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  QuestionRequestError, askConversationQuestion, createCourseConversation, deleteConversation, deleteConversationUpload,
  getConversationUpload, listConversationMessages, listConversationUploads, listConversations, retryConversationQuestion,
  uploadConversationDocument, type Conversation, type ConversationUpload, type QuestionResult,
} from "../../api/conversations";
import { DocumentRequestError, validateDocument } from "../../api/documents";
import { fetchSourceFile } from "../../api/sourceFiles";
import { useAuth } from "../../context/AuthContext";
import type { ChatCitation, ChatMessage, ChatReference, ChatStatus, CitationSource } from "../../types/chat";
import type { TrackedDocument } from "../../types/document";
import DocumentStatus from "../documents/DocumentStatus";
import CourseChat from "./CourseChat";
import { replaceMessage, toChatMessage } from "./chatHistory";
import { reconcileSelection, selectedDocumentIds } from "./chatReferences";

// Only the active chat and the selected sources are kept in the browser; messages
// always come from the backend, so a refresh shows exactly what was saved.
type SavedSession = { conversationId: number | null; selected: string[] };
const emptySession = (): SavedSession => ({ conversationId: null, selected: [] });
function sessionKey(userId: number, courseId: number) { return `studyforge:course-chat:${userId}:${courseId}`; }
function readSession(key: string): SavedSession {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (value && typeof value === "object" && "selected" in value && "conversationId" in value) {
      const { conversationId, selected } = value as SavedSession;
      if ((conversationId === null || Number.isSafeInteger(conversationId)) && Array.isArray(selected) &&
        selected.every((item) => typeof item === "string")) return { conversationId, selected };
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
function sourceProblem(cause: unknown) {
  if (cause instanceof DocumentRequestError && cause.status === 404) return "This source is no longer available.";
  if (cause instanceof DocumentRequestError && (cause.status === 401 || cause.status === 403)) return "Your session has ended. Sign in again to open sources.";
  return "The source could not be opened. Please try again.";
}
function fileName(source: CitationSource) {
  const name = source.name ?? "source";
  const suffix = source.format ? `.${source.format}` : "";
  return name.toLowerCase().endsWith(suffix) ? name : name + suffix;
}
const OBJECT_URL_LIFETIME = 60_000;

export default function ConnectedCourseChat({ courseId, materials }: { courseId: number; materials: TrackedDocument[] }) {
  const { accessToken, user } = useAuth();
  if (!accessToken || !user) return <p role="alert">Sign in to use Course Chat.</p>;
  return <ConnectedChat key={`${user.id}:${courseId}`} courseId={courseId} materials={materials} token={accessToken} userId={user.id} />;
}

function ConnectedChat({ courseId, materials, token, userId }: { courseId: number; materials: TrackedDocument[]; token: string; userId: number }) {
  const key = sessionKey(userId, courseId);
  const [session, setSession] = useState(() => readSession(key));
  // Threads
  const [threads, setThreadsState] = useState<Conversation[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [threadsError, setThreadsError] = useState("");
  const [threadsRequest, setThreadsRequest] = useState(0);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  // Active thread
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyRequest, setHistoryRequest] = useState(0);
  const [uploads, setUploads] = useState<ConversationUpload[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [deletingUploadId, setDeletingUploadId] = useState<number | null>(null);
  const [uploadDeleteError, setUploadDeleteError] = useState("");
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // Mirrors read inside async work, where state captured at call time may be stale.
  const activeRef = useRef<number | null>(null);
  const threadsRef = useRef<Conversation[]>([]);
  const pendingQuestion = useRef<AbortController | null>(null);
  const pendingUpload = useRef<AbortController | null>(null);
  const lifetime = useRef(new AbortController());
  const sequence = useRef(0);
  const refreshRun = useRef(0);
  // Loads read the latest token but do not depend on it: an access-token refresh must
  // not reload the thread list or history (that would disturb a question in flight).
  const tokenRef = useRef(token);
  useEffect(() => { tokenRef.current = token; }, [token]);

  function setThreads(next: Conversation[]) { threadsRef.current = next; setThreadsState(next); }
  const reloadHistory = useCallback(() => setHistoryRequest((value) => value + 1), []);

  // Leaving a thread cancels its in-flight question and upload in the browser. The
  // server still finishes and saves the answer, so it appears when the thread is reopened.
  function cancelPending() {
    pendingQuestion.current?.abort(); pendingQuestion.current = null;
    pendingUpload.current?.abort(); pendingUpload.current = null;
    setUploading(false); setUploadProgress(null);
  }
  function selectThread(id: number | null) {
    if (id === activeRef.current) return;
    cancelPending();
    activeRef.current = id;
    setActiveId(id);
    setMessages([]); setUploads([]); setHistoryError("");
    setStatus("idle"); setError(""); setNotice(""); setUploadError(""); setUploadDeleteError("");
    setSession((current) => ({ ...current, conversationId: id }));
  }

  // Load this course's chats; restore the saved one, else the most recent, else start one.
  useEffect(() => {
    const controller = new AbortController();
    setThreadsLoading(true); setThreadsError("");
    async function load() {
      try {
        const all = await listConversations(tokenRef.current, controller.signal);
        if (controller.signal.aborted) return;
        let list = all.filter((item) => item.course_id === courseId);
        if (!list.length) list = [await createCourseConversation(courseId, tokenRef.current, controller.signal)];
        if (controller.signal.aborted) return;
        if (list.some((item) => item.course_id !== courseId)) throw new Error("The returned conversation does not match this course.");
        setThreads(list);
        const saved = activeRef.current ?? readSession(key).conversationId;
        selectThread((list.find((item) => item.id === saved) ?? list[0]).id);
      } catch (cause) {
        if (!controller.signal.aborted) setThreadsError(problem(cause, "Your chats could not be loaded. Please try again."));
      } finally { if (!controller.signal.aborted) setThreadsLoading(false); }
    }
    void load();
    return () => controller.abort();
  // selectThread and key are stable for this mounted course; reload only on request.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, threadsRequest]);

  // Load the active thread's saved messages and uploads. A newer load (another thread,
  // or a reload) aborts this one, so a slow response can never show in the wrong thread.
  useEffect(() => {
    if (activeId === null) { setHistoryLoading(false); return; }
    const controller = new AbortController();
    setHistoryLoading(true); setHistoryError("");
    async function load(id: number) {
      try {
        const [saved, nextUploads] = await Promise.all([
          listConversationMessages(id, tokenRef.current, controller.signal), listConversationUploads(id, tokenRef.current, controller.signal),
        ]);
        if (controller.signal.aborted || activeRef.current !== id) return;
        if (nextUploads.some((item) => item.conversation_id !== id)) throw new Error("The returned uploads do not match this conversation.");
        setMessages(saved.map(toChatMessage));
        setUploads(nextUploads);
      } catch (cause) {
        if (!controller.signal.aborted) setHistoryError(problem(cause, "This chat could not be loaded. Please try again."));
      } finally { if (!controller.signal.aborted) setHistoryLoading(false); }
    }
    void load(activeId);
    return () => controller.abort();
  }, [activeId, historyRequest]);

  useEffect(() => { if (!threadsLoading) saveSession(key, session); }, [key, session, threadsLoading]);
  // Created in the effect (not only in useRef) so a StrictMode remount gets a live controller.
  useEffect(() => {
    lifetime.current = new AbortController();
    return () => { cancelPending(); lifetime.current.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After a question settles, re-read the list: the server may have named the thread
  // from its first question and moved it to the top. The active thread is unchanged.
  async function refreshThreads() {
    const run = ++refreshRun.current;
    const shownBefore = new Set(threadsRef.current.map((item) => item.id));
    try {
      // The latest token: an answer can outlast the token it was sent with.
      const all = await listConversations(tokenRef.current, lifetime.current.signal);
      // A newer refresh started meanwhile; its response is the one to keep.
      if (run !== refreshRun.current) return;
      const shownNow = threadsRef.current;
      const shownIds = new Set(shownNow.map((item) => item.id));
      // Server titles and order for chats still shown. A chat deleted meanwhile, here or
      // in another tab, is left out.
      const fresh = all.filter((item) => item.course_id === courseId && shownIds.has(item.id));
      const freshIds = new Set(fresh.map((item) => item.id));
      // A chat created after the server answered is not in its list yet: keep it.
      const createdMeanwhile = shownNow.filter((item) => !shownBefore.has(item.id) && !freshIds.has(item.id));
      setThreads([...createdMeanwhile, ...fresh]);
    } catch { /* The list keeps its current titles; nothing else depends on them. */ }
  }

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
  const selected = reconcileSelection(references, session.selected);
  const getStatus = useCallback((documentId: number, access: string, signal: AbortSignal) => getConversationUpload(activeId!, documentId, access, signal), [activeId]);
  const statusViews = useMemo(() => activeId && uploads.filter((item) => item.status !== "READY" && item.status !== "FAILED").map((item) =>
    <DocumentStatus key={`${activeId}:${item.id}`} tracked={{ id: item.id, name: item.name, snapshot: item }} conversationId={activeId} accessToken={token}
      getStatus={getStatus} onStatusChange={(next) => setUploads((current) => current.map((upload) => upload.id === next.id ? next : upload))} />
  ), [activeId, uploads, token, getStatus]);

  async function addDocuments(files: File[]) {
    const file = files[0];
    const validation = validateDocument(file ?? null);
    if (validation) { setUploadError(validation); return; }
    const conversation = activeRef.current;
    if (!file || !conversation || pendingUpload.current) return;
    const controller = new AbortController(); pendingUpload.current = controller;
    setUploading(true); setUploadProgress(0); setUploadError("");
    try {
      const next = await uploadConversationDocument(conversation, file, token, controller.signal, setUploadProgress);
      if (controller.signal.aborted) return;
      if (next.conversation_id !== conversation) throw new Error("Upload was saved to a different conversation.");
      setUploads((current) => [next, ...current.filter((item) => item.id !== next.id)]);
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof DocumentRequestError && cause.status === 503 && cause.documentId) {
        try {
          const next = await getConversationUpload(conversation, cause.documentId, token, controller.signal);
          if (!controller.signal.aborted) setUploads((current) => [next, ...current.filter((item) => item.id !== next.id)]);
        } catch { /* The list retry can recover an upload whose handoff was unconfirmed. */ }
      }
      setUploadError(problem(cause, "The upload could not be confirmed. Check this conversation before uploading again."));
    } finally { if (!controller.signal.aborted) { pendingUpload.current = null; setUploading(false); } }
  }

  // Shared by new questions and retries. `bubble` is the message being answered.
  async function answer(bubble: (message: ChatMessage) => boolean, run: (conversation: number, signal: AbortSignal) => Promise<QuestionResult>) {
    const conversation = activeRef.current;
    if (!conversation) return;
    const controller = new AbortController(); pendingQuestion.current = controller;
    setStatus("sending"); setError("");
    try {
      const result = await run(conversation, controller.signal);
      // Aborted (thread switched, deleted or stopped) or no longer the active thread:
      // never write this reply into whatever thread is showing now.
      if (controller.signal.aborted || activeRef.current !== conversation) return;
      setMessages((current) => replaceMessage(current, bubble, [result.question, result.reply]));
      setStatus("idle");
      void refreshThreads();
    } catch (cause) {
      if (controller.signal.aborted || activeRef.current !== conversation) return;
      setError(problem(cause, "Pandu could not answer right now. Please try again."));
      setStatus("error");
      if (cause instanceof QuestionRequestError && cause.question) {
        const question = cause.question;
        setMessages((current) => replaceMessage(current, bubble, [question]));
        void refreshThreads();
      } else {
        // Unknown outcome (network, 404, 409): the saved history is the truth.
        setMessages((current) => current.map((item) => bubble(item) ? { ...item, state: "failed" } : item));
        reloadHistory();
      }
    } finally { if (pendingQuestion.current === controller) pendingQuestion.current = null; }
  }

  function ask(text: string, ids: number[]) {
    if (pendingQuestion.current || !activeRef.current || !text.trim() || !ids.length || ids.length > 20) return;
    const eligible = selectedDocumentIds(references, selected);
    if (ids.some((id) => !eligible.includes(id))) return;
    const localId = `local-${++sequence.current}`;
    setMessages((current) => [...current, { id: localId, role: "user", text, state: "sending" }]);
    void answer((item) => item.id === localId, (conversation, signal) => askConversationQuestion(conversation, text, ids, token, signal));
  }

  function retry(message: ChatMessage) {
    const messageId = message.serverId;
    if (pendingQuestion.current || !activeRef.current || messageId === undefined) return;
    const ids = selectedDocumentIds(references, selected);
    if (!ids.length) { setError("Select at least one source, then retry."); setStatus("error"); return; }
    const isQuestion = (item: ChatMessage) => item.role === "user" && item.serverId === messageId;
    setMessages((current) => current.map((item) => isQuestion(item) ? { ...item, state: "sending" } : item));
    void answer(isQuestion, (conversation, signal) => retryConversationQuestion(conversation, messageId, ids, token, signal));
  }

  function stop() {
    if (!pendingQuestion.current) return;
    pendingQuestion.current.abort(); pendingQuestion.current = null;
    setStatus("idle");
    reloadHistory();
  }

  async function createThread() {
    if (creating) return;
    setCreating(true); setThreadsError("");
    try {
      const created = await createCourseConversation(courseId, token, lifetime.current.signal);
      if (created.course_id !== courseId) throw new Error("The returned conversation does not match this course.");
      setThreads([created, ...threadsRef.current.filter((item) => item.id !== created.id)]);
      selectThread(created.id);
    } catch (cause) {
      if (!lifetime.current.signal.aborted) setThreadsError(problem(cause, "A new chat could not be started. Please try again."));
    } finally { if (!lifetime.current.signal.aborted) setCreating(false); }
  }

  async function deleteThread(id: number) {
    if (deletingId !== null) return;
    const wasActive = activeRef.current === id;
    // Cancel this thread's in-flight question first, so its reply cannot appear later.
    if (wasActive && pendingQuestion.current) { cancelPending(); setStatus("idle"); }
    setDeletingId(id); setThreadsError("");
    let removed = false;
    try {
      await deleteConversation(id, token, lifetime.current.signal);
      removed = true;
    } catch (cause) {
      if (lifetime.current.signal.aborted) return;
      // 404: it is already gone (or no longer the student's), so it must leave the list.
      if (cause instanceof DocumentRequestError && cause.status === 404) removed = true;
      else {
        setThreadsError(problem(cause, "This chat could not be deleted. Please try again."));
        if (wasActive && activeRef.current === id) reloadHistory();
      }
    } finally { if (!lifetime.current.signal.aborted) setDeletingId(null); }
    if (!removed) return;
    const remaining = threadsRef.current.filter((item) => item.id !== id);
    setThreads(remaining);
    if (activeRef.current === id) selectThread(remaining[0]?.id ?? null);
  }

  async function deleteUpload(documentId: number) {
    const conversation = activeRef.current;
    if (!conversation || deletingUploadId !== null) return;
    setDeletingUploadId(documentId); setUploadDeleteError("");
    let removed = false;
    try {
      await deleteConversationUpload(conversation, documentId, token, lifetime.current.signal);
      removed = true;
    } catch (cause) {
      if (lifetime.current.signal.aborted) return;
      if (cause instanceof DocumentRequestError && cause.status === 404) removed = true;
      else if (activeRef.current === conversation) setUploadDeleteError(problem(cause, "The upload could not be deleted. Please try again."));
    } finally { if (!lifetime.current.signal.aborted) setDeletingUploadId(null); }
    if (!removed || activeRef.current !== conversation) return;
    setUploads((current) => current.filter((item) => item.id !== documentId));
    setSession((current) => ({ ...current, selected: current.selected.filter((item) => item !== `upload-${documentId}`) }));
  }

  // PDFs open in a new tab at the cited page; DOCX and PPTX download.
  async function openCitation(citation: ChatCitation) {
    const source = citation.source;
    setNotice("");
    if (!source) return;
    if (!source.available) { setNotice("This source is no longer available."); return; }
    // The tab must be opened during the click: after an await, browsers block it as a pop-up.
    const tab = source.format === "pdf" ? window.open("", "_blank") : null;
    if (source.format === "pdf" && !tab) { setNotice("Your browser blocked the new tab. Allow pop-ups for StudyForge to open sources."); return; }
    if (tab) tab.opener = null;
    try {
      const blob = await fetchSourceFile(source.documentId, token, lifetime.current.signal);
      const url = URL.createObjectURL(blob);
      // Revoked later, not at once: the new tab or download still needs the URL.
      setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_LIFETIME);
      if (tab) { tab.location.href = `${url}#page=${source.page}`; return; }
      const link = document.createElement("a");
      link.href = url; link.download = fileName(source); link.hidden = true;
      document.body.append(link); link.click(); link.remove();
    } catch (cause) {
      tab?.close();
      if (!lifetime.current.signal.aborted) setNotice(sourceProblem(cause));
    }
  }

  const deletingActive = deletingId !== null && deletingId === activeId;
  return <div className="demo-chat-container">
    <CourseChat courseId={courseId} chatReady={activeId !== null && !historyLoading && !historyError && !deletingActive}
      messages={messages} references={references} selectedReferences={selected} status={status} error={error}
      loadingReferences={historyLoading} referenceError="" uploading={uploading} uploadProgress={uploadProgress} uploadError={uploadError} uploadStatusViews={statusViews}
      onReferencesChange={(ids) => setSession((current) => ({ ...current, selected: reconcileSelection(references, ids) }))}
      onAddDocuments={(files) => void addDocuments(files)} onSend={ask} onStop={stop} onCitation={(citation) => void openCitation(citation)}
      onRetryMessage={retry} historyLoading={historyLoading} historyError={historyError} onReloadHistory={reloadHistory}
      onDeleteUpload={(documentId) => void deleteUpload(documentId)} deletingUploadId={deletingUploadId} uploadDeleteError={uploadDeleteError}
      notice={notice} onDismissNotice={() => setNotice("")}
      threads={{
        items: threads.map((item) => ({ id: item.id, title: item.title, updatedAt: item.updated_at })),
        activeId, loading: threadsLoading, error: threadsError, creating, deletingId,
        onSelect: selectThread, onCreate: () => void createThread(), onDelete: (id) => void deleteThread(id),
        onRetry: threads.length ? undefined : () => setThreadsRequest((value) => value + 1),
      }} />
  </div>;
}
