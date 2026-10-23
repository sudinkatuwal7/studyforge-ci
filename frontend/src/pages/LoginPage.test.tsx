import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthError, type LoginResult, login } from "../api/auth";
import LoginPage from "./LoginPage";

// Keep the real AuthError class so the page's instanceof checks still work.
vi.mock("../api/auth", async () => {
  const actual = await vi.importActual<typeof import("../api/auth")>("../api/auth");
  return { ...actual, login: vi.fn() };
});
const { saveLogin } = vi.hoisted(() => ({ saveLogin: vi.fn() }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ saveLogin }) }));

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

describe("LoginPage", () => {
  it("shows field errors and focuses the email field when submitted empty", async () => {
    render(<LoginPage />);

    await fillAndSubmit("", "");

    expect(screen.getByText("Enter your email address.")).toBeInTheDocument();
    expect(screen.getByText("Enter your password.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Email address")).toHaveFocus();
    expect(login).not.toHaveBeenCalled();
  });

  it("rejects a malformed email before calling the API", async () => {
    render(<LoginPage />);

    await fillAndSubmit("not-an-email", "secret123");

    expect(screen.getByText(/Enter a valid email address/)).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it("shows a loading state, then saves the session on success", async () => {
    let finishLogin: (result: LoginResult) => void = () => undefined;
    vi.mocked(login).mockReturnValue(new Promise((resolve) => (finishLogin = resolve)));
    render(<LoginPage />);

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
    render(<LoginPage />);

    await fillAndSubmit("student@example.test", "wrong-password");

    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect email or password.");
    expect(saveLogin).not.toHaveBeenCalled();
  });

  it("shows a connection error separately from bad credentials", async () => {
    vi.mocked(login).mockRejectedValue(
      new AuthError("unavailable", "We couldn't reach StudyForge. Check your connection and try again."),
    );
    render(<LoginPage />);

    await fillAndSubmit("student@example.test", "secret123");

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't reach StudyForge/);
  });

  it("toggles password visibility", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    const password = screen.getByLabelText("Password");

    expect(password).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(password).toHaveAttribute("type", "password");
  });

  it("shows the sign up link only when a handler is provided", async () => {
    const user = userEvent.setup();
    const onCreateAccount = vi.fn();
    const { rerender } = render(<LoginPage />);

    expect(screen.queryByRole("button", { name: "Sign up" })).not.toBeInTheDocument();

    rerender(<LoginPage onCreateAccount={onCreateAccount} />);
    await user.click(screen.getByRole("button", { name: "Sign up" }));
    expect(onCreateAccount).toHaveBeenCalledOnce();
  });
});
