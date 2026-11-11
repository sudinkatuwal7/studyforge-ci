import { useEffect } from "react";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, type NavigateFunction, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicUser } from "./api/auth";
import type { SignedOutReason } from "./context/AuthContext";
import App from "./App";

vi.mock("./api/health", () => ({
  getHealth: () => Promise.resolve({ status: "ok" }),
}));
vi.mock("./pages/DashboardPage", () => ({ default: () => <p>Dashboard page</p> }));
vi.mock("./pages/CourseDetailPage", () => ({ default: () => <p>Course page</p> }));
vi.mock("./pages/CalendarPage", () => ({ default: () => <p>Calendar page</p> }));
const { auth } = vi.hoisted(() => ({
  auth: {
    user: null as PublicUser | null,
    isRestoring: false,
    signedOutReason: null as SignedOutReason | null,
  },
}));
vi.mock("./context/AuthContext", () => ({
  useAuth: () => ({
    user: auth.user,
    isRestoring: auth.isRestoring,
    isSigningOut: false,
    signedOutReason: auth.signedOutReason,
    signOut: vi.fn(),
    saveLogin: vi.fn(),
  }),
}));

const student: PublicUser = { id: 1, email: "student@example.test", first_name: "Ada", last_name: "" };

const LANDING = { level: 1, name: "Study smarter with StudyForge" } as const;
const LOGIN_CARD = { name: "Log in to StudyForge" } as const;
const REGISTER_CARD = { name: "Create your account" } as const;

// Gives the tests the Back and Forward buttons, and the current address.
const browser = { navigate: (() => {}) as NavigateFunction, path: "", key: "" };
function BrowserProbe() {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    browser.navigate = navigate;
    browser.path = location.pathname + location.hash;
    browser.key = location.key;
  });
  return null;
}

async function goBack() {
  await act(async () => browser.navigate(-1));
}

async function goForward() {
  await act(async () => browser.navigate(1));
}

function renderAppAt(path: string) {
  // A new element each time: React skips re-rendering an identical one.
  const tree = () => (
    <MemoryRouter initialEntries={[path]}>
      <App />
      <BrowserProbe />
    </MemoryRouter>
  );
  const { rerender } = render(tree());
  return async () => {
    rerender(tree());
    // Let <Navigate> finish.
    await act(async () => {});
  };
}

beforeEach(() => {
  auth.user = null;
  auth.signedOutReason = null;
  auth.isRestoring = false;
  vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "");
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("App when signed out", () => {
  it("shows the landing page at the site root", () => {
    renderAppAt("/");

    expect(screen.getByRole("heading", LANDING)).toBeInTheDocument();
    expect(screen.queryByRole("region", LOGIN_CARD)).not.toBeInTheDocument();
  });

  it.each([
    ["header", "Log in", LOGIN_CARD],
    ["header", "Start free", REGISTER_CARD],
    ["introduction", "Log in", LOGIN_CARD],
    ["introduction", "Start free", REGISTER_CARD],
  ] as const)("opens the right card from the %s's %s link", async (area, linkName, card) => {
    renderAppAt("/");
    const user = userEvent.setup();
    const section =
      area === "header" ? screen.getByRole("banner") : screen.getByRole("region", { name: LANDING.name });

    await user.click(within(section).getByRole("link", { name: linkName }));

    expect(screen.getByRole("region", card)).toBeInTheDocument();
    expect(screen.queryByRole("heading", LANDING)).not.toBeInTheDocument();
  });

  it("opens the log in card directly at /login", () => {
    renderAppAt("/login");
    expect(screen.getByRole("region", LOGIN_CARD)).toBeInTheDocument();
  });

  it("opens the register card directly at /register", () => {
    renderAppAt("/register");
    expect(screen.getByRole("region", REGISTER_CARD)).toBeInTheDocument();
  });

  it.each([
    ["/login", "Log in", "Start free"],
    ["/register", "Start free", "Log in"],
  ])("marks the header pill for %s as the current page", (path, current, other) => {
    renderAppAt(path);

    const header = screen.getByRole("banner");
    expect(within(header).getByRole("link", { name: current })).toHaveAttribute("aria-current", "page");
    expect(within(header).getByRole("link", { name: other })).not.toHaveAttribute("aria-current");
  });

  it("shows the log in card at a course link, then the course after logging in", async () => {
    const rerender = renderAppAt("/courses/5");
    expect(screen.getByRole("region", LOGIN_CARD)).toBeInTheDocument();

    auth.user = student;
    await rerender();

    expect(screen.getByText("Course page")).toBeInTheDocument();
  });
});

describe("App when signed in", () => {
  it.each(["/", "/login", "/register"])("shows the dashboard at %s", async (path) => {
    auth.user = student;
    renderAppAt(path);
    await act(async () => {});

    expect(screen.getByText("Dashboard page")).toBeInTheDocument();
    expect(screen.queryByText("Page not found")).not.toBeInTheDocument();
  });

  it("goes to the dashboard after logging in on /login", async () => {
    const rerender = renderAppAt("/login");

    auth.user = student;
    await rerender();

    expect(screen.getByText("Dashboard page")).toBeInTheDocument();
  });
});

describe("App when a session ends at the site root", () => {
  it.each([
    ["signed_out", "You've been signed out."],
    ["expired", "Your session expired. Please sign in again."],
  ] as const)("shows the log in card with the %s notice", async (reason, message) => {
    auth.user = student;
    const rerender = renderAppAt("/");

    auth.user = null;
    auth.signedOutReason = reason;
    await rerender();

    const card = screen.getByRole("region", LOGIN_CARD);
    expect(within(card).getByRole("status")).toHaveTextContent(message);
    expect(screen.queryByRole("heading", LANDING)).not.toBeInTheDocument();
  });

  it("shows the landing page again after the Features link is clicked", async () => {
    auth.user = student;
    const rerender = renderAppAt("/");
    auth.user = null;
    auth.signedOutReason = "signed_out";
    await rerender();
    const user = userEvent.setup();

    await user.click(within(screen.getByRole("banner")).getByRole("link", { name: "Features" }));

    expect(screen.getByRole("heading", LANDING)).toBeInTheDocument();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("shows the landing page when the session ended without a reason", async () => {
    auth.user = student;
    const rerender = renderAppAt("/");

    auth.user = null;
    await rerender();

    expect(screen.getByRole("heading", LANDING)).toBeInTheDocument();
  });
});

describe("App while the session is being checked (page load or reload)", () => {
  it.each(["/", "/login", "/#features"])(
    "shows only the checking message at %s, not the landing page or a card",
    (path) => {
      auth.isRestoring = true;
      renderAppAt(path);

      expect(screen.getByText("Checking your session...")).toBeInTheDocument();
      expect(screen.queryByRole("heading", LANDING)).not.toBeInTheDocument();
      expect(screen.queryByRole("region", LOGIN_CARD)).not.toBeInTheDocument();
    },
  );

  it("shows the dashboard at / when the saved session is valid", async () => {
    auth.isRestoring = true;
    const rerender = renderAppAt("/");

    auth.isRestoring = false;
    auth.user = student;
    await rerender();

    expect(screen.getByText("Dashboard page")).toBeInTheDocument();
    expect(screen.queryByRole("heading", LANDING)).not.toBeInTheDocument();
  });

  it("shows the landing page at / when there is no saved session", async () => {
    auth.isRestoring = true;
    const rerender = renderAppAt("/");

    auth.isRestoring = false;
    await rerender();

    expect(screen.getByRole("heading", LANDING)).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("goes to the dashboard after a reload on /login with a valid session", async () => {
    auth.isRestoring = true;
    const rerender = renderAppAt("/login");

    auth.isRestoring = false;
    auth.user = student;
    await rerender();

    expect(screen.getByText("Dashboard page")).toBeInTheDocument();
    expect(browser.path).toBe("/");
  });

  it("keeps a course link through the check and opens it", async () => {
    auth.isRestoring = true;
    const rerender = renderAppAt("/courses/5");

    auth.isRestoring = false;
    auth.user = student;
    await rerender();

    expect(screen.getByText("Course page")).toBeInTheDocument();
    expect(browser.path).toBe("/courses/5");
  });
});

describe("App signed-in pages", () => {
  it.each([
    ["/", "Dashboard page"],
    ["/#features", "Dashboard page"],
    ["/courses/5", "Course page"],
    ["/calendar", "Calendar page"],
  ])("shows the app, not a signed-out page, at %s", async (path, page) => {
    auth.user = student;
    renderAppAt(path);
    await act(async () => {});

    expect(screen.getByText(page)).toBeInTheDocument();
    expect(screen.queryByRole("heading", LANDING)).not.toBeInTheDocument();
    expect(screen.queryByRole("region", LOGIN_CARD)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Start free" })).not.toBeInTheDocument();
  });

  it.each(["/login", "/register"])("replaces %s in the address with /", async (path) => {
    auth.user = student;
    renderAppAt(path);
    await act(async () => {});

    expect(browser.path).toBe("/");
  });

  it("shows Page not found at an unknown address", async () => {
    auth.user = student;
    renderAppAt("/no-such-page");
    await act(async () => {});

    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  });
});

describe("App with the Back and Forward buttons", () => {
  it("goes back from the log in card to the landing page", async () => {
    renderAppAt("/");
    const user = userEvent.setup();
    await user.click(within(screen.getByRole("banner")).getByRole("link", { name: "Log in" }));

    await goBack();

    expect(screen.getByRole("heading", LANDING)).toBeInTheDocument();
  });

  it("never shows a log in card or the landing page on Back after logging in", async () => {
    const rerender = renderAppAt("/");
    const user = userEvent.setup();
    await user.click(within(screen.getByRole("banner")).getByRole("link", { name: "Start free" }));
    await user.click(within(screen.getByRole("banner")).getByRole("link", { name: "Log in" }));
    auth.user = student;
    await rerender();
    expect(browser.path).toBe("/");

    for (let step = 0; step < 2; step += 1) {
      await goBack();
      expect(screen.getByText("Dashboard page")).toBeInTheDocument();
      expect(screen.queryByRole("region", LOGIN_CARD)).not.toBeInTheDocument();
      expect(screen.queryByRole("region", REGISTER_CARD)).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", LANDING)).not.toBeInTheDocument();
    }
    // Back really moved through the history: this is the first entry, so the
    // replaced /login and /register entries did not trap the user.
    expect(browser.key).toBe("default");
  });

  it("returns to the notice on Back after leaving it, and to the landing page on Forward", async () => {
    auth.user = student;
    const rerender = renderAppAt("/");
    auth.user = null;
    auth.signedOutReason = "signed_out";
    await rerender();
    const user = userEvent.setup();
    await user.click(within(screen.getByRole("banner")).getByRole("link", { name: "Features" }));
    expect(screen.getByRole("heading", LANDING)).toBeInTheDocument();

    await goBack();
    expect(within(screen.getByRole("region", LOGIN_CARD)).getByRole("status")).toHaveTextContent(
      "You've been signed out.",
    );

    await goForward();
    expect(screen.getByRole("heading", LANDING)).toBeInTheDocument();
  });

  it("shows the log in card with the notice on Back to a signed-in page after signing out", async () => {
    auth.user = student;
    const rerender = renderAppAt("/calendar");
    await act(async () => browser.navigate("/"));
    auth.user = null;
    auth.signedOutReason = "signed_out";
    await rerender();

    await goBack();

    expect(browser.path).toBe("/calendar");
    expect(within(screen.getByRole("region", LOGIN_CARD)).getByRole("status")).toHaveTextContent(
      "You've been signed out.",
    );
  });
});

describe("App with capital letters and trailing slashes in the address", () => {
  it.each(["/LOGIN", "/Login", "/login/", "/Login/"])("shows the log in card at %s when signed out", (path) => {
    renderAppAt(path);

    expect(screen.getByRole("region", LOGIN_CARD)).toBeInTheDocument();
    expect(within(screen.getByRole("banner")).getByRole("link", { name: "Log in" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it.each(["/REGISTER", "/register/"])("shows the register card at %s when signed out", (path) => {
    renderAppAt(path);

    expect(screen.getByRole("region", REGISTER_CARD)).toBeInTheDocument();
    expect(within(screen.getByRole("banner")).getByRole("link", { name: "Start free" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("shows the landing page at / with nothing after it", () => {
    renderAppAt("/");

    expect(screen.getByRole("heading", LANDING)).toBeInTheDocument();
  });

  it.each(["/LOGIN", "/login/", "/Register/"])("replaces %s with / and shows the dashboard when signed in", async (path) => {
    auth.user = student;
    renderAppAt(path);
    await act(async () => {});

    expect(screen.getByText("Dashboard page")).toBeInTheDocument();
    expect(browser.path).toBe("/");
  });

  it.each([
    ["/CALENDAR", "Calendar page"],
    ["/calendar/", "Calendar page"],
    ["/Courses/5/", "Course page"],
  ])("opens the signed-in page at %s", async (path, page) => {
    auth.user = student;
    renderAppAt(path);
    await act(async () => {});

    expect(screen.getByText(page)).toBeInTheDocument();
  });

  it("keeps a capitalised course link through login", async () => {
    const rerender = renderAppAt("/Courses/5/");
    expect(screen.getByRole("region", LOGIN_CARD)).toBeInTheDocument();

    auth.user = student;
    await rerender();

    expect(screen.getByText("Course page")).toBeInTheDocument();
    expect(browser.path).toBe("/Courses/5/");
  });
});
