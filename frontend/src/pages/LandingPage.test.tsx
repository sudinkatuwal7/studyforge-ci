import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LandingPage from "./LandingPage";

// jsdom has no layout, so it has no scrollIntoView either.
const scrollIntoView = vi.fn();

beforeEach(() => {
  Element.prototype.scrollIntoView = scrollIntoView;
});

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <LandingPage />
    </MemoryRouter>,
  );
}

describe("LandingPage", () => {
  it("shows the introduction, the four features, and a call to action", () => {
    renderAt("/");

    expect(screen.getByRole("heading", { level: 1, name: "Study smarter with StudyForge" })).toBeInTheDocument();
    const features = screen.getByRole("region", { name: "Everything for your courses" });
    const titles = within(features).getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual(["Ask Pandu", "Notes from your materials", "Practice quizzes", "Course management"]);
    expect(screen.getByRole("region", { name: "Ready to start studying?" })).toBeInTheDocument();
  });

  it("links every sign-up and log-in button to its page", () => {
    renderAt("/");

    const header = screen.getByRole("banner");
    const hero = screen.getByRole("region", { name: "Study smarter with StudyForge" });
    const cta = screen.getByRole("region", { name: "Ready to start studying?" });
    for (const area of [header, hero]) {
      expect(within(area).getByRole("link", { name: "Start free" })).toHaveAttribute("href", "/register");
      expect(within(area).getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
    }
    expect(within(cta).getByRole("link", { name: "Create a free account" })).toHaveAttribute("href", "/register");
    expect(within(cta).getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
  });

  it("marks neither header pill as the current page on the landing page", () => {
    renderAt("/");

    const header = screen.getByRole("banner");
    expect(within(header).getByRole("link", { name: "Log in" })).not.toHaveAttribute("aria-current");
    expect(within(header).getByRole("link", { name: "Start free" })).not.toHaveAttribute("aria-current");
  });

  it("points the header's Features link at the features section", () => {
    renderAt("/");

    const link = within(screen.getByRole("banner")).getByRole("link", { name: "Features" });
    expect(link).toHaveAttribute("href", "/#features");
    expect(document.getElementById("features")).toBe(
      screen.getByRole("region", { name: "Everything for your courses" }),
    );
  });

  it("does not scroll when the address has no section", () => {
    renderAt("/");

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("scrolls to the features when it opens at /#features", () => {
    renderAt("/#features");

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(document.getElementById("features"));
  });

  it("scrolls each time the Features link is clicked on the page", async () => {
    renderAt("/");
    const user = userEvent.setup();
    const link = within(screen.getByRole("banner")).getByRole("link", { name: "Features" });

    await user.click(link);
    await user.click(link);

    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    expect(scrollIntoView.mock.contexts[1]).toBe(document.getElementById("features"));
  });
});
