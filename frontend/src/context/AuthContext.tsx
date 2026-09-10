import { createContext, useContext, useState, type ReactNode } from "react";
import { api } from "../lib/api";

type User = {
  id: string;
  email: string;
  role: string;
  companyId?: string | null;
};

type AuthContextValue = {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (input: { companyName: string; currency: string; adminEmail: string; adminPassword: string }) => Promise<void>;
  logout: () => Promise<void>;
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

  async function login(email: string, password: string) {
    const { data } = await api.post("/auth/login", { email, password });
    persistSession(data.user, data.accessToken, data.refreshToken);
    setUser(data.user);
  }

  async function signup(input: { companyName: string; currency: string; adminEmail: string; adminPassword: string }) {
    const { data } = await api.post("/auth/signup", input);
    const signedUpUser = { ...data.user, companyId: data.company.id };
    persistSession(signedUpUser, data.accessToken, data.refreshToken);
    setUser(signedUpUser);
  }

  async function logout() {
    const refreshToken = localStorage.getItem("refreshToken");
    if (refreshToken) await api.post("/auth/logout", { refreshToken }).catch(() => {});
    localStorage.removeItem("user");
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, login, signup, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
