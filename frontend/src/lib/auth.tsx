"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { AuthUser } from "@/lib/types";

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  hasPermission: (perm: string) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data } = await apiFetch<AuthUser>("/auth/me");
      setUser(data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (username: string, password: string) => {
    const { data } = await apiFetch<{ user: AuthUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch("/auth/logout", { method: "POST", body: JSON.stringify({}) });
    } catch {
      /* abaikan */
    } finally {
      setUser(null);
    }
  }, []);

  const hasPermission = useCallback(
    (perm: string) =>
      user?.permissions.includes("*") || user?.permissions.includes(perm) || false,
    [user],
  );

  const value = useMemo(
    () => ({ user, loading, login, logout, refresh, hasPermission }),
    [user, loading, login, logout, refresh, hasPermission],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth harus di dalam <AuthProvider>");
  return ctx;
}
