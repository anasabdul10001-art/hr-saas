import { type FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { LeaveBalanceEntry, LeaveRequest, LeaveType } from "../lib/types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString();
}

const statusStyles: Record<string, string> = {
  PENDING_MANAGER: "bg-amber-100 text-amber-800",
  PENDING_HR: "bg-amber-100 text-amber-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  CANCELED: "bg-gray-100 text-gray-600",
};

export function LeavePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = user?.role === "COMPANY_ADMIN" || user?.role === "HR";
  const canApprove = canManage || user?.role === "MANAGER";

  // Company Admin can act at either stage; a Manager only at the manager stage; HR only at the
  // HR stage — mirrors the authorization the backend actually enforces in decide(), so we don't
  // show a button here that would just come back as a 400.
  function canDecideOn(status: LeaveRequest["status"]) {
    if (user?.role === "COMPANY_ADMIN") return status === "PENDING_MANAGER" || status === "PENDING_HR";
    if (user?.role === "MANAGER") return status === "PENDING_MANAGER";
    if (user?.role === "HR") return status === "PENDING_HR";
    return false;
  }

  const leaveTypes = useQuery({
    queryKey: ["leaveTypes"],
    queryFn: async () => (await api.get<LeaveType[]>("/leave-types")).data,
  });

  const myBalances = useQuery({
    queryKey: ["leaveBalances", "me"],
    queryFn: async () => (await api.get<LeaveBalanceEntry[]>("/leave-balances/me")).data,
  });

  const myRequests = useQuery({
    queryKey: ["leaveRequests", "me"],
    queryFn: async () => (await api.get<LeaveRequest[]>("/leave-requests/me")).data,
  });

  const teamRequests = useQuery({
    queryKey: ["leaveRequests", "team"],
    queryFn: async () => (await api.get<LeaveRequest[]>("/leave-requests")).data,
    enabled: canApprove,
  });

  function invalidateLeaveData() {
    queryClient.invalidateQueries({ queryKey: ["leaveRequests"] });
    queryClient.invalidateQueries({ queryKey: ["leaveBalances"] });
  }

  // Request leave form
  const [form, setForm] = useState({ leaveTypeId: "", startDate: "", endDate: "", reason: "" });
  const [requestError, setRequestError] = useState<string | null>(null);

  const createRequest = useMutation({
    mutationFn: async () => (await api.post("/leave-requests", form)).data,
    onSuccess: () => {
      setForm({ leaveTypeId: "", startDate: "", endDate: "", reason: "" });
      invalidateLeaveData();
    },
    onError: (err: unknown) => {
      setRequestError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to submit request");
    },
  });

  function handleRequestSubmit(e: FormEvent) {
    e.preventDefault();
    setRequestError(null);
    createRequest.mutate();
  }

  const cancelRequest = useMutation({
    mutationFn: async (id: string) => (await api.post(`/leave-requests/${id}/cancel`)).data,
    onSuccess: invalidateLeaveData,
  });

  const decide = useMutation({
    mutationFn: async ({ id, decision, reason }: { id: string; decision: "APPROVE" | "REJECT"; reason?: string }) =>
      (await api.post(`/leave-requests/${id}/decide`, { decision, reason })).data,
    onSuccess: invalidateLeaveData,
    onError: (err: unknown) => {
      alert((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to record decision");
    },
  });

  // Leave type management form (Admin/HR)
  const [typeForm, setTypeForm] = useState({ name: "", defaultBalance: "", isPaid: true });
  const createLeaveType = useMutation({
    mutationFn: async () =>
      (
        await api.post("/leave-types", {
          name: typeForm.name,
          defaultBalance: Number(typeForm.defaultBalance),
          isPaid: typeForm.isPaid,
        })
      ).data,
    onSuccess: () => {
      setTypeForm({ name: "", defaultBalance: "", isPaid: true });
      queryClient.invalidateQueries({ queryKey: ["leaveTypes"] });
    },
  });

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Leave</h1>
          <Link to="/dashboard" className="text-sm text-gray-600 underline">
            Back to dashboard
          </Link>
        </div>

        {myBalances.isSuccess && (
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-medium text-gray-900">My balances</h2>
            <div className="mt-2 flex gap-4">
              {myBalances.data.map((b) => (
                <div key={b.leaveType.id} className="text-sm">
                  <span className="text-gray-500">{b.leaveType.name}: </span>
                  <span className="font-medium text-gray-900">{b.balanceDays} day(s)</span>
                </div>
              ))}
            </div>

            <form onSubmit={handleRequestSubmit} className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-4">
              <select
                className="col-span-2 rounded border border-gray-300 px-3 py-2 text-sm"
                value={form.leaveTypeId}
                onChange={(e) => setForm({ ...form, leaveTypeId: e.target.value })}
                required
              >
                <option value="">Select leave type…</option>
                {leaveTypes.data?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <label className="text-xs text-gray-600">
                Start date
                <input
                  type="date"
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  required
                />
              </label>
              <label className="text-xs text-gray-600">
                End date
                <input
                  type="date"
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
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
                {createRequest.isPending ? "Submitting…" : "Request leave"}
              </button>
            </form>

            <div className="mt-4 divide-y divide-gray-100 border-t border-gray-100 pt-2">
              {myRequests.data?.length === 0 && <p className="py-2 text-sm text-gray-500">No leave requests yet.</p>}
              {myRequests.data?.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-gray-900">
                    {r.leaveType.name}: {formatDate(r.startDate)} → {formatDate(r.endDate)}
                    {r.rejectionReason && <span className="ml-2 text-xs text-red-600">({r.rejectionReason})</span>}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-1 text-xs ${statusStyles[r.status]}`}>{r.status}</span>
                    {(r.status === "PENDING_MANAGER" || r.status === "PENDING_HR") && (
                      <button onClick={() => cancelRequest.mutate(r.id)} className="text-xs text-gray-500 underline">
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {canManage && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createLeaveType.mutate();
            }}
            className="flex items-end gap-2 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
          >
            <label className="text-xs text-gray-600">
              New leave type
              <input
                className="mt-1 rounded border border-gray-300 px-3 py-2 text-sm"
                placeholder="Name"
                value={typeForm.name}
                onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
                required
              />
            </label>
            <label className="text-xs text-gray-600">
              Days/year
              <input
                type="number"
                className="mt-1 w-24 rounded border border-gray-300 px-3 py-2 text-sm"
                value={typeForm.defaultBalance}
                onChange={(e) => setTypeForm({ ...typeForm, defaultBalance: e.target.value })}
                required
              />
            </label>
            <button
              type="submit"
              disabled={createLeaveType.isPending}
              className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Add type
            </button>
          </form>
        )}

        {canApprove && (
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <h2 className="border-b border-gray-100 p-4 text-sm font-medium text-gray-900">Approvals</h2>
            <div className="divide-y divide-gray-100">
              {teamRequests.data?.length === 0 && <p className="p-4 text-sm text-gray-500">No requests.</p>}
              {teamRequests.data?.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-4 text-sm">
                  <span className="text-gray-900">
                    {r.employee?.firstName} {r.employee?.lastName} — {r.leaveType.name}: {formatDate(r.startDate)} →{" "}
                    {formatDate(r.endDate)}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-1 text-xs ${statusStyles[r.status]}`}>{r.status}</span>
                    {canDecideOn(r.status) && (
                      <>
                        <button
                          onClick={() => decide.mutate({ id: r.id, decision: "APPROVE" })}
                          className="rounded bg-green-600 px-2 py-1 text-xs text-white"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => {
                            const reason = window.prompt("Rejection reason (optional)") ?? undefined;
                            decide.mutate({ id: r.id, decision: "REJECT", reason });
                          }}
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
