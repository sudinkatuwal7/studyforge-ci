import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  RefreshRejectedError,
  logout,
  refreshAccessToken,
  restoreSession,
  type LoginResult,
} from "../api/auth";
import { fetchWithAccessToken } from "../api/client";

// Why the last session ended, so the login screen can explain it.
export type SignedOutReason = "signed_out" | "expired";

type AuthContextValue = {
  accessToken: string | null;
  user: LoginResult["user"] | null;
  isRestoring: boolean;
  isSigningOut: boolean;
  signedOutReason: SignedOutReason | null;
  saveLogin: (result: LoginResult) => void;
  signOut: () => Promise<void>;
  authenticatedFetch: (
    path: string,
    options?: RequestInit,
  ) => Promise<Response>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<LoginResult | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signedOutReason, setSignedOutReason] = useState<SignedOutReason | null>(null);

  const sessionRef = useRef<LoginResult | null>(null);
  const sessionVersionRef = useRef(0);
  const refreshPromiseRef = useRef<Promise<string> | null>(null);

  // A new login clears the reason. Ending a session records one, or null when
  // there was nothing to end, such as a first visit with no refresh cookie.
  function storeSession(
    next: LoginResult | null,
    reason: SignedOutReason | null = null,
  ) {
    sessionVersionRef.current += 1;
    sessionRef.current = next;
    refreshPromiseRef.current = null;
    setSession(next);
    setSignedOutReason(next ? null : reason);
  }

  async function signOut() {
    setIsSigningOut(true);
    try {
      // Wait for the server, so a late logout response cannot delete the
      // cookie of a login that happens right after it.
      await logout();
    } catch {
      // End the local session anyway. If the request never reached the
      // server, the HttpOnly cookie survives and a reload signs back in.
    } finally {
      storeSession(null, "signed_out");
      setIsSigningOut(false);
    }
  }

  function sharedRefresh(): Promise<string> {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const pending = refreshAccessToken();
    refreshPromiseRef.current = pending;

    const clearPending = () => {
      if (refreshPromiseRef.current === pending) {
        refreshPromiseRef.current = null;
      }
    };

    void pending.then(clearPending, clearPending);
    return pending;
  }

  useEffect(() => {
    let cancelled = false;

        // StrictMode runs this effect twice in development. Sharing the refresh keeps
    // that to one request, because a second one would reuse a single-use token.
    restoreSession(sharedRefresh)

      .then((result) => {
        if (!cancelled) storeSession(result);
      })
      .catch(() => {
        if (!cancelled) storeSession(null);
      })
      .finally(() => {
        if (!cancelled) setIsRestoring(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function authenticatedFetch(
    path: string,
    options: RequestInit = {},
  ): Promise<Response> {
    const current = sessionRef.current;
    if (!current) {
      throw new Error("Please sign in first.");
    }

    const sessionVersion = sessionVersionRef.current;
    let response = await fetchWithAccessToken(
      path,
      current.access,
      options,
    );

    if (response.status !== 401) {
      return response;
    }

    if (
      sessionVersionRef.current !== sessionVersion ||
      !sessionRef.current
    ) {
      throw new Error("Session changed. Please try again.");
    }

    // Another request may already have refreshed this access token.
    let access = sessionRef.current.access;

    if (access === current.access) {
      try {
        access = await sharedRefresh();
      } catch (error) {
        if (
          error instanceof RefreshRejectedError &&
          sessionVersionRef.current === sessionVersion
        ) {
          storeSession(null, "expired");
        }
        throw error;
      }

      if (
        sessionVersionRef.current !== sessionVersion ||
        !sessionRef.current
      ) {
        throw new Error("Session changed. Please try again.");
      }

      const updated = { ...sessionRef.current, access };
      sessionRef.current = updated;
      setSession(updated);
    }

    response = await fetchWithAccessToken(path, access, options);

    if (
      response.status === 401 &&
      sessionVersionRef.current === sessionVersion
    ) {
      storeSession(null, "expired");
    }

    return response;
  }

  const value: AuthContextValue = {
    accessToken: session?.access ?? null,
    user: session?.user ?? null,
    isRestoring,
    isSigningOut,
    signedOutReason,
    saveLogin: (result) => storeSession(result),
    signOut,
    authenticatedFetch,
  };

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (context === null) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}