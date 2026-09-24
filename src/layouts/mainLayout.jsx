import Sidebar from "../components/Sidebar/sidebar";
import { useNavigate } from 'react-router-dom';
import { useAuth } from "../context/AuthContext";
import { useIdleTimeout } from '../hooks/useIdleTimeout';

export default function MainLayout({ children }) {
  const navigate = useNavigate();
  const { role } = useAuth();

  useIdleTimeout(role, () => navigate("/"));

  return (
    <div className="dashboard">
      <Sidebar />

      <main className="main">
        {children}
      </main>
    </div>
  );
}