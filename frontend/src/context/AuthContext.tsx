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

// Every StudyForge tab in this browser hears when one of them ends a session.
const AUTH_CHANNEL = "studyforge-auth";

type SessionEndedMessage = { type: "session_ended"; reason: SignedOutReason };

function isSessionEndedMessage(data: unknown): data is SessionEndedMessage {
  if (typeof data !== "object" || data === null) return false;
  const { type, reason } = data as Record<string, unknown>;
  return type === "session_ended" && (reason === "signed_out" || reason === "expired");
}

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
  const channelRef = useRef<BroadcastChannel | null>(null);

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

  // End this tab's session and tell the other tabs, which end theirs without
  // broadcasting again, so the message cannot bounce between tabs.
  function endSession(reason: SignedOutReason) {
    storeSession(null, reason);
    channelRef.current?.postMessage({ type: "session_ended", reason });
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
      endSession("signed_out");
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
    // Older browsers have no BroadcastChannel; their tabs just stay independent.
    if (typeof BroadcastChannel === "undefined") return;

    const channel = new BroadcastChannel(AUTH_CHANNEL);
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (isSessionEndedMessage(event.data) && sessionRef.current) {
        storeSession(null, event.data.reason);
      }
    };
    channelRef.current = channel;

    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, []);

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
          endSession("expired");
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
      endSession("expired");
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