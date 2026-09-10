# Claude Code Prompt — Multi-Tenant HR SaaS Platform

Copy everything below into Claude Code (as your first message, or as CLAUDE.md) to kick off the project.

---

## Project Overview

Build a **multi-tenant HR SaaS web application** that lets multiple companies (tenants) independently manage their employees' attendance, leaves, payroll, and salary advances. Each company's data must be fully isolated from every other company's data.

## Tech Stack

- **Frontend:** React (Vite), TypeScript, React Router, a component library (e.g. shadcn/ui or MUI), React Query for data fetching, i18n support (Arabic + English, RTL/LTR).
- **Backend:** Node.js + Express, TypeScript.
- **Database:** PostgreSQL (relational integrity matters for payroll/financial data). Use an ORM (Prisma preferred).
- **Auth:** JWT-based auth with refresh tokens, password hashing (bcrypt/argon2).
- **Architecture:** Separate `frontend/` and `backend/` folders in one repo (or monorepo with a shared `types` package). REST API (or tRPC if you think it fits better — your call, explain tradeoffs briefly before committing).

Set up the project scaffolding first (folder structure, linting, env config, Docker Compose for local Postgres) before writing feature code.

## Multi-Tenancy Model

- Every company that signs up is a **Tenant** with its own isolated data (use a `company_id` / `tenant_id` foreign key on every tenant-scoped table — row-level isolation, not separate databases, unless you have a strong reason to recommend otherwise).
- There is a **Super Admin** layer above all tenants (the SaaS operator) who can see/manage companies, subscription plans, and platform-wide settings — but never employee-level data unless explicitly needed for support.
- All queries must enforce tenant isolation at the data-access layer, not just in the UI — this is a security requirement, not a nice-to-have.

## User Roles & Permissions

1. **Super Admin** (platform owner) — manages tenant companies, subscription plans, platform monitoring.
2. **Company Admin** — full control within their own company: manage departments, employees, roles, salary structures, subscription/billing for their company.
3. **HR** — manages employees, attendance records, leave policies, runs payroll, manages advances — within their company.
4. **Department Manager** — sees only their department's team; approves/rejects their team members' leave requests and advance requests (first approval step before HR/final approval).
5. **Employee** — self-service: check in/out, view their own attendance history, request leave, request salary advance, view payslips.

Design the approval workflow as: Employee submits → Department Manager approves/rejects → HR gives final approval (configurable per company later, but build it as a multi-step approval chain from the start, not hardcoded to one approver).

## Core Modules

### 1. Authentication & Onboarding
- Company signup flow (creates a new tenant + its first Company Admin user).
- Login, JWT + refresh token, password reset.
- Invite-based user creation for HR/Managers/Employees within a company (email invite with role assignment).

### 2. Company & Employee Management
- Company profile & settings (working days, default currency, timezone).
- Departments and positions (org structure).
- Employee CRUD: personal info, employment info (hire date, department, manager, position, employment status), documents (optional upload).

### 3. Attendance
- Employees check in/check out via web (and mobile-responsive UI) — capture timestamp automatically.
- HR/Admin can manually add/edit/correct attendance records (with an audit trail of who edited what).
- Design the check-in data model so a **biometric device / external attendance hardware can push records later via an API endpoint** — don't hardcode "only manual or self check-in"; include a `source` field (web, mobile, manual, device) on attendance records now, even though device integration itself is a future phase.
- Late/early-leave/absence detection based on the company's configured work schedule.

### 4. Leave Management
- Configurable leave types per company (annual, sick, unpaid, etc.) with configurable balances/accrual rules.
- Leave request → approval workflow (Manager → HR) as described above.
- Leave balance tracking per employee.

### 5. Payroll — Flexible Salary Structure
- Each company can define its **own salary structure** per employee: base salary + custom earning components (allowances, bonuses) + custom deduction components (all admin-configurable, not hardcoded formulas).
- Automatic deductions from payroll for: unpaid absence days, active salary advance installments.
- Monthly (or configurable period) payroll run that generates a payslip per employee, based on attendance + approved leave + salary structure + advance deductions.
- Payslip view/download for employees; payroll history for HR/Admin.

### 6. Salary Advances / Loans
- Employee requests an advance → approval workflow (Manager → HR/Admin).
- Configurable repayment plan (e.g. number of installments) that automatically deducts from future payroll runs until fully repaid.
- Track outstanding balance per employee.

### 7. Multi-Currency Support
- Each company selects its own currency at signup; all payroll/advance amounts for that company are stored and displayed in that currency (no need for cross-currency conversion — each tenant is self-contained in one currency).

### 8. Subscription & Billing (SaaS layer)
- Define subscription plans (e.g. Free / Pro / Enterprise) with feature gating and hard limits (e.g. max employees, which modules are enabled), enforced server-side.
- Plans are billed on a **recurring monthly cycle** (also support an annual option if straightforward). Track each company's subscription status: `trialing`, `active`, `past_due`, `canceled`, `expired`.
- **Real payment integration**, not a stub. Use **Stripe** as the primary payment/subscription engine (Stripe Billing/Subscriptions handles recurring charges, invoices, and card storage for you — don't build a custom card-storage/PCI flow yourself). If we later need a MENA-specific gateway (PayTabs, HyperPay, Moyasar, etc. for local card/wallet support), design the billing layer behind a provider-agnostic interface so a second provider can be added without a rewrite.
- Company Admin flow: choose a plan → enter payment method (hosted Stripe Checkout/Elements, so raw card data never touches our backend) → subscription activates. Company Admin can update payment method, view invoice history, upgrade/downgrade/cancel.
- Handle billing webhooks (payment succeeded, payment failed, subscription canceled) to keep each company's access in sync with their actual payment status — e.g. auto-restrict access on repeated failed payments after a grace period.
- Generate/store invoices per billing cycle (Stripe can generate these; store references + key fields locally for the admin dashboard).

### 9. Super Admin Dashboard (for you, the platform owner)
This is a distinct area of the app, separate from any company's HR workspace, for managing the SaaS business itself:
- **Subscribers list**: every company (tenant), their current plan, subscription status, MRR contribution, signup date, employee count — searchable/filterable.
- **Company detail view**: drill into one company's subscription/billing history, plan, usage (employee count vs. plan limit), and enough account info to support them (without exposing their employees' HR data unless explicitly needed).
- **Actions**: manually change a company's plan, extend a trial, suspend/reactivate a company's access, issue a refund/credit (via Stripe).
- **Revenue overview**: MRR/ARR, active vs. trialing vs. churned companies, revenue trend over time, failed-payment/past-due accounts needing attention.
- **Plan management**: create/edit subscription plans and their limits/pricing (so you can adjust pricing without a code deploy).

### 10. Dashboards & Reports
- Role-appropriate dashboards: Company Admin/HR (headcount, attendance summary, pending approvals, payroll cost), Manager (team status), Employee (their own summary) — in addition to the Super Admin dashboard above.
- Basic exportable reports (attendance, payroll) — CSV at minimum.

### 11. Notifications & Audit Log
- In-app (and stub email) notifications for approvals, payroll runs, invites.
- Audit log for sensitive actions (manual attendance edits, payroll runs, role changes) — who did what, when.

## Non-Functional Requirements

- Strict tenant data isolation, enforced server-side.
- Role-based access control enforced on every API endpoint (not just hidden UI elements).
- Arabic + English UI with RTL support.
- Responsive design (usable on mobile browsers for employee self-service).
- Input validation on both frontend and backend.
- Write the data model with financial correctness in mind (no floating-point money — use integer cents/fils or a decimal type).

## Suggested Build Order (do this in phases, confirm with me before moving to the next)

1. Project scaffolding + auth + multi-tenant data model + company signup.
2. Employee & department management + role-based access control.
3. Attendance (self check-in/out + manual entry).
4. Leave management + approval workflow.
5. Salary structure + payroll run + payslips.
6. Salary advances + automatic deduction integration with payroll.
7. Subscription plans + Stripe billing integration + Super Admin dashboard.
8. Company/HR dashboards, reports, notifications, polish.

## Before You Start

- Propose the database schema (core tables + relationships) and get my confirmation before generating a lot of code.
- If anything above is ambiguous or you see a better architectural approach, ask me or state your assumption explicitly rather than guessing silently.
