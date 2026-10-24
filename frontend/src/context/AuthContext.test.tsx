import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";

const savedUser = { id: 1, email: "ada@example.test", first_name: "Ada", last_name: "Lovelace" };

type ServerOptions = {
  // Status for the refresh on page load, and for any refresh after it.
  refreshStatus?: number;
  laterRefreshStatus?: number;
  // A logout that never reaches the server, or one that waits for `finishLogout`.
  logout?: "ok" | "offline" | "pending";
};

// Answers the auth requests, records each refresh POST, and rejects /todos/ with 401.
function stubAuthServer({
  refreshStatus = 200,
  laterRefreshStatus = refreshStatus,
  logout = "ok",
}: ServerOptions = {}) {
  document.cookie = "csrftoken=test-csrf";
  const refreshes: string[] = [];
  let finishLogout: () => void = () => undefined;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.endsWith("/auth/csrf/")) return Response.json({ status: "ok" });
    if (url.endsWith("/auth/token/refresh/")) {
      const status = refreshes.length === 0 ? refreshStatus : laterRefreshStatus;
      refreshes.push(url);
      return status === 200
        ? Response.json({ access: "restored-access-token" })
        : new Response("{}", { status });
    }
    if (url.endsWith("/auth/me/")) return Response.json({ user: savedUser });
    if (url.endsWith("/auth/logout/")) {
      if (logout === "offline") throw new TypeError("Failed to fetch");
      if (logout === "pending") await new Promise<void>((resolve) => (finishLogout = resolve));
      return new Response(null, { status: 204 });
    }
    return new Response("{}", { status: 401 });
  }));
  return { refreshes, finishLogout: () => finishLogout() };
}

function SessionStatus() {
  const { user, isRestoring, isSigningOut, signedOutReason, signOut, saveLogin, authenticatedFetch } =
    useAuth();
  if (isRestoring) return <p>Restoring</p>;
  return (
    <>
      <p>{user ? `Signed in as ${user.email}` : "Signed out"}</p>
      <p>Reason: {signedOutReason ?? "none"}</p>
      {isSigningOut && <p>Signing out</p>}
      <button type="button" onClick={() => void signOut()}>Sign out</button>
      <button type="button" onClick={() => void authenticatedFetch("/todos/").catch(() => undefined)}>
        Load tasks
      </button>
      <button type="button" onClick={() => saveLogin({ access: "new-access-token", user: savedUser })}>
        Log in
      </button>
    </>
  );
}

async function renderApp() {
  render(
    <StrictMode>
      <AuthProvider>
        <SessionStatus />
      </AuthProvider>
    </StrictMode>,
  );
  await screen.findByText(/^Signed (in|out)/);
  return userEvent.setup();
}

afterEach(() => vi.unstubAllGlobals());

describe("AuthProvider session restore", () => {
  it("restores the session with one refresh request, even under StrictMode", async () => {
    const { refreshes } = stubAuthServer();

    await renderApp();

    expect(screen.getByText("Signed in as ada@example.test")).toBeInTheDocument();
    // A second request would reuse the single-use refresh token and end every session.
    expect(refreshes).toHaveLength(1);
  });

  it("starts signed out, without a reason, when the refresh cookie is rejected", async () => {
    const { refreshes } = stubAuthServer({ refreshStatus: 401 });

    await renderApp();

    expect(screen.getByText("Signed out")).toBeInTheDocument();
    // A first visit is not an expired session, so the login screen shows no notice.
    expect(screen.getByText("Reason: none")).toBeInTheDocument();
    expect(refreshes).toHaveLength(1);
  });
});

describe("AuthProvider sign-out", () => {
  it("keeps the session until the server answers, then records signed_out", async () => {
    const server = stubAuthServer({ logout: "pending" });
    const user = await renderApp();

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(screen.getByText("Signing out")).toBeInTheDocument();
    expect(screen.getByText("Signed in as ada@example.test")).toBeInTheDocument();

    server.finishLogout();

    expect(await screen.findByText("Signed out")).toBeInTheDocument();
    expect(screen.getByText("Reason: signed_out")).toBeInTheDocument();
    expect(screen.queryByText("Signing out")).not.toBeInTheDocument();
  });

  it("still ends the local session when the logout request fails", async () => {
    stubAuthServer({ logout: "offline" });
    const user = await renderApp();

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByText("Signed out")).toBeInTheDocument();
    expect(screen.getByText("Reason: signed_out")).toBeInTheDocument();
  });

  it("records expired when a request's refresh is rejected", async () => {
    stubAuthServer({ laterRefreshStatus: 401 });
    const user = await renderApp();

    await user.click(screen.getByRole("button", { name: "Load tasks" }));

    expect(await screen.findByText("Signed out")).toBeInTheDocument();
    expect(screen.getByText("Reason: expired")).toBeInTheDocument();
  });

  it("clears the reason on the next login", async () => {
    stubAuthServer();
    const user = await renderApp();
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    await screen.findByText("Reason: signed_out");

    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(screen.getByText("Signed in as ada@example.test")).toBeInTheDocument();
    expect(screen.getByText("Reason: none")).toBeInTheDocument();
  });
});
