import { afterEach, expect, it, vi } from "vitest";
import { transcribeRecording } from "./voice";

afterEach(() => vi.unstubAllGlobals());

it("sends a bearer-authenticated recording and returns only its transcript", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: "Explain photosynthesis" }), { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  const text = await transcribeRecording(new Blob(["audio"], { type: "audio/webm" }), "student-token", new AbortController().signal);
  expect(text).toBe("Explain photosynthesis");
  const [, options] = fetch.mock.calls[0] as [string, RequestInit];
  expect(new Headers(options.headers).get("Authorization")).toBe("Bearer student-token");
  expect(options.body).toBeInstanceOf(FormData);
  expect((options.body as FormData).get("audio")).toBeInstanceOf(File);
});
