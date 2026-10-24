import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { PublicUser } from "../../api/auth";
import ProfileMenu from "./ProfileMenu";

const ada: PublicUser = { id: 1, email: "ada@example.test", first_name: "Ada", last_name: "Lovelace" };

function renderMenu(user = ada, { isSigningOut = false, onSignOut = vi.fn() } = {}) {
  render(
    <MemoryRouter>
      <ProfileMenu user={user} isSigningOut={isSigningOut} onSignOut={onSignOut} />
      <button type="button">Outside</button>
    </MemoryRouter>,
  );
  return { user: userEvent.setup(), onSignOut, trigger: screen.getByRole("button", { name: /Account menu/ }) };
}

describe("ProfileMenu", () => {
  it("shows the name, email, and options when opened", async () => {
    const { user, trigger } = renderMenu();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Ada Lovelace")).not.toBeVisible();

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Ada Lovelace")).toBeVisible();
    expect(screen.getByText("ada@example.test")).toBeVisible();
    expect(screen.getByRole("button", { name: /Edit profile/ })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Calendar" })).toHaveAttribute("href", "/calendar");
  });

  it("falls back to the email for accounts without a name", async () => {
    const { user, trigger } = renderMenu({ ...ada, first_name: "", last_name: "" });

    expect(trigger).toHaveAccessibleName("Account menu for ada@example.test");
    expect(trigger).toHaveTextContent("A");

    await user.click(trigger);
    // Shown once as the name, not repeated as a separate email line.
    expect(screen.getAllByText("ada@example.test", { selector: "p" })).toHaveLength(1);
  });

  it("closes on Escape and returns focus to the button", async () => {
    const { user, trigger } = renderMenu();
    await user.click(trigger);
    await user.tab();

    await user.keyboard("{Escape}");

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("closes on a click outside, on Tab out, and after choosing an option", async () => {
    const { user, trigger } = renderMenu();

    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Outside" }));
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    await user.tab(); // Calendar (Edit profile is disabled, so Tab skips it)
    await user.tab(); // Sign out
    await user.tab(); // Outside
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    await user.click(screen.getByRole("link", { name: "Calendar" }));
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("calls onSignOut when Sign out is chosen", async () => {
    const { user, trigger, onSignOut } = renderMenu();
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });

  it("disables sign out while it is in progress", async () => {
    const { user, trigger } = renderMenu(ada, { isSigningOut: true });
    await user.click(trigger);
    expect(screen.getByRole("button", { name: "Signing out..." })).toBeDisabled();
  });
});
