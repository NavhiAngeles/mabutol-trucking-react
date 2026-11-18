import { useState } from "react";
import { Link } from "react-router-dom";
import "../../components/TanawLogo.css";
import "../../components/signInFeedback.css";
import { useLoginViewModel } from "../../viewmodels/LoginViewModel";
import PasswordRecoveryModal from "./PasswordRecoveryModal";
import "./login.css";
import "./passwordRecovery.css";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function WarningIcon({ size = 14 }) {
  return (
    <svg
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function ArrowLeftIcon({ size = 16 }) {
  return (
    <svg
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  );
}

function BrandLockup({ inverted = false }) {
  return (
    <span className={`tanaw-brand-lockup is-md${inverted ? " is-inverted" : ""}`}>
      <span className="tanaw-brand-badge">
        <img
          src="/tanaw-logo.png"
          alt=""
          width="38"
          height="38"
          className="tanaw-brand-img"
          decoding="sync"
          fetchPriority="high"
        />
      </span>
      <span className="tanaw-brand-text">
        <span className="tanaw-brand-wordmark">TANAW</span>
        <span className="tanaw-brand-subtitle">Mabutol Trucking</span>
      </span>
    </span>
  );
}

function CorridorGraphic() {
  return (
    <svg
      className="login-corridor-graphic"
      aria-hidden="true"
      viewBox="0 0 420 280"
      width="420"
      height="280"
      fill="none"
    >
      <path
        d="M24 236 L112 184 Q152 160 198 148 L286 112 Q328 92 396 44"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="6 6"
      />
      <path
        d="M24 236 L112 184 Q152 160 198 148"
        stroke="currentColor"
        strokeWidth="3"
      />
      <circle cx="24" cy="236" r="4" fill="currentColor" />
      <circle cx="198" cy="148" r="5" fill="currentColor" />
      <circle cx="286" cy="112" r="4" stroke="currentColor" strokeWidth="2" />
      <circle cx="396" cy="44" r="4" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export default function Login() {
  const {
    email,
    password,
    keepSignedIn,
    errors,
    status,
    handleSubmit,
    handleEmailChange,
    handlePasswordChange,
    handleKeepSignedInChange,
  } = useLoginViewModel();

  const [showPassword, setShowPassword] = useState(false);
  const [blurEmailError, setBlurEmailError] = useState("");
  const [forgotOpen, setForgotOpen] = useState(false);
  const isPending = status === "loading" || status === "success";

  const activeEmailError = errors.email || blurEmailError;
  const activePasswordError = errors.password || "";

  function handleEmailInput(value) {
    if (blurEmailError) setBlurEmailError("");
    handleEmailChange(value);
  }

  function handleEmailBlur() {
    const trimmed = email.trim();
    if (trimmed && !EMAIL_PATTERN.test(trimmed)) {
      setBlurEmailError("Please enter a valid email address.");
    } else {
      setBlurEmailError("");
    }
  }

  function handleFormSubmit(e) {
    setBlurEmailError("");
    const trimmed = email.trim();
    const emailInvalid = !trimmed || !EMAIL_PATTERN.test(trimmed);
    const passwordInvalid = !password;

    if (emailInvalid) {
      e.currentTarget?.elements?.email?.focus?.();
    } else if (passwordInvalid) {
      e.currentTarget?.elements?.password?.focus?.();
    }

    return handleSubmit(e);
  }

  return (
    <div className="login-page">
      <div className="login-split">
        <aside className="login-brand-panel" aria-label="Operations portal overview">
          <CorridorGraphic />

          <div className="login-brand-top">
            <Link to="/" className="login-brand-link" aria-label="TANAW Mabutol Trucking home">
              <BrandLockup inverted />
            </Link>
          </div>

          <div className="login-brand-body">
            <p className="login-panel-title">
              Dispatch and fleet operations, centralized.
            </p>
            <p className="login-panel-lead">
              Manage Central Luzon freight runs, NLEX, SCTEX, and TPLEX toll matrices, live GPS tracking, and verified proof of delivery in one console.
            </p>

            <dl className="login-scope-list">
              <div className="login-scope-item">
                <dt>Dispatch Hub</dt>
                <dd>Cabanatuan City, Nueva Ecija</dd>
              </div>
              <div className="login-scope-item">
                <dt>Operations Standard</dt>
                <dd>Asia/Manila (PHT, UTC+8) &middot; PHP (&#8369;)</dd>
              </div>
              <div className="login-scope-item">
                <dt>Access Scope</dt>
                <dd>Authorized dispatchers and fleet administrators</dd>
              </div>
            </dl>
          </div>

          <footer className="login-panel-footer">
            <span>Mabutol Trucking Operations Portal</span>
          </footer>
        </aside>

        <main className="login-main">
          <div className="login-main-inner">
            <div className="login-form-shell">
              <header className="login-topbar">
                <Link to="/" className="login-mobile-brand" aria-label="TANAW Mabutol Trucking home">
                  <BrandLockup />
                </Link>
                <Link className="back-to-landing-link" to="/">
                  <ArrowLeftIcon size={16} />
                  <span>Back to Home</span>
                </Link>
              </header>

              <section className="card login-card" aria-labelledby="login-heading">
                <header className="card-header">
                  <h1 id="login-heading">Sign in to TANAW</h1>
                  <p>Enter your office credentials to open the dispatch console.</p>
                </header>

                <form onSubmit={handleFormSubmit} noValidate aria-busy={status === "loading"}>
                  {status === "error" && (
                    <div className="sign-in-failure-box" role="alert">
                      <div className="sign-in-failure-heading">
                        <WarningIcon size={16} />
                        <strong>Sign-in unsuccessful</strong>
                      </div>
                      <p>Please check the highlighted details below and try again.</p>
                    </div>
                  )}

                  <div className="form-group">
                    <label htmlFor="email" className="field-label">
                      Email address
                    </label>
                    <div className="input-wrapper">
                      <input
                        type="email"
                        id="email"
                        name="email"
                        autoComplete="username"
                        inputMode="email"
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        enterKeyHint="next"
                        required
                        placeholder="name@mabutoltrucking.com"
                        className={activeEmailError ? "input-field is-invalid" : "input-field"}
                        value={email}
                        disabled={isPending}
                        aria-invalid={activeEmailError ? "true" : "false"}
                        aria-describedby={activeEmailError ? "email-error" : undefined}
                        onChange={(e) => handleEmailInput(e.target.value)}
                        onBlur={handleEmailBlur}
                      />
                    </div>
                    {activeEmailError && (
                      <p id="email-error" className="field-error">
                        <WarningIcon size={14} />
                        <span>{activeEmailError}</span>
                      </p>
                    )}
                  </div>

                  <div className="form-group">
                    <label htmlFor="password" className="field-label">
                      Password
                    </label>
                    <div className="input-wrapper">
                      <input
                        type={showPassword ? "text" : "password"}
                        id="password"
                        name="password"
                        autoComplete="current-password"
                        enterKeyHint="done"
                        required
                        placeholder="Enter your password"
                        className={
                          activePasswordError
                            ? "input-field input-field-password is-invalid"
                            : "input-field input-field-password"
                        }
                        value={password}
                        disabled={isPending}
                        aria-invalid={activePasswordError ? "true" : "false"}
                        aria-describedby={activePasswordError ? "password-error" : undefined}
                        onChange={(e) => handlePasswordChange(e.target.value)}
                      />
                      <button
                        type="button"
                        className="toggle-password"
                        disabled={isPending}
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        aria-pressed={showPassword}
                      >
                        {showPassword ? (
                          <svg
                            aria-hidden="true"
                            xmlns="http://www.w3.org/2000/svg"
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg
                            aria-hidden="true"
                            xmlns="http://www.w3.org/2000/svg"
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                    {activePasswordError && (
                      <p id="password-error" className="field-error">
                        <WarningIcon size={14} />
                        <span>{activePasswordError}</span>
                      </p>
                    )}
                  </div>

                  <div className="form-options">
                    <label htmlFor="keep-signed-in" className="checkbox-label">
                      <input
                        type="checkbox"
                        id="keep-signed-in"
                        name="keepSignedIn"
                        className="checkbox-input"
                        checked={Boolean(keepSignedIn)}
                        disabled={isPending}
                        onChange={(e) => handleKeepSignedInChange?.(e.target.checked)}
                      />
                      <span>Keep me signed in</span>
                    </label>

                    {!isPending && (
                      <button
                        type="button"
                        className="forgot-password-link"
                        aria-haspopup="dialog"
                        onClick={() => setForgotOpen(true)}
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>

                  <button type="submit" className="btn-primary" disabled={isPending} aria-live="polite">
                    {status === "loading" ? "Signing in…" : status === "success" ? "Signed in" : "Sign In"}
                  </button>
                </form>

                <footer className="login-card-footer">
                  <p>Office accounts are provisioned by your Mabutol Trucking administrator.</p>
                </footer>
              </section>

              <p className="login-mobile-meta">
                Cabanatuan Dispatch Hub &middot; Asia/Manila (PHT, UTC+8)
              </p>
            </div>
          </div>
        </main>
      </div>

      {forgotOpen && !isPending && (
        <PasswordRecoveryModal onClose={() => setForgotOpen(false)} />
      )}
    </div>
  );
}
