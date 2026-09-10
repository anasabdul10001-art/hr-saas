# HR SaaS — Project Brief

Multi-tenant HR SaaS web application: companies (tenants) manage their employees' attendance, leaves, payroll, and salary advances. Strict per-tenant data isolation. Platform owner (Super Admin) runs subscription billing (Stripe, monthly) and a management dashboard on top.

## Tech Stack
- **Frontend:** `frontend/` — React (Vite), TypeScript, React Router, shadcn/ui, React Query, i18n (Arabic + English, RTL/LTR).
- **Backend:** `backend/` — Node.js + Express, TypeScript, Prisma ORM, PostgreSQL.
- **Auth:** JWT + refresh tokens, bcrypt/argon2 password hashing.
- **Billing:** Stripe (Billing/Subscriptions + Checkout), webhook-driven subscription status sync.
- **Local dev:** Docker Compose for Postgres.

## Multi-Tenancy
Row-level isolation via `company_id` on every tenant-scoped table (not separate DBs). All data access enforces tenant scoping server-side — never trust the client for this.

## Roles
Super Admin (platform) → Company Admin → HR → Department Manager → Employee. Approval chains (leave, advances): Employee → Department Manager → HR.

## Full spec
See [`docs/project-brief.md`](docs/project-brief.md) for the complete module-by-module spec (attendance, leave, payroll, advances, multi-currency, billing, Super Admin dashboard, non-functional requirements) and the phased build order.

## Build order (current phase tracked here — update as we progress)
1. Project scaffolding + auth + multi-tenant data model + company signup ✅
2. Employee & department management + RBAC ✅
3. Attendance (self check-in/out + manual entry) ✅
4. Leave management + approval workflow ✅
5. **Salary structure + payroll run + payslips** ✅ ← current, done — next up is phase 6
6. Salary advances + automatic payroll deduction
7. Subscription plans + Stripe billing + Super Admin dashboard
8. Company/HR dashboards, reports, notifications, polish

## Ground rules
- No floating-point money — integer minor units (cents/fils) or `Decimal`.
- RBAC enforced on every API endpoint, not just hidden in the UI.
- Propose schema/design changes before large code generation passes for a new phase.
