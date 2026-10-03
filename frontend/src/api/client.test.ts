import { afterEach, expect, it, vi } from "vitest";
import { ApiError, getJson, postJson } from "./client";

afterEach(() => vi.unstubAllGlobals());

it("keeps public health requests free of an authorization header", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ status: "ok" }));
  vi.stubGlobal("fetch", fetch);

  expect(await getJson("/health/")).toEqual({ status: "ok" });
  const [url, options] = fetch.mock.calls[0] as [string, RequestInit];
  expect(url).toBe("http://api.test/api/v1/health/");
  expect(new Headers(options.headers).has("Authorization")).toBe(false);
});

it("preserves course HTTP errors and sends the shared session token", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
  vi.stubGlobal("fetch", fetch);

  const error = await getJson("/courses/7/", "test-access").catch((cause: unknown) => cause);
  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({ status: 404 });
  const [, options] = fetch.mock.calls[0] as [string, RequestInit];
  expect(new Headers(options.headers).get("Authorization")).toBe("Bearer test-access");
});

it("sends course creation as authenticated JSON", async () => {
  const course = { id: 7, name: "Biology", description: "Lecture notes" };
  const fetch = vi.fn().mockResolvedValue(Response.json(course, { status: 201 }));
  vi.stubGlobal("fetch", fetch);
  const body = { name: course.name, description: course.description };

  expect(await postJson("/courses/", body, "test-access")).toEqual(course);
  const [url, options] = fetch.mock.calls[0] as [string, RequestInit];
  expect(url).toBe("http://api.test/api/v1/courses/");
  expect(options.method).toBe("POST");
  expect(new Headers(options.headers).get("Content-Type")).toBe("application/json");
  expect(new Headers(options.headers).get("Authorization")).toBe("Bearer test-access");
  expect(JSON.parse(options.body as string)).toEqual(body);
});
