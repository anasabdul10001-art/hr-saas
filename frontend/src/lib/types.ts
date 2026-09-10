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
