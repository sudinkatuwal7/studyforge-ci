import { afterEach, expect, it, vi } from "vitest";
import { deleteNotes, generateNotes, getNotes, listNotes, NotesRequestError, updateNotes } from "./notes";

const notes = { id: 5, title: "Notes: Cells", course: 42, overview: "x", sections: [], source_documents: [], created_at: "2026-10-01" };
afterEach(() => vi.unstubAllGlobals());

const choices = { note_type: "key_concepts", detail_level: "detailed", format: "paragraphs" } as const;

it("posts the selected ids and options to the course notes endpoint", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json(notes, { status: 201 }));
  vi.stubGlobal("fetch", fetch);
  expect(await generateNotes(42, [1, 2], choices, "token")).toEqual(notes);
  const [url, options] = fetch.mock.calls[0];
  expect(url).toMatch(/\/courses\/42\/notes\/$/);
  expect(options.method).toBe("POST");
  expect(JSON.parse(options.body)).toEqual({ document_ids: [1, 2], ...choices });
  expect(options.headers.get("Authorization")).toBe("Bearer token");
});

it("reads saved notes without using the browser cache", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json(notes));
  vi.stubGlobal("fetch", fetch);
  expect(await getNotes(5, "token")).toEqual(notes);
  expect(fetch.mock.calls[0][0]).toMatch(/\/notes\/5\/$/);
  expect(fetch.mock.calls[0][1].cache).toBe("no-store");
});

it("carries the backend's code on a failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ code: "NOTES_INPUT_TOO_LARGE" }, { status: 422 })));
  await expect(generateNotes(42, [1], choices, "token")).rejects.toMatchObject({ status: 422, code: "NOTES_INPUT_TOO_LARGE" });
});

it("falls back to an empty code when the failure is not JSON", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>Bad gateway</html>", { status: 502 })));
  const failure = await getNotes(5, "token").catch((cause: unknown) => cause);
  expect(failure).toBeInstanceOf(NotesRequestError);
  expect(failure).toMatchObject({ status: 502, code: "" });
});

const summary = { id: 5, title: "Notes: Cells", course: 42, course_name: "Biology", options: choices, created_at: "2026-10-01", updated_at: "2026-10-02" };

it("lists every course's notes without using the browser cache", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json([summary]));
  vi.stubGlobal("fetch", fetch);
  expect(await listNotes("token")).toEqual([summary]);
  const [url, options] = fetch.mock.calls[0];
  expect(url).toMatch(/\/notes\/$/);
  expect(options.cache).toBe("no-store");
  expect(options.headers.get("Authorization")).toBe("Bearer token");
});

it("lists one course's notes with the course filter", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json([]));
  vi.stubGlobal("fetch", fetch);
  expect(await listNotes("token", 42)).toEqual([]);
  expect(fetch.mock.calls[0][0]).toMatch(/\/notes\/\?course=42$/);
});

it("patches only the changed fields", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ ...notes, title: "Renamed" }));
  vi.stubGlobal("fetch", fetch);
  expect(await updateNotes(5, { title: "Renamed" }, "token")).toMatchObject({ title: "Renamed" });
  const [url, options] = fetch.mock.calls[0];
  expect(url).toMatch(/\/notes\/5\/$/);
  expect(options.method).toBe("PATCH");
  expect(options.headers.get("Content-Type")).toBe("application/json");
  expect(JSON.parse(options.body)).toEqual({ title: "Renamed" });
});

it("carries the reason an edit was rejected", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
    Response.json({ code: "NOTES_INVALID_CONTENT", detail: "heading must be a non-empty string" }, { status: 400 }),
  ));
  await expect(updateNotes(5, { sections: [] }, "token")).rejects.toMatchObject({
    status: 400, code: "NOTES_INVALID_CONTENT", detail: "heading must be a non-empty string",
  });
});

it("carries the title's error when the title is rejected", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ title: ["This field may not be blank."] }, { status: 400 })));
  await expect(updateNotes(5, { title: "" }, "token")).rejects.toMatchObject({
    status: 400, code: "", detail: "This field may not be blank.",
  });
});

it("deletes notes and resolves on 204", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetch);
  await expect(deleteNotes(5, "token")).resolves.toBeUndefined();
  const [url, options] = fetch.mock.calls[0];
  expect(url).toMatch(/\/notes\/5\/$/);
  expect(options.method).toBe("DELETE");
});

it("reports notes that are not found or not the student's as a 404", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ detail: "No CourseNotes matches the given query." }, { status: 404 })));
  const failure = await deleteNotes(5, "token").catch((cause: unknown) => cause);
  expect(failure).toBeInstanceOf(NotesRequestError);
  expect(failure).toMatchObject({ status: 404 });
});
