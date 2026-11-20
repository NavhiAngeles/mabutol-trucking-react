import AppRouter from "./router/AppRouter";
import { AuthProvider } from "./context/AuthContext";
import SignInFeedback from './components/SignInFeedback';


function App() {
  return (
    <AuthProvider>
      <SignInFeedback />
      <AppRouter />
    </AuthProvider>
  );
}

export default App;
