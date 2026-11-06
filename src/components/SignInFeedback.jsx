import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import './signInFeedback.css';

export default function SignInFeedback() {
  const { user, signInMessage, dismissSignInMessage } = useAuth();
  const userId = user?.id;
  useEffect(() => {
    if (!userId || !signInMessage) return undefined;
    const timer = setTimeout(dismissSignInMessage, 5000);
    return () => clearTimeout(timer);
  }, [userId, signInMessage, dismissSignInMessage]);
  if (!user || !signInMessage) return null;
  return <aside className="sign-in-success-box" role="status">
    <div><strong>Sign-in successful</strong><p>{signInMessage}</p></div>
    <button type="button" aria-label="Dismiss sign-in message" onClick={dismissSignInMessage}>×</button>
  </aside>;
}
