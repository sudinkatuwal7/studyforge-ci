import { render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";

const savedUser = { id: 1, email: "ada@example.test", first_name: "Ada", last_name: "Lovelace" };

// Answers the restore requests and records each refresh POST.
function stubAuthServer(refreshStatus = 200) {
  document.cookie = "csrftoken=test-csrf";
  const refreshes: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.endsWith("/auth/csrf/")) return Response.json({ status: "ok" });
    if (url.endsWith("/auth/token/refresh/")) {
      refreshes.push(url);
      return refreshStatus === 200
        ? Response.json({ access: "restored-access-token" })
        : new Response("{}", { status: refreshStatus });
    }
    if (url.endsWith("/auth/me/")) return Response.json({ user: savedUser });
    return new Response("{}", { status: 404 });
  }));
  return refreshes;
}

function SessionStatus() {
  const { user, isRestoring } = useAuth();
  if (isRestoring) return <p>Restoring</p>;
  return <p>{user ? `Signed in as ${user.email}` : "Signed out"}</p>;
}

function renderApp() {
  render(
    <StrictMode>
      <AuthProvider>
        <SessionStatus />
      </AuthProvider>
    </StrictMode>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("AuthProvider session restore", () => {
  it("restores the session with one refresh request, even under StrictMode", async () => {
    const refreshes = stubAuthServer();

    renderApp();

    expect(await screen.findByText("Signed in as ada@example.test")).toBeInTheDocument();
    // A second request would reuse the single-use refresh token and end every session.
    expect(refreshes).toHaveLength(1);
  });

  it("starts signed out when the refresh cookie is rejected", async () => {
    const refreshes = stubAuthServer(401);

    renderApp();

    expect(await screen.findByText("Signed out")).toBeInTheDocument();
    expect(refreshes).toHaveLength(1);
  });
});
