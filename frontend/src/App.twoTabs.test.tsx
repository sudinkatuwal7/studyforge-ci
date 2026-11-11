import { render, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./context/AuthContext";
import App from "./App";

vi.mock("./api/health", () => ({
  getHealth: () => Promise.resolve({ status: "ok" }),
}));
// The dashboard's only job here is to send a request that can find the session expired.
vi.mock("./pages/DashboardPage", () => ({
  default: function DashboardStub() {
    const { authenticatedFetch } = useAuth();
    return (
      <button type="button" onClick={() => void authenticatedFetch("/todos/").catch(() => undefined)}>
        Load tasks
      </button>
    );
  },
}));
vi.mock("./pages/CalendarPage", () => ({ default: () => <p>Calendar page</p> }));

const savedUser = { id: 1, email: "ada@example.test", first_name: "Ada", last_name: "Lovelace" };

const LANDING = { level: 1, name: "Study smarter with StudyForge" } as const;
const LOGIN_CARD = { name: "Log in to StudyForge" } as const;

// Both tabs share one fake server. Each tab's page-load refresh succeeds; a later
// refresh answers with `laterRefreshStatus`, and /todos/ always needs a refresh.
function stubAuthServer({ laterRefreshStatus = 200 } = {}) {
  document.cookie = "csrftoken=test-csrf";
  let refreshes = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.endsWith("/auth/csrf/")) return Response.json({ status: "ok" });
    if (url.endsWith("/auth/token/refresh/")) {
      refreshes += 1;
      const status = refreshes <= 2 ? 200 : laterRefreshStatus;
      if (status !== 200) return new Response("{}", { status });
      return Response.json({ access: "restored-access-token" });
    }
    if (url.endsWith("/auth/me/")) return Response.json({ user: savedUser });
    if (url.endsWith("/auth/logout/")) return new Response(null, { status: 204 });
    if (url.endsWith("/todos/")) return new Response("{}", { status: 401 });
    return Response.json({});
  }));
}

// Like main.tsx, but each tab has its own AuthProvider (and so its own
// BroadcastChannel) and its own history, as two browser tabs do.
function openTab(path: string) {
  const { container } = render(
    <StrictMode>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>
      </AuthProvider>
    </StrictMode>,
  );
  return within(container);
}

async function openTwoTabs(firstPath: string, secondPath: string) {
  const first = openTab(firstPath);
  const second = openTab(secondPath);
  const accountMenu = { name: "Account menu for Ada Lovelace" };
  await first.findByRole("button", accountMenu);
  await second.findByRole("button", accountMenu);
  return { first, second, user: userEvent.setup() };
}

beforeEach(() => {
  vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "");
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("App in two tabs", () => {
  it("shows the log in card with the notice in both tabs at / when one signs out", async () => {
    stubAuthServer();
    const { first, second, user } = await openTwoTabs("/", "/");

    await user.click(first.getByRole("button", { name: "Account menu for Ada Lovelace" }));
    await user.click(first.getByRole("button", { name: "Sign out" }));

    for (const tab of [first, second]) {
      const card = await tab.findByRole("region", LOGIN_CARD);
      expect(within(card).getByRole("status")).toHaveTextContent("You've been signed out.");
      expect(tab.queryByRole("heading", LANDING)).not.toBeInTheDocument();
    }
  });

  it("keeps the other tab on its page, with the log in card, when one signs out", async () => {
    stubAuthServer();
    const { first, second, user } = await openTwoTabs("/", "/calendar");

    await user.click(first.getByRole("button", { name: "Account menu for Ada Lovelace" }));
    await user.click(first.getByRole("button", { name: "Sign out" }));

    const card = await second.findByRole("region", LOGIN_CARD);
    expect(within(card).getByRole("status")).toHaveTextContent("You've been signed out.");
    expect(second.queryByText("Calendar page")).not.toBeInTheDocument();
  });

  it("lets each tab leave the notice on its own", async () => {
    stubAuthServer();
    const { first, second, user } = await openTwoTabs("/", "/");
    await user.click(first.getByRole("button", { name: "Account menu for Ada Lovelace" }));
    await user.click(first.getByRole("button", { name: "Sign out" }));
    await second.findByRole("region", LOGIN_CARD);

    await user.click(within(second.getByRole("banner")).getByRole("link", { name: "Features" }));

    expect(second.getByRole("heading", LANDING)).toBeInTheDocument();
    expect(first.getByRole("region", LOGIN_CARD)).toBeInTheDocument();
    expect(first.queryByRole("heading", LANDING)).not.toBeInTheDocument();
  });

  it("shows the expired notice in both tabs at / when one tab's session expires", async () => {
    stubAuthServer({ laterRefreshStatus: 401 });
    const { first, second, user } = await openTwoTabs("/", "/");

    await user.click(first.getByRole("button", { name: "Load tasks" }));

    for (const tab of [first, second]) {
      const card = await tab.findByRole("region", LOGIN_CARD);
      expect(within(card).getByRole("status")).toHaveTextContent(
        "Your session expired. Please sign in again.",
      );
      expect(tab.queryByRole("heading", LANDING)).not.toBeInTheDocument();
    }
  });
});
