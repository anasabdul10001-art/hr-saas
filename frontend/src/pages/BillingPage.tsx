import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import type { CompanySubscription, Plan } from "../lib/types";

function money(minorUnits: number) {
  return (minorUnits / 100).toFixed(2);
}
function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString() : "—";
}

const statusStyles: Record<string, string> = {
  TRIALING: "bg-blue-100 text-blue-800",
  ACTIVE: "bg-green-100 text-green-800",
  PAST_DUE: "bg-amber-100 text-amber-800",
  CANCELED: "bg-red-100 text-red-800",
  EXPIRED: "bg-red-100 text-red-800",
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
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Billing</h1>
          <Link to="/dashboard" className="text-sm text-gray-600 underline">
            Back to dashboard
          </Link>
        </div>

        {checkoutResult === "success" && (
          <p className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">Subscription updated.</p>
        )}
        {checkoutResult === "canceled" && (
          <p className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">Checkout was canceled.</p>
        )}

        {subscription.isSuccess && (
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Current plan: {subscription.data.plan.name}</p>
                <p className="text-xs text-gray-500">
                  {money(subscription.data.plan.priceMonthly)}/mo · up to {subscription.data.plan.maxEmployees} employees
                </p>
              </div>
              <span className={`rounded-full px-2 py-1 text-xs ${statusStyles[subscription.data.status]}`}>
                {subscription.data.status}
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-gray-100 pt-3 text-xs text-gray-500">
              {subscription.data.trialEndsAt && (
                <div>
                  Trial ends: <span className="text-gray-900">{formatDate(subscription.data.trialEndsAt)}</span>
                </div>
              )}
              {subscription.data.currentPeriodEnd && (
                <div>
                  Renews: <span className="text-gray-900">{formatDate(subscription.data.currentPeriodEnd)}</span>
                </div>
              )}
            </dl>
            {subscription.data.stripeCustomerId && (
              <button
                onClick={() => portal.mutate()}
                disabled={portal.isPending}
                className="mt-3 rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700 disabled:opacity-50"
              >
                Manage payment method
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          {plans.data?.map((plan) => (
            <div key={plan.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-medium text-gray-900">{plan.name}</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">
                ${money(plan.priceMonthly)}
                <span className="text-xs font-normal text-gray-500">/mo</span>
              </p>
              <p className="mt-1 text-xs text-gray-500">Up to {plan.maxEmployees} employees</p>
              <button
                onClick={() => checkout.mutate(plan.id)}
                disabled={checkout.isPending || subscription.data?.plan.id === plan.id}
                className="mt-3 w-full rounded bg-gray-900 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                {subscription.data?.plan.id === plan.id ? "Current plan" : "Choose plan"}
              </button>
            </div>
          ))}
        </div>

        {subscription.data && subscription.data.invoices.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <h2 className="border-b border-gray-100 p-4 text-sm font-medium text-gray-900">Invoices</h2>
            <div className="divide-y divide-gray-100">
              {subscription.data.invoices.map((inv) => (
                <div key={inv.id} className="flex justify-between p-4 text-sm">
                  <span className="text-gray-900">{formatDate(inv.issuedAt)}</span>
                  <span className="text-gray-500">
                    {money(inv.amountPaid)} {inv.currency.toUpperCase()} · {inv.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
