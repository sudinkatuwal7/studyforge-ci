import { type FocusEvent, type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { PublicUser } from "../../api/auth";

type ProfileMenuProps = {
  user: PublicUser;
  isSigningOut: boolean;
  onSignOut: () => void;
};

// Account button in the top bar. It opens a panel with the user's name, email,
// profile options, and sign out (a disclosure, not an ARIA menu, so Tab works).
export default function ProfileMenu({ user, isSigningOut, onSignOut }: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // Accounts made before names were required may have blank names.
  const fullName = `${user.first_name.trim()} ${user.last_name.trim()}`.trim();
  const displayName = fullName || user.email;
  const shortName = user.first_name.trim() || user.email;
  const initials = initialsFor(user);

  // Close on a click anywhere outside the menu.
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && open) {
      setOpen(false);
      buttonRef.current?.focus();
    }
  }

  // Close when Tab moves focus out of the menu.
  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget;
    if (next instanceof Node && !event.currentTarget.contains(next)) {
      setOpen(false);
    }
  }

  return (
    <div className="profile-menu" ref={menuRef} onKeyDown={handleKeyDown} onBlur={handleBlur}>
      <button
        ref={buttonRef}
        type="button"
        className="profile-trigger"
        aria-label={`Account menu for ${displayName}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="avatar" aria-hidden="true">{initials}</span>
        <span className="profile-trigger-name">{shortName}</span>
        <ChevronIcon />
      </button>

      <div id={panelId} className="profile-panel" hidden={!open}>
        <div className="profile-summary">
          <span className="avatar" aria-hidden="true">{initials}</span>
          <div>
            <p className="profile-name">{displayName}</p>
            {fullName && <p className="profile-email">{user.email}</p>}
          </div>
        </div>

        <ul className="profile-options">
          <li>
            {/* Placeholder: the backend has no profile-editing API yet. */}
            <button type="button" className="profile-option" disabled>
              Edit profile
              <span className="soon-badge">Coming soon</span>
            </button>
          </li>
          <li>
            <Link to="/calendar" className="profile-option" onClick={() => setOpen(false)}>
              Calendar
            </Link>
          </li>
        </ul>

        <button
          type="button"
          className="profile-option profile-signout"
          onClick={onSignOut}
          disabled={isSigningOut}
        >
          {isSigningOut ? "Signing out..." : "Sign out"}
        </button>
      </div>
    </div>
  );
}

function initialsFor(user: PublicUser): string {
  const letters = [user.first_name, user.last_name]
    .map((name) => name.trim().charAt(0))
    .join("");
  return (letters || user.email.trim().charAt(0) || "?").toUpperCase();
}

function ChevronIcon() {
  return (
    <svg className="profile-chevron" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m7 10 5 5 5-5" />
    </svg>
  );
}
