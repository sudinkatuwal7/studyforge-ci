import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AuthError,
  type LoginResult,
  type PublicUser,
  login,
  loginWithGoogle,
  register,
} from "../api/auth";
import { useSignInLock } from "../components/auth/useSignInLock";
import RegisterPage from "./RegisterPage";

// App owns the lock in the real page, so give the page a parent that does too.
function RegisterCard({ onSignIn }: { onSignIn: () => void }) {
  const signInLock = useSignInLock();
  return <RegisterPage onSignIn={onSignIn} signInLock={signInLock} />;
}

// Keep the real AuthError class so the page's instanceof checks still work.
vi.mock("../api/auth", async () => {
  const actual = await vi.importActual<typeof import("../api/auth")>("../api/auth");
  return { ...actual, login: vi.fn(), loginWithGoogle: vi.fn(), register: vi.fn() };
});
const { saveLogin } = vi.hoisted(() => ({ saveLogin: vi.fn() }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ saveLogin }) }));

const newUser: PublicUser = { id: 7, email: "new@example.test", first_name: "Ada", last_name: "Lovelace" };
const loginResult: LoginResult = { access: "access-token", user: newUser };

type FormValues = {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
};

async function fillAndSubmit(values: FormValues) {
  const user = userEvent.setup();
  const fields: [string, string | undefined][] = [
    ["First name", values.firstName],
    ["Last name", values.lastName],
    ["Email address", values.email],
    ["Password", values.password],
    ["Confirm password", values.confirmPassword],
  ];
  // paste() fills each field in one input event. type() sends one per character and is slow.
  for (const [label, value] of fields) {
    if (value) {
      await user.click(screen.getByLabelText(label));
      await user.paste(value);
    }
  }
  await user.click(screen.getByRole("button", { name: "Create account" }));
  return user;
}

const validForm: FormValues = {
  firstName: " Ada ",
  lastName: "Lovelace",
  email: "New@Example.test",
  password: "analytical-engine",
  confirmPassword: "analytical-engine",
};

describe("RegisterPage errors from Google and the form", () => {
  // A fake window.google, so the test can play the part of Google's popup.
  async function renderWithGoogle() {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "client-id.apps.googleusercontent.com");
    const initialize = vi.fn<GoogleAccountsId["initialize"]>();
    const renderButton = vi.fn<GoogleAccountsId["renderButton"]>();
    window.google = { accounts: { id: { initialize, renderButton } } };

    render(<RegisterCard onSignIn={vi.fn()} />);
    await vi.waitFor(() => expect(renderButton).toHaveBeenCalled());

    return {
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

  it("sends nothing to Google's endpoint while the form's requests are running", async () => {
    let finishRegister: (user: PublicUser) => void = () => {};
    vi.mocked(register).mockReturnValue(
      new Promise((resolve) => {
        finishRegister = resolve;
      }),
    );
    vi.mocked(login).mockResolvedValue(loginResult);
    const { chooseGoogleAccount } = await renderWithGoogle();
    const slot = document.querySelector(".auth-google-slot");

    await fillAndSubmit(validForm);
    expect(slot).toHaveAttribute("inert");
    await chooseGoogleAccount();
    expect(loginWithGoogle).not.toHaveBeenCalled();

    await act(async () => finishRegister(newUser));
    expect(saveLogin).toHaveBeenCalledTimes(1);
    expect(saveLogin).toHaveBeenCalledWith(loginResult);
    // App outlives this card, so a later sign-in after signing out must not be blocked.
    expect(slot).not.toHaveAttribute("inert");
  });

  it("keeps Google blocked from register() succeeding until automatic login finishes", async () => {
    vi.mocked(register).mockResolvedValue(newUser);
    let finishLogin: (result: LoginResult) => void = () => {};
    vi.mocked(login).mockReturnValue(
      new Promise((resolve) => {
        finishLogin = resolve;
      }),
    );
    const { chooseGoogleAccount } = await renderWithGoogle();
    const slot = document.querySelector(".auth-google-slot");

    await fillAndSubmit(validForm);

    // The account exists and login() is running: this is when its cookie arrives.
    expect(login).toHaveBeenCalledTimes(1);
    expect(slot).toHaveAttribute("inert");
    await chooseGoogleAccount();
    expect(loginWithGoogle).not.toHaveBeenCalled();

    await act(async () => finishLogin(loginResult));
    expect(saveLogin).toHaveBeenCalledTimes(1);
    expect(saveLogin).toHaveBeenCalledWith(loginResult);
    expect(slot).not.toHaveAttribute("inert");
  });


  it("sends no sign-up while a Google request is running", async () => {
    let finishGoogle: (result: LoginResult) => void = () => {};
    vi.mocked(loginWithGoogle).mockReturnValue(
      new Promise((resolve) => {
        finishGoogle = resolve;
      }),
    );
    const { chooseGoogleAccount } = await renderWithGoogle();

    await chooseGoogleAccount();
    const createAccount = screen.getByRole("button", { name: "Create account" });
    expect(createAccount).toBeDisabled();
    // Fill in a valid form and submit it directly, so only the lock can stop it.
    await fillAndSubmit(validForm);
    await act(async () => fireEvent.submit(createAccount.closest("form")!));
    expect(register).not.toHaveBeenCalled();

    await act(async () => finishGoogle(loginResult));
    expect(saveLogin).toHaveBeenCalledTimes(1);
  });

  it("clears a Google error when the form is submitted", async () => {
    vi.mocked(loginWithGoogle).mockRejectedValue(
      new AuthError("credentials", "An account with this email already exists."),
    );
    const { chooseGoogleAccount } = await renderWithGoogle();

    await chooseGoogleAccount();
    expect(screen.getByRole("alert")).toHaveTextContent("An account with this email already exists.");

    await fillAndSubmit({});

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("replaces a form error when a Google sign-in fails", async () => {
    vi.mocked(register).mockRejectedValue(new AuthError("unavailable", "Something went wrong on our side."));
    vi.mocked(loginWithGoogle).mockRejectedValue(
      new AuthError("credentials", "An account with this email already exists."),
    );
    const { chooseGoogleAccount } = await renderWithGoogle();

    await fillAndSubmit({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "new@example.test",
      password: "EveningRivers!8462",
      confirmPassword: "EveningRivers!8462",
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong on our side.");

    await chooseGoogleAccount();

    expect(screen.getByRole("alert")).toHaveTextContent("An account with this email already exists.");
  });
});

describe("RegisterPage", () => {
  it("checks password length and match before calling the API", async () => {
    render(<RegisterCard onSignIn={vi.fn()} />);

    await fillAndSubmit({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "new@example.test",
      password: "short",
      confirmPassword: "shorter",
    });

    expect(screen.getByText("Use at least 8 characters.")).toBeInTheDocument();
    expect(screen.getByText("Passwords don't match.")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveFocus();
    expect(register).not.toHaveBeenCalled();
  });

  it("requires first and last name before calling the API", async () => {
    render(<RegisterCard onSignIn={vi.fn()} />);

    await fillAndSubmit({ ...validForm, firstName: "   ", lastName: undefined });

    expect(screen.getByText("Enter your first name.")).toBeInTheDocument();
    expect(screen.getByText("Enter your last name.")).toBeInTheDocument();
    expect(screen.getByLabelText("First name")).toHaveFocus();
    expect(register).not.toHaveBeenCalled();
  });

  it("shows backend errors under their fields and clears one when edited", async () => {
    vi.mocked(register).mockRejectedValue(
      new AuthError("validation", "Please fix the highlighted fields.", {
        email: ["An account with this email already exists."],
        password: ["This password is too common."],
      }),
    );
    render(<RegisterCard onSignIn={vi.fn()} />);

    const user = await fillAndSubmit(validForm);

    expect(await screen.findByText("An account with this email already exists.")).toBeInTheDocument();
    expect(screen.getByText("This password is too common.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Please fix the highlighted fields.");
    expect(screen.getByLabelText("Email address")).toHaveFocus();

    await user.type(screen.getByLabelText("Email address"), "x");
    expect(screen.queryByText("An account with this email already exists.")).not.toBeInTheDocument();
    expect(screen.getByText("This password is too common.")).toBeInTheDocument();
  });

  it("shows backend errors that are not tied to a field in the alert", async () => {
    vi.mocked(register).mockRejectedValue(
      new AuthError("validation", "Please fix the highlighted fields.", {
        non_field_errors: ["Registration is closed."],
      }),
    );
    render(<RegisterCard onSignIn={vi.fn()} />);

    await fillAndSubmit(validForm);

    expect(await screen.findByRole("alert")).toHaveTextContent("Registration is closed.");
  });

  it("creates the account, then logs in with the saved email", async () => {
    let finishRegister: (user: PublicUser) => void = () => undefined;
    vi.mocked(register).mockReturnValue(new Promise((resolve) => (finishRegister = resolve)));
    vi.mocked(login).mockResolvedValue(loginResult);
    render(<RegisterCard onSignIn={vi.fn()} />);

    await fillAndSubmit(validForm);

    expect(screen.getByRole("button", { name: /Creating account/ })).toBeDisabled();
    expect(register).toHaveBeenCalledWith({
      email: "New@Example.test",
      password: "analytical-engine",
      first_name: "Ada",
      last_name: "Lovelace",
    });

    finishRegister(newUser);
    await vi.waitFor(() => expect(saveLogin).toHaveBeenCalledWith(loginResult));
    expect(login).toHaveBeenCalledWith("new@example.test", "analytical-engine");
  });

  it("asks the user to log in if automatic login fails", async () => {
    vi.mocked(register).mockResolvedValue(newUser);
    vi.mocked(login).mockRejectedValue(new AuthError("unavailable", "Something went wrong."));
    render(<RegisterCard onSignIn={vi.fn()} />);

    await fillAndSubmit(validForm);

    expect(await screen.findByRole("alert")).toHaveTextContent(/account was created/);
    expect(screen.getByRole("button", { name: "Create account" })).toBeEnabled();
    expect(saveLogin).not.toHaveBeenCalled();
  });

  it("switches back to the log in card", async () => {
    const user = userEvent.setup();
    const onSignIn = vi.fn();
    render(<RegisterCard onSignIn={onSignIn} />);

    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(onSignIn).toHaveBeenCalledOnce();
  });
});
