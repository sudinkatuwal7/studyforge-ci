import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import GoogleSignIn from "./GoogleSignIn";
import { useSignInLock } from "./useSignInLock";

// In its own file because this failure stays remembered in GoogleSignIn's
// module-level script load, which would affect any later test in the same file.
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ saveLogin: vi.fn() }),
}));

function GoogleButton() {
  const signInLock = useSignInLock();
  return <GoogleSignIn text="continue_with" error="" onError={vi.fn()} signInLock={signInLock} />;
}

afterEach(() => {
  vi.unstubAllEnvs();
  delete window.google;
});

it("stays unavailable until reload when the script loads without window.google", async () => {
  vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "client-id.apps.googleusercontent.com");
  const scriptSelector = 'script[src="https://accounts.google.com/gsi/client"]';

  const { unmount } = render(<GoogleButton />);
  const script = document.head.querySelector<HTMLScriptElement>(scriptSelector);
  await act(async () => script?.dispatchEvent(new Event("load")));

  expect(screen.getByRole("button", { name: /Continue with Google/ })).toBeDisabled();

  // Switching cards remounts the button, but the failure is remembered.
  unmount();
  render(<GoogleButton />);
  await act(async () => {});

  expect(screen.getByRole("button", { name: /Continue with Google/ })).toBeDisabled();
  expect(document.head.querySelectorAll(scriptSelector)).toHaveLength(1);
});
