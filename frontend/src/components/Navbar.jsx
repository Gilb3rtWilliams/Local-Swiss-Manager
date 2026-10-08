import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import AuthWidget from "../auth/AuthWidget.jsx";
import "../css/Navbar.css";

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { authenticated, logout } = useAuth();

  // Organizer-only chrome: render nothing for visitors who aren't logged in
  // (authenticated is null while the session check is still pending, false
  // once it has failed), and keep it off the public client pages.
  if (
    authenticated !== true ||
    location.pathname === "/" ||
    location.pathname.startsWith("/register/") ||
    location.pathname.startsWith("/results/")
  )
    return null;

  async function handleLogout() {
    await logout();
    navigate("/");
  }

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="navbar-brand">
          <span className="navbar-glyph">♟</span> Local Swiss Manager
        </Link>
        <nav className="navbar-actions">
          <Link
            to="/dashboard"
            className={`navbar-link ${
              location.pathname === "/dashboard" ? "active" : ""
            }`}
          >
            Dashboard
          </Link>
          <button
            className="btn-primary btn-sm"
            onClick={() => navigate("/new")}
          >
            + New Tournament
          </button>
          <button className="navbar-link" onClick={handleLogout}>
            Log out
          </button>
          <AuthWidget />
        </nav>
      </div>
    </header>
  );
}
