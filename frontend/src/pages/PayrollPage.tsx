import { type FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, PlayCircle, CheckCircle2 } from "lucide-react";
import { api, downloadFile } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { AppShell } from "../components/AppShell";
import type { Employee, Payslip, PayrollRun, SalaryComponent, SalaryStructure } from "../lib/types";

function money(minorUnits: number) {
  return (minorUnits / 100).toFixed(2);
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString();
}

const runStatusStyles: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  PROCESSED: "bg-amber-50 text-amber-700",
  PAID: "bg-emerald-50 text-emerald-700",
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
    <AppShell title="Payroll">
      <div className="space-y-4">
        {myPayslips.isSuccess && (
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-900">My payslips</h2>
            <div className="mt-2 divide-y divide-slate-100">
              {myPayslips.data.length === 0 && <p className="py-2 text-sm text-slate-500">No payslips yet.</p>}
              {myPayslips.data.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-slate-900">
                    {p.payrollRun && `${formatDate(p.payrollRun.periodStart)} → ${formatDate(p.payrollRun.periodEnd)}`}
                    {" — Net: "}
                    <strong>{money(p.netPay)}</strong>
                  </span>
                  <span className="text-xs text-slate-500">
                    Gross {money(p.grossPay)} · Deductions {money(p.totalDeductions)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {canManage && (
          <>
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-slate-900">Salary structure</h2>
              <select
                className="input-field mt-2"
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
                <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-600">Base salary</label>
                    <input
                      type="number"
                      className="input-field w-32"
                      placeholder="0.00"
                      value={baseSalaryInput}
                      onChange={(e) => setBaseSalaryInput(e.target.value)}
                    />
                    <button onClick={() => saveBaseSalary.mutate()} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800">
                      Save
                    </button>
                  </div>

                  {salaryComponents.data?.map((component) => (
                    <div key={component.id} className="flex items-center gap-2 text-sm">
                      <span className="w-40 text-slate-700">
                        {component.name} <span className="text-xs text-slate-400">({component.type})</span>
                      </span>
                      <input
                        type="number"
                        className="input-field w-24"
                        placeholder={component.calculationType === "PERCENTAGE_OF_BASE" ? "%" : "0.00"}
                        value={componentInputs[component.id] ?? ""}
                        onChange={(e) => setComponentInputs({ ...componentInputs, [component.id]: e.target.value })}
                      />
                      <button
                        onClick={() => saveComponent.mutate(component)}
                        className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
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
              className="card flex items-end gap-2 p-4"
            >
              <label className="text-xs text-slate-600">
                New salary component
                <input
                  className="input-field mt-1"
                  placeholder="Name"
                  value={typeForm.name}
                  onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
                  required
                />
              </label>
              <select className="input-field" value={typeForm.type} onChange={(e) => setTypeForm({ ...typeForm, type: e.target.value })}>
                <option value="EARNING">Earning</option>
                <option value="DEDUCTION">Deduction</option>
              </select>
              <select
                className="input-field"
                value={typeForm.calculationType}
                onChange={(e) => setTypeForm({ ...typeForm, calculationType: e.target.value })}
              >
                <option value="FIXED">Fixed amount</option>
                <option value="PERCENTAGE_OF_BASE">% of base</option>
              </select>
              <button type="submit" className="btn-primary">
                Add
              </button>
            </form>

            <form
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                createRun.mutate();
              }}
              className="card flex items-end gap-2 p-4"
            >
              <label className="text-xs text-slate-600">
                Period start
                <input
                  type="date"
                  className="input-field mt-1"
                  value={runForm.periodStart}
                  onChange={(e) => setRunForm({ ...runForm, periodStart: e.target.value })}
                  required
                />
              </label>
              <label className="text-xs text-slate-600">
                Period end
                <input
                  type="date"
                  className="input-field mt-1"
                  value={runForm.periodEnd}
                  onChange={(e) => setRunForm({ ...runForm, periodEnd: e.target.value })}
                  required
                />
              </label>
              <button type="submit" className="btn-primary">
                New payroll run
              </button>
            </form>

            <div className="card">
              <h2 className="border-b border-slate-100 p-4 text-sm font-semibold text-slate-900">Payroll runs</h2>
              <div className="divide-y divide-slate-100">
                {payrollRuns.data?.length === 0 && <p className="p-4 text-sm text-slate-500">No payroll runs yet.</p>}
                {payrollRuns.data?.map((run) => (
                  <div key={run.id} className="p-4 text-sm">
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}
                        className="font-medium text-slate-900 hover:text-brand-600"
                      >
                        {formatDate(run.periodStart)} → {formatDate(run.periodEnd)}
                      </button>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${runStatusStyles[run.status]}`}>{run.status}</span>
                        {run.status === "DRAFT" && (
                          <button
                            onClick={() => processRun.mutate(run.id)}
                            className="flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
                          >
                            <PlayCircle size={14} />
                            Process
                          </button>
                        )}
                        {run.status === "PROCESSED" && (
                          <button
                            onClick={() => markPaid.mutate(run.id)}
                            className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                          >
                            <CheckCircle2 size={14} />
                            Mark paid
                          </button>
                        )}
                        {run.status !== "DRAFT" && (
                          <button
                            onClick={() => downloadFile(`/reports/payroll/${run.id}.csv`, `payroll-${run.id}.csv`)}
                            className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                          >
                            <Download size={14} />
                            CSV
                          </button>
                        )}
                      </div>
                    </div>

                    {expandedRunId === run.id && runDetail.data && (
                      <div className="mt-2 divide-y divide-slate-100 border-t border-slate-100 pt-2">
                        {runDetail.data.payslips.length === 0 && <p className="py-2 text-xs text-slate-500">Not processed yet.</p>}
                        {runDetail.data.payslips.map((p: Payslip) => (
                          <div key={p.id} className="flex justify-between py-1 text-xs">
                            <span className="text-slate-700">
                              {p.employee?.firstName} {p.employee?.lastName}
                            </span>
                            <span className="text-slate-500">
                              Gross {money(p.grossPay)} · Ded {money(p.totalDeductions)} · Net{" "}
                              <strong className="text-slate-900">{money(p.netPay)}</strong>
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
    </AppShell>
  );
}
