import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteDocument, DocumentRequestError, getDocument, listDocuments, MAX_PDF_BYTES, renameDocument, uploadDocument, validateDocument, validatePdf } from "./documents";

const document = {
  id: 12, course_id: 7, name: "Lecture.pdf", status: "PENDING",
  created_at: "2026-09-30T12:00:00Z", updated_at: "2026-09-30T12:00:00Z", error: null,
};

afterEach(() => vi.unstubAllGlobals());

describe("document API", () => {
  it("lists uncached materials with authentication and validates each response", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json([document]));
    vi.stubGlobal("fetch", fetch);
    const signal = new AbortController().signal;
    expect(await listDocuments(7, "token", signal)).toEqual([document]);
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("http://api.test/api/v1/courses/7/documents/");
    expect(options).toMatchObject({ signal, cache: "no-store" });
    expect(new Headers(options.headers).get("Authorization")).toBe("Bearer token");
    fetch.mockResolvedValue(Response.json([{ ...document, status: "UNKNOWN" }]));
    await expect(listDocuments(7, "token", signal)).rejects.toThrow("invalid document response");
  });

  it("patches only the display name and accepts an empty 204 delete response", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ ...document, name: "Renamed" }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    const signal = new AbortController().signal;
    expect((await renameDocument(12, "Renamed", "token", signal)).name).toBe("Renamed");
    expect(fetch.mock.calls[0][0]).toBe("http://api.test/api/v1/documents/12/");
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: "PATCH", body: JSON.stringify({ name: "Renamed" }), signal });
    expect(new Headers(fetch.mock.calls[0][1].headers).get("Content-Type")).toBe("application/json");
    await deleteDocument(12, "token", signal);
    expect(fetch.mock.calls[1][1]).toMatchObject({ method: "DELETE", signal });
    expect(new Headers(fetch.mock.calls[1][1].headers).get("Authorization")).toBe("Bearer token");
  });

  it("preserves safe deletion errors without exposing HTML or retrying", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("<html>private path</html>", { status: 503 }));
    vi.stubGlobal("fetch", fetch);
    await expect(deleteDocument(12, "token", new AbortController().signal)).rejects.toThrow("The request could not be completed.");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("sends exactly one multipart file, with auth and browser-controlled content type", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(document, { status: 201 }));
    vi.stubGlobal("fetch", fetch);
    const file = new File(["%PDF-example"], "Lecture.pdf", { type: "application/pdf" });
    const controller = new AbortController();
    expect(await uploadDocument(7, file, "test-access", controller.signal)).toEqual(document);
    const [url, options] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/v1/courses/7/documents/");
    expect(options.method).toBe("POST");
    expect(options.signal).toBe(controller.signal);
    expect(new Headers(options.headers).get("Authorization")).toBe("Bearer test-access");
    expect(new Headers(options.headers).has("Content-Type")).toBe(false);
    expect(Array.from((options.body as FormData).keys())).toEqual(["file"]);
    expect((options.body as FormData).get("file")).toBe(file);
  });

  it("retrieves uncached status with the access token and cancellation signal", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(document));
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    await getDocument(12, "test-access", controller.signal);
    const [url, options] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/v1/documents/12/");
    expect(options.cache).toBe("no-store");
    expect(options.signal).toBe(controller.signal);
    expect(new Headers(options.headers).get("Authorization")).toBe("Bearer test-access");
  });

  it("preserves saved-document IDs in handoff errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      document_id: 12,
      error: { code: "PROCESSING_HANDOFF_UNCONFIRMED", message: "The PDF was saved, but processing could not be confirmed." },
    }, { status: 503 })));
    await expect(uploadDocument(7, new File(["pdf"], "Lecture.pdf"), "token", new AbortController().signal))
      .rejects.toMatchObject({ status: 503, documentId: 12, code: "PROCESSING_HANDOFF_UNCONFIRMED" });
  });

  it("does not expose an HTML server error or automatically retry a POST", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("<html>internal traceback</html>", { status: 502 }));
    vi.stubGlobal("fetch", fetch);
    await expect(uploadDocument(7, new File(["pdf"], "Lecture.pdf"), "token", new AbortController().signal))
      .rejects.toMatchObject({ status: 502, message: "The request could not be completed. Please try again later." });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects an unknown status instead of polling indefinitely", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ...document, status: "UNKNOWN" })));
    await expect(getDocument(12, "token", new AbortController().signal)).rejects.toThrow("invalid document response");
  });

  it("recognizes plain validation errors", () => {
    const error = new DocumentRequestError(400, { code: "INVALID_PDF", message: "Upload a valid, readable PDF." });
    expect(error.message).toBe("Upload a valid, readable PDF.");
    expect(error.documentId).toBeNull();
  });
});

describe("client PDF prechecks", () => {
  it("accepts PDF, DOCX, and PPTX extensions without trusting browser MIME", () => {
    for (const name of ["lecture.pdf", "notes.DOCX", "slides.pptx"]) {
      expect(validateDocument(new File(["source"], name, { type: "text/plain" }))).toBeNull();
    }
    expect(validateDocument(new File(["source"], "legacy.doc"))).toMatch(/\.docx/);
  });
  it("checks missing, empty, non-PDF, and oversized files", () => {
    expect(validatePdf(null)).toMatch(/Choose a PDF/);
    expect(validatePdf(new File([], "empty.pdf"))).toMatch(/empty/);
    expect(validatePdf(new File(["text"], "notes.txt"))).toMatch(/\.pdf/);
    const file = new File(["pdf"], "large.pdf");
    Object.defineProperty(file, "size", { value: MAX_PDF_BYTES + 1 });
    expect(validatePdf(file)).toMatch(/20 MiB/);
  });

  it("accepts exactly 20 MiB and a case-insensitive extension regardless of reported MIME", () => {
    const file = new File(["pdf"], "LECTURE.PDF", { type: "application/octet-stream" });
    Object.defineProperty(file, "size", { value: MAX_PDF_BYTES });
    expect(validatePdf(file)).toBeNull();
  });
});
