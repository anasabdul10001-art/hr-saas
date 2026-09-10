import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { AdminCompanyListItem, Plan, RevenueOverview } from "../lib/types";

function money(minorUnits: number) {
  return (minorUnits / 100).toFixed(2);
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString();
}

const statusStyles: Record<string, string> = {
  TRIALING: "bg-blue-100 text-blue-800",
  ACTIVE: "bg-green-100 text-green-800",
  PAST_DUE: "bg-amber-100 text-amber-800",
  CANCELED: "bg-red-100 text-red-800",
  EXPIRED: "bg-red-100 text-red-800",
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
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Super Admin — {user?.email}</h1>
          <button onClick={() => logout()} className="text-sm text-gray-600 underline">
            Log out
          </button>
        </div>

        {revenue.isSuccess && (
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-gray-500">MRR</p>
              <p className="text-lg font-semibold text-gray-900">${money(revenue.data.mrr)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-gray-500">ARR</p>
              <p className="text-lg font-semibold text-gray-900">${money(revenue.data.arr)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-gray-500">Active subscriptions</p>
              <p className="text-lg font-semibold text-gray-900">{revenue.data.countsByStatus.ACTIVE ?? 0}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-gray-500">Past due</p>
              <p className="text-lg font-semibold text-gray-900">{revenue.data.countsByStatus.PAST_DUE ?? 0}</p>
            </div>
          </div>
        )}

        {revenue.data && revenue.data.pastDueAccounts.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <p className="font-medium">Accounts needing attention:</p>
            {revenue.data.pastDueAccounts.map((a) => (
              <p key={a.companyId}>
                {a.companyName} ({a.plan})
              </p>
            ))}
          </div>
        )}

        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <h2 className="border-b border-gray-100 p-4 text-sm font-medium text-gray-900">Subscribers</h2>
          <div className="divide-y divide-gray-100">
            {companies.data?.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                <div>
                  <p className="font-medium text-gray-900">
                    {c.name} {c.isSuspended && <span className="text-xs text-red-600">(suspended)</span>}
                  </p>
                  <p className="text-xs text-gray-500">
                    {c.employeeCount} employee(s) · joined {formatDate(c.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {c.subscription && (
                    <span className={`rounded-full px-2 py-1 text-xs ${statusStyles[c.subscription.status]}`}>
                      {c.subscription.plan} · {c.subscription.status}
                    </span>
                  )}
                  <select
                    className="rounded border border-gray-300 px-2 py-1 text-xs"
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
                    className={`rounded px-2 py-1 text-xs text-white ${c.isSuspended ? "bg-green-600" : "bg-red-600"}`}
                  >
                    {c.isSuspended ? "Reactivate" : "Suspend"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
