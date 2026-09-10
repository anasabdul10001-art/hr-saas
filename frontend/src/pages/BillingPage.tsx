import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { CreditCard, Check } from "lucide-react";
import { api } from "../lib/api";
import { AppShell } from "../components/AppShell";
import type { CompanySubscription, Plan } from "../lib/types";

function money(minorUnits: number) {
  return (minorUnits / 100).toFixed(2);
}
function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString() : "—";
}

const statusStyles: Record<string, string> = {
  TRIALING: "bg-blue-50 text-blue-700",
  ACTIVE: "bg-emerald-50 text-emerald-700",
  PAST_DUE: "bg-amber-50 text-amber-700",
  CANCELED: "bg-rose-50 text-rose-700",
  EXPIRED: "bg-rose-50 text-rose-700",
};

export function BillingPage() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const checkoutResult = searchParams.get("checkout");

  const subscription = useQuery({
    queryKey: ["billing", "subscription"],
    queryFn: async () => (await api.get<CompanySubscription>("/billing/subscription")).data,
  });

  const plans = useQuery({
    queryKey: ["plans"],
    queryFn: async () => (await api.get<Plan[]>("/plans")).data,
  });

  const checkout = useMutation({
    mutationFn: async (planId: string) => (await api.post("/billing/checkout", { planId })).data,
    onSuccess: (data) => {
      if (data.free) {
        queryClient.invalidateQueries({ queryKey: ["billing", "subscription"] });
      } else if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (err: unknown) => {
      alert((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Checkout failed");
    },
  });

  const portal = useMutation({
    mutationFn: async () => (await api.post("/billing/portal")).data,
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
    },
    onError: (err: unknown) => {
      alert((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Could not open billing portal");
    },
  });

  return (
    <AppShell title="Billing">
      <div className="space-y-4">
        {checkoutResult === "success" && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Subscription updated.</p>
        )}
        {checkoutResult === "canceled" && (
          <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">Checkout was canceled.</p>
        )}

        {subscription.isSuccess && (
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">Current plan: {subscription.data.plan.name}</p>
                <p className="text-xs text-slate-500">
                  {money(subscription.data.plan.priceMonthly)}/mo · up to {subscription.data.plan.maxEmployees} employees
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[subscription.data.status]}`}>
                {subscription.data.status}
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
              {subscription.data.trialEndsAt && (
                <div>
                  Trial ends: <span className="text-slate-900">{formatDate(subscription.data.trialEndsAt)}</span>
                </div>
              )}
              {subscription.data.currentPeriodEnd && (
                <div>
                  Renews: <span className="text-slate-900">{formatDate(subscription.data.currentPeriodEnd)}</span>
                </div>
              )}
            </dl>
            {subscription.data.stripeCustomerId && (
              <button onClick={() => portal.mutate()} disabled={portal.isPending} className="btn-secondary mt-3">
                <CreditCard size={14} />
                Manage payment method
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-3 gap-4">
          {plans.data?.map((plan) => {
            const isCurrent = subscription.data?.plan.id === plan.id;
            return (
              <div
                key={plan.id}
                className={`rounded-xl border bg-white p-5 shadow-sm ${isCurrent ? "border-brand-500 ring-1 ring-brand-500" : "border-slate-200"}`}
              >
                <p className="text-sm font-semibold text-slate-900">{plan.name}</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  ${money(plan.priceMonthly)}
                  <span className="text-xs font-normal text-slate-500">/mo</span>
                </p>
                <p className="mt-1 text-xs text-slate-500">Up to {plan.maxEmployees} employees</p>
                <ul className="mt-3 space-y-1.5 text-xs text-slate-600">
                  {Object.entries(plan.features)
                    .filter(([, enabled]) => enabled)
                    .map(([feature]) => (
                      <li key={feature} className="flex items-center gap-1.5">
                        <Check size={12} className="text-emerald-600" />
                        {feature.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}
                      </li>
                    ))}
                </ul>
                <button
                  onClick={() => checkout.mutate(plan.id)}
                  disabled={checkout.isPending || isCurrent}
                  className={isCurrent ? "btn-secondary mt-4 w-full" : "btn-primary mt-4 w-full"}
                >
                  {isCurrent ? "Current plan" : "Choose plan"}
                </button>
              </div>
            );
          })}
        </div>

        {subscription.data && subscription.data.invoices.length > 0 && (
          <div className="card">
            <h2 className="border-b border-slate-100 p-4 text-sm font-semibold text-slate-900">Invoices</h2>
            <div className="divide-y divide-slate-100">
              {subscription.data.invoices.map((inv) => (
                <div key={inv.id} className="flex justify-between p-4 text-sm">
                  <span className="text-slate-900">{formatDate(inv.issuedAt)}</span>
                  <span className="text-slate-500">
                    {money(inv.amountPaid)} {inv.currency.toUpperCase()} · {inv.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
