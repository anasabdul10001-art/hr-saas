import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Clock,
  CalendarDays,
  Wallet,
  HandCoins,
  ShieldCheck,
  CreditCard,
  Check,
  ArrowRight,
  Users,
  UserCheck,
  FileClock,
} from "lucide-react";
import { api } from "../lib/api";
import { Logo } from "../components/Logo";
import type { Plan } from "../lib/types";

function money(minorUnits: number) {
  return (minorUnits / 100).toFixed(0);
}

const FEATURES = [
  {
    icon: Clock,
    title: "Attendance",
    body: "Self check-in/out for every employee, plus manual corrections from HR with a full audit trail.",
  },
  {
    icon: CalendarDays,
    title: "Leave management",
    body: "Configurable leave types and a real two-step approval chain: employee → manager → HR.",
  },
  {
    icon: Wallet,
    title: "Payroll",
    body: "Flexible salary structures with automatic deductions for unpaid absence, computed from real attendance data.",
  },
  {
    icon: HandCoins,
    title: "Salary advances",
    body: "Employees request advances; approved ones are repaid automatically over payroll runs.",
  },
  {
    icon: ShieldCheck,
    title: "Built for multi-tenancy",
    body: "Every company's data is isolated at the database level — enforced server-side, not just in the UI.",
  },
  {
    icon: CreditCard,
    title: "Subscription billing",
    body: "Stripe-powered plans with employee limits, upgrade anytime, and a Super Admin view across every account.",
  },
];

function DashboardPreview() {
  return (
    <div className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-rose-400" />
          <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        </div>
        <span className="text-xs font-medium text-slate-400">Dashboard</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-brand-50 p-3">
          <Users size={16} className="text-brand-600" />
          <p className="mt-2 text-lg font-bold text-slate-900">48</p>
          <p className="text-[11px] text-slate-500">Employees</p>
        </div>
        <div className="rounded-xl bg-emerald-50 p-3">
          <UserCheck size={16} className="text-emerald-600" />
          <p className="mt-2 text-lg font-bold text-slate-900">44</p>
          <p className="text-[11px] text-slate-500">Present today</p>
        </div>
        <div className="rounded-xl bg-amber-50 p-3">
          <FileClock size={16} className="text-amber-600" />
          <p className="mt-2 text-lg font-bold text-slate-900">3</p>
          <p className="text-[11px] text-slate-500">Pending leave</p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {["Sara Manager", "Omar Dev", "Layla Sales"].map((name, i) => (
          <div key={name} className="flex items-center gap-3 rounded-lg border border-slate-100 p-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-[10px] font-semibold text-brand-700">
              {name.split(" ").map((n) => n[0]).join("")}
            </div>
            <div className="flex-1">
              <div className="h-2 w-24 rounded-full bg-slate-200" />
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                i === 1 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
              }`}
            >
              {i === 1 ? "On leave" : "Active"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HomePage() {
  const plans = useQuery({
    queryKey: ["plans", "public"],
    queryFn: async () => (await api.get<Plan[]>("/plans")).data,
  });

  return (
    <div className="bg-slate-50">
      {/* Nav */}
      <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/">
            <Logo />
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900">
              Log in
            </Link>
            <Link to="/signup" className="btn-primary">
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-96 w-[48rem] -translate-x-1/2 rounded-full bg-brand-200/40 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-6 py-20 lg:grid-cols-2 lg:py-28">
          <div>
            <span className="inline-flex items-center rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
              Multi-tenant HR, built for growing teams
            </span>
            <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
              Run your whole company's HR in one place.
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-slate-600">
              Attendance, leave, payroll, and salary advances — with real approval workflows and
              role-based access, not a spreadsheet held together with hope.
            </p>
            <div className="mt-8 flex items-center gap-4">
              <Link to="/signup" className="btn-primary px-6 py-3 text-base">
                Start free
                <ArrowRight size={16} />
              </Link>
              <Link to="/login" className="text-sm font-medium text-slate-700 hover:text-slate-900">
                Log in →
              </Link>
            </div>
          </div>
          <DashboardPreview />
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900">Everything HR needs, nothing it doesn't</h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-slate-600">
          Every module is connected — payroll reads real attendance and approved leave, so numbers stay honest.
        </p>
        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="card p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <f.icon size={20} />
              </div>
              <h3 className="mt-4 text-sm font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-1.5 text-sm text-slate-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      {plans.isSuccess && plans.data.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900">Simple, transparent pricing</h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-slate-600">Start free. Upgrade when your team grows.</p>
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {plans.data.map((plan, i) => (
              <div
                key={plan.id}
                className={`rounded-xl border bg-white p-6 shadow-sm ${i === 1 ? "border-brand-500 ring-1 ring-brand-500" : "border-slate-200"}`}
              >
                <p className="text-sm font-semibold text-slate-900">{plan.name}</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">
                  ${money(plan.priceMonthly)}
                  <span className="text-sm font-normal text-slate-500">/mo</span>
                </p>
                <p className="mt-1 text-xs text-slate-500">Up to {plan.maxEmployees} employees</p>
                <ul className="mt-4 space-y-1.5 text-xs text-slate-600">
                  {Object.entries(plan.features)
                    .filter(([, enabled]) => enabled)
                    .map(([feature]) => (
                      <li key={feature} className="flex items-center gap-1.5">
                        <Check size={12} className="text-emerald-600" />
                        {feature.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}
                      </li>
                    ))}
                </ul>
                <Link to="/signup" className={i === 1 ? "btn-primary mt-5 w-full" : "btn-secondary mt-5 w-full"}>
                  Get started
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Final CTA */}
      <section className="bg-slate-900">
        <div className="mx-auto max-w-4xl px-6 py-16 text-center">
          <h2 className="text-3xl font-bold text-white">Ready to get organized?</h2>
          <p className="mt-2 text-slate-300">Create your company account in under a minute — no credit card required.</p>
          <Link to="/signup" className="btn-primary mt-6 inline-flex px-6 py-3 text-base">
            Create your company
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <Logo compact />
          <p className="text-xs text-slate-500">© {new Date().getFullYear()} Nawa. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
