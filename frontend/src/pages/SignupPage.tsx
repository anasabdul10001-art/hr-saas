import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState("");
  const [currency, setCurrency] = useState("usd");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signup({ companyName, currency, adminEmail, adminPassword });
      navigate("/dashboard");
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Signup failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900">Create your company account</h1>

        <div className="space-y-1">
          <label className="text-sm text-gray-700">Company name</label>
          <input
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-gray-700">Currency</label>
          <select
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            <option value="usd">USD</option>
            <option value="eur">EUR</option>
            <option value="jod">JOD</option>
            <option value="sar">SAR</option>
            <option value="aed">AED</option>
            <option value="egp">EGP</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm text-gray-700">Admin email</label>
          <input
            type="email"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-gray-700">Password</label>
          <input
            type="password"
            minLength={8}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            required
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-gray-900 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "Creating…" : "Create company"}
        </button>

        <p className="text-center text-sm text-gray-600">
          Already have an account?{" "}
          <Link to="/login" className="text-gray-900 underline">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}
