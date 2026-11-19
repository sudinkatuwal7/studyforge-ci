import { request } from "./client";

export async function transcribeRecording(audio: Blob, token: string, signal: AbortSignal): Promise<string> {
  const form = new FormData();
  const extension = audio.type.includes("mp4") ? "mp4" : audio.type.includes("ogg") ? "ogg" : "webm";
  form.append("audio", audio, `question.${extension}`);
  const response = await request("/voice/transcriptions/", { method: "POST", body: form, signal }, token);
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body && typeof body === "object" && "detail" in body && typeof body.detail === "string" ? body.detail : "Voice transcription failed. Try again or type your question.";
    throw new Error(detail);
  }
  if (!body || typeof body !== "object" || !("text" in body) || typeof body.text !== "string") throw new Error("The transcription response was invalid.");
  return body.text;
}
