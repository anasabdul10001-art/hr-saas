import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { NotificationBell } from "../components/NotificationBell";
import type { DashboardData } from "../lib/types";

function money(minorUnits: number) {
  return (minorUnits / 100).toFixed(2);
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString();
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function DashboardStats({ data }: { data: DashboardData }) {
  if (data.role === "company") {
    return (
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        <StatTile label="Employees" value={data.totalEmployees} />
        <StatTile label="Present today" value={data.presentToday} />
        <StatTile label="On leave today" value={data.onLeaveToday} />
        <StatTile label="Pending leave" value={data.pendingLeaveApprovals} />
        <StatTile label="Pending advances" value={data.pendingAdvanceApprovals} />
        {data.lastPayrollRun && (
          <div className="col-span-full rounded-lg border border-gray-200 bg-white p-4 text-sm shadow-sm">
            Last payroll run: {formatDate(data.lastPayrollRun.periodStart)} → {formatDate(data.lastPayrollRun.periodEnd)} (
            {data.lastPayrollRun.status}) — total net pay <strong>{money(data.lastPayrollRun.totalNetPay)}</strong>
          </div>
        )}
      </div>
    );
  }

  if (data.role === "manager") {
    return (
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        <StatTile label="Team size" value={data.teamSize} />
        <StatTile label="Present today" value={data.presentToday} />
        <StatTile label="On leave today" value={data.onLeaveToday} />
        <StatTile label="Pending leave" value={data.pendingLeaveApprovals} />
        <StatTile label="Pending advances" value={data.pendingAdvanceApprovals} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Attendance days this month" value={data.attendanceDaysThisMonth} />
        <StatTile label="My pending requests" value={data.myPendingRequests} />
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-xs text-gray-500">Leave balances</p>
        <div className="mt-1 flex gap-4 text-sm">
          {data.leaveBalances.map((b) => (
            <span key={b.leaveType}>
              {b.leaveType}: <strong>{b.balanceDays}</strong>
            </span>
          ))}
        </div>
      </div>
      {data.lastPayslip && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm shadow-sm">
          Last payslip: {formatDate(data.lastPayslip.periodStart)} → {formatDate(data.lastPayslip.periodEnd)} — net pay{" "}
          <strong>{money(data.lastPayslip.netPay)}</strong>
        </div>
      )}
    </div>
  );
}

export function DashboardPage() {
  const { user, logout } = useAuth();

  const dashboard = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => (await api.get<DashboardData>("/dashboard")).data,
  });

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
            <div className="flex items-center gap-4">
              <NotificationBell />
              <button onClick={() => logout()} className="text-sm text-gray-600 underline">
                Log out
              </button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <Link to="/employees" className="text-gray-900 underline">
              Employees
            </Link>
            <Link to="/departments" className="text-gray-900 underline">
              Departments
            </Link>
            <Link to="/attendance" className="text-gray-900 underline">
              Attendance
            </Link>
            <Link to="/leave" className="text-gray-900 underline">
              Leave
            </Link>
            <Link to="/payroll" className="text-gray-900 underline">
              Payroll
            </Link>
            <Link to="/advances" className="text-gray-900 underline">
              Advances
            </Link>
            {(user?.role === "COMPANY_ADMIN" || user?.role === "HR") && (
              <Link to="/billing" className="text-gray-900 underline">
                Billing
              </Link>
            )}
          </div>
          <dl className="mt-4 space-y-1 text-xs text-gray-500">
            <div>
              {user?.email} · {user?.role}
            </div>
          </dl>
        </div>

        {dashboard.isSuccess && <DashboardStats data={dashboard.data} />}
      </div>
    </div>
  );
}
