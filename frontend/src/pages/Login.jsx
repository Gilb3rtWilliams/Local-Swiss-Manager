import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import BackgroundSlideshow from "../components/BackgroundSlideshow.jsx";
import "../css/Login.css";

import slide1 from "../images/slide1.jpg";
import slide2 from "../images/slide2.jpg";
import slide3 from "../images/slide3.jpg";
import slide4 from "../images/slide4.jpg";
import slide5 from "../images/slide5.jpg";

const HERO_IMAGES = [slide1, slide2, slide3, slide4, slide5];

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
      {/* Same background slideshow used on the Welcome page */}
      <BackgroundSlideshow images={HERO_IMAGES} className="login-bg" />

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
