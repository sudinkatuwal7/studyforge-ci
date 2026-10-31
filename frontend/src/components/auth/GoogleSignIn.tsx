import { useEffect, useRef, useState } from "react";
import { AuthError, loginWithGoogle } from "../../api/auth";
import { useAuth } from "../../context/AuthContext";
import { GoogleIcon } from "./icons";
import type { SignInLock } from "./useSignInLock";

const GIS_SCRIPT_URL = "https://accounts.google.com/gsi/client";

type GoogleSignInProps = {
  // Google's own button wording: "Continue with Google" or "Sign up with Google".
  text: "continue_with" | "signup_with";
  // The page owns this message so it can show one error at a time on the card.
  error: string;
  onError: (message: string) => void;
  // Shared with the page's form, so only one sign-in request runs at a time.
  signInLock: SignInLock;
};

type Status = "loading" | "ready" | "unavailable";

// Every Google button on the page shares one script load.
let gisLoading: Promise<GoogleAccountsId> | null = null;

function loadGoogleIdentity(): Promise<GoogleAccountsId> {
  if (window.google?.accounts?.id) {
    return Promise.resolve(window.google.accounts.id);
  }

  gisLoading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      if (window.google?.accounts?.id) {
        resolve(window.google.accounts.id);
      } else {
        reject(new Error("Google Identity Services did not load"));
      }
    };
    script.onerror = () => {
      // Forget the failure so the next button can try again.
      gisLoading = null;
      script.remove();
      reject(new Error("Google Identity Services did not load"));
    };
    document.head.append(script);
  });
  return gisLoading;
}

// Google only gives an ID token through the button it draws itself (an iframe),
// so this renders Google's button into a slot instead of styling our own.
export default function GoogleSignIn({ text, error, onError, signInLock }: GoogleSignInProps) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const [status, setStatus] = useState<Status>(clientId ? "loading" : "unavailable");
  const [busy, setBusy] = useState(false);

  const slotRef = useRef<HTMLDivElement>(null);
  const { saveLogin } = useAuth();

  async function handleCredential(credential: string) {
    // A popup opened earlier can return while the form's request is running, or
    // a double click can send a second credential. Only one request may run.
    if (!signInLock.acquire()) return;
    setBusy(true);
    onError("");

    try {
      // On success App swaps to the signed-in shell and this card unmounts.
      saveLogin(await loginWithGoogle(credential));
    } catch (caught) {
      onError(
        caught instanceof AuthError
          ? caught.message
          : "Google sign-in failed. Please try again.",
      );
    } finally {
      signInLock.release();
      setBusy(false);
    }
  }

  // Google keeps the callbacks it was given, so they call through these refs to
  // always reach the current handleCredential and onError.
  const handleRef = useRef(handleCredential);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    handleRef.current = handleCredential;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;

    loadGoogleIdentity()
      .then((googleId) => {
        const slot = slotRef.current;
        if (cancelled || !slot) return;

        googleId.initialize({
          client_id: clientId,
          callback: (response) => {
            // A password sign-in can finish while the popup is open. Don't then
            // replace that session with whichever account the popup returns.
            if (!cancelled) void handleRef.current(response.credential);
          },
          context: text === "signup_with" ? "signup" : "signin",
          ux_mode: "popup",
        });
        googleId.renderButton(slot, {
          type: "standard",
          theme: "outline",
          size: "large",
          shape: "pill",
          text,
          logo_alignment: "center",
          // Google draws a fixed width, so match the card (its limits are 200-400px).
          width: String(Math.min(400, Math.max(200, slot.clientWidth))),
          // A click starts a new attempt, so the last attempt's error no longer applies.
          click_listener: () => onErrorRef.current(""),
        });
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("unavailable");
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, text]);

  if (status === "unavailable") {
    return (
      <button type="button" className="auth-google" disabled>
        <GoogleIcon />
        Continue with Google
        <span className="soon-badge">Unavailable</span>
      </button>
    );
  }

  return (
    <div className="auth-google-signin">
      {error && (
        <p className="auth-alert" role="alert">
          {error}
        </p>
      )}
      <div
        ref={slotRef}
        className="auth-google-slot"
        aria-busy={status === "loading" || signInLock.locked}
        // Also stops keyboard users, who can reach the iframe despite the CSS.
        inert={signInLock.locked}
      />
      {busy && (
        <p className="auth-google-status" role="status">
          <span className="spinner" aria-hidden="true" />
          Signing in with Google...
        </p>
      )}
    </div>
  );
}
