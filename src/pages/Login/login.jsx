import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./login.css";

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function handleSubmit(e) {
    e.preventDefault();

    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      alert("Please fill in all fields.");
      return;
    }

    if (!validateEmail(trimmedEmail)) {
      alert("Enter a valid corporate email.");
      return;
    }

    alert("Login successful (demo only).");
    navigate("/dashboard");
  }

  return (
    <div className="login-page">
      <div className="overlay"></div>

      <main className="container">
        <div className="branding">
          <div className="logo"></div>

          <h1>Mabutol Tracking</h1>

          <p className="subtitle">
            MABUTOL TRACKING & LOGISTICS
          </p>
        </div>

        <section className="card">
          <header className="card-header">
            <h2>Secure Access</h2>

            <p>
              Authenticate to manage fleet operations.
            </p>
          </header>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="email">
                CORPORATE EMAIL
              </label>

              <input
                type="email"
                id="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="form-group">
              <div className="label-row">
                <label htmlFor="password">
                  SECURITY KEY
                </label>

                <a href="#" className="forgot">
                  Forgot Access?
                </a>
              </div>

              <input
                type="password"
                id="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              className="btn-primary"
            >
              Sign In →
            </button>

            <div className="divider">
              <span>OR IDENTIFY PROVIDER</span>
            </div>

            <div className="oauth">
              <button
                type="button"
                className="btn-oauth"
              >
                Google
              </button>

              <button
                type="button"
                className="btn-oauth"
              >
                Azure AD
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}