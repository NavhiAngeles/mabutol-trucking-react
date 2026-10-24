import Sidebar from "../components/Sidebar/sidebar";
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from "../context/AuthContext";
import { useIdleTimeout } from '../hooks/useIdleTimeout';

export default function MainLayout({ children }) {
  const navigate = useNavigate();
  const { role } = useAuth();

  const handleIdleTimeout = useCallback(() => navigate("/"), [navigate]);
  useIdleTimeout(role, handleIdleTimeout);

  return (
    <div className="dashboard">
      <Sidebar />

      <main className="main">
        {children}
      </main>
    </div>
  );
}
