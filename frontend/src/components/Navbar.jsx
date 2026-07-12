import { Link, useLocation, useNavigate } from "react-router-dom";
import "../css/Navbar.css";

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();

  // Both the registration page and the public results view are
  // public-facing — a prospective player or spectator shouldn't see
  // "Dashboard" or "+ New Tournament", both organizer-only actions.
  if (
    location.pathname === "/" ||
    location.pathname.startsWith("/register/") ||
    location.pathname.startsWith("/results/")
  )
    return null;

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="navbar-brand">
          <span className="navbar-glyph">♞</span> Local Swiss Manager
        </Link>
        <nav className="navbar-actions">
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
        </nav>
      </div>
    </header>
  );
}
