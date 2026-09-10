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
5. Salary structure + payroll run + payslips ✅
6. Salary advances + automatic payroll deduction ✅
7. **Subscription plans + Stripe billing + Super Admin dashboard** ✅ ← current, done — next up is phase 8
8. Company/HR dashboards, reports, notifications, polish

## Ground rules
- No floating-point money — integer minor units (cents/fils) or `Decimal`.
- RBAC enforced on every API endpoint, not just hidden in the UI.
- Propose schema/design changes before large code generation passes for a new phase.

## Activating real Stripe billing
Checkout/portal/webhooks are fully implemented but untested against a real Stripe account (none
configured in this environment). To activate: create a Stripe account, grab test-mode keys from
https://dashboard.stripe.com/test/apikeys, set `STRIPE_SECRET_KEY` in `backend/.env`, then either
use the Stripe CLI (`stripe listen --forward-to localhost:4000/api/billing/webhook`) for a real
webhook secret, or reuse a locally-generated one for testing signature verification only (see git
history around the phase-7 commit for how that was done without a real account). Run
`npm run prisma:seed` once to create the default plans and a Super Admin login
(`SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD` in `.env`, defaults to `superadmin@local.test` /
`changeme123` if unset — change this before deploying anywhere real).
