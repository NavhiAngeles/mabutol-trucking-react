function LoginSuccessToast() {
  return (
    <div className="tanaw-toast">
      <div className="toast-check">
        ✓
      </div>

      <div className="toast-content">
        <h4>Login Successful</h4>
        <p>Redirecting to dashboard...</p>
      </div>
    </div>
  );
}

export default LoginSuccessToast;