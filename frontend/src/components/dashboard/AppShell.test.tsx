import type { ReactNode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppShell from "./AppShell";

afterEach(() => vi.unstubAllGlobals());

function renderShell(path: string, children: ReactNode = <p>Page body</p>) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppShell
        user={{ id: 1, email: "student@example.test", first_name: "Sam", last_name: "Student" }}
        health={{ status: "ok" }}
        isSigningOut={false}
        onSignOut={() => undefined}
      >
        {children}
      </AppShell>
    </MemoryRouter>,
  );
}

function mockDesktopScreen(matches: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    matches,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  };
  vi.stubGlobal("matchMedia", vi.fn(() => query));
  return (next: boolean) => act(() => {
    query.matches = next;
    listeners.forEach((listener) => listener());
  });
}

function BackButton() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate(-1)}>Back</button>;
}

describe("AppShell calendar navigation", () => {
  it("marks Calendar active and titles the page", () => {
    renderShell("/calendar");

    expect(screen.getByRole("link", { name: "Calendar" })).toHaveAttribute("href", "/calendar");
    expect(screen.getByRole("link", { name: "Calendar" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { level: 1, name: "Calendar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
  });

  it("keeps the dashboard title on Home", () => {
    renderShell("/");

    expect(screen.getByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Calendar" })).not.toHaveAttribute("aria-current");
  });

  it("offers sign out in the profile menu instead of the sidebar", () => {
    renderShell("/");

    expect(screen.getByRole("button", { name: "Account menu for Sam Student" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Log out/ })).not.toBeInTheDocument();
  });

  it("opens and closes the drawer with focus contained in its links", () => {
    renderShell("/");
    const toggle = screen.getByRole("button", { name: "Navigation menu" });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("main")).toHaveAttribute("inert");
    expect(screen.getByRole("dialog", { name: "Navigation" })).toBeInTheDocument();
    const brand = screen.getByRole("link", { name: "StudyForge" });
    const calendar = screen.getByRole("link", { name: "Calendar" });
    expect(brand).toHaveFocus();
    calendar.focus();
    fireEvent.keyDown(calendar, { key: "Tab" });
    expect(brand).toHaveFocus();
    fireEvent.keyDown(brand, { key: "Escape" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("closes the drawer when a nav link is followed", () => {
    renderShell("/");
    const toggle = screen.getByRole("button", { name: "Navigation menu" });
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("link", { name: "Calendar" }));
    expect(screen.getByRole("heading", { level: 1, name: "Calendar" })).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("main")).not.toHaveAttribute("inert");
    expect(toggle).toHaveFocus();
  });

  it("does not reopen the drawer when going Back to the page it was opened on", () => {
    renderShell("/", <BackButton />);
    const toggle = screen.getByRole("button", { name: "Navigation menu" });
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("link", { name: "Calendar" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes the drawer when the backdrop is tapped", () => {
    const { container } = renderShell("/");
    const toggle = screen.getByRole("button", { name: "Navigation menu" });
    fireEvent.click(toggle);
    fireEvent.click(container.querySelector(".sidebar-backdrop")!);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();
  });

  it("closes the drawer and keeps focus on the sidebar link when widened to desktop", () => {
    const resize = mockDesktopScreen(false);
    renderShell("/");
    const toggle = screen.getByRole("button", { name: "Navigation menu" });
    fireEvent.click(toggle);
    expect(screen.getByRole("main")).toHaveAttribute("inert");
    const calendar = screen.getByRole("link", { name: "Calendar" });
    calendar.focus();
    resize(true);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("main")).not.toHaveAttribute("inert");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(calendar).toHaveFocus();
  });

  it("returns focus to the menu button on the next Escape after a resize while closed", () => {
    const resize = mockDesktopScreen(false);
    renderShell("/");
    resize(true);
    resize(false);
    const toggle = screen.getByRole("button", { name: "Navigation menu" });
    fireEvent.click(toggle);
    fireEvent.keyDown(screen.getByRole("link", { name: "StudyForge" }), { key: "Escape" });
    expect(toggle).toHaveFocus();
  });
});
