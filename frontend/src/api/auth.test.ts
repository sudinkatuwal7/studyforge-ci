import { afterEach, describe, expect, it, vi } from "vitest";
import { RefreshRejectedError, accessTokenLifetimeMs, refreshAccessToken } from "./auth";

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

describe("accessTokenLifetimeMs", () => {
  function token(payload: object) {
    // JWTs use base64url: no padding, and - and _ instead of + and /.
    const encoded = btoa(JSON.stringify(payload)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
    return `header.${encoded}.signature`;
  }

  it("reads the lifetime from the token's own iat and exp", () => {
    expect(accessTokenLifetimeMs(token({ iat: 1_000, exp: 1_900 }))).toBe(900_000);
  });

  it("decodes base64url payloads", () => {
    // This name makes the base64 contain "/", which base64url writes as "_".
    expect(accessTokenLifetimeMs(token({ iat: 1_000, exp: 1_060, name: "??>>" }))).toBe(60_000);
  });

  it.each([
    ["is not a JWT", "restored-access-token"],
    ["has no iat", token({ exp: 1_900 })],
    ["expires before it was issued", token({ iat: 1_900, exp: 1_000 })],
  ])("returns null when the token %s", (_label, value) => {
    expect(accessTokenLifetimeMs(value)).toBeNull();
  });
});
