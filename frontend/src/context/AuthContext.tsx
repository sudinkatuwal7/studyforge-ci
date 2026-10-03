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
  refreshAccessToken,
  restoreSession,
  type LoginResult,
} from "../api/auth";
import { fetchWithAccessToken } from "../api/client";

type AuthContextValue = {
  accessToken: string | null;
  user: LoginResult["user"] | null;
  isRestoring: boolean;
  saveLogin: (result: LoginResult) => void;
  clearSession: () => void;
  authenticatedFetch: (
    path: string,
    options?: RequestInit,
  ) => Promise<Response>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<LoginResult | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  const sessionRef = useRef<LoginResult | null>(null);
  const sessionVersionRef = useRef(0);
  const refreshPromiseRef = useRef<Promise<string> | null>(null);

  function storeSession(next: LoginResult | null) {
    sessionVersionRef.current += 1;
    sessionRef.current = next;
    refreshPromiseRef.current = null;
    setSession(next);
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

    restoreSession()
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
          storeSession(null);
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
      storeSession(null);
    }

    return response;
  }

  const value: AuthContextValue = {
    accessToken: session?.access ?? null,
    user: session?.user ?? null,
    isRestoring,
    saveLogin: storeSession,
    clearSession: () => storeSession(null),
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