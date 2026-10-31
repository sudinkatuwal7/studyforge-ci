import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LoginResult, PublicUser } from "../api/auth";
import { useSignInLock } from "../components/auth/useSignInLock";
import LoginPage from "./LoginPage";

// App owns the lock in the real page, so give the page a parent that does too.
function LoginCard({ onCreateAccount }: { onCreateAccount?: () => void }) {
  const signInLock = useSignInLock();
  return <LoginPage onCreateAccount={onCreateAccount} signInLock={signInLock} />;
}

// The real api/auth runs here against a fake server, so the requests that are
// actually sent are what the test counts.
const { saveLogin } = vi.hoisted(() => ({ saveLogin: vi.fn<(result: LoginResult) => void>() }));
vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ saveLogin, signedOutReason: null }),
}));

type Method = "password" | "google";

const USERS: Record<Method, PublicUser> = {
  password: { id: 1, email: "password.user@example.test", first_name: "Pat", last_name: "Word" },
  google: { id: 2, email: "google.user@example.test", first_name: "Gee", last_name: "Mail" },
};

// Like a browser, this stores the refresh cookie when a response's headers arrive,
// before the page can read its body. saveLogin only runs after the body is read.
function stubServer() {
  document.cookie = "csrftoken=test-csrf";
  const waiting = new Map<Method, { headers: () => void; body: () => void }>();
  const server = { refreshCookieOwner: null as number | null, waiting, posts: [] as Method[] };

  vi.stubGlobal("fetch", (url: string) => {
    if (url.endsWith("/auth/csrf/")) return Promise.resolve(Response.json({ status: "ok" }));

    const method: Method = url.endsWith("/auth/google/") ? "google" : "password";
    server.posts.push(method);
    return new Promise<Response>((resolve) => {
      let releaseBody = () => {};
      const bodyArrived = new Promise<void>((done) => {
        releaseBody = done;
      });
      const payload = { access: `${method}-access`, user: USERS[method] };
      waiting.set(method, {
        headers() {
          server.refreshCookieOwner = USERS[method].id;
          const response = Response.json(payload);
          response.json = () => bodyArrived.then(() => payload);
          resolve(response);
        },
        body: releaseBody,
      });
    });
  });
  return server;
}

async function renderWithGoogle() {
  const initialize = vi.fn<GoogleAccountsId["initialize"]>();
  const renderButton = vi.fn<GoogleAccountsId["renderButton"]>();
  window.google = { accounts: { id: { initialize, renderButton } } };

  render(<LoginCard />);
  await vi.waitFor(() => expect(renderButton).toHaveBeenCalled());

  return async function chooseGoogleAccount() {
    const { callback } = initialize.mock.calls[0][0];
    await act(async () => callback({ credential: "google-id-token" }));
  };
}

async function submitPasswordForm() {
  const user = userEvent.setup();
  await user.click(screen.getByLabelText("Email address"));
  await user.paste(USERS.password.email);
  await user.click(screen.getByLabelText("Password"));
  await user.paste("EveningRivers!8462");
  await user.click(screen.getByRole("button", { name: /Log in|Logging in/ }));
}

// Gives the CSRF fetch and any POST after it time to run.
async function settle() {
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

beforeEach(() => {
  vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "client-id.apps.googleusercontent.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  delete window.google;
});

describe("LoginPage when both sign-in methods are used at once", () => {
  it.each<[Method, Method]>([
    ["password", "password"],
    ["password", "google"],
    ["google", "password"],
    ["google", "google"],
  ])("keeps the user and cookie together: %s started first, %s would answer first", async (started, answersFirst) => {
    const server = stubServer();
    const chooseGoogleAccount = await renderWithGoogle();
    const startMethod: Record<Method, () => Promise<void>> = {
      password: submitPasswordForm,
      google: chooseGoogleAccount,
    };
    const other: Method = started === "password" ? "google" : "password";

    await startMethod[started]();
    await settle();
    await startMethod[other]();
    await settle();

    // With the lock working, only the first method's request exists, so the other
    // method's steps do nothing and response order cannot matter. They are here for
    // when the lock breaks: a second request then gets its headers and body in the
    // order most likely to split user and cookie.
    const answersLast: Method = answersFirst === "password" ? "google" : "password";
    for (const step of [
      () => server.waiting.get(answersFirst)?.headers(),
      () => server.waiting.get(answersLast)?.headers(),
      () => server.waiting.get(answersLast)?.body(),
      () => server.waiting.get(answersFirst)?.body(),
    ]) {
      await act(async () => step());
      await settle();
    }

    expect(server.posts).toEqual([started]);
    expect(saveLogin).toHaveBeenCalledTimes(1);
    expect(saveLogin.mock.lastCall?.[0].user.id).toBe(USERS[started].id);
    expect(saveLogin.mock.lastCall?.[0].user.id).toBe(server.refreshCookieOwner);
  });

  it("allows the other method again after the first one fails", async () => {
    const server = stubServer();
    const chooseGoogleAccount = await renderWithGoogle();
    vi.stubGlobal("fetch", (url: string) => {
      if (url.endsWith("/auth/csrf/")) return Promise.resolve(Response.json({ status: "ok" }));
      if (url.endsWith("/auth/token/")) {
        return Promise.resolve(Response.json({ detail: "No" }, { status: 401 }));
      }
      server.refreshCookieOwner = USERS.google.id;
      return Promise.resolve(Response.json({ access: "google-access", user: USERS.google }));
    });

    await submitPasswordForm();
    await settle();
    expect(screen.getByRole("alert")).toHaveTextContent("Incorrect email or password.");

    await chooseGoogleAccount();
    await settle();

    expect(saveLogin.mock.lastCall?.[0].user).toEqual(USERS.google);
    expect(server.refreshCookieOwner).toBe(USERS.google.id);
  });
});
