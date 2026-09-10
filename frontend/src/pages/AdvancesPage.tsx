import { type FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { SalaryAdvance } from "../lib/types";

function money(minorUnits: number) {
  return (minorUnits / 100).toFixed(2);
}

const statusStyles: Record<string, string> = {
  PENDING_MANAGER: "bg-amber-100 text-amber-800",
  PENDING_HR: "bg-amber-100 text-amber-800",
  APPROVED: "bg-blue-100 text-blue-800",
  REJECTED: "bg-red-100 text-red-800",
  REPAID: "bg-green-100 text-green-800",
};

export function AdvancesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canApprove = user?.role === "COMPANY_ADMIN" || user?.role === "HR" || user?.role === "MANAGER";

  const myAdvances = useQuery({
    queryKey: ["advances", "me"],
    queryFn: async () => (await api.get<SalaryAdvance[]>("/advances/me")).data,
  });

  const teamAdvances = useQuery({
    queryKey: ["advances", "team"],
    queryFn: async () => (await api.get<SalaryAdvance[]>("/advances")).data,
    enabled: canApprove,
  });

  function invalidateAdvances() {
    queryClient.invalidateQueries({ queryKey: ["advances"] });
  }

  function canDecideOn(status: SalaryAdvance["status"]) {
    if (user?.role === "COMPANY_ADMIN") return status === "PENDING_MANAGER" || status === "PENDING_HR";
    if (user?.role === "MANAGER") return status === "PENDING_MANAGER";
    if (user?.role === "HR") return status === "PENDING_HR";
    return false;
  }

  const [form, setForm] = useState({ amount: "", installmentsCount: "3", reason: "" });
  const [requestError, setRequestError] = useState<string | null>(null);

  const createRequest = useMutation({
    mutationFn: async () =>
      (
        await api.post("/advances", {
          amount: Math.round(Number(form.amount) * 100),
          installmentsCount: Number(form.installmentsCount),
          reason: form.reason || undefined,
        })
      ).data,
    onSuccess: () => {
      setForm({ amount: "", installmentsCount: "3", reason: "" });
      invalidateAdvances();
    },
    onError: (err: unknown) => {
      setRequestError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to submit request");
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setRequestError(null);
    createRequest.mutate();
  }

  const decide = useMutation({
    mutationFn: async ({ id, decision }: { id: string; decision: "APPROVE" | "REJECT" }) =>
      (await api.post(`/advances/${id}/decide`, { decision })).data,
    onSuccess: invalidateAdvances,
    onError: (err: unknown) => {
      alert((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to record decision");
    },
  });

  const hasOpenRequest = myAdvances.data?.some((a) => a.status === "PENDING_MANAGER" || a.status === "PENDING_HR" || a.status === "APPROVED");

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Salary Advances</h1>
          <Link to="/dashboard" className="text-sm text-gray-600 underline">
            Back to dashboard
          </Link>
        </div>

        {myAdvances.isSuccess && (
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-medium text-gray-900">My advances</h2>

            {!hasOpenRequest && (
              <form onSubmit={handleSubmit} className="mt-3 grid grid-cols-2 gap-3 border-t border-gray-100 pt-3">
                <label className="text-xs text-gray-600">
                  Amount
                  <input
                    type="number"
                    step="0.01"
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    required
                  />
                </label>
                <label className="text-xs text-gray-600">
                  Installments
                  <input
                    type="number"
                    min={1}
                    max={24}
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    value={form.installmentsCount}
                    onChange={(e) => setForm({ ...form, installmentsCount: e.target.value })}
                    required
                  />
                </label>
                <input
                  className="col-span-2 rounded border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Reason (optional)"
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                />
                {requestError && <p className="col-span-2 text-sm text-red-600">{requestError}</p>}
                <button
                  type="submit"
                  disabled={createRequest.isPending}
                  className="col-span-2 rounded bg-gray-900 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {createRequest.isPending ? "Submitting…" : "Request advance"}
                </button>
              </form>
            )}
            {hasOpenRequest && (
              <p className="mt-2 text-sm text-gray-500">
                You already have a pending or active advance — a new request can't be submitted until it's resolved.
              </p>
            )}

            <div className="mt-4 divide-y divide-gray-100 border-t border-gray-100 pt-2">
              {myAdvances.data.length === 0 && <p className="py-2 text-sm text-gray-500">No advance requests yet.</p>}
              {myAdvances.data.map((a) => (
                <div key={a.id} className="py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-900">
                      {money(a.amount)} in {a.installmentsCount} installment(s)
                      {a.reason && <span className="ml-2 text-xs text-gray-500">({a.reason})</span>}
                    </span>
                    <span className={`rounded-full px-2 py-1 text-xs ${statusStyles[a.status]}`}>{a.status}</span>
                  </div>
                  {a.status === "APPROVED" && (
                    <p className="mt-1 text-xs text-gray-500">
                      Repaid {money(a.paidAmount)} of {money(a.amount)} — {money(a.remainingAmount)} remaining
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {canApprove && (
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <h2 className="border-b border-gray-100 p-4 text-sm font-medium text-gray-900">Approvals</h2>
            <div className="divide-y divide-gray-100">
              {teamAdvances.data?.length === 0 && <p className="p-4 text-sm text-gray-500">No requests.</p>}
              {teamAdvances.data?.map((a) => (
                <div key={a.id} className="flex items-center justify-between p-4 text-sm">
                  <span className="text-gray-900">
                    {a.employee?.firstName} {a.employee?.lastName} — {money(a.amount)} in {a.installmentsCount} installment(s)
                    {a.reason && <span className="ml-2 text-xs text-gray-500">({a.reason})</span>}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-1 text-xs ${statusStyles[a.status]}`}>{a.status}</span>
                    {canDecideOn(a.status) && (
                      <>
                        <button
                          onClick={() => decide.mutate({ id: a.id, decision: "APPROVE" })}
                          className="rounded bg-green-600 px-2 py-1 text-xs text-white"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => decide.mutate({ id: a.id, decision: "REJECT" })}
                          className="rounded bg-red-600 px-2 py-1 text-xs text-white"
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
