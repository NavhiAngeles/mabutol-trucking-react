import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signIn } from "../services/authService";
import { useAuth } from "../context/AuthContext";

export function useLoginViewModel() {
  const navigate = useNavigate();
  const { completeSignIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({ email: "", password: "" });
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const submissionLocked = useRef(false);

  function validateEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submissionLocked.current) return;
    const trimmedEmail = email.trim();
    // Password whitespace is significant, including passwords set in Settings.
    const loginPassword = password;

    const newErrors = { email: "", password: "" };
    if (!trimmedEmail) newErrors.email = "Email is required.";
    else if (!validateEmail(trimmedEmail)) newErrors.email = "Please enter a valid email address.";
    if (!loginPassword) newErrors.password = "Password is required.";
    setErrors(newErrors);
    if (newErrors.email || newErrors.password) { setStatus('error'); return; }

    submissionLocked.current = true;
    setStatus("loading");
    try {
      const result = await signIn(trimmedEmail, loginPassword);
      completeSignIn(result);
      setStatus("success");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      submissionLocked.current = false;
      setStatus("error");
      setErrors((prev) => ({ ...prev, password: err.message }));
    }
  }
  
  function handlePasswordChange(value) {
    setPassword(value);

    if (errors.password) {
      setErrors((prev) => ({ ...prev, password: "" }));
    }
  }

  function handleEmailChange(value) {
    setEmail(value);

    if (errors.email) {
      setErrors((prev) => ({ ...prev, email: "" }));
    }
  }

  return { email, setEmail, password, setPassword, errors, status, handleSubmit, handlePasswordChange, handleEmailChange };
}
