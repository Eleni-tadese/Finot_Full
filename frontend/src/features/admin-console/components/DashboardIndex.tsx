import { Navigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import DashboardOverview from "../../../pages/dashboard/DashboardOverview";

/** /dashboard: Super Admin lands on the admin console, everyone else on their normal overview. */
const DashboardIndex = () => {
  const { user } = useAuth();
  if (user?.role === "Super_admin") return <Navigate to="/dashboard/admin" replace />;
  return <DashboardOverview />;
};

export default DashboardIndex;
