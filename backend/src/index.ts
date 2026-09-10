import express from "express";
import cors from "cors";
import { env } from "./config/env";
import { authRouter } from "./modules/auth/auth.routes";
import { employeeRouter } from "./modules/employees/employee.routes";
import { departmentRouter } from "./modules/departments/department.routes";
import { attendanceRouter } from "./modules/attendance/attendance.routes";
import { leaveTypeRouter } from "./modules/leave/leaveType.routes";
import { leaveBalanceRouter } from "./modules/leave/leaveBalance.routes";
import { leaveRequestRouter } from "./modules/leave/leaveRequest.routes";

const app = express();

app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRouter);
app.use("/api/employees", employeeRouter);
app.use("/api/departments", departmentRouter);
app.use("/api/attendance", attendanceRouter);
app.use("/api/leave-types", leaveTypeRouter);
app.use("/api/leave-balances", leaveBalanceRouter);
app.use("/api/leave-requests", leaveRequestRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(env.port, () => {
  console.log(`Backend listening on http://localhost:${env.port}`);
});
