import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import "../css/Login.css";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(password);
      const dest = location.state?.from?.pathname || "/dashboard";
      navigate(dest, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lg-root">
      <div className="lg-bg" aria-hidden="true">
        <div className="lg-bg-scene" />
        <div className="lg-bg-scene" />
        <div className="lg-bg-scene" />
      </div>

      <div className="lg-card">
        <span className="lg-eyebrow">Admin</span>
        <h1 className="lg-title">Sign In</h1>
        <p className="lg-sub">Tournament management is admin-only from here.</p>

        <form onSubmit={handleSubmit}>
          <label className="lg-field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              autoFocus
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </label>

          {error && <div className="lg-error">{error}</div>}

          <button className="lg-submit" disabled={busy || !password}>
            {busy ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
