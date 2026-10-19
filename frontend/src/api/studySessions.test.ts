import { afterEach, describe, expect, it, vi } from "vitest";
import type { CreateStudySessionInput, StudySession, UpdateStudySessionInput } from "../types/studySession";
import { ApiError } from "./client";
import {
  createStudySession,
  deleteStudySession,
  getStudySession,
  listStudySessions,
  updateStudySession,
} from "./studySessions";

const token = "test-access-token";
const session: StudySession = {
  id: 12,
  title: "Review graphs",
  course: 7,
  date: "2026-10-22",
  time: "09:30:00",
  created_at: "2026-10-18T12:00:00Z",
  updated_at: "2026-10-18T12:00:00Z",
};
const input: CreateStudySessionInput = {
  creation_key: "550e8400-e29b-41d4-a716-446655440000",
  title: session.title,
  course: session.course,
  date: session.date,
};

afterEach(() => vi.unstubAllGlobals());

describe("study-session API", () => {
  it.each([
    { label: "an empty list", items: [] },
    { label: "saved sessions", items: [session] },
  ])("returns $label", async ({ items }) => {
    const fetch = vi.fn().mockResolvedValue(Response.json(items));
    vi.stubGlobal("fetch", fetch);
    expect(await listStudySessions(token)).toEqual(items);
    const [url, options] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/v1/study-sessions/");
    expect(options.method ?? "GET").toBe("GET");
    expect(new Headers(options.headers).get("Authorization")).toBe(`Bearer ${token}`);
  });

  it("retrieves a session by ID", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(session));
    vi.stubGlobal("fetch", fetch);
    expect(await getStudySession(token, 12)).toEqual(session);
    const [url, options] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/v1/study-sessions/12/");
    expect(options.method ?? "GET").toBe("GET");
    expect(new Headers(options.headers).get("Authorization")).toBe(`Bearer ${token}`);
  });

  it.each([
    { label: "omitted time", details: input },
    { label: "null time", details: { ...input, time: null } },
    { label: "clock time", details: { ...input, time: "09:30" } },
  ])("creates with $label and preserves the supplied key", async ({ details }) => {
    const saved = { ...session, time: details.time ? "09:30:00" : null };
    const fetch = vi.fn().mockResolvedValue(Response.json(saved, { status: 201 }));
    vi.stubGlobal("fetch", fetch);
    expect(await createStudySession(token, details)).toEqual(saved);
    const [url, options] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/v1/study-sessions/");
    expect(options.method).toBe("POST");
    expect(new Headers(options.headers).get("Authorization")).toBe(`Bearer ${token}`);
    expect(new Headers(options.headers).get("Content-Type")).toBe("application/json");
    expect(JSON.parse(options.body as string)).toEqual(details);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("reuses the same creation key when the caller retries after a lost response", async () => {
    const fetch = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(Response.json(session, { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await expect(createStudySession(token, input)).rejects.toThrow("Failed to fetch");
    expect(await createStudySession(token, input)).toEqual(session);
    expect(fetch).toHaveBeenCalledTimes(2);
    const bodies = fetch.mock.calls.map(([, options]) => JSON.parse(options.body));
    expect(bodies).toEqual([input, input]);
  });

  it.each<{ changes: UpdateStudySessionInput }>([
    { changes: { title: "Updated title" } },
    { changes: { course: 8, date: "2026-10-23", time: "11:00" } },
    { changes: { time: null } },
  ])("PATCH sends only supplied changes: $changes", async ({ changes }) => {
    const updated = { ...session, ...changes };
    const fetch = vi.fn().mockResolvedValue(Response.json(updated));
    vi.stubGlobal("fetch", fetch);
    expect(await updateStudySession(token, 12, changes)).toEqual(updated);
    const [url, options] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/v1/study-sessions/12/");
    expect(options.method).toBe("PATCH");
    expect(new Headers(options.headers).get("Authorization")).toBe(`Bearer ${token}`);
    expect(new Headers(options.headers).get("Content-Type")).toBe("application/json");
    expect(JSON.parse(options.body as string)).toEqual(changes);
  });

  it("deletes without trying to parse an empty 204 response", async () => {
    const response = new Response(null, { status: 204 });
    const parse = vi.spyOn(response, "json");
    const fetch = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetch);
    await expect(deleteStudySession(token, 12)).resolves.toBeUndefined();
    expect(parse).not.toHaveBeenCalled();
    const [url, options] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/v1/study-sessions/12/");
    expect(options.method).toBe("DELETE");
    expect(new Headers(options.headers).get("Authorization")).toBe(`Bearer ${token}`);
    expect(options.body).toBeUndefined();
  });
});

const operations = [
  { name: "list", call: listStudySessions },
  { name: "retrieve", call: (accessToken: string | null) => getStudySession(accessToken, 12) },
  { name: "create", call: (accessToken: string | null) => createStudySession(accessToken, input) },
  { name: "update", call: (accessToken: string | null) => updateStudySession(accessToken, 12, { time: null }) },
  { name: "delete", call: (accessToken: string | null) => deleteStudySession(accessToken, 12) },
];

describe.each(operations)("study-session API errors: $name", ({ call }) => {
  it("rejects a missing token before making a request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(call(null)).rejects.toThrow("Log in to manage your study sessions.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([400, 401, 404, 409, 500])("preserves HTTP status %s without retrying", async (status) => {
    // Server/proxy errors may contain text instead of a valid JSON body.
    const fetch = vi.fn().mockResolvedValue(new Response("Request failed", { status }));
    vi.stubGlobal("fetch", fetch);
    const error = await call(token).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("passes network failures to the caller", async () => {
    const failure = new TypeError("Failed to fetch");
    const fetch = vi.fn().mockRejectedValue(failure);
    vi.stubGlobal("fetch", fetch);
    await expect(call(token)).rejects.toBe(failure);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
