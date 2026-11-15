import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import type { Course } from "../../types/course";
import QuickLinks from "./QuickLinks";

const biology: Course = { id: 7, name: "Biology", description: "", owner: 1, created_at: "2026-10-01" };
const history: Course = { id: 8, name: "History", description: "", owner: 1, created_at: "2026-10-01" };
const saved = (userId: number) => localStorage.getItem(`studyforge:lastCourse:${userId}`);

afterEach(() => localStorage.clear());

function renderLinks(courses: Course[] | null, { loadFailed = false, userId = 1 as number | undefined } = {}) {
  render(<MemoryRouter><QuickLinks courses={courses} loadFailed={loadFailed} userId={userId} /></MemoryRouter>);
  return within(screen.getByRole("region", { name: "Quick links" }));
}

it("links each section of the last opened course, with Pandu opened over Materials", () => {
  localStorage.setItem("studyforge:lastCourse:1", "8");
  const links = renderLinks([biology, history]);

  expect(links.getByText("History")).toBeVisible();
  expect(links.getByRole("link", { name: /Materials/ })).toHaveAttribute("href", "/courses/8/materials");
  expect(links.getByRole("link", { name: /Notes/ })).toHaveAttribute("href", "/courses/8/notes");
  expect(links.getByRole("link", { name: /Quizzes/ })).toHaveAttribute("href", "/courses/8/quizzes");
  expect(links.getByRole("link", { name: /Ask Pandu/ })).toHaveAttribute("href", "/courses/8/materials?pandu=open");
  expect(links.queryByRole("list", { name: "Choose a course" })).not.toBeInTheDocument();
});

it("shows the course picker when there is no last opened course, and remembers the choice", () => {
  const links = renderLinks([biology, history]);
  expect(links.getByText("Choose a course for your quick links.")).toBeVisible();
  expect(links.queryByRole("link")).not.toBeInTheDocument();

  fireEvent.click(links.getByRole("button", { name: "Biology" }));
  expect(links.getByRole("link", { name: /Notes/ })).toHaveAttribute("href", "/courses/7/notes");
  expect(saved(1)).toBe("7");
});

it("falls back to the picker and forgets a last course that was deleted or is no longer the student's", () => {
  localStorage.setItem("studyforge:lastCourse:1", "99");
  const links = renderLinks([biology, history]);
  expect(links.getByRole("status")).toHaveTextContent("Your last opened course is no longer available.");
  expect(links.getByRole("list", { name: "Choose a course" })).toBeVisible();
  expect(links.queryByRole("link")).not.toBeInTheDocument();
  expect(saved(1)).toBeNull();

  // Picking another course replaces the message with that course's links.
  fireEvent.click(links.getByRole("button", { name: "History" }));
  expect(links.queryByText(/no longer available/)).not.toBeInTheDocument();
  expect(links.getByRole("link", { name: /Materials/ })).toHaveAttribute("href", "/courses/8/materials");
});

it("explains the missing course and offers to create one when no courses are left", () => {
  localStorage.setItem("studyforge:lastCourse:1", "99");
  const links = renderLinks([]);
  expect(links.getByRole("status")).toHaveTextContent("Your last opened course is no longer available.");
  expect(links.getByRole("button", { name: "Create your first course" })).toBeVisible();
  expect(saved(1)).toBeNull();
});

it("does not show the message on a later visit, once the missing course was forgotten", () => {
  localStorage.setItem("studyforge:lastCourse:1", "99");
  const { unmount } = render(<MemoryRouter><QuickLinks courses={[biology]} loadFailed={false} userId={1} /></MemoryRouter>);
  expect(screen.getByText(/no longer available/)).toBeVisible();
  unmount();

  const links = renderLinks([biology]);
  expect(links.queryByText(/no longer available/)).not.toBeInTheDocument();
  expect(links.getByRole("list", { name: "Choose a course" })).toBeVisible();
});

it("does not show the message when the student simply has no last course", () => {
  const links = renderLinks([biology]);
  expect(links.queryByText(/no longer available/)).not.toBeInTheDocument();
});

it("lets the student change the quick-links course or cancel the change", () => {
  localStorage.setItem("studyforge:lastCourse:1", "7");
  const links = renderLinks([biology, history]);

  fireEvent.click(links.getByRole("button", { name: "Change course" }));
  expect(links.getByRole("button", { name: "Biology" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(links.getByRole("button", { name: "Cancel" }));
  expect(links.getByRole("link", { name: /Materials/ })).toHaveAttribute("href", "/courses/7/materials");

  fireEvent.click(links.getByRole("button", { name: "Change course" }));
  fireEvent.click(links.getByRole("button", { name: "History" }));
  expect(links.getByRole("link", { name: /Materials/ })).toHaveAttribute("href", "/courses/8/materials");
  expect(saved(1)).toBe("8");
});

it("does not offer Change course when the student has only one course", () => {
  localStorage.setItem("studyforge:lastCourse:1", "7");
  const links = renderLinks([biology]);
  expect(links.getByRole("link", { name: /Materials/ })).toBeVisible();
  expect(links.queryByRole("button", { name: "Change course" })).not.toBeInTheDocument();
});

it("keeps each account's last course separate", () => {
  localStorage.setItem("studyforge:lastCourse:1", "7");
  const links = renderLinks([biology, history], { userId: 2 });
  expect(links.getByRole("list", { name: "Choose a course" })).toBeVisible();
  expect(saved(1)).toBe("7");
});

describe("when the account changes while the card stays mounted", () => {
  const tree = (userId: number | undefined, courses: Course[] | null) => (
    <MemoryRouter><QuickLinks courses={courses} loadFailed={false} userId={userId} /></MemoryRouter>
  );
  const card = () => within(screen.getByRole("region", { name: "Quick links" }));

  it("switches to the new account's own saved course", () => {
    localStorage.setItem("studyforge:lastCourse:1", "7");
    localStorage.setItem("studyforge:lastCourse:2", "8");
    const { rerender } = render(tree(1, [biology]));
    expect(card().getByText("Biology")).toBeVisible();

    rerender(tree(2, [history]));
    expect(card().getByText("History")).toBeVisible();
    expect(card().queryByText("Biology")).not.toBeInTheDocument();
    expect(card().getByRole("link", { name: /Materials/ })).toHaveAttribute("href", "/courses/8/materials");
    // Neither account's saved course was touched by the switch.
    expect(saved(1)).toBe("7");
    expect(saved(2)).toBe("8");
  });

  it("never carries the previous account's course or message to an account with nothing saved", () => {
    localStorage.setItem("studyforge:lastCourse:1", "7");
    const { rerender } = render(tree(1, [biology]));

    rerender(tree(2, [history]));
    expect(card().getByRole("list", { name: "Choose a course" })).toBeVisible();
    expect(card().queryByText(/no longer available/)).not.toBeInTheDocument();
    expect(card().queryByRole("link")).not.toBeInTheDocument();
    expect(saved(1)).toBe("7");
  });

  it("closes an open picker from the previous account", () => {
    localStorage.setItem("studyforge:lastCourse:1", "7");
    localStorage.setItem("studyforge:lastCourse:2", "8");
    const { rerender } = render(tree(1, [biology, history]));
    fireEvent.click(card().getByRole("button", { name: "Change course" }));

    rerender(tree(2, [biology, history]));
    expect(card().queryByRole("list", { name: "Choose a course" })).not.toBeInTheDocument();
    expect(card().getByRole("link", { name: /Materials/ })).toHaveAttribute("href", "/courses/8/materials");
  });

  it("reads the saved course when the account arrives after the card mounted", () => {
    localStorage.setItem("studyforge:lastCourse:1", "7");
    const { rerender } = render(tree(undefined, null));

    rerender(tree(1, [biology]));
    expect(card().getByRole("link", { name: /Notes/ })).toHaveAttribute("href", "/courses/7/notes");
  });
});

it("offers to create the first course when the student has none, and jumps to the form", () => {
  render(<MemoryRouter>
    <QuickLinks courses={[]} loadFailed={false} userId={1} />
    {/* Stands in for the dashboard's course form below the card. */}
    <label htmlFor="course-name">Course name</label><input id="course-name" />
  </MemoryRouter>);
  const links = within(screen.getByRole("region", { name: "Quick links" }));
  expect(links.getByText(/Create a course to get quick links/)).toBeVisible();
  expect(links.queryByRole("link")).not.toBeInTheDocument();

  fireEvent.click(links.getByRole("button", { name: "Create your first course" }));
  expect(screen.getByLabelText("Course name")).toHaveFocus();
});

it("shows loading while courses load", () => {
  const links = renderLinks(null);
  expect(links.getByRole("status")).toHaveTextContent("Loading quick links...");
});

it("shows an error instead of loading forever when courses fail to load", () => {
  const links = renderLinks(null, { loadFailed: true });
  expect(links.getByRole("alert")).toHaveTextContent("Could not load your courses");
  expect(links.queryByRole("status")).not.toBeInTheDocument();
});
