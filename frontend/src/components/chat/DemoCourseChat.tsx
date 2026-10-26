import { useEffect, useRef, useState } from "react";
import type { TrackedDocument } from "../../types/document";
import type { ChatCitation, ChatMessage, ChatReference } from "../../types/chat";
import CourseChat from "./CourseChat";

export default function DemoCourseChat({ courseId, materials }: { courseId: number; materials: TrackedDocument[] }) {
  // This adapter is intentionally local and can be replaced by SCRUM-75 integration.
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [uploads, setUploads] = useState<ChatReference[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [citation, setCitation] = useState<ChatCitation | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const request = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  // Cancel pending work when the student switches courses or leaves the workspace.
  useEffect(() => () => {
    request.current?.abort();
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // Reuse the live course-material list instead of fetching or polling it again.
  const references: ChatReference[] = [
    ...materials.map((item) => ({
      id: `course-${item.id}`,
      documentId: item.id,
      name: item.name,
      source: "course" as const,
      detail: item.snapshot?.status ?? "Not yet checked",
      status: item.snapshot?.status ?? "PENDING",
      available: item.snapshot?.status === "READY",
    })),
    ...uploads,
  ];
  // Discard selections for deleted, failed, or not-yet-ready materials.
  const validSelected = selected.filter((id) => references.some((item) => item.id === id && item.available));

  function stop() {
    if (!request.current) return;
    request.current.abort();
    request.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setBusy(false);
    setNotice("Pandu’s response was stopped.");
  }

  function send(text: string) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setMessages((current) => [...current, { id: String(++sequence.current), role: "user", text }]);
    setBusy(true);
    // Simulate only the loading transition; the response remains clearly labeled sample content.
    timer.current = setTimeout(() => {
      if (controller.signal.aborted) return;
      setMessages((current) => [...current, {
        id: String(++sequence.current), role: "assistant",
        text: "Pandu sample reply: this is where a course-based explanation will appear. This demo has not read your documents or answered your question.",
        citations: [{ id: "demo-source", label: "Pandu sample citation · Preview", detail: "Pandu demo citation only. Real document excerpts and source navigation will be connected during AI integration. No course document supports this sample reply." }],
      }]);
      timer.current = null;
      request.current = null;
      setBusy(false);
    }, 600);
  }
  return <div className="demo-chat-container">
    <CourseChat courseId={courseId} demo messages={messages} references={references} selectedReferences={validSelected} status={busy ? "sending" : "idle"}
      onSend={send} onStop={stop} onRetry={() => {}} onReferencesChange={setSelected} onCitation={setCitation}
      onAddDocuments={(files) => {
        // Store attachment names in memory only; no file contents leave the browser.
        const accepted = files.filter((file) => /\.pdf$/i.test(file.name));
        setNotice(accepted.length === files.length ? "Pandu demo attachments stay local — files are not uploaded or processed." : "Pandu’s demo attachment picker supports PDF files only.");
        setUploads((current) => [...current, ...accepted.map((file) => ({ id: `upload-${++sequence.current}`, documentId: 0, name: file.name, source: "upload" as const, status: "LOCAL", detail: "Pandu demo attachment — local, not uploaded or processed", available: false }))]);
      }} />
    {notice && <div className="chat-detail" role="status"><p>{notice}</p><button onClick={() => setNotice("")}>Dismiss</button></div>}
    {citation && <div className="chat-detail" role="region" aria-label="Citation details"><strong>{citation.label}</strong><p>{citation.detail}</p><button autoFocus onClick={() => setCitation(null)}>Close citation</button></div>}
  </div>;
}
