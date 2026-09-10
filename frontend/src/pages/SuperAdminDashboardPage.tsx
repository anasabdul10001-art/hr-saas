import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, DollarSign, TrendingUp, Users, AlertTriangle } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Logo } from "../components/Logo";
import type { AdminCompanyListItem, Plan, RevenueOverview } from "../lib/types";

function money(minorUnits: number) {
  return (minorUnits / 100).toFixed(2);
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString();
}

const statusStyles: Record<string, string> = {
  TRIALING: "bg-blue-50 text-blue-700",
  ACTIVE: "bg-emerald-50 text-emerald-700",
  PAST_DUE: "bg-amber-50 text-amber-700",
  CANCELED: "bg-rose-50 text-rose-700",
  EXPIRED: "bg-rose-50 text-rose-700",
};

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
            <span className="text-xs text-slate-400">{user?.email}</span>
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
      </main>
    </div>
  );
}
