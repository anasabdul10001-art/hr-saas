import express from "express";
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

const app = express();

app.use(cors({ origin: env.corsOrigin, credentials: true }));

// Stripe webhook signature verification needs the raw request bytes, so this must be mounted
// with a raw body parser BEFORE the global express.json() below (which would otherwise consume
// and re-serialize the body, breaking the signature check).
app.use("/api/billing/webhook", express.raw({ type: "application/json" }), billingWebhookRouter);

app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.get("/health", (_req, res) => res.json({ status: "ok" }));
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

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(env.port, () => {
  console.log(`Backend listening on http://localhost:${env.port}`);
});
