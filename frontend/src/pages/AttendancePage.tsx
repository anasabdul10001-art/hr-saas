import { type FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, LogIn, LogOut } from "lucide-react";
import { api, downloadFile } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { AppShell } from "../components/AppShell";
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
    <AppShell title="Attendance">
      <div className="space-y-4">
        {myEmployee.isSuccess && (
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {openRecord ? `Checked in at ${formatDateTime(openRecord.checkIn)}` : "Not checked in"}
                </p>
                <p className="text-xs text-slate-500">Self check-in/out for your own attendance</p>
              </div>
              {openRecord ? (
                <button onClick={() => checkOut.mutate()} disabled={checkOut.isPending} className="btn-primary bg-rose-600 hover:bg-rose-700">
                  <LogOut size={16} />
                  Check out
                </button>
              ) : (
                <button onClick={() => checkIn.mutate()} disabled={checkIn.isPending} className="btn-primary">
                  <LogIn size={16} />
                  Check in
                </button>
              )}
            </div>

            <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100 pt-2">
              {myAttendance.data?.length === 0 && <p className="py-2 text-sm text-slate-500">No attendance records yet.</p>}
              {myAttendance.data?.slice(0, 10).map((r) => (
                <div key={r.id} className="flex justify-between py-2 text-sm">
                  <span className="text-slate-900">
                    {formatDateTime(r.checkIn)} → {formatDateTime(r.checkOut)}
                  </span>
                  <span className="text-xs text-slate-500">{r.source}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {canManage && (
          <form onSubmit={handleManualSubmit} className="card grid grid-cols-2 gap-3 p-5">
            <h2 className="col-span-2 text-sm font-semibold text-slate-900">Add manual record</h2>
            <select
              className="input-field col-span-2"
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
            <label className="text-xs text-slate-600">
              Check-in
              <input
                type="datetime-local"
                className="input-field mt-1"
                value={manualForm.checkIn}
                onChange={(e) => setManualForm({ ...manualForm, checkIn: e.target.value })}
                required
              />
            </label>
            <label className="text-xs text-slate-600">
              Check-out (optional)
              <input
                type="datetime-local"
                className="input-field mt-1"
                value={manualForm.checkOut}
                onChange={(e) => setManualForm({ ...manualForm, checkOut: e.target.value })}
              />
            </label>
            <input
              className="input-field col-span-2"
              placeholder="Notes (e.g. reason for manual entry)"
              value={manualForm.notes}
              onChange={(e) => setManualForm({ ...manualForm, notes: e.target.value })}
            />
            {manualError && <p className="col-span-2 text-sm text-rose-600">{manualError}</p>}
            <button type="submit" disabled={createManual.isPending} className="btn-primary col-span-2">
              {createManual.isPending ? "Saving…" : "Add record"}
            </button>
          </form>
        )}

        {canViewTeam && (
          <div className="card">
            <div className="flex items-center justify-between border-b border-slate-100 p-4">
              <h2 className="text-sm font-semibold text-slate-900">Team attendance</h2>
              <button
                onClick={() => downloadFile("/reports/attendance.csv", "attendance.csv")}
                className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                <Download size={14} />
                Download CSV
              </button>
            </div>
            <div className="divide-y divide-slate-100">
              {teamAttendance.data?.length === 0 && <p className="p-4 text-sm text-slate-500">No records yet.</p>}
              {teamAttendance.data?.map((r) => (
                <div key={r.id} className="flex justify-between p-4 text-sm">
                  <span className="text-slate-900">
                    {r.employee?.firstName} {r.employee?.lastName} — {formatDateTime(r.checkIn)} → {formatDateTime(r.checkOut)}
                  </span>
                  <span className="text-xs text-slate-500">{r.source}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
