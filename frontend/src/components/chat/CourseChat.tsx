import { useEffect, useId, useRef, useState } from "react";
import type { ChatMessage, CourseChatProps } from "../../types/chat";
import ChatThreads from "./ChatThreads";
import { microphoneError, recognitionConstructor, type SpeechRecognitionLike } from "./chatVoice";
import { reconcileSelection, selectAllReferences, selectedDocumentIds, toggleReference } from "./chatReferences";

function PanduLogo({ size }: { size: "small" | "large" }) {
  return (
    <img
      className={`pandu-avatar pandu-avatar-${size}`}
      src={`${import.meta.env.BASE_URL}images/StudyForge.png`}
      alt=""
    />
  );
}

function VoiceButtonIcon({ recording }: { recording: boolean }) {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {recording ? <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" /> : <>
      <rect x="9" y="2" width="6" height="13" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0M12 17v5m-4 0h8" />
    </>}
  </svg>;
}

type MessageActions = { onRetryMessage?: CourseChatProps["onRetryMessage"]; onReloadHistory?: CourseChatProps["onReloadHistory"]; busy?: boolean;
  voiceAvailable?: boolean; speakingId?: string | null; paused?: boolean; onPlay?: (message: ChatMessage) => void; onPause?: () => void; onStopAudio?: () => void };

export function ChatMessageView({ message, onCitation, streaming = false, onRetryMessage, onReloadHistory, busy, voiceAvailable, speakingId, paused, onPlay, onPause, onStopAudio }: { message: ChatMessage; onCitation: CourseChatProps["onCitation"]; streaming?: boolean } & MessageActions) {
  return <article className={`chat-message chat-message-${message.role}`} aria-busy={streaming || message.state === "sending"}>
    <strong>{message.role === "user" ? "You" : "Pandu"}</strong>
    <p>{message.text}{streaming && <span className="chat-streaming-cursor" aria-hidden="true" />}</p>
    {message.role === "assistant" && !!message.text && voiceAvailable && <div className="chat-audio-actions">
      <button type="button" onClick={() => onPlay?.(message)} aria-label={`${speakingId === message.id && paused ? "Resume" : "Play"} answer from Pandu`}>{speakingId === message.id && paused ? "Resume" : "Play"}</button>
      {speakingId === message.id && <>
        {!paused && <button type="button" onClick={onPause}>Pause</button>}
        <button type="button" onClick={onStopAudio}>Stop audio</button>
      </>}
    </div>}
    {message.state === "failed" && <div className="chat-message-state">
      <span>Pandu didn’t answer this question.</span>
      {onRetryMessage && message.serverId !== undefined && <button type="button" disabled={busy} onClick={() => onRetryMessage(message)}>Retry</button>}
    </div>}
    {message.state === "pending" && <div className="chat-message-state">
      <span>Pandu is still answering…</span>
      {onReloadHistory && <button type="button" onClick={onReloadHistory}>Check again</button>}
    </div>}
    {!!message.tools?.length && <details className="chat-tools">
      <summary>{message.tools.map((tool) => tool.summary).join(" · ")}</summary>
      <ul>{message.tools.flatMap((tool) => tool.details.map((detail) => <li key={`${tool.id}:${detail}`}>{detail}</li>))}</ul>
    </details>}
    {!!message.citations?.length && <ul className="chat-citations" aria-label="Sources for this answer">
      {message.citations.map((citation) => <li key={citation.id}>
        <button type="button" className="chat-citation" onClick={() => onCitation(citation)}>{citation.label}</button>
        {citation.detail && <details className="chat-citation-excerpt"><summary>Excerpt</summary><q>{citation.detail}</q></details>}
      </li>)}
    </ul>}
  </article>;
}

type UploadDeletion = Pick<CourseChatProps, "onDeleteUpload" | "deletingUploadId" | "uploadDeleteError">;

export function ReferencePicker({ references, selectedReferences, onReferencesChange, onAddDocuments, uploading, uploadProgress, uploadError, loadingReferences, referenceError, onRetryReferences, uploadStatusViews, chatReady, onDeleteUpload, deletingUploadId, uploadDeleteError }: Pick<CourseChatProps, "references" | "selectedReferences" | "onReferencesChange" | "onAddDocuments" | "uploading" | "uploadProgress" | "uploadError" | "loadingReferences" | "referenceError" | "onRetryReferences" | "uploadStatusViews" | "chatReady"> & UploadDeletion) {
  const input = useRef<HTMLInputElement>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const selected = reconcileSelection(references, selectedReferences);
  return <details className="chat-references">
    <summary>Sources · {selected.length} selected</summary>
    <div className="reference-options">
      {loadingReferences && <p role="status">Loading conversation uploads...</p>}
      {referenceError && <div role="alert">{referenceError} {onRetryReferences && <button type="button" onClick={onRetryReferences}>Retry references</button>}</div>}
      <div className="reference-actions"><button type="button" disabled={!references.some((item) => item.available)} onClick={() => onReferencesChange(selectAllReferences(references, selected))}>Select all READY</button><button type="button" disabled={!selected.length} onClick={() => onReferencesChange([])}>Clear selection</button></div>
      {(["course", "upload"] as const).map((source) => <fieldset key={source}>
        <legend>{source === "course" ? "Course Materials" : "Conversation Uploads"}</legend>
        {!references.some((item) => item.source === source) && <p>No documents yet.</p>}
        {references.filter((item) => item.source === source).map((item) => <div key={item.id} className="reference-item">
          <label>
            <input type="checkbox" disabled={!item.available || (!selected.includes(item.id) && selected.length >= 20)} checked={selected.includes(item.id)} onChange={() => onReferencesChange(toggleReference(references, selected, item.id))} />
            <span>{item.name}<small>{item.detail}{!item.available && " · Unavailable"}</small></span>
          </label>
          {source === "upload" && onDeleteUpload && (confirming === item.documentId ?
            <div role="group" aria-label={`Delete ${item.name}?`} className="reference-delete-confirm">
              <span>Delete this upload?</span>
              <button type="button" onClick={() => { setConfirming(null); onDeleteUpload(item.documentId); }}>Delete</button>
              <button type="button" autoFocus onClick={() => setConfirming(null)}>Cancel</button>
            </div> :
            <button type="button" className="reference-delete" aria-label={`Delete upload ${item.name}`}
              disabled={deletingUploadId !== null && deletingUploadId !== undefined} onClick={() => setConfirming(item.documentId)}>
              {deletingUploadId === item.documentId ? "Deleting…" : "Delete"}
            </button>)}
        </div>)}
      </fieldset>)}
      {uploadDeleteError && <p className="document-error" role="alert">{uploadDeleteError}</p>}
      {uploadStatusViews}
      <input ref={input} type="file" accept=".pdf,.docx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation" hidden aria-label="Add documents to Pandu" onChange={(event) => {
        onAddDocuments(Array.from(event.target.files ?? [])); event.target.value = "";
      }} />
      <button className="reference-upload" type="button" disabled={uploading || chatReady === false} onClick={() => input.current?.click()}>+ Add conversation upload</button>
      {uploading && <div role="status">Uploading {uploadProgress === null || uploadProgress === undefined ? "..." : `${uploadProgress}%`}<progress value={uploadProgress ?? undefined} max={100} /></div>}
      {uploadError && <p className="document-error" role="alert">{uploadError}</p>}
    </div>
  </details>;
}

export default function CourseChat(props: CourseChatProps) {
  const [draft, setDraft] = useState("");
  const [recording, setRecording] = useState(false);
  const [requestingMicrophone, setRequestingMicrophone] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);
  const [preferServer, setPreferServer] = useState(false);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const recordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingStream = useRef<MediaStream | null>(null);
  const transcription = useRef<AbortController | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const mounted = useRef(true);
  const voiceSession = useRef(0);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const canRecognize = typeof window !== "undefined" && !!recognitionConstructor();
  const canRecord = !!props.onTranscribeAudio && typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
  const canSpeak = typeof window !== "undefined" && !!window.speechSynthesis && typeof window.SpeechSynthesisUtterance === "function";
  const inputId = useId();
  const sendHintId = useId();
  const log = useRef<HTMLDivElement>(null);
  const busy = props.status === "sending" || props.status === "streaming";
  const offline = !online && !props.demo;
  const documentIds = selectedDocumentIds(props.references, props.selectedReferences);
  const lastAssistantId = [...props.messages].reverse().find((message) => message.role === "assistant")?.id;
  // With saved history, there may be no chat at all (all deleted) or one still loading.
  const noThread = !!props.threads && props.threads.activeId === null && !props.threads.loading;
  const showWelcome = !props.messages.length && !noThread && !props.historyLoading && !props.historyError;
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [props.messages, props.status]);
  useEffect(() => {
    const updateConnection = () => setOnline(navigator.onLine !== false);
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    return () => { window.removeEventListener("online", updateConnection); window.removeEventListener("offline", updateConnection); };
  }, []);
  useEffect(() => {
    if (online) return;
    voiceSession.current += 1;
    if (recognition.current) { recognition.current.onresult = null; recognition.current.onerror = null; recognition.current.onend = null; recognition.current.abort(); recognition.current = null; }
    if (recordingTimer.current) clearTimeout(recordingTimer.current);
    if (recorder.current) { recorder.current.onstop = null; if (recorder.current.state === "recording") recorder.current.stop(); recorder.current = null; }
    recordingStream.current?.getTracks().forEach((track) => track.stop()); recordingStream.current = null;
    transcription.current?.abort(); transcription.current = null;
    setRecording(false); setTranscribing(false); setRequestingMicrophone(false);
  }, [online]);
  useEffect(() => {
    if (speakingId && !props.messages.some((message) => message.id === speakingId)) stopAudio();
  // Playback belongs to the visible answer; a thread switch removes that answer.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.messages, speakingId]);
  useEffect(() => {
    mounted.current = true;
    setRecording(false); setRequestingMicrophone(false); setTranscribing(false); setVoiceError("");
    setSpeakingId(null); setPaused(false);
    return () => {
      mounted.current = false;
      voiceSession.current += 1;
      if (recognition.current) {
        recognition.current.onresult = null;
        recognition.current.onerror = null;
        recognition.current.onend = null;
        recognition.current.abort();
        recognition.current = null;
      }
      if (recordingTimer.current) clearTimeout(recordingTimer.current);
      if (recorder.current) {
        recorder.current.onstop = null;
        recorder.current.onerror = null;
        recorder.current.ondataavailable = null;
      }
      if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
      recorder.current = null;
      recordingStream.current?.getTracks().forEach((track) => track.stop());
      recordingStream.current = null;
      transcription.current?.abort();
      transcription.current = null;
      if (utterance.current) window.speechSynthesis.cancel();
      utterance.current = null;
    };
  // Voice input and playback belong to the active chat; keep the typed draft.
  }, [props.threads?.activeId]);
  async function toggleMicrophone() {
    if (offline) { setVoiceError("Connect to the internet before using voice input. You can still type your question."); return; }
    if (recognition.current) { recognition.current.stop(); return; }
    if (recorder.current) { if (recordingTimer.current) clearTimeout(recordingTimer.current); if (recorder.current.state !== "inactive") recorder.current.stop(); return; }
    if (requestingMicrophone) return;
    const session = voiceSession.current;
    const Recognition = recognitionConstructor();
    // Prefer browser recognition; use Gemini when unavailable or after a
    // browser recognition service error on an earlier attempt.
    if (!Recognition || preferServer) {
      if (!canRecord || !props.onTranscribeAudio) { setVoiceError("Voice input is not supported in this browser. You can still type your question."); return; }
      try {
        setRequestingMicrophone(true);
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!mounted.current || session !== voiceSession.current || navigator.onLine === false) {
          stream.getTracks().forEach((track) => track.stop());
          if (mounted.current && session === voiceSession.current) setRequestingMicrophone(false);
          return;
        }
        recordingStream.current = stream;
        const mime = ["audio/webm", "audio/mp4", "audio/ogg"].find((type) => MediaRecorder.isTypeSupported?.(type));
        const capture = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        const chunks: Blob[] = [];
        let failed = false;
        recorder.current = capture;
        capture.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
        capture.onerror = () => { failed = true; setVoiceError("Recording failed. You can still type your question."); if (capture.state === "recording") capture.stop(); };
        capture.onstop = () => {
          if (recordingTimer.current) clearTimeout(recordingTimer.current);
          recorder.current = null; setRecording(false);
          stream.getTracks().forEach((track) => track.stop()); recordingStream.current = null;
          if (failed) return;
          const audio = new Blob(chunks, { type: capture.mimeType || mime || "audio/webm" });
          if (!audio.size) { setVoiceError("No speech was recorded. Try again or type your question."); return; }
          if (audio.size > 5 * 1024 * 1024) { setVoiceError("The recording is too large. Try a shorter question."); return; }
          const controller = new AbortController(); transcription.current = controller; setTranscribing(true);
          void props.onTranscribeAudio!(audio, controller.signal).then((words) => {
            if (!controller.signal.aborted && words.trim()) setDraft((current) => current.trim() ? `${current.trimEnd()} ${words.trim()}` : words.trim());
          }).catch((error: unknown) => {
            if (!controller.signal.aborted) setVoiceError(error instanceof Error ? error.message : "Voice transcription failed. You can still type your question.");
          }).finally(() => { if (!controller.signal.aborted) { transcription.current = null; setTranscribing(false); } });
        };
        capture.start(); setRecording(true); setVoiceError("");
        setRequestingMicrophone(false);
        recordingTimer.current = setTimeout(() => { if (capture.state === "recording") capture.stop(); }, 60_000);
      } catch (error) {
        if (!mounted.current || session !== voiceSession.current) return;
        recorder.current = null;
        recordingStream.current?.getTracks().forEach((track) => track.stop()); recordingStream.current = null;
        setRecording(false); setRequestingMicrophone(false);
        setVoiceError(error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "PermissionDeniedError")
          ? microphoneError("not-allowed") : error instanceof DOMException && error.name === "NotFoundError"
            ? microphoneError("audio-capture") : "Microphone recording could not start. You can still type your question.");
      }
      return;
    }
    const instance = new Recognition();
    recognition.current = instance;
    instance.lang = navigator.language || "en-US";
    instance.continuous = false;
    instance.interimResults = false;
    instance.onresult = (event) => {
      const words = Array.from(event.results).slice(event.resultIndex).filter((result) => result.isFinal).map((result) => result[0].transcript.trim()).filter(Boolean).join(" ");
      if (words) setDraft((current) => current.trim() ? `${current.trimEnd()} ${words}` : words);
    };
    instance.onerror = (event) => {
      if (recognition.current === instance) recognition.current = null;
      setRecording(false);
      if (canRecord && (event.error === "network" || event.error === "service-not-allowed" || event.error === "language-not-supported")) {
        setPreferServer(true);
        setVoiceError("Browser voice recognition is unavailable. Tap Mic again to use Gemini transcription.");
      } else setVoiceError(microphoneError(event.error));
    };
    instance.onend = () => { if (recognition.current === instance) { recognition.current = null; setRecording(false); } };
    try { instance.start(); setRecording(true); setVoiceError(""); }
    catch {
      recognition.current = null; setRecording(false);
      if (canRecord) { setPreferServer(true); setVoiceError("Browser voice recognition could not start. Tap Mic again to use Gemini transcription."); }
      else setVoiceError("Voice input could not start. You can still type your question.");
    }
  }
  function stopAudio() {
    if (canSpeak) window.speechSynthesis.cancel();
    utterance.current = null; setSpeakingId(null); setPaused(false);
  }
  function playAudio(message: ChatMessage) {
    if (!canSpeak) return;
    if (speakingId === message.id && paused) { window.speechSynthesis.resume(); setPaused(false); return; }
    stopAudio();
    const next = new SpeechSynthesisUtterance(message.text);
    utterance.current = next;
    next.onend = next.onerror = () => { if (utterance.current === next) { utterance.current = null; setSpeakingId(null); setPaused(false); } };
    window.speechSynthesis.speak(next);
    setSpeakingId(message.id);
  }
  function send() {
    if (!draft.trim() || busy || !documentIds.length || props.chatReady === false || offline) return;
    props.onSend(draft.trim(), documentIds); setDraft("");
  }
  const prompts = ["Summarize selected materials", "Explain a concept", "Generate practice questions"];
  return <aside className="course-chat" aria-label="Pandu course chat" aria-busy={busy} data-course-id={props.courseId}>
    <header className="chat-header">
      <PanduLogo size="small" />
      <div><h3>Pandu</h3><p>Your study partner</p></div>
      {props.demo && <span className="chat-demo-badge">Demo</span>}
    </header>
    {props.threads && <ChatThreads {...props.threads} />}
    <div ref={log} className="chat-messages" role="log" aria-label="Messages with Pandu" aria-live="polite">
      {props.historyLoading && !props.messages.length && <p className="chat-history-status" role="status">Loading this chat…</p>}
      {props.historyError && <div className="chat-history-status" role="alert"><p>{props.historyError}</p>
        {props.onReloadHistory && <button type="button" onClick={props.onReloadHistory}>Try again</button>}</div>}
      {noThread && <div className="chat-empty">
        <PanduLogo size="large" />
        <h4>No chats yet</h4>
        <p>Start a chat to ask Pandu about your course materials.</p>
        <div className="chat-prompts"><button type="button" disabled={props.threads?.creating} onClick={props.threads?.onCreate}>Start a new chat</button></div>
      </div>}
      {showWelcome && <div className="chat-empty">
        <PanduLogo size="large" />
        <h4>Hi! I’m Pandu.</h4>
        <p>Ask me questions about your course materials.</p>
        <div className="chat-prompts" role="group" aria-label="Suggested prompts">
          {prompts.map((prompt) => <button type="button" key={prompt} disabled={busy} onClick={() => setDraft(prompt)}>{prompt}</button>)}
        </div>
        {props.demo && <small>Demo replies and citations are samples.</small>}
      </div>}
      {props.messages.map((message) => <ChatMessageView key={message.id} message={message} onCitation={props.onCitation} streaming={props.status === "streaming" && message.id === lastAssistantId}
        onRetryMessage={props.onRetryMessage} onReloadHistory={props.onReloadHistory} busy={busy || props.chatReady === false}
        voiceAvailable={canSpeak} speakingId={speakingId} paused={paused} onPlay={playAudio} onPause={() => { window.speechSynthesis.pause(); setPaused(true); }} onStopAudio={stopAudio} />)}
      {props.status === "sending" && <div className="chat-streaming-status" role="status"><p>{props.demo ? "Pandu is preparing a demo reply…" : "Sending your message to Pandu…"}</p>{props.onStop && <button type="button" onClick={props.onStop}>Stop response</button>}</div>}
      {props.status === "streaming" && <div className="chat-streaming-status" role="status"><p>Pandu is responding…</p>{props.onStop && <button type="button" onClick={props.onStop}>Stop response</button>}</div>}
      {props.status === "error" && <div role="alert"><p>{props.error || "Pandu could not send a reply."}</p>{props.onRetry && <button type="button" onClick={props.onRetry}>Retry with Pandu</button>}</div>}
    </div>
    {props.notice && <div className="chat-notice" role="alert"><p>{props.notice}</p>{props.onDismissNotice && <button type="button" onClick={props.onDismissNotice}>Dismiss</button>}</div>}
    <ReferencePicker {...props} />
    {!canRecognize && !canRecord && <p className="chat-voice-error">Voice input is not supported in this browser. You can still type your question.</p>}
    {canRecord && (!canRecognize || preferServer) && <p className="chat-voice-note">Voice recordings are sent for transcription.</p>}
    {offline && <p className="chat-voice-error" role="alert">You are offline. Connect to the internet before sending or using voice input. You can still edit your draft.</p>}
    {transcribing && <p className="chat-voice-error" role="status">Converting your recording to text…</p>}
    {!canSpeak && <p className="chat-voice-error">Read aloud is not supported in this browser.</p>}
    {voiceError && <p className="chat-voice-error" role="alert">{voiceError}</p>}
    <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); send(); }}>
      <label className="chat-composer-label" htmlFor={inputId}>Message Pandu</label>
      <textarea id={inputId} rows={1} value={draft} placeholder="Ask Pandu a question…" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); }
      }} />
      <button className="chat-voice-button" type="button" aria-label={recording ? "Stop recording" : "Start voice input"} aria-pressed={recording} onClick={() => void toggleMicrophone()} disabled={offline || (!canRecognize && !canRecord) || transcribing || requestingMicrophone} title={offline ? "Connect to the internet to use voice input" : canRecognize || canRecord ? "Speak a question" : "Voice input is not supported in this browser"}>
        <VoiceButtonIcon recording={recording} /><span>{recording ? "Stop" : requestingMicrophone ? "…" : "Speak"}</span>
      </button>
      <button className="chat-send" aria-label={props.demo ? "Send to Pandu (demo)" : "Send to Pandu"} aria-describedby={draft.trim() && !documentIds.length ? sendHintId : undefined} disabled={!draft.trim() || busy || !documentIds.length || props.chatReady === false || offline} type="submit">↑</button>
    </form>
    {!!draft.trim() && !documentIds.length && <p id={sendHintId} className="chat-send-hint" role="status">Select at least one READY source in Sources to send this question.</p>}
  </aside>;
}
