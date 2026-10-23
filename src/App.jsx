import AppRouter from "./router/AppRouter";
import { AuthProvider } from "./context/AuthContext";
import DashboardMapProvider from './pages/Dashboard/DashboardMapProvider';


function App() {
  return (
    <AuthProvider>
      <DashboardMapProvider>
        <AppRouter />
      </DashboardMapProvider>
    </AuthProvider>
  );
}

export default App;
