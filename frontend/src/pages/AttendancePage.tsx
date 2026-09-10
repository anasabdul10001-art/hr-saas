import { type FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { AttendanceRecord, Employee } from "../lib/types";

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export function AttendancePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = user?.role === "COMPANY_ADMIN" || user?.role === "HR";
  const canViewTeam = canManage || user?.role === "MANAGER";

  const myEmployee = useQuery({
    queryKey: ["employees", "me"],
    queryFn: async () => (await api.get("/employees/me")).data,
    retry: false,
  });

  const myAttendance = useQuery({
    queryKey: ["attendance", "me"],
    queryFn: async () => (await api.get<AttendanceRecord[]>("/attendance/me")).data,
    enabled: myEmployee.isSuccess,
  });

  const teamAttendance = useQuery({
    queryKey: ["attendance", "team"],
    queryFn: async () => (await api.get<AttendanceRecord[]>("/attendance")).data,
    enabled: canViewTeam,
  });

  const employees = useQuery({
    queryKey: ["employees"],
    queryFn: async () => (await api.get<Employee[]>("/employees")).data,
    enabled: canManage,
  });

  const openRecord = myAttendance.data?.find((r) => !r.checkOut);

  const checkIn = useMutation({
    mutationFn: async () => (await api.post("/attendance/check-in")).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["attendance"] }),
  });
  const checkOut = useMutation({
    mutationFn: async () => (await api.post("/attendance/check-out")).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["attendance"] }),
  });

  const [manualForm, setManualForm] = useState({ employeeId: "", checkIn: "", checkOut: "", notes: "" });
  const [manualError, setManualError] = useState<string | null>(null);

  const createManual = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        employeeId: manualForm.employeeId,
        checkIn: new Date(manualForm.checkIn).toISOString(),
      };
      if (manualForm.checkOut) payload.checkOut = new Date(manualForm.checkOut).toISOString();
      if (manualForm.notes) payload.notes = manualForm.notes;
      return (await api.post("/attendance/manual", payload)).data;
    },
    onSuccess: () => {
      setManualForm({ employeeId: "", checkIn: "", checkOut: "", notes: "" });
      queryClient.invalidateQueries({ queryKey: ["attendance", "team"] });
    },
    onError: (err: unknown) => {
      setManualError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to add record");
    },
  });

  function handleManualSubmit(e: FormEvent) {
    e.preventDefault();
    setManualError(null);
    createManual.mutate();
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Attendance</h1>
          <Link to="/dashboard" className="text-sm text-gray-600 underline">
            Back to dashboard
          </Link>
        </div>

        {myEmployee.isSuccess && (
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {openRecord ? `Checked in at ${formatDateTime(openRecord.checkIn)}` : "Not checked in"}
                </p>
                <p className="text-xs text-gray-500">Self check-in/out for your own attendance</p>
              </div>
              {openRecord ? (
                <button
                  onClick={() => checkOut.mutate()}
                  disabled={checkOut.isPending}
                  className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  Check out
                </button>
              ) : (
                <button
                  onClick={() => checkIn.mutate()}
                  disabled={checkIn.isPending}
                  className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  Check in
                </button>
              )}
            </div>

            <div className="mt-4 divide-y divide-gray-100 border-t border-gray-100 pt-2">
              {myAttendance.data?.length === 0 && <p className="py-2 text-sm text-gray-500">No attendance records yet.</p>}
              {myAttendance.data?.slice(0, 10).map((r) => (
                <div key={r.id} className="flex justify-between py-2 text-sm">
                  <span className="text-gray-900">
                    {formatDateTime(r.checkIn)} → {formatDateTime(r.checkOut)}
                  </span>
                  <span className="text-xs text-gray-500">{r.source}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {canManage && (
          <form onSubmit={handleManualSubmit} className="grid grid-cols-2 gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="col-span-2 text-sm font-medium text-gray-900">Add manual record</h2>
            <select
              className="col-span-2 rounded border border-gray-300 px-3 py-2 text-sm"
              value={manualForm.employeeId}
              onChange={(e) => setManualForm({ ...manualForm, employeeId: e.target.value })}
              required
            >
              <option value="">Select employee…</option>
              {employees.data?.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.firstName} {emp.lastName}
                </option>
              ))}
            </select>
            <label className="text-xs text-gray-600">
              Check-in
              <input
                type="datetime-local"
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                value={manualForm.checkIn}
                onChange={(e) => setManualForm({ ...manualForm, checkIn: e.target.value })}
                required
              />
            </label>
            <label className="text-xs text-gray-600">
              Check-out (optional)
              <input
                type="datetime-local"
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                value={manualForm.checkOut}
                onChange={(e) => setManualForm({ ...manualForm, checkOut: e.target.value })}
              />
            </label>
            <input
              className="col-span-2 rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder="Notes (e.g. reason for manual entry)"
              value={manualForm.notes}
              onChange={(e) => setManualForm({ ...manualForm, notes: e.target.value })}
            />
            {manualError && <p className="col-span-2 text-sm text-red-600">{manualError}</p>}
            <button
              type="submit"
              disabled={createManual.isPending}
              className="col-span-2 rounded bg-gray-900 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {createManual.isPending ? "Saving…" : "Add record"}
            </button>
          </form>
        )}

        {canViewTeam && (
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <h2 className="border-b border-gray-100 p-4 text-sm font-medium text-gray-900">Team attendance</h2>
            <div className="divide-y divide-gray-100">
              {teamAttendance.data?.length === 0 && <p className="p-4 text-sm text-gray-500">No records yet.</p>}
              {teamAttendance.data?.map((r) => (
                <div key={r.id} className="flex justify-between p-4 text-sm">
                  <span className="text-gray-900">
                    {r.employee?.firstName} {r.employee?.lastName} — {formatDateTime(r.checkIn)} → {formatDateTime(r.checkOut)}
                  </span>
                  <span className="text-xs text-gray-500">{r.source}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
