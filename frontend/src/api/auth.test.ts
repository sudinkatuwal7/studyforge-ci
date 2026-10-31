import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AuthError,
  RefreshRejectedError,
  accessTokenLifetimeMs,
  loginWithGoogle,
  refreshAccessToken,
} from "./auth";

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

describe("loginWithGoogle", () => {
  const loginResult = {
    access: "access-token",
    user: { id: 7, email: "sam.student@gmail.com", first_name: "Sam", last_name: "Student" },
  };

  function stubGoogleEndpoint(response: Response) {
    document.cookie = "csrftoken=test-csrf";
    const fetch = vi.fn(async (url: string) => {
      if (url.endsWith("/auth/csrf/")) return Response.json({ status: "ok" });
      return response;
    });
    vi.stubGlobal("fetch", fetch);
    return fetch;
  }

  async function googleError(response: Response) {
    stubGoogleEndpoint(response);
    const error = await loginWithGoogle("google-id-token").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AuthError);
    return error as AuthError;
  }

  it("posts the Google credential with the CSRF token and returns the session", async () => {
    const fetch = stubGoogleEndpoint(Response.json(loginResult));

    await expect(loginWithGoogle("google-id-token")).resolves.toEqual(loginResult);

    expect(fetch).toHaveBeenLastCalledWith("http://api.test/api/v1/auth/google/", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRFToken": "test-csrf" },
      body: JSON.stringify({ credential: "google-id-token" }),
    });
  });

  it.each([
    [401, { detail: "Google sign-in failed." }, "credentials", "Google sign-in failed. Please try again."],
    [400, { credential: ["This field may not be blank."] }, "credentials", "Google sign-in failed. Please try again."],
    [403, { detail: "This account has been deactivated." }, "credentials", "This account has been deactivated."],
    [409, { detail: "An account with this email already exists." }, "credentials", "An account with this email already exists."],
    [503, { detail: "Google sign-in is not available right now." }, "unavailable", "Google sign-in is not available right now."],
    [500, {}, "unavailable", "Something went wrong on our side. Please try again."],
  ])("turns a %i response into a %s error", async (status, body, kind, message) => {
    const error = await googleError(Response.json(body, { status }));

    expect(error.kind).toBe(kind);
    expect(error.message).toBe(message);
  });

  it("does not call a failed CSRF check a deactivated account", async () => {
    const error = await googleError(
      Response.json({ detail: "CSRF Failed: CSRF token missing." }, { status: 403 }),
    );

    expect(error.kind).toBe("unavailable");
    expect(error.message).not.toMatch(/deactivated/);
  });

  describe("when the CSRF step fails", () => {
    function stubCsrfResponse(response: Response) {
      const fetch = vi.fn(async () => response);
      vi.stubGlobal("fetch", fetch);
      return fetch;
    }

    function clearCsrfCookie() {
      document.cookie = "csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    }

    it("never sends the credential after a non-200 response, even with an old cookie", async () => {
      document.cookie = "csrftoken=old-csrf";
      const fetch = stubCsrfResponse(new Response("{}", { status: 500 }));

      const error = await loginWithGoogle("google-id-token").catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(AuthError);
      expect((error as AuthError).kind).toBe("unavailable");
      expect((error as AuthError).message).toBe("Something went wrong on our side. Please try again.");
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("never sends the credential when no CSRF cookie was set", async () => {
      clearCsrfCookie();
      const fetch = stubCsrfResponse(Response.json({ status: "ok" }));

      const error = await loginWithGoogle("google-id-token").catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(AuthError);
      expect((error as AuthError).kind).toBe("unavailable");
      expect((error as AuthError).message).toBe("Something went wrong on our side. Please try again.");
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });


  it("reports a network failure as unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const error = await loginWithGoogle("google-id-token").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AuthError);
    expect((error as AuthError).kind).toBe("unavailable");
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
