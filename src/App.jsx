import AppRouter from "./router/AppRouter";
import { AuthProvider } from "./context/AuthContext";
import DashboardMapProvider from './pages/Dashboard/DashboardMapProvider';
import SignInFeedback from './components/SignInFeedback';


function App() {
  return (
    <AuthProvider>
      <SignInFeedback />
      <DashboardMapProvider>
        <AppRouter />
      </DashboardMapProvider>
    </AuthProvider>
  );
}

export default App;
