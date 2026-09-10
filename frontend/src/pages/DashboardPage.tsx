import { useQuery } from "@tanstack/react-query";
import type { ComponentType } from "react";
import { Users, UserCheck, CalendarOff, FileClock, HandCoins, Wallet } from "lucide-react";
import { api } from "../lib/api";
import { AppShell } from "../components/AppShell";
import type { DashboardData } from "../lib/types";

function money(minorUnits: number) {
  return (minorUnits / 100).toFixed(2);
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString();
}

function StatTile({ label, value, icon: Icon }: { label: string; value: string | number; icon: ComponentType<{ size?: number; className?: string }> }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
        <Icon size={18} />
      </div>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-lg font-semibold text-slate-900">{value}</p>
      </div>
    </div>
  );
}

function InfoBanner({ children }: { children: React.ReactNode }) {
  return <div className="card p-4 text-sm text-slate-700">{children}</div>;
}

function DashboardStats({ data }: { data: DashboardData }) {
  if (data.role === "company") {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatTile label="Employees" value={data.totalEmployees} icon={Users} />
          <StatTile label="Present today" value={data.presentToday} icon={UserCheck} />
          <StatTile label="On leave today" value={data.onLeaveToday} icon={CalendarOff} />
          <StatTile label="Pending leave" value={data.pendingLeaveApprovals} icon={FileClock} />
          <StatTile label="Pending advances" value={data.pendingAdvanceApprovals} icon={HandCoins} />
        </div>
        {data.lastPayrollRun && (
          <InfoBanner>
            Last payroll run: {formatDate(data.lastPayrollRun.periodStart)} → {formatDate(data.lastPayrollRun.periodEnd)} (
            {data.lastPayrollRun.status}) — total net pay <strong>{money(data.lastPayrollRun.totalNetPay)}</strong>
          </InfoBanner>
        )}
      </div>
    );
  }

  if (data.role === "manager") {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Team size" value={data.teamSize} icon={Users} />
        <StatTile label="Present today" value={data.presentToday} icon={UserCheck} />
        <StatTile label="On leave today" value={data.onLeaveToday} icon={CalendarOff} />
        <StatTile label="Pending leave" value={data.pendingLeaveApprovals} icon={FileClock} />
        <StatTile label="Pending advances" value={data.pendingAdvanceApprovals} icon={HandCoins} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Attendance days this month" value={data.attendanceDaysThisMonth} icon={UserCheck} />
        <StatTile label="My pending requests" value={data.myPendingRequests} icon={FileClock} />
      </div>
      <div className="card p-4">
        <p className="text-xs text-slate-500">Leave balances</p>
        <div className="mt-2 flex gap-6 text-sm">
          {data.leaveBalances.map((b) => (
            <span key={b.leaveType} className="text-slate-700">
              {b.leaveType}: <strong className="text-slate-900">{b.balanceDays}</strong>
            </span>
          ))}
        </div>
      </div>
      {data.lastPayslip && (
        <InfoBanner>
          <Wallet size={14} className="mr-1.5 inline text-brand-600" />
          Last payslip: {formatDate(data.lastPayslip.periodStart)} → {formatDate(data.lastPayslip.periodEnd)} — net pay{" "}
          <strong>{money(data.lastPayslip.netPay)}</strong>
        </InfoBanner>
      )}
    </div>
  );
}

export function DashboardPage() {
  const dashboard = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => (await api.get<DashboardData>("/dashboard")).data,
  });

  return (
    <AppShell title="Dashboard">
      {dashboard.isSuccess && <DashboardStats data={dashboard.data} />}
    </AppShell>
  );
}
