import { type FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { Logo } from "../components/Logo";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, newPassword });
      navigate("/login");
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to reset password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50/60 to-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Link to="/">
            <Logo />
          </Link>
        </div>
        <div className="card space-y-4 p-6">
          <h1 className="text-lg font-semibold text-slate-900">Set a new password</h1>

          {!token ? (
            <p className="text-sm text-rose-600">
              This link is missing its reset token. Request a new one from{" "}
              <Link to="/forgot-password" className="font-medium text-brand-600 hover:text-brand-700">
                the reset page
              </Link>
              .
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">New password</label>
                <input
                  type="password"
                  minLength={8}
                  className="input-field"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-sm text-rose-600">{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? "Saving…" : "Reset password"}
              </button>
            </form>
          )}

          <p className="text-center text-sm text-slate-600">
            <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
              Back to log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
