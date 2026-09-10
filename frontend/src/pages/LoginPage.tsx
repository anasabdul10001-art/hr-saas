import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function LoginPage() {
  const { login } = useAuth();
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
      navigate(loggedInUser.role === "SUPER_ADMIN" ? "/admin" : "/dashboard");
    } catch {
      setError("Invalid email or password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900">Log in</h1>

        <div className="space-y-1">
          <label className="text-sm text-gray-700">Email</label>
          <input
            type="email"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-gray-700">Password</label>
          <input
            type="password"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-gray-900 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "Logging in…" : "Log in"}
        </button>

        <p className="text-center text-sm text-gray-600">
          Don't have a company yet?{" "}
          <Link to="/signup" className="text-gray-900 underline">
            Create one
          </Link>
        </p>
      </form>
    </div>
  );
}
