import { type FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
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
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Departments</h1>
          <Link to="/dashboard" className="text-sm text-gray-600 underline">
            Back to dashboard
          </Link>
        </div>

        {canManage && (
          <form onSubmit={handleSubmit} className="flex gap-2 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <input
              className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder="Department name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <button
              type="submit"
              disabled={createDepartment.isPending}
              className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Add
            </button>
          </form>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white shadow-sm">
          {isLoading && <p className="p-4 text-sm text-gray-500">Loading…</p>}
          {departments?.length === 0 && <p className="p-4 text-sm text-gray-500">No departments yet.</p>}
          {departments?.map((dept) => (
            <div key={dept.id} className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium text-gray-900">{dept.name}</p>
                <p className="text-xs text-gray-500">
                  {dept._count.employees} employee{dept._count.employees === 1 ? "" : "s"}
                  {dept.manager ? ` · Manager: ${dept.manager.firstName} ${dept.manager.lastName}` : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
