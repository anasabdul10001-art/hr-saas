import "express-async-errors"; // lets a thrown error inside an async route reach the error handler instead of hanging or crashing the process
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cors from "cors";
import path from "path";
import { env } from "./config/env";
import { authRouter } from "./modules/auth/auth.routes";
import { employeeRouter } from "./modules/employees/employee.routes";
import { departmentRouter } from "./modules/departments/department.routes";
import { attendanceRouter } from "./modules/attendance/attendance.routes";
import { leaveTypeRouter } from "./modules/leave/leaveType.routes";
import { leaveBalanceRouter } from "./modules/leave/leaveBalance.routes";
import { leaveRequestRouter } from "./modules/leave/leaveRequest.routes";
import { salaryComponentRouter } from "./modules/payroll/salaryComponent.routes";
import { employeeSalaryRouter } from "./modules/payroll/employeeSalary.routes";
import { payrollRunRouter } from "./modules/payroll/payrollRun.routes";
import { advanceRouter } from "./modules/advance/advance.routes";
import { planRouter } from "./modules/billing/plan.routes";
import { billingRouter, billingWebhookRouter } from "./modules/billing/billing.routes";
import { adminRouter } from "./modules/admin/admin.routes";
import { notificationRouter } from "./modules/notification/notification.routes";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes";
import { reportsRouter } from "./modules/reports/reports.routes";
import { profileRouter } from "./modules/profile/profile.routes";
import { settingsRouter } from "./modules/settings/settings.routes";
import { accountingLinkRouter } from "./modules/accounting/accountingLink.routes";

const app = express();

// Behind Render's proxy the client address is in X-Forwarded-For; without this every visitor looks like one address
// and the rate limits below would lock everybody out together.
app.set("trust proxy", 1);
app.use(helmet());

app.use(cors({ origin: env.corsOrigin, credentials: true }));

// Stripe webhook signature verification needs the raw request bytes, so this must be mounted
// with a raw body parser BEFORE the global express.json() below (which would otherwise consume
// and re-serialize the body, breaking the signature check).
app.use("/api/billing/webhook", express.raw({ type: "application/json" }), billingWebhookRouter);

app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.get("/health", (_req, res) => res.json({ status: "ok" }));
// Slows down password guessing and account/email probing. Tests raise the limits through the environment.
const authLimit = (name: string, max: number) =>
  rateLimit({ windowMs: 15 * 60 * 1000, limit: Number(process.env[`AUTH_${name}_RATE_LIMIT`]) || max, standardHeaders: true, legacyHeaders: false, message: { error: "Too many attempts, please try again later" } });
app.use("/api/auth/login", authLimit("LOGIN", 10));
app.use("/api/auth/signup", authLimit("SIGNUP", 10));
app.use("/api/auth/forgot-password", authLimit("FORGOT", 5));
app.use("/api/auth/reset-password", authLimit("RESET", 10));
app.use("/api/auth/refresh", authLimit("REFRESH", 60));
app.use("/api/auth", authRouter);
app.use("/api/employees", employeeRouter);
app.use("/api/departments", departmentRouter);
app.use("/api/attendance", attendanceRouter);
app.use("/api/leave-types", leaveTypeRouter);
app.use("/api/leave-balances", leaveBalanceRouter);
app.use("/api/leave-requests", leaveRequestRouter);
app.use("/api/salary-components", salaryComponentRouter);
app.use("/api/employee-salary", employeeSalaryRouter);
app.use("/api/payroll-runs", payrollRunRouter);
app.use("/api/advances", advanceRouter);
app.use("/api/plans", planRouter);
app.use("/api/billing", billingRouter);
app.use("/api/admin", adminRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/profile", profileRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/accounting-link", accountingLinkRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

export { app };
