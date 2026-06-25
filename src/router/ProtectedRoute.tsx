import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "@/shared/context/AuthContext";
import type { UserType } from "@/shared/userTypes";

interface ProtectedRouteProps {
  allowedRoles?: UserType[];
}

export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();

  // Not logged in → go to login, remember where they were
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Logged in but wrong role → go to their own dashboard
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={`/${user.role}/dashboard`} replace />;
  }

  return <Outlet />;
}
