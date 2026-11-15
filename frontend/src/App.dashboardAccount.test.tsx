import { useState } from "react";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import type { PublicUser } from "./api/auth";
import App from "./App";

vi.mock("./api/health", () => ({ getHealth: () => Promise.resolve({ status: "ok" }) }));
// Each mounted dashboard gets a new number, so a remount is visible on screen.
const { auth, mounts } = vi.hoisted(() => ({
  auth: { user: null as PublicUser | null },
  mounts: { count: 0 },
}));
vi.mock("./pages/DashboardPage", () => ({
  default: function DashboardStub() {
    const [instance] = useState(() => ++mounts.count);
    return <p>Dashboard instance {instance}</p>;
  },
}));
vi.mock("./pages/CoursesPage", () => ({
  default: function CoursesStub() {
    const [instance] = useState(() => ++mounts.count);
    return <p>Courses instance {instance}</p>;
  },
}));
vi.mock("./pages/TasksPage", () => ({
  default: function TasksStub() {
    const [instance] = useState(() => ++mounts.count);
    return <p>Tasks instance {instance}</p>;
  },
}));
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

const studentA: PublicUser = { id: 1, email: "a@example.test", first_name: "Ada", last_name: "" };
const studentB: PublicUser = { id: 2, email: "b@example.test", first_name: "Bo", last_name: "" };
const tree = (path = "/") => <MemoryRouter initialEntries={[path]}><App /></MemoryRouter>;

beforeEach(() => { mounts.count = 0; });

it("starts a fresh dashboard when the signed-in account changes", async () => {
  auth.user = studentA;
  const { rerender } = render(tree());
  await act(async () => {});
  expect(screen.getByText("Dashboard instance 1")).toBeInTheDocument();

  auth.user = studentB;
  rerender(tree());
  await act(async () => {});
  expect(screen.getByText("Dashboard instance 2")).toBeInTheDocument();
});

it("keeps the same dashboard when the same account re-renders, for example after a token refresh", async () => {
  auth.user = studentA;
  const { rerender } = render(tree());
  await act(async () => {});

  auth.user = { ...studentA };
  rerender(tree());
  await act(async () => {});
  expect(screen.getByText("Dashboard instance 1")).toBeInTheDocument();
});

it.each([
  ["/courses", "Courses", "Courses"],
  ["/tasks", "Tasks", "Tasks"],
])("shows the %s page with its nav item highlighted", async (path, page, navItem) => {
  auth.user = studentA;
  render(tree(path));
  await act(async () => {});
  expect(screen.getByText(`${page} instance 1`)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: navItem })).toHaveAttribute("aria-current", "page");
});

it.each(["/courses", "/tasks"])("starts a fresh %s page when the signed-in account changes", async (path) => {
  auth.user = studentA;
  const { rerender } = render(tree(path));
  await act(async () => {});
  expect(screen.getByText(/instance 1/)).toBeInTheDocument();

  auth.user = studentB;
  rerender(tree(path));
  await act(async () => {});
  expect(screen.getByText(/instance 2/)).toBeInTheDocument();
});

it("still opens the dashboard for an old /#tasks link", async () => {
  auth.user = studentA;
  render(tree("/#tasks"));
  await act(async () => {});
  expect(screen.getByText("Dashboard instance 1")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
});

it("points the not-found page back to the courses page", async () => {
  auth.user = studentA;
  render(tree("/no-such-page"));
  await act(async () => {});
  expect(screen.getByRole("link", { name: "Return to my courses" })).toHaveAttribute("href", "/courses");
});
