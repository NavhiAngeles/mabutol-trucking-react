import { useAuth } from "../context/AuthContext";

function ProtectedRoute({ children }) {
  const { user, role, loading } = useAuth();

  if (loading) return null;

  if (!user || !["admin", "staff"].includes(role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default ProtectedRoute;