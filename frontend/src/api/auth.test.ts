import { afterEach, describe, expect, it, vi } from "vitest";
import { RefreshRejectedError, refreshAccessToken } from "./auth";

function stubAuthServer(refreshStatus = 200) {
  document.cookie = "csrftoken=test-csrf";
  const fetch = vi.fn(async (url: string) => {
    if (url.endsWith("/auth/csrf/")) return Response.json({ status: "ok" });
    if (url.endsWith("/auth/token/refresh/") && refreshStatus === 200) {
      return Response.json({ access: "new-access-token" });
    }
    return new Response("{}", { status: refreshStatus });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

// jsdom has no Web Locks API, so tests add navigator.locks themselves.
function stubLocks(request: LockManager["request"]) {
  Object.defineProperty(navigator, "locks", { value: { request }, configurable: true });
}

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "locks");
});

describe("refreshAccessToken", () => {
  it("refreshes only while holding the shared refresh lock", async () => {
    const fetch = stubAuthServer();
    let requestsBeforeLock = -1;
    const request = vi.fn(async (_name: string, task: () => Promise<string>) => {
      requestsBeforeLock = fetch.mock.calls.length;
      return task();
    });
    stubLocks(request as unknown as LockManager["request"]);

    await expect(refreshAccessToken()).resolves.toBe("new-access-token");

    expect(request).toHaveBeenCalledWith("studyforge-refresh", expect.any(Function));
    expect(requestsBeforeLock).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("still refreshes in browsers without Web Locks", async () => {
    const fetch = stubAuthServer();

    await expect(refreshAccessToken()).resolves.toBe("new-access-token");

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("reports a rejected refresh cookie as RefreshRejectedError", async () => {
    stubAuthServer(401);

    await expect(refreshAccessToken()).rejects.toBeInstanceOf(RefreshRejectedError);
  });
});
