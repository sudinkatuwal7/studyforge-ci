import { afterEach, expect, it, vi } from "vitest";
import { deleteCourse, renameCourse } from "./courses";

afterEach(() => vi.unstubAllGlobals());

it("PATCH renames a course and returns the updated record", async () => {
  const course = { id: 7, name: "Biology", description: "Cells", owner: 1, created_at: "2026-10-01" };
  const fetch = vi.fn().mockResolvedValue(Response.json(course));
  vi.stubGlobal("fetch", fetch);
  expect(await renameCourse("token", 7, "Biology")).toEqual(course);
  const [url, options] = fetch.mock.calls[0] as [string, RequestInit];
  expect(url).toBe("http://api.test/api/v1/courses/7/");
  expect(options.method).toBe("PATCH");
  expect(new Headers(options.headers).get("Authorization")).toBe("Bearer token");
  expect(JSON.parse(options.body as string)).toEqual({ name: "Biology" });
});

it("DELETE requires authentication and accepts an empty success response", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetch);
  await expect(deleteCourse(null, 7)).rejects.toThrow("Log in");
  expect(fetch).not.toHaveBeenCalled();
  await expect(deleteCourse("token", 7)).resolves.toBeUndefined();
  const [url, options] = fetch.mock.calls[0] as [string, RequestInit];
  expect(url).toBe("http://api.test/api/v1/courses/7/");
  expect(options.method).toBe("DELETE");
  expect(new Headers(options.headers).get("Authorization")).toBe("Bearer token");
});

it("surfaces a backend name validation message and HTTP status", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ name: ["Invalid name."] }, { status: 400 })));
  await expect(renameCourse("token", 7, "bad")).rejects.toMatchObject({ status: 400, message: "Invalid name." });
});
