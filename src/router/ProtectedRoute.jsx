import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import MfaGate from "../components/MfaGate";

function ProtectedRoute({ children }) {
  const { user, role, loading } = useAuth();

  if (loading) return null;

  if (!user || !["admin", "staff"].includes(role)) {
    return <Navigate to="/" replace />;
  }

  return <MfaGate key={user.id}>{children}</MfaGate>;
}

export default ProtectedRoute;
