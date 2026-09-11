import { type FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { LogOut, DollarSign, TrendingUp, Users, AlertTriangle, CreditCard, Tag, Plus } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Logo } from "../components/Logo";
import { Avatar } from "../components/Avatar";
import type { AdminCompanyListItem, Plan, PlatformSettings, RevenueOverview } from "../lib/types";

function money(minorUnits: number) {
  return (minorUnits / 100).toFixed(2);
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString();
}
function errorMessage(err: unknown, fallback: string) {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;
}

const statusStyles: Record<string, string> = {
  TRIALING: "bg-blue-50 text-blue-700",
  ACTIVE: "bg-emerald-50 text-emerald-700",
  PAST_DUE: "bg-amber-50 text-amber-700",
  CANCELED: "bg-rose-50 text-rose-700",
  EXPIRED: "bg-rose-50 text-rose-700",
};

function PlansSection() {
  const queryClient = useQueryClient();
  const plans = useQuery({
    queryKey: ["plans"],
    queryFn: async () => (await api.get<Plan[]>("/plans")).data,
  });

  function invalidatePlans() {
    queryClient.invalidateQueries({ queryKey: ["plans"] });
  }

  const [editValues, setEditValues] = useState<Record<string, { price: string; maxEmployees: string }>>({});

  function valuesFor(plan: Plan) {
    return editValues[plan.id] ?? { price: money(plan.priceMonthly), maxEmployees: String(plan.maxEmployees) };
  }

  const updatePlan = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<{ priceMonthly: number; maxEmployees: number; isActive: boolean }> }) =>
      (await api.patch(`/plans/${id}`, data)).data,
    onSuccess: invalidatePlans,
    onError: (err: unknown) => alert(errorMessage(err, "Failed to update plan")),
  });

  const [createForm, setCreateForm] = useState({ name: "", price: "", maxEmployees: "", featuresCsv: "" });
  const [createError, setCreateError] = useState<string | null>(null);

  const createPlan = useMutation({
    mutationFn: async () => {
      const features: Record<string, boolean> = {};
      createForm.featuresCsv
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean)
        .forEach((f) => (features[f] = true));

      return (
        await api.post("/plans", {
          name: createForm.name,
          priceMonthly: Math.round(Number(createForm.price) * 100),
          maxEmployees: Number(createForm.maxEmployees),
          features,
        })
      ).data;
    },
    onSuccess: () => {
      setCreateForm({ name: "", price: "", maxEmployees: "", featuresCsv: "" });
      setCreateError(null);
      invalidatePlans();
    },
    onError: (err: unknown) => setCreateError(errorMessage(err, "Failed to create plan")),
  });

  function handleCreateSubmit(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    createPlan.mutate();
  }

  return (
    <div className="card">
      <div className="flex items-center gap-2 border-b border-slate-100 p-4">
        <Tag size={16} className="text-brand-600" />
        <h2 className="text-sm font-semibold text-slate-900">Plans & pricing</h2>
      </div>

      <div className="divide-y divide-slate-100">
        {plans.data?.map((plan) => {
          const values = valuesFor(plan);
          return (
            <div key={plan.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
              <span className={`w-28 shrink-0 font-medium ${plan.isActive ? "text-slate-900" : "text-slate-400 line-through"}`}>
                {plan.name}
              </span>
              <label className="flex items-center gap-1 text-xs text-slate-500">
                $
                <input
                  type="number"
                  step="0.01"
                  className="w-20 rounded border border-slate-200 px-2 py-1 text-xs"
                  value={values.price}
                  onChange={(e) => setEditValues({ ...editValues, [plan.id]: { ...values, price: e.target.value } })}
                />
                /mo
              </label>
              <label className="flex items-center gap-1 text-xs text-slate-500">
                max
                <input
                  type="number"
                  className="w-16 rounded border border-slate-200 px-2 py-1 text-xs"
                  value={values.maxEmployees}
                  onChange={(e) => setEditValues({ ...editValues, [plan.id]: { ...values, maxEmployees: e.target.value } })}
                />
                employees
              </label>
              <span className="text-xs text-slate-400">{Object.keys(plan.features).join(", ") || "no features set"}</span>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() =>
                    updatePlan.mutate({
                      id: plan.id,
                      data: { priceMonthly: Math.round(Number(values.price) * 100), maxEmployees: Number(values.maxEmployees) },
                    })
                  }
                  className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                >
                  Save
                </button>
                <button
                  onClick={() => updatePlan.mutate({ id: plan.id, data: { isActive: !plan.isActive } })}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium text-white ${plan.isActive ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
                >
                  {plan.isActive ? "Deactivate" : "Activate"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={handleCreateSubmit} className="flex flex-wrap items-end gap-2 border-t border-slate-100 p-4">
        <label className="text-xs text-slate-600">
          New plan name
          <input
            className="input-field mt-1 w-32"
            value={createForm.name}
            onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
            required
          />
        </label>
        <label className="text-xs text-slate-600">
          Price/mo ($)
          <input
            type="number"
            step="0.01"
            className="input-field mt-1 w-24"
            value={createForm.price}
            onChange={(e) => setCreateForm({ ...createForm, price: e.target.value })}
            required
          />
        </label>
        <label className="text-xs text-slate-600">
          Max employees
          <input
            type="number"
            className="input-field mt-1 w-24"
            value={createForm.maxEmployees}
            onChange={(e) => setCreateForm({ ...createForm, maxEmployees: e.target.value })}
            required
          />
        </label>
        <label className="text-xs text-slate-600">
          Features (comma-separated)
          <input
            className="input-field mt-1 w-48"
            placeholder="attendance, payroll, advances"
            value={createForm.featuresCsv}
            onChange={(e) => setCreateForm({ ...createForm, featuresCsv: e.target.value })}
          />
        </label>
        <button type="submit" disabled={createPlan.isPending} className="btn-primary">
          <Plus size={14} />
          Add plan
        </button>
        {createError && <p className="w-full text-xs text-rose-600">{createError}</p>}
      </form>
    </div>
  );
}

function PaymentSettingsSection() {
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await api.get<PlatformSettings>("/settings")).data,
  });

  const [form, setForm] = useState({ stripeSecretKey: "", stripeWebhookSecret: "" });
  const [success, setSuccess] = useState(false);

  const save = useMutation({
    mutationFn: async () => {
      const body: Record<string, string> = {};
      if (form.stripeSecretKey) body.stripeSecretKey = form.stripeSecretKey;
      if (form.stripeWebhookSecret) body.stripeWebhookSecret = form.stripeWebhookSecret;
      return (await api.patch<PlatformSettings>("/settings", body)).data;
    },
    onSuccess: () => {
      setForm({ stripeSecretKey: "", stripeWebhookSecret: "" });
      setSuccess(true);
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (err: unknown) => alert(errorMessage(err, "Failed to save settings")),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSuccess(false);
    save.mutate();
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2">
        <CreditCard size={16} className="text-brand-600" />
        <h2 className="text-sm font-semibold text-slate-900">Payment settings (Stripe)</h2>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Live here instead of backend/.env — takes effect immediately, no restart needed.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-700">
            Secret key{" "}
            {settings.data?.stripeSecretKeySet && (
              <span className="text-slate-400">— currently {settings.data.stripeSecretKeyMasked}</span>
            )}
          </label>
          <input
            type="password"
            className="input-field"
            placeholder="sk_live_… or sk_test_…"
            value={form.stripeSecretKey}
            onChange={(e) => setForm({ ...form, stripeSecretKey: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-700">
            Webhook signing secret{" "}
            {settings.data?.stripeWebhookSecretSet && (
              <span className="text-slate-400">— currently {settings.data.stripeWebhookSecretMasked}</span>
            )}
          </label>
          <input
            type="password"
            className="input-field"
            placeholder="whsec_…"
            value={form.stripeWebhookSecret}
            onChange={(e) => setForm({ ...form, stripeWebhookSecret: e.target.value })}
          />
        </div>
        {success && <p className="text-xs text-emerald-600">Saved.</p>}
        <button type="submit" disabled={save.isPending} className="btn-primary">
          {save.isPending ? "Saving…" : "Save"}
        </button>
      </form>
    </div>
  );
}

export function SuperAdminDashboardPage() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();

  const revenue = useQuery({
    queryKey: ["admin", "revenue"],
    queryFn: async () => (await api.get<RevenueOverview>("/admin/revenue")).data,
  });

  const companies = useQuery({
    queryKey: ["admin", "companies"],
    queryFn: async () => (await api.get<AdminCompanyListItem[]>("/admin/companies")).data,
  });

  const plans = useQuery({
    queryKey: ["plans"],
    queryFn: async () => (await api.get<Plan[]>("/plans")).data,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["admin"] });
  }

  const changePlan = useMutation({
    mutationFn: async ({ companyId, planId }: { companyId: string; planId: string }) =>
      (await api.patch(`/admin/companies/${companyId}/subscription`, { planId })).data,
    onSuccess: invalidate,
  });

  const toggleSuspend = useMutation({
    mutationFn: async ({ companyId, isSuspended }: { companyId: string; isSuspended: boolean }) =>
      (await api.patch(`/admin/companies/${companyId}/suspension`, { isSuspended })).data,
    onSuccess: invalidate,
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-800 bg-slate-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Logo compact />
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white">Super Admin</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/profile" className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs text-slate-300 hover:bg-white/5 hover:text-white">
              <Avatar name={user?.name} email={user?.email} avatarUrl={user?.avatarUrl} size="sm" />
              {user?.name || user?.email}
            </Link>
            <button onClick={() => logout()} className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-white">
              <LogOut size={15} />
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 p-6">
        {revenue.isSuccess && (
          <div className="grid grid-cols-4 gap-4">
            <div className="card flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <DollarSign size={18} />
              </div>
              <div>
                <p className="text-xs text-slate-500">MRR</p>
                <p className="text-lg font-semibold text-slate-900">${money(revenue.data.mrr)}</p>
              </div>
            </div>
            <div className="card flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <TrendingUp size={18} />
              </div>
              <div>
                <p className="text-xs text-slate-500">ARR</p>
                <p className="text-lg font-semibold text-slate-900">${money(revenue.data.arr)}</p>
              </div>
            </div>
            <div className="card flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <Users size={18} />
              </div>
              <div>
                <p className="text-xs text-slate-500">Active subscriptions</p>
                <p className="text-lg font-semibold text-slate-900">{revenue.data.countsByStatus.ACTIVE ?? 0}</p>
              </div>
            </div>
            <div className="card flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <AlertTriangle size={18} />
              </div>
              <div>
                <p className="text-xs text-slate-500">Past due</p>
                <p className="text-lg font-semibold text-slate-900">{revenue.data.countsByStatus.PAST_DUE ?? 0}</p>
              </div>
            </div>
          </div>
        )}

        {revenue.data && revenue.data.pastDueAccounts.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <p className="font-medium">Accounts needing attention:</p>
            {revenue.data.pastDueAccounts.map((a) => (
              <p key={a.companyId}>
                {a.companyName} ({a.plan})
              </p>
            ))}
          </div>
        )}

        <div className="card">
          <h2 className="border-b border-slate-100 p-4 text-sm font-semibold text-slate-900">Subscribers</h2>
          <div className="divide-y divide-slate-100">
            {companies.data?.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                <div>
                  <p className="font-medium text-slate-900">
                    {c.name} {c.isSuspended && <span className="text-xs text-rose-600">(suspended)</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {c.employeeCount} employee(s) · joined {formatDate(c.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {c.subscription && (
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[c.subscription.status]}`}>
                      {c.subscription.plan} · {c.subscription.status}
                    </span>
                  )}
                  <select
                    className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                    value=""
                    onChange={(e) => {
                      if (e.target.value) changePlan.mutate({ companyId: c.id, planId: e.target.value });
                    }}
                  >
                    <option value="">Change plan…</option>
                    {plans.data?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => toggleSuspend.mutate({ companyId: c.id, isSuspended: !c.isSuspended })}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-medium text-white ${c.isSuspended ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"}`}
                  >
                    {c.isSuspended ? "Reactivate" : "Suspend"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <PlansSection />
        <PaymentSettingsSection />
      </main>
    </div>
  );
}
