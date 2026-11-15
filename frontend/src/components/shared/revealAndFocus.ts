// Shared by every "do this next" action that points at a control further down the page:
// scroll it into view (smoothly, unless the student prefers reduced motion), then focus it.
// Returns false when there is nothing to focus.
export function revealAndFocus(element: HTMLElement | null | undefined): boolean {
  if (!element) return false;
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  // scrollIntoView is missing in some test environments; focus still works without it.
  element.scrollIntoView?.({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
  element.focus({ preventScroll: true });
  return true;
}
