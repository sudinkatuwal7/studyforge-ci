import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthError, type LoginResult, type PublicUser, login, register } from "../api/auth";
import RegisterPage from "./RegisterPage";

// Keep the real AuthError class so the page's instanceof checks still work.
vi.mock("../api/auth", async () => {
  const actual = await vi.importActual<typeof import("../api/auth")>("../api/auth");
  return { ...actual, login: vi.fn(), register: vi.fn() };
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
    ["First name (optional)", values.firstName],
    ["Last name (optional)", values.lastName],
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

describe("RegisterPage", () => {
  it("checks password length and match before calling the API", async () => {
    render(<RegisterPage onSignIn={vi.fn()} />);

    await fillAndSubmit({ email: "new@example.test", password: "short", confirmPassword: "shorter" });

    expect(screen.getByText("Use at least 8 characters.")).toBeInTheDocument();
    expect(screen.getByText("Passwords don't match.")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveFocus();
    expect(register).not.toHaveBeenCalled();
  });

  it("shows backend errors under their fields and clears one when edited", async () => {
    vi.mocked(register).mockRejectedValue(
      new AuthError("validation", "Please fix the highlighted fields.", {
        email: ["An account with this email already exists."],
        password: ["This password is too common."],
      }),
    );
    render(<RegisterPage onSignIn={vi.fn()} />);

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
    render(<RegisterPage onSignIn={vi.fn()} />);

    await fillAndSubmit(validForm);

    expect(await screen.findByRole("alert")).toHaveTextContent("Registration is closed.");
  });

  it("creates the account, then logs in with the saved email", async () => {
    let finishRegister: (user: PublicUser) => void = () => undefined;
    vi.mocked(register).mockReturnValue(new Promise((resolve) => (finishRegister = resolve)));
    vi.mocked(login).mockResolvedValue(loginResult);
    render(<RegisterPage onSignIn={vi.fn()} />);

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
    render(<RegisterPage onSignIn={vi.fn()} />);

    await fillAndSubmit(validForm);

    expect(await screen.findByRole("alert")).toHaveTextContent(/account was created/);
    expect(screen.getByRole("button", { name: "Create account" })).toBeEnabled();
    expect(saveLogin).not.toHaveBeenCalled();
  });

  it("switches back to the log in card", async () => {
    const user = userEvent.setup();
    const onSignIn = vi.fn();
    render(<RegisterPage onSignIn={onSignIn} />);

    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(onSignIn).toHaveBeenCalledOnce();
  });
});
