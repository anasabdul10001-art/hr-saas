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
