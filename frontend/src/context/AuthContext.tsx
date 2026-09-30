import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { restoreSession, type LoginResult } from "../api/auth";

type AuthContextValue = {
  accessToken: string | null;
  user: LoginResult["user"] | null;
  isRestoring: boolean;
  saveLogin: (result: LoginResult) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<LoginResult | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  useEffect(() => {
    let cancelled = false;

    restoreSession()
      .then((result) => {
        if (!cancelled) setSession(result);
      })
      .catch(() => {
        if (!cancelled) setSession(null);
      })
      .finally(() => {
        if (!cancelled) setIsRestoring(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const value: AuthContextValue = {
    accessToken: session?.access ?? null,
    user: session?.user ?? null,
    isRestoring,
    saveLogin: (result) => setSession(result),
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