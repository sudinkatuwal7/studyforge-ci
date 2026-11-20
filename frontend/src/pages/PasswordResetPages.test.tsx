import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthError,
  InvalidPasswordResetLinkError,
  confirmPasswordReset,
  requestPasswordReset,
  validatePasswordResetLink,
  type PublicUser,
} from "../api/auth";
import ForgotPasswordPage from "./ForgotPasswordPage";
import ResetPasswordPage from "./ResetPasswordPage";

vi.mock("../api/auth", async () => {
  const actual = await vi.importActual<typeof import("../api/auth")>("../api/auth");
  return {
    ...actual,
    requestPasswordReset: vi.fn(),
    validatePasswordResetLink: vi.fn(),
    confirmPasswordReset: vi.fn(),
  };
});

const { auth, signOut } = vi.hoisted(() => ({
  auth: { user: null as PublicUser | null },
  signOut: vi.fn(async () => {}),
}));
vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: auth.user, signOut }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = null;
  vi.mocked(requestPasswordReset).mockResolvedValue();
  vi.mocked(validatePasswordResetLink).mockResolvedValue(true);
  vi.mocked(confirmPasswordReset).mockResolvedValue();
});

function renderRequest() {
  render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>);
}

function renderReset(uid: string | undefined = "uid123", token: string | undefined = "token123") {
  render(<MemoryRouter><ResetPasswordPage uid={uid} token={token} /></MemoryRouter>);
}

async function fillResetForm() {
  const user = userEvent.setup();
  await user.click(await screen.findByLabelText("New password"));
  await user.paste("EveningRivers!8462");
  await user.click(screen.getByLabelText("Confirm new password"));
  await user.paste("EveningRivers!8462");
  await user.click(screen.getByRole("button", { name: "Save new password" }));
}

describe("ForgotPasswordPage", () => {
  it("validates the address and shows the same confirmation after submission", async () => {
    const user = userEvent.setup();
    renderRequest();

    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(screen.getByText("Enter your email address.")).toBeInTheDocument();
    expect(requestPasswordReset).not.toHaveBeenCalled();

    await user.click(screen.getByLabelText("Email address"));
    await user.paste("student@example.test");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(requestPasswordReset).toHaveBeenCalledWith("student@example.test");
    expect(await screen.findByRole("status")).toHaveTextContent("If an eligible account exists");
    expect(screen.getByText(/expires in 60 minutes/)).toBeInTheDocument();
    expect(screen.getByText(/If no email arrives, check your spam folder/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Request another link" }));
    expect(screen.getByLabelText("Email address")).toHaveValue("student@example.test");
  });

  it("blocks a second submission while the request is pending", async () => {
    let finish: () => void = () => {};
    vi.mocked(requestPasswordReset).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const user = userEvent.setup();
    renderRequest();

    await user.click(screen.getByLabelText("Email address"));
    await user.paste("student@example.test");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(screen.getByRole("button", { name: "Sending link..." })).toBeDisabled();
    expect(requestPasswordReset).toHaveBeenCalledOnce();
    finish();
    expect(await screen.findByRole("status")).toHaveTextContent("If an eligible account exists");
  });

  it("shows an inline message when the email has no account", async () => {
    const message = "No account found with that email address.";
    vi.mocked(requestPasswordReset).mockRejectedValue(
      new AuthError("validation", message, { email: [message] }),
    );
    const user = userEvent.setup();
    renderRequest();

    await user.click(screen.getByLabelText("Email address"));
    await user.paste("missing@example.test");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toHaveFocus();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows a retry message when reset requests are limited", async () => {
    const message = "Too many password reset requests. Please try again later.";
    vi.mocked(requestPasswordReset).mockRejectedValue(new AuthError("rate_limit", message));
    const user = userEvent.setup();
    renderRequest();

    await user.click(screen.getByLabelText("Email address"));
    await user.paste("student@example.test");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("ResetPasswordPage", () => {
  it("shows a request-another link for an invalid, expired, or reused token", async () => {
    vi.mocked(validatePasswordResetLink).mockResolvedValue(false);
    renderReset();

    expect(await screen.findByRole("alert")).toHaveTextContent("invalid, expired, or has already been used");
    expect(screen.getByRole("link", { name: "Request another reset link" })).toHaveAttribute(
      "href", "/forgot-password",
    );
    expect(confirmPasswordReset).not.toHaveBeenCalled();
  });

  it("rejects an incomplete URL without sending a validation request", async () => {
    render(<MemoryRouter><ResetPasswordPage uid="uid123" /></MemoryRouter>);
    expect(await screen.findByRole("link", { name: "Request another reset link" })).toBeInTheDocument();
    expect(validatePasswordResetLink).not.toHaveBeenCalled();
  });

  it("shows Django's password validation message", async () => {
    vi.mocked(confirmPasswordReset).mockRejectedValue(
      new AuthError("validation", "Please fix the highlighted fields.", {
        new_password: ["This password is too common."],
      }),
    );
    renderReset();
    await fillResetForm();

    expect(await screen.findByText("This password is too common.")).toBeInTheDocument();
    expect(screen.getByLabelText("New password")).toHaveFocus();
  });

  it("handles a link reused between validation and submission", async () => {
    vi.mocked(confirmPasswordReset).mockRejectedValue(new InvalidPasswordResetLinkError());
    renderReset();
    await fillResetForm();

    expect(await screen.findByRole("link", { name: "Request another reset link" })).toBeInTheDocument();
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
  });

  it("completes the reset without signing in", async () => {
    renderReset();
    await fillResetForm();

    expect(confirmPasswordReset).toHaveBeenCalledWith("uid123", "token123", "EveningRivers!8462");
    expect(await screen.findByRole("status")).toHaveTextContent("Your password has been reset");
    expect(screen.getByText(/confirmation email does not arrive/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
    expect(signOut).not.toHaveBeenCalled();
  });

  it("ends an existing local session after the reset", async () => {
    auth.user = { id: 7, email: "student@example.test", first_name: "Sam", last_name: "Student" };
    renderReset();
    await fillResetForm();

    expect(await screen.findByRole("status")).toHaveTextContent("Your password has been reset");
    expect(signOut).toHaveBeenCalledOnce();
  });
});
