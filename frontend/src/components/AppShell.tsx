import { type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Building2,
  Clock,
  CalendarDays,
  Wallet,
  HandCoins,
  CreditCard,
  LogOut,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Logo } from "./Logo";
import { NotificationBell } from "./NotificationBell";
import { Avatar } from "./Avatar";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/employees", label: "Employees", icon: Users },
  { to: "/departments", label: "Departments", icon: Building2 },
  { to: "/attendance", label: "Attendance", icon: Clock },
  { to: "/leave", label: "Leave", icon: CalendarDays },
  { to: "/payroll", label: "Payroll", icon: Wallet },
  { to: "/advances", label: "Advances", icon: HandCoins },
];

export function AppShell({ title, children }: { title: string; children: ReactNode }) {
  const { user, logout } = useAuth();
  const canSeeBilling = user?.role === "COMPANY_ADMIN" || user?.role === "HR";

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="p-5">
          <Logo />
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`
              }
            >
              <item.icon size={18} strokeWidth={2} />
              {item.label}
            </NavLink>
          ))}
          {canSeeBilling && (
            <NavLink
              to="/billing"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`
              }
            >
              <CreditCard size={18} strokeWidth={2} />
              Billing
            </NavLink>
          )}
        </nav>
        <div className="border-t border-slate-200 p-3">
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `mb-1 flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors ${
                isActive ? "bg-brand-50" : "hover:bg-slate-50"
              }`
            }
          >
            <Avatar name={user?.name} email={user?.email} avatarUrl={user?.avatarUrl} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-slate-900">{user?.name || user?.email}</p>
              <p className="text-xs text-slate-500">{user?.role}</p>
            </div>
          </NavLink>
          <button
            onClick={() => logout()}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
          >
            <LogOut size={16} strokeWidth={2} />
            Log out
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
          <NotificationBell />
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-4xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
