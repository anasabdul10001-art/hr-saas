import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Logo } from "../components/Logo";

export function SuperAdminLoginPage() {
  const { login, logout } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const loggedInUser = await login(email, password);
      if (loggedInUser.role !== "SUPER_ADMIN") {
        // This entry point is only for the platform owner — a valid company login here still
        // doesn't belong on the admin dashboard, so don't leave that session active.
        await logout();
        setError("This sign-in is for platform administrators only.");
        return;
      }
      navigate("/admin");
    } catch {
      setError("Invalid email or password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <Logo />
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white">Platform Admin</span>
        </div>
        <form onSubmit={handleSubmit} className="card space-y-4 p-6">
          <h1 className="text-lg font-semibold text-slate-900">Admin sign-in</h1>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Email</label>
            <input type="email" className="input-field" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Password</label>
            <input
              type="password"
              className="input-field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
