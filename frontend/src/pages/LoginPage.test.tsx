import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError, type LoginResult, login, loginWithGoogle } from "../api/auth";
import type { SignedOutReason } from "../context/AuthContext";
import { useSignInLock } from "../components/auth/useSignInLock";
import LoginPage from "./LoginPage";

// App owns the lock in the real page, so give the page a parent that does too.
function LoginCard({ onCreateAccount }: { onCreateAccount?: () => void }) {
  const signInLock = useSignInLock();
  return <LoginPage onCreateAccount={onCreateAccount} signInLock={signInLock} />;
}

// Keep the real AuthError class so the page's instanceof checks still work.
vi.mock("../api/auth", async () => {
  const actual = await vi.importActual<typeof import("../api/auth")>("../api/auth");
  return { ...actual, login: vi.fn(), loginWithGoogle: vi.fn() };
});
const { saveLogin, auth } = vi.hoisted(() => ({
  saveLogin: vi.fn(),
  auth: { signedOutReason: null as SignedOutReason | null },
}));
vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ saveLogin, signedOutReason: auth.signedOutReason }),
}));

beforeEach(() => {
  auth.signedOutReason = null;
});

const loginResult: LoginResult = {
  access: "access-token",
  user: { id: 1, email: "student@example.test", first_name: "Ada", last_name: "" },
};

async function fillAndSubmit(email: string, password: string) {
  const user = userEvent.setup();
  // paste() fills each field in one input event. type() sends one per character and is slow.
  if (email) {
    await user.click(screen.getByLabelText("Email address"));
    await user.paste(email);
  }
  if (password) {
    await user.click(screen.getByLabelText("Password"));
    await user.paste(password);
  }
  await user.click(screen.getByRole("button", { name: "Log in" }));
  return user;
}

describe("LoginPage errors from Google and the form", () => {
  // A fake window.google, so the test can play the part of Google's popup.
  async function renderWithGoogle() {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "client-id.apps.googleusercontent.com");
    const initialize = vi.fn<GoogleAccountsId["initialize"]>();
    const renderButton = vi.fn<GoogleAccountsId["renderButton"]>();
    window.google = { accounts: { id: { initialize, renderButton } } };

    render(<LoginCard />);
    await vi.waitFor(() => expect(renderButton).toHaveBeenCalled());

    return {
      clickGoogleButton() {
        act(() => renderButton.mock.calls[0][1].click_listener?.());
      },
      async chooseGoogleAccount() {
        const { callback } = initialize.mock.calls[0][0];
        await act(async () => callback({ credential: "google-id-token" }));
      },
    };
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    delete window.google;
  });

  it("blocks the form while a Google request is running", async () => {
    let finishGoogle: (result: LoginResult) => void = () => {};
    vi.mocked(loginWithGoogle).mockReturnValue(
      new Promise((resolve) => {
        finishGoogle = resolve;
      }),
    );
    const { chooseGoogleAccount } = await renderWithGoogle();

    await chooseGoogleAccount();

    const logIn = screen.getByRole("button", { name: "Log in" });
    expect(logIn).toBeDisabled();
    // Fill in a valid form and submit it directly, so only the lock can stop it.
    await fillAndSubmit("student@example.test", "correct-password");
    await act(async () => fireEvent.submit(logIn.closest("form")!));
    expect(login).not.toHaveBeenCalled();

    await act(async () => finishGoogle(loginResult));
    expect(saveLogin).toHaveBeenCalledTimes(1);
    // App outlives this card, so a later sign-in after signing out must not be blocked.
    expect(logIn).toBeEnabled();
  });

  it("blocks Google while the password request is running", async () => {
    let failPassword: (error: AuthError) => void = () => {};
    vi.mocked(login).mockReturnValue(
      new Promise((_resolve, reject) => {
        failPassword = reject;
      }),
    );
    const { chooseGoogleAccount } = await renderWithGoogle();
    const slot = document.querySelector(".auth-google-slot");

    await fillAndSubmit("student@example.test", "wrong-password");

    // jsdom does not enforce inert, so a browser check must confirm the click is blocked.
    expect(slot).toHaveAttribute("inert");
    // A popup opened before the form was submitted can still return.
    await chooseGoogleAccount();
    expect(loginWithGoogle).not.toHaveBeenCalled();

    await act(async () => failPassword(new AuthError("credentials", "Incorrect email or password.")));
    expect(screen.getByRole("alert")).toHaveTextContent("Incorrect email or password.");
    expect(slot).not.toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "Log in" })).toBeEnabled();
  });

  it("shows only the current attempt's result when switching between methods", async () => {
    const incorrectPassword = new AuthError("credentials", "Incorrect email or password.");
    const emailTaken = new AuthError("credentials", "An account with this email already exists.");
    let failGoogle: (error: AuthError) => void = () => {};
    vi.mocked(login).mockRejectedValue(incorrectPassword);
    vi.mocked(loginWithGoogle).mockReturnValue(
      new Promise((_resolve, reject) => {
        failGoogle = reject;
      }),
    );
    const { clickGoogleButton, chooseGoogleAccount } = await renderWithGoogle();

    // Password attempt fails.
    const user = await fillAndSubmit("student@example.test", "wrong-password");
    expect(screen.getByRole("alert")).toHaveTextContent("Incorrect email or password.");

    // Clicking Google starts a new attempt, while its popup is still open.
    clickGoogleButton();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    // Google returns an account and StudyForge is still answering.
    await chooseGoogleAccount();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Signing in with Google...");

    // getByRole throws if more than one alert is showing.
    await act(async () => failGoogle(emailTaken));
    expect(screen.getByRole("alert")).toHaveTextContent("An account with this email already exists.");

    // Back to the password form: only its own result remains.
    await user.click(screen.getByRole("button", { name: "Log in" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Incorrect email or password.");
  });

  it("replaces a Google error when the form is submitted", async () => {
    vi.mocked(loginWithGoogle).mockRejectedValue(
      new AuthError("credentials", "An account with this email already exists."),
    );
    vi.mocked(login).mockRejectedValue(new AuthError("credentials", "Incorrect email or password."));
    const { chooseGoogleAccount } = await renderWithGoogle();

    await chooseGoogleAccount();
    expect(screen.getByRole("alert")).toHaveTextContent("An account with this email already exists.");

    await fillAndSubmit("student@example.test", "wrong-password");

    expect(screen.getByRole("alert")).toHaveTextContent("Incorrect email or password.");
  });

  it("clears a Google error when the form fails its own validation", async () => {
    vi.mocked(loginWithGoogle).mockRejectedValue(
      new AuthError("credentials", "An account with this email already exists."),
    );
    const { chooseGoogleAccount } = await renderWithGoogle();

    await chooseGoogleAccount();
    await fillAndSubmit("", "");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("replaces a form error when a Google sign-in fails", async () => {
    vi.mocked(login).mockRejectedValue(new AuthError("credentials", "Incorrect email or password."));
    vi.mocked(loginWithGoogle).mockRejectedValue(
      new AuthError("credentials", "An account with this email already exists."),
    );
    const { chooseGoogleAccount } = await renderWithGoogle();

    await fillAndSubmit("student@example.test", "wrong-password");
    expect(screen.getByRole("alert")).toHaveTextContent("Incorrect email or password.");

    await chooseGoogleAccount();

    expect(screen.getByRole("alert")).toHaveTextContent("An account with this email already exists.");
  });
});

describe("LoginPage", () => {
  it("shows field errors and focuses the email field when submitted empty", async () => {
    render(<LoginCard />);

    await fillAndSubmit("", "");

    expect(screen.getByText("Enter your email address.")).toBeInTheDocument();
    expect(screen.getByText("Enter your password.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Email address")).toHaveFocus();
    expect(login).not.toHaveBeenCalled();
  });

  it("rejects a malformed email before calling the API", async () => {
    render(<LoginCard />);

    await fillAndSubmit("not-an-email", "secret123");

    expect(screen.getByText(/Enter a valid email address/)).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it("shows a loading state, then saves the session on success", async () => {
    let finishLogin: (result: LoginResult) => void = () => undefined;
    vi.mocked(login).mockReturnValue(new Promise((resolve) => (finishLogin = resolve)));
    render(<LoginCard />);

    await fillAndSubmit("  student@example.test ", "secret123");

    const submit = screen.getByRole("button", { name: /Logging in/ });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute("aria-busy", "true");
    expect(login).toHaveBeenCalledWith("student@example.test", "secret123");

    finishLogin(loginResult);
    expect(await screen.findByRole("button", { name: "Log in" })).toBeEnabled();
    expect(saveLogin).toHaveBeenCalledWith(loginResult);
  });

  it("shows the credentials error from the API", async () => {
    vi.mocked(login).mockRejectedValue(
      new AuthError("credentials", "Incorrect email or password."),
    );
    render(<LoginCard />);

    await fillAndSubmit("student@example.test", "wrong-password");

    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect email or password.");
    expect(saveLogin).not.toHaveBeenCalled();
  });

  it("shows a connection error separately from bad credentials", async () => {
    vi.mocked(login).mockRejectedValue(
      new AuthError("unavailable", "We couldn't reach StudyForge. Check your connection and try again."),
    );
    render(<LoginCard />);

    await fillAndSubmit("student@example.test", "secret123");

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't reach StudyForge/);
  });

  it("toggles password visibility", async () => {
    const user = userEvent.setup();
    render(<LoginCard />);
    const password = screen.getByLabelText("Password");

    expect(password).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(password).toHaveAttribute("type", "password");
  });

  it.each([
    { reason: "signed_out" as const, message: "You've been signed out." },
    { reason: "expired" as const, message: "Your session expired. Please sign in again." },
  ])("explains a $reason session end", ({ reason, message }) => {
    auth.signedOutReason = reason;

    render(<LoginCard />);

    expect(screen.getByRole("status")).toHaveTextContent(message);
  });

  it("shows no notice on a first visit", () => {
    render(<LoginCard />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("replaces the notice with a login error", async () => {
    auth.signedOutReason = "expired";
    vi.mocked(login).mockRejectedValue(new AuthError("credentials", "Incorrect email or password."));
    render(<LoginCard />);

    await fillAndSubmit("student@example.test", "wrong-password");

    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect email or password.");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the sign up link only when a handler is provided", async () => {
    const user = userEvent.setup();
    const onCreateAccount = vi.fn();
    const { rerender } = render(<LoginCard />);

    expect(screen.queryByRole("button", { name: "Sign up" })).not.toBeInTheDocument();

    rerender(<LoginCard onCreateAccount={onCreateAccount} />);
    await user.click(screen.getByRole("button", { name: "Sign up" }));
    expect(onCreateAccount).toHaveBeenCalledOnce();
  });
});
