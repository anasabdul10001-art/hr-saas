import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function DashboardPage() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
          <button onClick={() => logout()} className="text-sm text-gray-600 underline">
            Log out
          </button>
        </div>
        <div className="mt-4 flex gap-4 text-sm">
          <Link to="/employees" className="text-gray-900 underline">
            Employees
          </Link>
          <Link to="/departments" className="text-gray-900 underline">
            Departments
          </Link>
          <Link to="/attendance" className="text-gray-900 underline">
            Attendance
          </Link>
          <Link to="/leave" className="text-gray-900 underline">
            Leave
          </Link>
        </div>
        <dl className="mt-4 space-y-2 text-sm">
          <div>
            <dt className="text-gray-500">Email</dt>
            <dd className="text-gray-900">{user?.email}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Role</dt>
            <dd className="text-gray-900">{user?.role}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Company ID</dt>
            <dd className="text-gray-900">{user?.companyId ?? "—"}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
