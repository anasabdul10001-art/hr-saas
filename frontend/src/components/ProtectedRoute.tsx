import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function ProtectedRoute() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

// Tenant (company HR product) pages — a Super Admin has no company context and belongs on
// their own dashboard instead.
export function TenantProtectedRoute() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "SUPER_ADMIN") return <Navigate to="/admin" replace />;
  return <Outlet />;
}

export function SuperAdminProtectedRoute() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/admin/login" replace />;
  if (user.role !== "SUPER_ADMIN") return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
