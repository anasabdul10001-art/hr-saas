export type EmploymentStatus = "ACTIVE" | "ON_LEAVE" | "TERMINATED";

export type Department = {
  id: string;
  name: string;
  managerId: string | null;
  manager: { id: string; firstName: string; lastName: string } | null;
  _count: { employees: number };
};

export type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  position: string | null;
  employmentStatus: EmploymentStatus;
  hireDate: string;
  departmentId: string | null;
  department: { id: string; name: string } | null;
  managerId: string | null;
  manager: { id: string; firstName: string; lastName: string } | null;
  user: { email: string; role: string; isActive: boolean } | null;
};

export type AttendanceSource = "WEB" | "MOBILE" | "MANUAL" | "DEVICE";

export type AttendanceRecord = {
  id: string;
  employeeId: string;
  employee?: { id: string; firstName: string; lastName: string };
  checkIn: string;
  checkOut: string | null;
  source: AttendanceSource;
  notes: string | null;
};

export type LeaveType = {
  id: string;
  name: string;
  defaultBalance: number;
  isPaid: boolean;
};

export type LeaveBalanceEntry = {
  leaveType: LeaveType;
  balanceDays: number;
};

export type LeaveRequestStatus = "PENDING_MANAGER" | "PENDING_HR" | "APPROVED" | "REJECTED" | "CANCELED";

export type LeaveRequest = {
  id: string;
  leaveType: LeaveType;
  employee?: { id: string; firstName: string; lastName: string; managerId: string | null };
  startDate: string;
  endDate: string;
  reason: string | null;
  status: LeaveRequestStatus;
  rejectionReason: string | null;
};

export type SalaryComponentType = "EARNING" | "DEDUCTION";
export type SalaryCalculationType = "FIXED" | "PERCENTAGE_OF_BASE";

export type SalaryComponent = {
  id: string;
  name: string;
  type: SalaryComponentType;
  calculationType: SalaryCalculationType;
};

export type EmployeeSalaryComponent = {
  id: string;
  salaryComponentId: string;
  fixedAmount: number | null;
  percentage: number | null;
  salaryComponent: SalaryComponent;
};

export type SalaryStructure = {
  baseSalary: number | null;
  components: EmployeeSalaryComponent[];
};

export type PayrollRunStatus = "DRAFT" | "PROCESSED" | "PAID";

export type PayrollRun = {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: PayrollRunStatus;
  runAt: string | null;
};

export type PayslipBreakdown = {
  baseSalary: number;
  components: Array<{ name: string; type: SalaryComponentType; amount: number }>;
  unpaidAbsence: { workingDays: number; unpaidDays: number; dailyRate: number; deduction: number };
};

export type AdvanceStatus = "PENDING_MANAGER" | "PENDING_HR" | "APPROVED" | "REJECTED" | "REPAID";

export type AdvanceInstallment = {
  id: string;
  amount: number;
  dueDate: string;
  isPaid: boolean;
  paidInPayrollRunId: string | null;
};

export type SalaryAdvance = {
  id: string;
  employeeId: string;
  employee?: { id: string; firstName: string; lastName: string; managerId: string | null };
  amount: number;
  installmentsCount: number;
  status: AdvanceStatus;
  reason: string | null;
  installments: AdvanceInstallment[];
  paidAmount: number;
  remainingAmount: number;
};

export type Plan = {
  id: string;
  name: string;
  priceMonthly: number;
  currency: string;
  maxEmployees: number;
  features: Record<string, boolean>;
  isActive: boolean;
};

export type PlatformSettings = {
  stripeSecretKeySet: boolean;
  stripeSecretKeyMasked: string | null;
  stripeWebhookSecretSet: boolean;
  stripeWebhookSecretMasked: string | null;
};

export type SubscriptionStatusValue = "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";

export type Invoice = {
  id: string;
  amountDue: number;
  amountPaid: number;
  currency: string;
  status: string;
  issuedAt: string;
};

export type CompanySubscription = {
  id: string;
  status: SubscriptionStatusValue;
  plan: Plan;
  stripeCustomerId: string | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  invoices: Invoice[];
};

export type AdminCompanyListItem = {
  id: string;
  name: string;
  slug: string;
  isSuspended: boolean;
  createdAt: string;
  employeeCount: number;
  subscription: { status: SubscriptionStatusValue; plan: string; priceMonthly: number } | null;
};

export type RevenueOverview = {
  mrr: number;
  arr: number;
  countsByStatus: Record<string, number>;
  pastDueAccounts: Array<{ companyId: string; companyName: string; plan: string }>;
  revenueTrend: Array<{ month: string; amount: number }>;
};

export type CompanyDashboard = {
  role: "company";
  totalEmployees: number;
  presentToday: number;
  onLeaveToday: number;
  pendingLeaveApprovals: number;
  pendingAdvanceApprovals: number;
  lastPayrollRun: { periodStart: string; periodEnd: string; status: string; totalNetPay: number } | null;
};

export type ManagerDashboard = {
  role: "manager";
  teamSize: number;
  presentToday: number;
  onLeaveToday: number;
  pendingLeaveApprovals: number;
  pendingAdvanceApprovals: number;
};

export type EmployeeDashboard = {
  role: "employee";
  attendanceDaysThisMonth: number;
  leaveBalances: Array<{ leaveType: string; balanceDays: number }>;
  myPendingRequests: number;
  lastPayslip: { periodStart: string; periodEnd: string; netPay: number } | null;
};

export type DashboardData = CompanyDashboard | ManagerDashboard | EmployeeDashboard;

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
};

export type Payslip = {
  id: string;
  employeeId: string;
  employee?: { id: string; firstName: string; lastName: string };
  payrollRunId: string;
  payrollRun?: { periodStart: string; periodEnd: string; status: PayrollRunStatus };
  grossPay: number;
  totalDeductions: number;
  netPay: number;
  breakdown: PayslipBreakdown;
};
