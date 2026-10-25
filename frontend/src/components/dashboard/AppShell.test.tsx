import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import AppShell from "./AppShell";

function renderShell(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppShell
        user={{ id: 1, email: "student@example.test", first_name: "Sam", last_name: "Student" }}
        health={{ status: "ok" }}
        isSigningOut={false}
        onSignOut={() => undefined}
      >
        <p>Page body</p>
      </AppShell>
    </MemoryRouter>,
  );
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
});
