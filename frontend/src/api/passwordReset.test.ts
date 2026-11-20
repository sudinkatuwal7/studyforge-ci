import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AuthError,
  InvalidPasswordResetLinkError,
  confirmPasswordReset,
  requestPasswordReset,
  validatePasswordResetLink,
} from "./auth";

function stubServer(response: Response) {
  document.cookie = "csrftoken=reset-csrf";
  const fetch = vi.fn(async (url: string) =>
    url.endsWith("/auth/csrf/") ? Response.json({ status: "ok" }) : response,
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("password reset API", () => {
  it("posts each step with CSRF and without an access token", async () => {
    const fetch = stubServer(Response.json({ valid: true }));

    await requestPasswordReset("student@example.test");
    await expect(validatePasswordResetLink("uid123", "token123")).resolves.toBe(true);
    await confirmPasswordReset("uid123", "token123", "EveningRivers!8462");

    expect(fetch.mock.calls.filter(([url]) => url.endsWith("/auth/csrf/"))).toHaveLength(3);
    expect(fetch).toHaveBeenNthCalledWith(2, "http://api.test/api/v1/auth/password-reset/request/", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRFToken": "reset-csrf" },
      body: JSON.stringify({ email: "student@example.test" }),
    });
    expect(fetch).toHaveBeenNthCalledWith(4, "http://api.test/api/v1/auth/password-reset/validate/", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRFToken": "reset-csrf" },
      body: JSON.stringify({ uid: "uid123", token: "token123" }),
    });
    expect(fetch).toHaveBeenNthCalledWith(6, "http://api.test/api/v1/auth/password-reset/confirm/", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRFToken": "reset-csrf" },
      body: JSON.stringify({ uid: "uid123", token: "token123", new_password: "EveningRivers!8462" }),
    });
  });

  it("shows a retry message when the browser or shared request limit is reached", async () => {
    stubServer(Response.json(
      { code: "RESET_REQUEST_LIMITED", detail: "Too many password reset requests. Please try again later." },
      { status: 429 },
    ));

    await expect(requestPasswordReset("student@example.test")).rejects.toMatchObject({
      kind: "rate_limit",
      message: "Too many password reset requests. Please try again later.",
    });
  });

  it("identifies an email address that has no account", async () => {
    stubServer(Response.json(
      { code: "EMAIL_NOT_FOUND", detail: "No account found with that email address." },
      { status: 404 },
    ));

    await expect(requestPasswordReset("missing@example.test")).rejects.toMatchObject({
      kind: "validation",
      fieldErrors: { email: ["No account found with that email address."] },
    });
  });

  it("maps invalid links and Django password validation errors", async () => {
    stubServer(Response.json({ code: "INVALID_RESET_LINK", detail: "Invalid link" }, { status: 400 }));
    await expect(validatePasswordResetLink("uid", "token")).resolves.toBe(false);
    await expect(confirmPasswordReset("uid", "token", "password123")).rejects.toBeInstanceOf(
      InvalidPasswordResetLinkError,
    );

    stubServer(Response.json({ new_password: ["This password is too common."] }, { status: 400 }));
    const error = await confirmPasswordReset("uid", "token", "password123").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AuthError);
    expect((error as AuthError).fieldErrors.new_password).toEqual(["This password is too common."]);
  });

  it("does not submit a reset request after CSRF setup fails", async () => {
    document.cookie = "csrftoken=stale";
    const fetch = vi.fn(async () => new Response("{}", { status: 500 }));
    vi.stubGlobal("fetch", fetch);

    await expect(requestPasswordReset("student@example.test")).rejects.toMatchObject({ kind: "unavailable" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
