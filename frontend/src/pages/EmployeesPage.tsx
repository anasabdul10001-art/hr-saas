import { type FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { AppShell } from "../components/AppShell";
import type { Department, Employee } from "../lib/types";

const statusStyles: Record<string, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700",
  ON_LEAVE: "bg-amber-50 text-amber-700",
  TERMINATED: "bg-slate-100 text-slate-500",
};

function Avatar({ firstName, lastName }: { firstName: string; lastName: string }) {
  const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
      {initials}
    </div>
  );
}

export function EmployeesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = user?.role === "COMPANY_ADMIN" || user?.role === "HR";

  const { data: employees, isLoading } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => (await api.get<Employee[]>("/employees")).data,
  });

  const { data: departments } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => (await api.get<Department[]>("/departments")).data,
    enabled: canManage,
  });

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    departmentId: "",
    managerId: "",
    position: "",
    hireDate: "",
    inviteEmail: "",
    inviteRole: "EMPLOYEE",
  });
  const [error, setError] = useState<string | null>(null);
  const [lastInvite, setLastInvite] = useState<{ email: string; tempPassword: string } | null>(null);

  const createEmployee = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        firstName: form.firstName,
        lastName: form.lastName,
        hireDate: form.hireDate,
      };
      if (form.departmentId) payload.departmentId = form.departmentId;
      if (form.managerId) payload.managerId = form.managerId;
      if (form.position) payload.position = form.position;
      if (form.inviteEmail) payload.invite = { email: form.inviteEmail, role: form.inviteRole };
      return (await api.post("/employees", payload)).data;
    },
    onSuccess: (data) => {
      if (data.tempPassword) setLastInvite({ email: form.inviteEmail, tempPassword: data.tempPassword });
      setForm({ firstName: "", lastName: "", departmentId: "", managerId: "", position: "", hireDate: "", inviteEmail: "", inviteRole: "EMPLOYEE" });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (err: unknown) => {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to create employee");
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLastInvite(null);
    createEmployee.mutate();
  }

  return (
    <AppShell title="Employees">
      <div className="space-y-4">
        {canManage && (
          <form onSubmit={handleSubmit} className="card grid grid-cols-2 gap-3 p-5">
            <input
              className="input-field"
              placeholder="First name"
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              required
            />
            <input
              className="input-field"
              placeholder="Last name"
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              required
            />
            <select className="input-field" value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
              <option value="">No department</option>
              {departments?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <select className="input-field" value={form.managerId} onChange={(e) => setForm({ ...form, managerId: e.target.value })}>
              <option value="">No manager</option>
              {employees?.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.firstName} {emp.lastName}
                </option>
              ))}
            </select>
            <input
              className="input-field"
              placeholder="Position"
              value={form.position}
              onChange={(e) => setForm({ ...form, position: e.target.value })}
            />
            <input
              type="date"
              className="input-field"
              value={form.hireDate}
              onChange={(e) => setForm({ ...form, hireDate: e.target.value })}
              required
            />
            <input
              type="email"
              className="input-field"
              placeholder="Invite email (optional — grants self-service login)"
              value={form.inviteEmail}
              onChange={(e) => setForm({ ...form, inviteEmail: e.target.value })}
            />
            <select
              className="input-field"
              value={form.inviteRole}
              onChange={(e) => setForm({ ...form, inviteRole: e.target.value })}
              disabled={!form.inviteEmail}
            >
              <option value="EMPLOYEE">Employee</option>
              <option value="MANAGER">Manager</option>
              <option value="HR">HR</option>
            </select>

            <button type="submit" disabled={createEmployee.isPending} className="btn-primary col-span-2">
              <UserPlus size={16} />
              {createEmployee.isPending ? "Creating…" : "Add employee"}
            </button>
          </form>
        )}

        {error && <p className="text-sm text-rose-600">{error}</p>}
        {lastInvite && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Temp password for {lastInvite.email}: <code className="font-mono">{lastInvite.tempPassword}</code> (would be
            emailed in production)
          </p>
        )}

        <div className="card divide-y divide-slate-100">
          {isLoading && <p className="p-4 text-sm text-slate-500">Loading…</p>}
          {employees?.length === 0 && <p className="p-4 text-sm text-slate-500">No employees visible to you yet.</p>}
          {employees?.map((emp) => (
            <div key={emp.id} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Avatar firstName={emp.firstName} lastName={emp.lastName} />
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {emp.firstName} {emp.lastName}
                  </p>
                  <p className="text-xs text-slate-500">
                    {emp.department?.name ?? "No department"}
                    {emp.manager ? ` · Reports to ${emp.manager.firstName} ${emp.manager.lastName}` : ""}
                    {emp.user ? ` · ${emp.user.email} (${emp.user.role})` : " · No login"}
                  </p>
                </div>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[emp.employmentStatus]}`}>
                {emp.employmentStatus}
              </span>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
