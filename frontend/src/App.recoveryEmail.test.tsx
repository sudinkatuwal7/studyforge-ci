import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError, type PublicUser, login, register } from "./api/auth";
import App from "./App";

vi.mock("./api/auth", async () => {
  const actual = await vi.importActual<typeof import("./api/auth")>("./api/auth");
  return { ...actual, login: vi.fn(), register: vi.fn() };
});
vi.mock("./api/health", () => ({
  getHealth: () => Promise.resolve({ status: "ok" }),
}));
vi.mock("./pages/DashboardPage", () => ({ default: () => <p>Dashboard</p> }));
const { auth } = vi.hoisted(() => ({ auth: { user: null as PublicUser | null } }));
vi.mock("./context/AuthContext", () => ({
  useAuth: () => ({
    user: auth.user,
    isRestoring: false,
    isSigningOut: false,
    signedOutReason: null,
    signOut: vi.fn(),
    saveLogin: vi.fn(),
  }),
}));

const savedUser: PublicUser = { id: 7, email: "new@example.test", first_name: "Ada", last_name: "Lovelace" };

function renderApp() {
  // A new element each time: React skips re-rendering an identical one.
  const tree = () => (
    <MemoryRouter>
      <App />
    </MemoryRouter>
  );
  const { rerender } = render(tree());
  return () => rerender(tree());
}

async function signUpWithFailedLogin() {
  vi.mocked(register).mockResolvedValue(savedUser);
  vi.mocked(login).mockRejectedValue(new AuthError("unavailable", "Something went wrong."));
  const user = userEvent.setup();

  await user.click(screen.getByRole("button", { name: "Start free" }));
  const fields: [string, string][] = [
    ["First name", "Ada"],
    ["Last name", "Lovelace"],
    ["Email address", "New@Example.test"],
    ["Password", "analytical-engine"],
    ["Confirm password", "analytical-engine"],
  ];
  for (const [label, value] of fields) {
    await user.click(screen.getByLabelText(label));
    await user.paste(value);
  }
  await user.click(screen.getByRole("button", { name: "Create account" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Your account was created");
  return user;
}

beforeEach(() => {
  auth.user = null;
  // No Google button is needed here: it shows as unavailable.
  vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("App after a sign-up whose automatic login failed", () => {
  it("prefills the saved lowercase email from the card's Log in link", async () => {
    renderApp();
    const user = await signUpWithFailedLogin();

    const card = screen.getByRole("region", { name: "Create your account" });
    await user.click(within(card).getByRole("button", { name: "Log in" }));

    expect(screen.getByLabelText("Email address")).toHaveValue("new@example.test");
    expect(screen.getByLabelText("Password")).toHaveValue("");
  });

  it("prefills it from the header's Log in button too", async () => {
    renderApp();
    const user = await signUpWithFailedLogin();

    const header = screen.getByRole("banner");
    await user.click(within(header).getByRole("button", { name: "Log in" }));

    expect(screen.getByLabelText("Email address")).toHaveValue("new@example.test");
  });

  it("leaves the email empty on a first visit", () => {
    renderApp();

    expect(screen.getByLabelText("Email address")).toHaveValue("");
  });

  it("forgets the email once someone has signed in", async () => {
    const rerender = renderApp();
    await signUpWithFailedLogin();

    auth.user = savedUser;
    rerender();
    await act(async () => {});
    auth.user = null;
    rerender();

    expect(screen.getByLabelText("Email address")).toHaveValue("");
  });
});
