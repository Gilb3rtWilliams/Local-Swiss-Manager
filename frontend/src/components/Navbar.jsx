import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import "../css/Navbar.css";

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { authenticated, logout } = useAuth();

  // Both the registration page and the public results/bracket view are
  // public-facing — a prospective player or spectator shouldn't see admin
  // controls, "Dashboard", "+ New Tournament", or a Log Out button for a
  // session that isn't theirs.
  if (
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
          <span className="navbar-glyph">♞</span> Local Swiss Manager
        </Link>
        <nav className="navbar-actions">
          {authenticated && (
            <>
              <Link
                to="/dashboard"
                className={`navbar-link ${location.pathname === "/dashboard" ? "active" : ""}`}
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
                Log Out
              </button>
            </>
          )}
          {authenticated === false && location.pathname !== "/login" && (
            <Link to="/login" className="navbar-link">
              Log In
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
