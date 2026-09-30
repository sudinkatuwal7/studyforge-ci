import { createContext, useContext, useState, type ReactNode } from "react";
import type { LoginResult } from "../api/auth";

type AuthContextValue = {
  accessToken: string | null;
  user: LoginResult["user"] | null;
  saveLogin: (result: LoginResult) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<LoginResult | null>(null);

  const value: AuthContextValue = {
    accessToken: session?.access ?? null,
    user: session?.user ?? null,
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