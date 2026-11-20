import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { validatePasswordResetLink, type PublicUser } from "./api/auth";
import App from "./App";

vi.mock("./api/auth", async () => {
  const actual = await vi.importActual<typeof import("./api/auth")>("./api/auth");
  return { ...actual, validatePasswordResetLink: vi.fn() };
});
vi.mock("./api/health", () => ({ getHealth: () => Promise.resolve({ status: "ok" }) }));

const { auth } = vi.hoisted(() => ({ auth: { user: null as PublicUser | null } }));
vi.mock("./context/AuthContext", () => ({
  useAuth: () => ({
    user: auth.user,
    isRestoring: false,
    isSigningOut: false,
    signedOutReason: null,
    saveLogin: vi.fn(),
    signOut: vi.fn(async () => {}),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = null;
  vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "");
  vi.mocked(validatePasswordResetLink).mockResolvedValue(true);
});

describe("App password reset routes", () => {
  it("opens the request form from the login card", async () => {
    render(<MemoryRouter initialEntries={["/login"]}><App /></MemoryRouter>);

    await userEvent.setup().click(screen.getByRole("button", { name: "Forgot password?" }));

    expect(screen.getByRole("heading", { name: "Reset your password" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
  });

  it("opens an emailed reset link while a session is active", async () => {
    auth.user = { id: 7, email: "student@example.test", first_name: "Sam", last_name: "Student" };
    render(
      <MemoryRouter initialEntries={["/reset-password/uid123/token123"]}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByLabelText("New password")).toBeInTheDocument();
    expect(validatePasswordResetLink).toHaveBeenCalledWith("uid123", "token123");
  });
});
