import { createContext, useContext, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

type User = {
  id: string;
  email: string;
  role: string;
  companyId?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
};

type AuthContextValue = {
  user: User | null;
  login: (email: string, password: string) => Promise<User>;
  signup: (input: { companyName: string; currency: string; adminEmail: string; adminPassword: string }) => Promise<User>;
  logout: () => Promise<void>;
  updateUser: (patch: Partial<User>) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function loadStoredUser(): User | null {
  const raw = localStorage.getItem("user");
  return raw ? JSON.parse(raw) : null;
}

function persistSession(user: User, accessToken: string, refreshToken: string) {
  localStorage.setItem("user", JSON.stringify(user));
  localStorage.setItem("accessToken", accessToken);
  localStorage.setItem("refreshToken", refreshToken);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(loadStoredUser());
  const queryClient = useQueryClient();

  // Query keys (e.g. ["payslips", "me"]) are the same regardless of who's logged in, so without
  // clearing the cache on every account switch, a just-logged-in user can briefly render with
  // the previous user's cached data until their own fetch resolves.
  async function login(email: string, password: string) {
    const { data } = await api.post("/auth/login", { email, password });
    queryClient.clear();
    persistSession(data.user, data.accessToken, data.refreshToken);
    setUser(data.user);
    return data.user as User;
  }

  async function signup(input: { companyName: string; currency: string; adminEmail: string; adminPassword: string }) {
    const { data } = await api.post("/auth/signup", input);
    queryClient.clear();
    const signedUpUser = { ...data.user, companyId: data.company.id };
    persistSession(signedUpUser, data.accessToken, data.refreshToken);
    setUser(signedUpUser);
    return signedUpUser as User;
  }

  async function logout() {
    const refreshToken = localStorage.getItem("refreshToken");
    if (refreshToken) await api.post("/auth/logout", { refreshToken }).catch(() => {});
    localStorage.removeItem("user");
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    queryClient.clear();
    setUser(null);
  }

  // Lets the profile page reflect an edit (name, avatar) immediately without a full re-login —
  // the PATCH/upload response already has the fresh fields, no need to re-fetch.
  function updateUser(patch: Partial<User>) {
    setUser((current) => {
      if (!current) return current;
      const updated = { ...current, ...patch };
      localStorage.setItem("user", JSON.stringify(updated));
      return updated;
    });
  }

  return <AuthContext.Provider value={{ user, login, signup, logout, updateUser }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
