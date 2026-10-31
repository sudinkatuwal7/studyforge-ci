import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type LoginResult, login, loginWithGoogle } from "./api/auth";
import App from "./App";

vi.mock("./api/auth", async () => {
  const actual = await vi.importActual<typeof import("./api/auth")>("./api/auth");
  return { ...actual, login: vi.fn(), loginWithGoogle: vi.fn() };
});
vi.mock("./api/health", () => ({
  getHealth: () => Promise.resolve({ status: "ok" }),
}));
const { saveLogin } = vi.hoisted(() => ({ saveLogin: vi.fn() }));
vi.mock("./context/AuthContext", () => ({
  useAuth: () => ({
    user: null,
    isRestoring: false,
    isSigningOut: false,
    signedOutReason: null,
    signOut: vi.fn(),
    saveLogin,
  }),
}));

const loginResult: LoginResult = {
  access: "access-token",
  user: { id: 1, email: "student@example.test", first_name: "Ada", last_name: "" },
};

beforeEach(() => {
  vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "client-id.apps.googleusercontent.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete window.google;
});

describe("App sign-in lock", () => {
  it("keeps blocking Google when the user switches cards during a password login", async () => {
    let finishPassword: (result: LoginResult) => void = () => {};
    vi.mocked(login).mockReturnValue(
      new Promise((resolve) => {
        finishPassword = resolve;
      }),
    );
    const initialize = vi.fn<GoogleAccountsId["initialize"]>();
    const renderButton = vi.fn<GoogleAccountsId["renderButton"]>();
    window.google = { accounts: { id: { initialize, renderButton } } };
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    await vi.waitFor(() => expect(renderButton).toHaveBeenCalledTimes(1));

    // Start a password login on the log in card.
    await user.click(screen.getByLabelText("Email address"));
    await user.paste("student@example.test");
    await user.click(screen.getByLabelText("Password"));
    await user.paste("correct-password");
    const card = screen.getByRole("region", { name: "Log in to StudyForge" });
    await user.click(within(card).getByRole("button", { name: "Log in" }));
    expect(login).toHaveBeenCalledTimes(1);

    // Switch cards while it runs, then complete Google on the new card.
    await user.click(screen.getByRole("button", { name: "Start free" }));
    await vi.waitFor(() => expect(renderButton).toHaveBeenCalledTimes(2));
    expect(document.querySelector(".auth-google-slot")).toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "Create account" })).toBeDisabled();

    const { callback } = initialize.mock.calls[1][0];
    await act(async () => callback({ credential: "google-id-token" }));
    expect(loginWithGoogle).not.toHaveBeenCalled();

    // The password login still finishes, and nothing else competes with it.
    await act(async () => finishPassword(loginResult));
    expect(saveLogin).toHaveBeenCalledTimes(1);
    expect(saveLogin).toHaveBeenCalledWith(loginResult);
    expect(document.querySelector(".auth-google-slot")).not.toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "Create account" })).toBeEnabled();
  });
});
