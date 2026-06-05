import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./login.css";

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [success, setSuccess] = useState(false);
  const [errors, setErrors] = useState({ email: "", password: "" });

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function handleSubmit(e) {
    e.preventDefault();

    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    const newErrors = { email: "", password: "" };
    let hasError = false;

    if (!trimmedEmail) {
      newErrors.email = "Email is required.";
      hasError = true;
    } else if (!validateEmail(trimmedEmail)) {
      newErrors.email = "Please enter a valid email address.";
      hasError = true;
    }

    if (!trimmedPassword) {
      newErrors.password = "Password is required.";
      hasError = true;
    }

    setErrors(newErrors);

    if (hasError) return;

    setSuccess(true);

    setTimeout(() => {
      navigate("/dashboard");
    }, 2000);
  }

  return (
    <div className="login-page">
      <main className="container">
        {/* Branding */}
        <div className="branding">
          <div className="logo">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </div>
          <h1>TANAW</h1>
          {success && (
            <div className="tanaw-toast">
              <div className="toast-check">
                ✓
            </div>

            <div className="toast-content">
              <h4>Login Successful</h4>
              <p>Redirecting to dashboard...</p>
            </div>
          </div>
          )}
        </div>

        {/* Auth Card */}
        <section className="card">
          <header className="card-header">
            <h2>Login</h2>
            <p>Authenticate to manage fleet operations.</p>
          </header>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="email">EMAIL ADDRESS</label>
              <div className="input-wrapper">
                <span className="input-icon">@</span>
                <input
                  type="email"
                  id="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errors.email) setErrors((prev) => ({ ...prev, email: "" }));
                  }}
                />
              </div>
              {errors.email && (
                <p className="field-error">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  {errors.email}
                </p>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="password">PASSWORD</label>
              <div className="input-wrapper">
                <span className="input-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </span>
                <input
                  type="password"
                  id="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors((prev) => ({ ...prev, password: "" }));
                  }}
                />
              </div>
              {errors.password && (
                <p className="field-error">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  {errors.password}
                </p>
              )}
            </div>

            <button type="submit" className="btn-primary">
              Sign In →
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}