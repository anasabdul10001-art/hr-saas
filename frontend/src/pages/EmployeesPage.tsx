import { type FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { Department, Employee } from "../lib/types";

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
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Employees</h1>
          <div className="flex gap-4 text-sm">
            <Link to="/departments" className="text-gray-600 underline">
              Departments
            </Link>
            <Link to="/dashboard" className="text-gray-600 underline">
              Back to dashboard
            </Link>
          </div>
        </div>

        {canManage && (
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <input
              className="rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder="First name"
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              required
            />
            <input
              className="rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder="Last name"
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              required
            />
            <select
              className="rounded border border-gray-300 px-3 py-2 text-sm"
              value={form.departmentId}
              onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
            >
              <option value="">No department</option>
              {departments?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <select
              className="rounded border border-gray-300 px-3 py-2 text-sm"
              value={form.managerId}
              onChange={(e) => setForm({ ...form, managerId: e.target.value })}
            >
              <option value="">No manager</option>
              {employees?.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.firstName} {emp.lastName}
                </option>
              ))}
            </select>
            <input
              className="rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder="Position"
              value={form.position}
              onChange={(e) => setForm({ ...form, position: e.target.value })}
            />
            <input
              type="date"
              className="rounded border border-gray-300 px-3 py-2 text-sm"
              value={form.hireDate}
              onChange={(e) => setForm({ ...form, hireDate: e.target.value })}
              required
            />
            <input
              type="email"
              className="rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder="Invite email (optional — grants self-service login)"
              value={form.inviteEmail}
              onChange={(e) => setForm({ ...form, inviteEmail: e.target.value })}
            />
            <select
              className="rounded border border-gray-300 px-3 py-2 text-sm"
              value={form.inviteRole}
              onChange={(e) => setForm({ ...form, inviteRole: e.target.value })}
              disabled={!form.inviteEmail}
            >
              <option value="EMPLOYEE">Employee</option>
              <option value="MANAGER">Manager</option>
              <option value="HR">HR</option>
            </select>

            <button
              type="submit"
              disabled={createEmployee.isPending}
              className="col-span-2 rounded bg-gray-900 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {createEmployee.isPending ? "Creating…" : "Add employee"}
            </button>
          </form>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        {lastInvite && (
          <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Temp password for {lastInvite.email}: <code className="font-mono">{lastInvite.tempPassword}</code> (would be
            emailed in production)
          </p>
        )}

        <div className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white shadow-sm">
          {isLoading && <p className="p-4 text-sm text-gray-500">Loading…</p>}
          {employees?.length === 0 && <p className="p-4 text-sm text-gray-500">No employees visible to you yet.</p>}
          {employees?.map((emp) => (
            <div key={emp.id} className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {emp.firstName} {emp.lastName}
                </p>
                <p className="text-xs text-gray-500">
                  {emp.department?.name ?? "No department"}
                  {emp.manager ? ` · Reports to ${emp.manager.firstName} ${emp.manager.lastName}` : ""}
                  {emp.user ? ` · ${emp.user.email} (${emp.user.role})` : " · No login"}
                </p>
              </div>
              <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700">{emp.employmentStatus}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
