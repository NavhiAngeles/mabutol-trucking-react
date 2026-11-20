import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import MfaGate from "../components/MfaGate";
import WorkspaceLoadingScreen from "../components/WorkspaceLoadingScreen";

function ProtectedRoute({ children }) {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <WorkspaceLoadingScreen
        message="Verifying office session…"
        detail="Confirming your dispatch credentials before opening the workspace."
      />
    );
  }

  if (!user || !["admin", "staff"].includes(role)) {
    return <Navigate to="/" replace />;
  }

  return <MfaGate key={user.id} userId={user.id}>{children}</MfaGate>;
}

export default ProtectedRoute;
