import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import DemoCourseChat from "./DemoCourseChat";
import CourseChat from "./CourseChat";

afterEach(() => vi.useRealTimers());

it("puts recognized speech in the editable draft without sending it", () => {
  let recognitionResult: ((event: { resultIndex: number; results: { isFinal: boolean; 0: { transcript: string } }[] }) => void) | null = null;
  class MockRecognition {
    continuous = false; interimResults = false; lang = "";
    onresult: ((event: { resultIndex: number; results: { isFinal: boolean; 0: { transcript: string } }[] }) => void) | null = null;
    onend: (() => void) | null = null;
    onerror: ((event: { error: string }) => void) | null = null;
    start() { recognitionResult = this.onresult; }
    stop() { this.onend?.(); }
    abort() { this.onend?.(); }
  }
  Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: MockRecognition });
  const transcribe = vi.fn();
  const getUserMedia = vi.fn();
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  Object.defineProperty(window, "MediaRecorder", { configurable: true, value: class {} });
  const send = vi.fn();
  const props = { courseId: 42, messages: [], references: [{ id: "course-1", documentId: 1, name: "Notes", source: "course" as const, detail: "READY", status: "READY", available: true }], selectedReferences: ["course-1"], status: "idle" as const,
    onSend: send, onTranscribeAudio: transcribe, onReferencesChange: vi.fn(), onAddDocuments: vi.fn(), onCitation: vi.fn() };
  render(<CourseChat {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Start voice input" }));
  act(() => recognitionResult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "What is gravity?" } }] }));
  expect(screen.getByRole("textbox", { name: "Message Pandu" })).toHaveValue("What is gravity?");
  expect(send).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("textbox", { name: "Message Pandu" }), { target: { value: "Explain gravity" } });
  fireEvent.click(screen.getByRole("button", { name: "Send to Pandu" }));
  expect(send).toHaveBeenCalledWith("Explain gravity", [1]);
  expect(getUserMedia).not.toHaveBeenCalled();
  expect(transcribe).not.toHaveBeenCalled();
  Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: undefined });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined });
  Object.defineProperty(window, "MediaRecorder", { configurable: true, value: undefined });
});

it("offers Gemini recording after browser recognition reports a service failure", async () => {
  let failRecognition: ((event: { error: string }) => void) | null = null;
  class MockRecognition {
    continuous = false; interimResults = false; lang = "";
    onresult = null; onend = null;
    onerror: ((event: { error: string }) => void) | null = null;
    start() { failRecognition = this.onerror; }
    stop() {} abort() {}
  }
  const track = { stop: vi.fn() };
  const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [track] });
  class MockRecorder {
    static isTypeSupported = () => true;
    mimeType = "audio/webm"; state = "inactive";
    ondataavailable = null; onerror = null;
    onstop: (() => void) | null = null;
    start() { this.state = "recording"; }
    stop() { this.state = "inactive"; this.onstop?.(); }
  }
  Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: MockRecognition });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  Object.defineProperty(window, "MediaRecorder", { configurable: true, value: MockRecorder });
  render(<CourseChat courseId={42} messages={[]} references={[]} selectedReferences={[]} status="idle" onSend={vi.fn()}
    onTranscribeAudio={vi.fn()} onReferencesChange={vi.fn()} onAddDocuments={vi.fn()} onCitation={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Start voice input" }));
  act(() => failRecognition?.({ error: "network" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Tap Mic again to use Gemini transcription");
  fireEvent.click(screen.getByRole("button", { name: "Start voice input" }));
  expect(await screen.findByRole("button", { name: "Stop recording" })).toBeInTheDocument();
  expect(getUserMedia).toHaveBeenCalledOnce();
  Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: undefined });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined });
  Object.defineProperty(window, "MediaRecorder", { configurable: true, value: undefined });
});

it("asks the student to reconnect while keeping the draft editable", () => {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
  const send = vi.fn(), transcribe = vi.fn();
  render(<CourseChat courseId={42} messages={[]} references={[{ id: "course-1", documentId: 1, name: "Notes", source: "course", detail: "READY", status: "READY", available: true }]} selectedReferences={["course-1"]} status="idle"
    onSend={send} onTranscribeAudio={transcribe} onReferencesChange={vi.fn()} onAddDocuments={vi.fn()} onCitation={vi.fn()} />);
  expect(screen.getByRole("alert")).toHaveTextContent("Connect to the internet");
  fireEvent.change(screen.getByRole("textbox", { name: "Message Pandu" }), { target: { value: "Explain atoms" } });
  expect(screen.getByRole("textbox", { name: "Message Pandu" })).toHaveValue("Explain atoms");
  expect(screen.getByRole("button", { name: "Send to Pandu" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Start voice input" })).toBeDisabled();
  expect(send).not.toHaveBeenCalled(); expect(transcribe).not.toHaveBeenCalled();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  act(() => window.dispatchEvent(new Event("online")));
  expect(screen.queryByText(/You are offline/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Send to Pandu" })).toBeEnabled();
});

it("shows microphone denial while leaving typing available", () => {
  let deny: ((event: { error: string }) => void) | null = null;
  class MockRecognition {
    continuous = false; interimResults = false; lang = "";
    onresult = null; onend = null;
    onerror: ((event: { error: string }) => void) | null = null;
    start() { deny = this.onerror; }
    stop() {} abort() {}
  }
  Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: MockRecognition });
  render(<CourseChat courseId={42} messages={[]} references={[]} selectedReferences={[]} status="idle" onSend={vi.fn()} onReferencesChange={vi.fn()} onAddDocuments={vi.fn()} onCitation={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Start voice input" }));
  act(() => deny?.({ error: "not-allowed" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Microphone access was denied");
  fireEvent.change(screen.getByRole("textbox", { name: "Message Pandu" }), { target: { value: "Typed question" } });
  expect(screen.getByRole("textbox", { name: "Message Pandu" })).toHaveValue("Typed question");
  Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: undefined });
});

it("plays, pauses, resumes and stops a Pandu answer", () => {
  const speak = vi.fn(), pause = vi.fn(), resume = vi.fn(), cancel = vi.fn();
  Object.defineProperty(window, "speechSynthesis", { configurable: true, value: { speak, pause, resume, cancel } });
  Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: class { text: string; constructor(text: string) { this.text = text; } } });
  render(<CourseChat courseId={42} messages={[{ id: "answer", role: "assistant", text: "Gravity pulls objects together." }]} references={[]} selectedReferences={[]} status="idle" onSend={vi.fn()} onReferencesChange={vi.fn()} onAddDocuments={vi.fn()} onCitation={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Play answer from Pandu" }));
  expect(speak.mock.calls[0][0].text).toBe("Gravity pulls objects together.");
  fireEvent.click(screen.getByRole("button", { name: "Pause" }));
  expect(pause).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Resume answer from Pandu" }));
  expect(resume).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Stop audio" }));
  expect(cancel).toHaveBeenCalled();
  Object.defineProperty(window, "speechSynthesis", { configurable: true, value: undefined });
  Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: undefined });
});

it("records and transcribes through the fallback when browser recognition is unavailable", async () => {
  Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: undefined });
  Object.defineProperty(window, "webkitSpeechRecognition", { configurable: true, value: undefined });
  const track = { stop: vi.fn() };
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [track] }) } });
  class MockRecorder {
    static isTypeSupported = (type: string) => type === "audio/webm";
    mimeType = "audio/webm"; state = "inactive";
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    onerror: (() => void) | null = null;
    start() { this.state = "recording"; }
    stop() { this.state = "inactive"; this.ondataavailable?.({ data: new Blob(["audio"], { type: "audio/webm" }) }); this.onstop?.(); }
  }
  Object.defineProperty(window, "MediaRecorder", { configurable: true, value: MockRecorder });
  const transcribe = vi.fn().mockResolvedValue("What is an atom?");
  const send = vi.fn();
  render(<CourseChat courseId={42} messages={[]} references={[{ id: "course-1", documentId: 1, name: "Notes", source: "course", detail: "READY", status: "READY", available: true }]} selectedReferences={["course-1"]} status="idle"
    onSend={send} onTranscribeAudio={transcribe} onReferencesChange={vi.fn()} onAddDocuments={vi.fn()} onCitation={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Start voice input" }));
  expect(await screen.findByRole("button", { name: "Stop recording" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Stop recording" }));
  expect(await screen.findByDisplayValue("What is an atom?")).toBeInTheDocument();
  expect(transcribe).toHaveBeenCalledOnce();
  expect(track.stop).toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Send to Pandu" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Send to Pandu" }));
  expect(send).toHaveBeenCalledWith("What is an atom?", [1]);
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined });
  Object.defineProperty(window, "MediaRecorder", { configurable: true, value: undefined });
});

it("sends a typed question without sources so Pandu can clarify what is needed", () => {
  const send = vi.fn();
  render(<CourseChat courseId={42} messages={[]} references={[]} selectedReferences={[]} status="idle"
    onSend={send} onReferencesChange={vi.fn()} onAddDocuments={vi.fn()} onCitation={vi.fn()} />);
  fireEvent.change(screen.getByRole("textbox", { name: "Message Pandu" }), { target: { value: "What is an atom?" } });
  fireEvent.click(screen.getByRole("button", { name: "Send to Pandu" }));
  expect(send).toHaveBeenCalledExactlyOnceWith("What is an atom?", []);
  expect(screen.getByRole("textbox", { name: "Message Pandu" })).toHaveValue("");
});

it("keeps the composer usable when recording permission is denied", async () => {
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError")) } });
  Object.defineProperty(window, "MediaRecorder", { configurable: true, value: class {} });
  render(<CourseChat courseId={42} messages={[]} references={[]} selectedReferences={[]} status="idle" onSend={vi.fn()}
    onTranscribeAudio={vi.fn()} onReferencesChange={vi.fn()} onAddDocuments={vi.fn()} onCitation={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Start voice input" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Microphone access was denied");
  fireEvent.change(screen.getByRole("textbox", { name: "Message Pandu" }), { target: { value: "I can still type" } });
  expect(screen.getByRole("textbox", { name: "Message Pandu" })).toHaveValue("I can still type");
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined });
  Object.defineProperty(window, "MediaRecorder", { configurable: true, value: undefined });
});

const readyDocument = {
  id: 1,
  course_id: 42,
  name: "Lecture.pdf",
  status: "READY" as const,
  error: null,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
};

it("labels demo replies and citations honestly, supports references, and prevents duplicate sends", async () => {
  vi.useFakeTimers();
  render(<DemoCourseChat courseId={42} materials={[{ id: 1, name: "Lecture.pdf", snapshot: readyDocument }]} />);
  expect(screen.getByText("Demo")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Sources · 0 selected"));
  fireEvent.click(screen.getByRole("checkbox", { name: /Lecture.pdf/ }));
  expect(screen.getByText("Sources · 1 selected")).toBeInTheDocument();
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "Explain this topic" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(screen.getByText("Explain this topic")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Send to Pandu \(demo\)/ })).toBeDisabled();
  await act(() => vi.advanceTimersByTimeAsync(600));
  expect(screen.getByText(/Pandu sample reply:/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Pandu sample citation · Preview" }));
  expect(screen.getByRole("region", { name: "Citation details" })).toHaveTextContent("No course document supports this sample reply");
});

it("keeps chat attachments local and removes deleted materials from selected references", () => {
  const { rerender } = render(<DemoCourseChat courseId={42} materials={[{ id: 1, name: "Lecture.pdf", snapshot: readyDocument }]} />);
  fireEvent.click(screen.getByText("Sources · 0 selected"));
  fireEvent.click(screen.getByRole("checkbox", { name: /Lecture.pdf/ }));
  fireEvent.change(screen.getByLabelText("Add documents to Pandu"), { target: { files: [new File(["sample"], "Local.pdf")] } });
  expect(screen.getByText(/Pandu demo attachment — local, not uploaded or processed/)).toBeInTheDocument();
  rerender(<DemoCourseChat courseId={42} materials={[]} />);
  expect(screen.getByText("Sources · 0 selected")).toBeInTheDocument();
  expect(screen.queryByText("Lecture.pdf")).not.toBeInTheDocument();
});

it("supports injected errors and retries without a demo dependency", () => {
  const retry = vi.fn();
  render(<CourseChat courseId={42} messages={[]} references={[]} selectedReferences={[]} status="error" error="Connection lost" onRetry={retry} onSend={vi.fn()} onReferencesChange={vi.fn()} onAddDocuments={vi.fn()} onCitation={vi.fn()} />);
  expect(screen.getByRole("alert")).toHaveTextContent("Connection lost");
  fireEvent.click(screen.getByRole("button", { name: "Retry with Pandu" }));
  expect(retry).toHaveBeenCalledOnce();
});

it("distinguishes sending from streaming and lets the student stop a response", () => {
  const stop = vi.fn();
  const props = {
    courseId: 42,
    messages: [],
    references: [],
    selectedReferences: [],
    onRetry: vi.fn(),
    onSend: vi.fn(),
    onStop: stop,
    onReferencesChange: vi.fn(),
    onAddDocuments: vi.fn(),
    onCitation: vi.fn(),
  };
  const { rerender } = render(<CourseChat {...props} status="sending" />);

  expect(screen.getByRole("status")).toHaveTextContent("Sending your message to Pandu");
  fireEvent.click(screen.getByRole("button", { name: "Stop response" }));
  expect(stop).toHaveBeenCalledOnce();

  rerender(<CourseChat {...props} status="streaming" />);
  expect(screen.getByRole("status")).toHaveTextContent("Pandu is responding");
  fireEvent.click(screen.getByRole("button", { name: "Stop response" }));
  expect(stop).toHaveBeenCalledTimes(2);
});

it("cancels Pandu's pending demo response", async () => {
  vi.useFakeTimers();
  render(<DemoCourseChat courseId={42} materials={[{ id: 1, name: "Lecture.pdf", snapshot: readyDocument }]} />);
  fireEvent.click(screen.getByText("Sources · 0 selected"));
  fireEvent.click(screen.getByRole("checkbox", { name: /Lecture.pdf/ }));

  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Explain this" } });
  fireEvent.click(screen.getByRole("button", { name: "Send to Pandu (demo)" }));
  fireEvent.click(screen.getByRole("button", { name: "Stop response" }));
  await act(() => vi.advanceTimersByTimeAsync(600));

  expect(screen.getByText("Pandu’s response was stopped.")).toBeInTheDocument();
  expect(screen.queryByText(/Pandu sample reply:/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Send to Pandu (demo)" })).toBeDisabled();
});

it("sends only selected and ready backend course document IDs", () => {
  const send = vi.fn();
  render(<CourseChat courseId={42} messages={[]} references={[
    { id: "course-1", documentId: 1, name: "Ready.pdf", source: "course", detail: "READY", status: "READY", available: true },
    { id: "course-2", documentId: 2, name: "Pending.pdf", source: "course", detail: "PROCESSING", status: "PROCESSING", available: false },
  ]} selectedReferences={["course-1", "course-2"]} status="idle" onRetry={vi.fn()} onSend={send}
    onReferencesChange={vi.fn()} onAddDocuments={vi.fn()} onCitation={vi.fn()} />);

  expect(screen.getByRole("checkbox", { name: /Pending.pdf/ })).toBeDisabled();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Compare the notes" } });
  fireEvent.click(screen.getByRole("button", { name: "Send to Pandu" }));

  expect(send).toHaveBeenCalledWith("Compare the notes", [1]);
});

it("fills the composer from a suggested prompt and marks the streamed message", () => {
  const { rerender } = render(<CourseChat courseId={42} messages={[]} references={[]} selectedReferences={[]} status="idle"
    onRetry={vi.fn()} onSend={vi.fn()} onReferencesChange={vi.fn()} onAddDocuments={vi.fn()} onCitation={vi.fn()} />);

  fireEvent.click(screen.getByRole("button", { name: "Explain a concept" }));
  expect(screen.getByRole("textbox")).toHaveValue("Explain a concept");

  rerender(<CourseChat courseId={42} messages={[{ id: "answer-1", role: "assistant", text: "Partial answer" }]} references={[]}
    selectedReferences={[]} status="streaming" onStop={vi.fn()} onRetry={vi.fn()} onSend={vi.fn()}
    onReferencesChange={vi.fn()} onAddDocuments={vi.fn()} onCitation={vi.fn()} />);
  expect(screen.getByText("Partial answer").closest("article")).toHaveAttribute("aria-busy", "true");
});

it("keeps READY course materials and uploads in separate groups with all and clear actions", () => {
  const change = vi.fn();
  const references = [
    { id: "course-1", documentId: 1, name: "One.pdf", source: "course" as const, detail: "READY", status: "READY", available: true },
    { id: "course-2", documentId: 2, name: "Two.pdf", source: "course" as const, detail: "READY", status: "READY", available: true },
    { id: "upload-3", documentId: 3, name: "Chat.pdf", source: "upload" as const, detail: "READY", status: "READY", available: true },
    { id: "upload-4", documentId: 4, name: "Pending.pdf", source: "upload" as const, detail: "PROCESSING", status: "PROCESSING", available: false },
  ];
  const props = { courseId: 42, messages: [], references, selectedReferences: [], status: "idle" as const,
    onRetry: vi.fn(), onSend: vi.fn(), onReferencesChange: change, onAddDocuments: vi.fn(), onCitation: vi.fn() };
  const { rerender } = render(<CourseChat {...props} />);
  expect(screen.getByRole("group", { name: "Course Materials" })).toHaveTextContent("One.pdf");
  expect(screen.getByRole("group", { name: "Conversation Uploads" })).toHaveTextContent("Chat.pdf");
  expect(screen.getByRole("checkbox", { name: /Pending.pdf/ })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Select all READY" }));
  expect(change).toHaveBeenCalledWith(["course-1", "course-2", "upload-3"]);
  rerender(<CourseChat {...props} selectedReferences={["course-1", "course-2", "upload-3"]} />);
  fireEvent.click(screen.getByRole("checkbox", { name: /Two.pdf/ }));
  expect(change).toHaveBeenLastCalledWith(["course-1", "upload-3"]);
  fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
  expect(change).toHaveBeenLastCalledWith([]);
});
