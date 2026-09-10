import { type FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { Employee, Payslip, PayrollRun, SalaryComponent, SalaryStructure } from "../lib/types";

function money(minorUnits: number) {
  return (minorUnits / 100).toFixed(2);
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString();
}

const runStatusStyles: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  PROCESSED: "bg-amber-100 text-amber-800",
  PAID: "bg-green-100 text-green-800",
};

export function PayrollPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = user?.role === "COMPANY_ADMIN" || user?.role === "HR";

  const myPayslips = useQuery({
    queryKey: ["payslips", "me"],
    queryFn: async () => (await api.get<Payslip[]>("/payroll-runs/payslips/me")).data,
  });

  const employees = useQuery({
    queryKey: ["employees"],
    queryFn: async () => (await api.get<Employee[]>("/employees")).data,
    enabled: canManage,
  });

  const salaryComponents = useQuery({
    queryKey: ["salaryComponents"],
    queryFn: async () => (await api.get<SalaryComponent[]>("/salary-components")).data,
    enabled: canManage,
  });

  const payrollRuns = useQuery({
    queryKey: ["payrollRuns"],
    queryFn: async () => (await api.get<PayrollRun[]>("/payroll-runs")).data,
    enabled: canManage,
  });

  // --- salary structure editor ---
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const salaryStructure = useQuery({
    queryKey: ["salaryStructure", selectedEmployeeId],
    queryFn: async () => (await api.get<SalaryStructure>(`/employee-salary/${selectedEmployeeId}`)).data,
    enabled: canManage && !!selectedEmployeeId,
  });

  const [baseSalaryInput, setBaseSalaryInput] = useState("");
  const [componentInputs, setComponentInputs] = useState<Record<string, string>>({});

  // Seed the editable inputs from the loaded structure so "Save" without retyping keeps the
  // existing value instead of submitting an empty field as zero.
  useEffect(() => {
    if (!salaryStructure.data) return;
    setBaseSalaryInput(salaryStructure.data.baseSalary !== null ? money(salaryStructure.data.baseSalary) : "");
    const seeded: Record<string, string> = {};
    for (const c of salaryStructure.data.components) {
      seeded[c.salaryComponentId] =
        c.salaryComponent.calculationType === "PERCENTAGE_OF_BASE"
          ? String(c.percentage ?? "")
          : c.fixedAmount !== null
            ? money(c.fixedAmount)
            : "";
    }
    setComponentInputs(seeded);
  }, [salaryStructure.data]);

  const saveBaseSalary = useMutation({
    mutationFn: async () =>
      (
        await api.put(`/employee-salary/${selectedEmployeeId}/base-salary`, {
          baseSalary: Math.round(Number(baseSalaryInput) * 100),
        })
      ).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["salaryStructure", selectedEmployeeId] }),
  });

  const saveComponent = useMutation({
    mutationFn: async (component: SalaryComponent) => {
      const raw = componentInputs[component.id] ?? "";
      const body =
        component.calculationType === "PERCENTAGE_OF_BASE"
          ? { salaryComponentId: component.id, percentage: Number(raw) }
          : { salaryComponentId: component.id, fixedAmount: Math.round(Number(raw) * 100) };
      return (await api.put(`/employee-salary/${selectedEmployeeId}/components`, body)).data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["salaryStructure", selectedEmployeeId] }),
  });

  // --- salary component creation ---
  const [typeForm, setTypeForm] = useState({ name: "", type: "EARNING", calculationType: "FIXED" });
  const createComponent = useMutation({
    mutationFn: async () => (await api.post("/salary-components", typeForm)).data,
    onSuccess: () => {
      setTypeForm({ name: "", type: "EARNING", calculationType: "FIXED" });
      queryClient.invalidateQueries({ queryKey: ["salaryComponents"] });
    },
  });

  // --- payroll runs ---
  const [runForm, setRunForm] = useState({ periodStart: "", periodEnd: "" });
  const createRun = useMutation({
    mutationFn: async () => (await api.post("/payroll-runs", runForm)).data,
    onSuccess: () => {
      setRunForm({ periodStart: "", periodEnd: "" });
      queryClient.invalidateQueries({ queryKey: ["payrollRuns"] });
    },
  });

  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const runDetail = useQuery({
    queryKey: ["payrollRun", expandedRunId],
    queryFn: async () => (await api.get(`/payroll-runs/${expandedRunId}`)).data,
    enabled: !!expandedRunId,
  });

  const processRun = useMutation({
    mutationFn: async (id: string) => (await api.post(`/payroll-runs/${id}/process`)).data,
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["payrollRuns"] });
      queryClient.invalidateQueries({ queryKey: ["payrollRun", id] });
    },
  });

  const markPaid = useMutation({
    mutationFn: async (id: string) => (await api.post(`/payroll-runs/${id}/mark-paid`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["payrollRuns"] }),
  });

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Payroll</h1>
          <Link to="/dashboard" className="text-sm text-gray-600 underline">
            Back to dashboard
          </Link>
        </div>

        {myPayslips.isSuccess && (
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-medium text-gray-900">My payslips</h2>
            <div className="mt-2 divide-y divide-gray-100">
              {myPayslips.data.length === 0 && <p className="py-2 text-sm text-gray-500">No payslips yet.</p>}
              {myPayslips.data.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-gray-900">
                    {p.payrollRun && `${formatDate(p.payrollRun.periodStart)} → ${formatDate(p.payrollRun.periodEnd)}`}
                    {" — Net: "}
                    <strong>{money(p.netPay)}</strong>
                  </span>
                  <span className="text-xs text-gray-500">
                    Gross {money(p.grossPay)} · Deductions {money(p.totalDeductions)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {canManage && (
          <>
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-medium text-gray-900">Salary structure</h2>
              <select
                className="mt-2 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                value={selectedEmployeeId}
                onChange={(e) => {
                  setSelectedEmployeeId(e.target.value);
                  setComponentInputs({});
                }}
              >
                <option value="">Select employee…</option>
                {employees.data?.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.firstName} {emp.lastName}
                  </option>
                ))}
              </select>

              {salaryStructure.isSuccess && selectedEmployeeId && (
                <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-600">Base salary</label>
                    <input
                      type="number"
                      className="w-32 rounded border border-gray-300 px-2 py-1 text-sm"
                      placeholder="0.00"
                      value={baseSalaryInput}
                      onChange={(e) => setBaseSalaryInput(e.target.value)}
                    />
                    <button
                      onClick={() => saveBaseSalary.mutate()}
                      className="rounded bg-gray-900 px-3 py-1 text-xs text-white"
                    >
                      Save
                    </button>
                  </div>

                  {salaryComponents.data?.map((component) => (
                    <div key={component.id} className="flex items-center gap-2 text-sm">
                      <span className="w-40 text-gray-700">
                        {component.name} <span className="text-xs text-gray-400">({component.type})</span>
                      </span>
                      <input
                        type="number"
                        className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
                        placeholder={component.calculationType === "PERCENTAGE_OF_BASE" ? "%" : "0.00"}
                        value={componentInputs[component.id] ?? ""}
                        onChange={(e) => setComponentInputs({ ...componentInputs, [component.id]: e.target.value })}
                      />
                      <button
                        onClick={() => saveComponent.mutate(component)}
                        className="rounded bg-gray-900 px-3 py-1 text-xs text-white"
                      >
                        Save
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <form
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                createComponent.mutate();
              }}
              className="flex items-end gap-2 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            >
              <label className="text-xs text-gray-600">
                New salary component
                <input
                  className="mt-1 rounded border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Name"
                  value={typeForm.name}
                  onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
                  required
                />
              </label>
              <select
                className="rounded border border-gray-300 px-3 py-2 text-sm"
                value={typeForm.type}
                onChange={(e) => setTypeForm({ ...typeForm, type: e.target.value })}
              >
                <option value="EARNING">Earning</option>
                <option value="DEDUCTION">Deduction</option>
              </select>
              <select
                className="rounded border border-gray-300 px-3 py-2 text-sm"
                value={typeForm.calculationType}
                onChange={(e) => setTypeForm({ ...typeForm, calculationType: e.target.value })}
              >
                <option value="FIXED">Fixed amount</option>
                <option value="PERCENTAGE_OF_BASE">% of base</option>
              </select>
              <button type="submit" className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white">
                Add
              </button>
            </form>

            <form
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                createRun.mutate();
              }}
              className="flex items-end gap-2 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            >
              <label className="text-xs text-gray-600">
                Period start
                <input
                  type="date"
                  className="mt-1 rounded border border-gray-300 px-3 py-2 text-sm"
                  value={runForm.periodStart}
                  onChange={(e) => setRunForm({ ...runForm, periodStart: e.target.value })}
                  required
                />
              </label>
              <label className="text-xs text-gray-600">
                Period end
                <input
                  type="date"
                  className="mt-1 rounded border border-gray-300 px-3 py-2 text-sm"
                  value={runForm.periodEnd}
                  onChange={(e) => setRunForm({ ...runForm, periodEnd: e.target.value })}
                  required
                />
              </label>
              <button type="submit" className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white">
                New payroll run
              </button>
            </form>

            <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
              <h2 className="border-b border-gray-100 p-4 text-sm font-medium text-gray-900">Payroll runs</h2>
              <div className="divide-y divide-gray-100">
                {payrollRuns.data?.length === 0 && <p className="p-4 text-sm text-gray-500">No payroll runs yet.</p>}
                {payrollRuns.data?.map((run) => (
                  <div key={run.id} className="p-4 text-sm">
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}
                        className="text-gray-900 underline"
                      >
                        {formatDate(run.periodStart)} → {formatDate(run.periodEnd)}
                      </button>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-1 text-xs ${runStatusStyles[run.status]}`}>{run.status}</span>
                        {run.status === "DRAFT" && (
                          <button
                            onClick={() => processRun.mutate(run.id)}
                            className="rounded bg-gray-900 px-2 py-1 text-xs text-white"
                          >
                            Process
                          </button>
                        )}
                        {run.status === "PROCESSED" && (
                          <button
                            onClick={() => markPaid.mutate(run.id)}
                            className="rounded bg-green-600 px-2 py-1 text-xs text-white"
                          >
                            Mark paid
                          </button>
                        )}
                      </div>
                    </div>

                    {expandedRunId === run.id && runDetail.data && (
                      <div className="mt-2 divide-y divide-gray-100 border-t border-gray-100 pt-2">
                        {runDetail.data.payslips.length === 0 && <p className="py-2 text-xs text-gray-500">Not processed yet.</p>}
                        {runDetail.data.payslips.map((p: Payslip) => (
                          <div key={p.id} className="flex justify-between py-1 text-xs">
                            <span>
                              {p.employee?.firstName} {p.employee?.lastName}
                            </span>
                            <span>
                              Gross {money(p.grossPay)} · Ded {money(p.totalDeductions)} · Net <strong>{money(p.netPay)}</strong>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
