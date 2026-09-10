import { type FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { AppShell } from "../components/AppShell";
import type { Department } from "../lib/types";

export function DepartmentsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = user?.role === "COMPANY_ADMIN" || user?.role === "HR";

  const { data: departments, isLoading } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => (await api.get<Department[]>("/departments")).data,
  });

  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createDepartment = useMutation({
    mutationFn: async () => (await api.post("/departments", { name })).data,
    onSuccess: () => {
      setName("");
      queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
    onError: (err: unknown) => {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to create department");
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    createDepartment.mutate();
  }

  return (
    <AppShell title="Departments">
      <div className="space-y-4">
        {canManage && (
          <form onSubmit={handleSubmit} className="card flex gap-2 p-4">
            <input
              className="input-field flex-1"
              placeholder="Department name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <button type="submit" disabled={createDepartment.isPending} className="btn-primary">
              <Plus size={16} />
              Add
            </button>
          </form>
        )}
        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="card divide-y divide-slate-100">
          {isLoading && <p className="p-4 text-sm text-slate-500">Loading…</p>}
          {departments?.length === 0 && <p className="p-4 text-sm text-slate-500">No departments yet.</p>}
          {departments?.map((dept) => (
            <div key={dept.id} className="flex items-center gap-3 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <Building2 size={16} />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900">{dept.name}</p>
                <p className="text-xs text-slate-500">
                  {dept._count.employees} employee{dept._count.employees === 1 ? "" : "s"}
                  {dept.manager ? ` · Manager: ${dept.manager.firstName} ${dept.manager.lastName}` : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
