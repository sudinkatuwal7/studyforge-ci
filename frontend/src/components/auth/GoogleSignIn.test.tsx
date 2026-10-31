import { act, render, screen } from "@testing-library/react";
import { type ComponentProps, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError, type LoginResult, loginWithGoogle } from "../../api/auth";
import GoogleSignIn from "./GoogleSignIn";
import { useSignInLock } from "./useSignInLock";

// Keep the real AuthError class so the component's instanceof check still works.
vi.mock("../../api/auth", async () => {
  const actual = await vi.importActual<typeof import("../../api/auth")>("../../api/auth");
  return { ...actual, loginWithGoogle: vi.fn() };
});
const { saveLogin } = vi.hoisted(() => ({ saveLogin: vi.fn() }));
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ saveLogin }),
}));

const loginResult: LoginResult = {
  access: "access-token",
  user: { id: 7, email: "sam.student@gmail.com", first_name: "Sam", last_name: "Student" },
};

// A fake window.google, so no script is loaded and the test can play Google's part.
function stubGoogleIdentity() {
  const googleId = {
    initialize: vi.fn<GoogleAccountsId["initialize"]>(),
    renderButton: vi.fn<GoogleAccountsId["renderButton"]>(),
  };
  window.google = { accounts: { id: googleId } };
  return {
    googleId,
    // What Google does when the user picks an account in its popup.
    async chooseAccount(credential = "google-id-token") {
      const { callback } = googleId.initialize.mock.calls[0][0];
      await act(async () => callback({ credential }));
    },
  };
}

// The pages own the error text, so give the component a parent that does too.
function GoogleSignInWithError({ text }: Pick<ComponentProps<typeof GoogleSignIn>, "text">) {
  const [error, setError] = useState("");
  const signInLock = useSignInLock();
  return <GoogleSignIn text={text} error={error} onError={setError} signInLock={signInLock} />;
}

beforeEach(() => {
  vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "client-id.apps.googleusercontent.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete window.google;
});

describe("GoogleSignIn", () => {
  it("renders Google's button with our client ID and wording", async () => {
    const { googleId } = stubGoogleIdentity();

    render(<GoogleSignInWithError text="signup_with" />);

    await vi.waitFor(() => expect(googleId.renderButton).toHaveBeenCalled());
    expect(googleId.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: "client-id.apps.googleusercontent.com",
        context: "signup",
        ux_mode: "popup",
      }),
    );
    const [slot, options] = googleId.renderButton.mock.calls[0];
    expect(slot).toBeInstanceOf(HTMLDivElement);
    expect(options).toEqual(expect.objectContaining({ text: "signup_with" }));
  });

  it("signs in with the credential Google returns", async () => {
    vi.mocked(loginWithGoogle).mockResolvedValue(loginResult);
    const google = stubGoogleIdentity();
    render(<GoogleSignInWithError text="continue_with" />);
    await vi.waitFor(() => expect(google.googleId.renderButton).toHaveBeenCalled());

    await google.chooseAccount("google-id-token");

    expect(loginWithGoogle).toHaveBeenCalledWith("google-id-token");
    expect(saveLogin).toHaveBeenCalledWith(loginResult);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each([
    "An account with this email already exists.",
    "This account has been deactivated.",
  ])("shows the backend's reason when sign-in is refused: %s", async (message) => {
    vi.mocked(loginWithGoogle).mockRejectedValue(new AuthError("credentials", message));
    const google = stubGoogleIdentity();
    render(<GoogleSignInWithError text="continue_with" />);
    await vi.waitFor(() => expect(google.googleId.renderButton).toHaveBeenCalled());

    await google.chooseAccount();

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(saveLogin).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows a generic message for an unexpected error", async () => {
    vi.mocked(loginWithGoogle).mockRejectedValue(new Error("boom"));
    const google = stubGoogleIdentity();
    render(<GoogleSignInWithError text="continue_with" />);
    await vi.waitFor(() => expect(google.googleId.renderButton).toHaveBeenCalled());

    await google.chooseAccount();

    expect(screen.getByRole("alert")).toHaveTextContent("Google sign-in failed. Please try again.");
  });

  it("ignores a second credential while the first is being sent", async () => {
    let finish: (result: LoginResult) => void = () => {};
    vi.mocked(loginWithGoogle).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const google = stubGoogleIdentity();
    render(<GoogleSignInWithError text="continue_with" />);
    await vi.waitFor(() => expect(google.googleId.renderButton).toHaveBeenCalled());

    await google.chooseAccount("first");
    expect(screen.getByRole("status")).toHaveTextContent("Signing in with Google...");
    await google.chooseAccount("second");
    await act(async () => finish(loginResult));

    expect(loginWithGoogle).toHaveBeenCalledTimes(1);
    expect(loginWithGoogle).toHaveBeenCalledWith("first");
    expect(saveLogin).toHaveBeenCalledTimes(1);
  });

  it("ignores a credential that arrives after the card has gone", async () => {
    const google = stubGoogleIdentity();
    const { unmount } = render(<GoogleSignInWithError text="continue_with" />);
    await vi.waitFor(() => expect(google.googleId.renderButton).toHaveBeenCalled());

    unmount();
    await google.chooseAccount();

    expect(loginWithGoogle).not.toHaveBeenCalled();
    expect(saveLogin).not.toHaveBeenCalled();
  });

  it("lets the user try again after a failure", async () => {
    vi.mocked(loginWithGoogle)
      .mockRejectedValueOnce(new AuthError("unavailable", "Google sign-in is not available right now."))
      .mockResolvedValueOnce(loginResult);
    const google = stubGoogleIdentity();
    render(<GoogleSignInWithError text="continue_with" />);
    await vi.waitFor(() => expect(google.googleId.renderButton).toHaveBeenCalled());

    await google.chooseAccount();
    await google.chooseAccount();

    expect(loginWithGoogle).toHaveBeenCalledTimes(2);
    expect(saveLogin).toHaveBeenCalledWith(loginResult);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a disabled button when no client ID is configured", () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "");
    const { googleId } = stubGoogleIdentity();

    render(<GoogleSignInWithError text="continue_with" />);

    expect(screen.getByRole("button", { name: /Continue with Google/ })).toBeDisabled();
    expect(googleId.initialize).not.toHaveBeenCalled();
  });

  it("shows a disabled button when Google's script cannot load", async () => {
    render(<GoogleSignInWithError text="continue_with" />);

    const script = document.head.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]',
    );
    expect(script).not.toBeNull();
    await act(async () => script?.dispatchEvent(new Event("error")));

    expect(screen.getByRole("button", { name: /Continue with Google/ })).toBeDisabled();
    // The failed script is removed so a later attempt can load it again.
    expect(script?.isConnected).toBe(false);
  });
});
