import { type FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { AppShell } from "../components/AppShell";
import type { LeaveBalanceEntry, LeaveRequest, LeaveType } from "../lib/types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString();
}

const statusStyles: Record<string, string> = {
  PENDING_MANAGER: "bg-amber-50 text-amber-700",
  PENDING_HR: "bg-amber-50 text-amber-700",
  APPROVED: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-rose-50 text-rose-700",
  CANCELED: "bg-slate-100 text-slate-500",
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
    <AppShell title="Leave">
      <div className="space-y-4">
        {myBalances.isSuccess && (
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-900">My balances</h2>
            <div className="mt-2 flex gap-4">
              {myBalances.data.map((b) => (
                <div key={b.leaveType.id} className="text-sm">
                  <span className="text-slate-500">{b.leaveType.name}: </span>
                  <span className="font-medium text-slate-900">{b.balanceDays} day(s)</span>
                </div>
              ))}
            </div>

            <form onSubmit={handleRequestSubmit} className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
              <select
                className="input-field col-span-2"
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
              <label className="text-xs text-slate-600">
                Start date
                <input
                  type="date"
                  className="input-field mt-1"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  required
                />
              </label>
              <label className="text-xs text-slate-600">
                End date
                <input
                  type="date"
                  className="input-field mt-1"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  required
                />
              </label>
              <input
                className="input-field col-span-2"
                placeholder="Reason (optional)"
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              />
              {requestError && <p className="col-span-2 text-sm text-rose-600">{requestError}</p>}
              <button type="submit" disabled={createRequest.isPending} className="btn-primary col-span-2">
                {createRequest.isPending ? "Submitting…" : "Request leave"}
              </button>
            </form>

            <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100 pt-2">
              {myRequests.data?.length === 0 && <p className="py-2 text-sm text-slate-500">No leave requests yet.</p>}
              {myRequests.data?.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-slate-900">
                    {r.leaveType.name}: {formatDate(r.startDate)} → {formatDate(r.endDate)}
                    {r.rejectionReason && <span className="ml-2 text-xs text-rose-600">({r.rejectionReason})</span>}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[r.status]}`}>{r.status}</span>
                    {(r.status === "PENDING_MANAGER" || r.status === "PENDING_HR") && (
                      <button onClick={() => cancelRequest.mutate(r.id)} className="text-xs text-slate-500 underline hover:text-slate-700">
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
            className="card flex items-end gap-2 p-4"
          >
            <label className="text-xs text-slate-600">
              New leave type
              <input
                className="input-field mt-1"
                placeholder="Name"
                value={typeForm.name}
                onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
                required
              />
            </label>
            <label className="text-xs text-slate-600">
              Days/year
              <input
                type="number"
                className="input-field mt-1 w-24"
                value={typeForm.defaultBalance}
                onChange={(e) => setTypeForm({ ...typeForm, defaultBalance: e.target.value })}
                required
              />
            </label>
            <button type="submit" disabled={createLeaveType.isPending} className="btn-primary">
              Add type
            </button>
          </form>
        )}

        {canApprove && (
          <div className="card">
            <h2 className="border-b border-slate-100 p-4 text-sm font-semibold text-slate-900">Approvals</h2>
            <div className="divide-y divide-slate-100">
              {teamRequests.data?.length === 0 && <p className="p-4 text-sm text-slate-500">No requests.</p>}
              {teamRequests.data?.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-4 text-sm">
                  <span className="text-slate-900">
                    {r.employee?.firstName} {r.employee?.lastName} — {r.leaveType.name}: {formatDate(r.startDate)} →{" "}
                    {formatDate(r.endDate)}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[r.status]}`}>{r.status}</span>
                    {canDecideOn(r.status) && (
                      <>
                        <button
                          onClick={() => decide.mutate({ id: r.id, decision: "APPROVE" })}
                          className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                        >
                          <Check size={14} />
                          Approve
                        </button>
                        <button
                          onClick={() => {
                            const reason = window.prompt("Rejection reason (optional)") ?? undefined;
                            decide.mutate({ id: r.id, decision: "REJECT", reason });
                          }}
                          className="flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
                        >
                          <X size={14} />
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
    </AppShell>
  );
}
