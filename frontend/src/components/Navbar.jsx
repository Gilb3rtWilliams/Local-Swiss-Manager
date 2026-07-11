import { Link, useLocation, useNavigate } from "react-router-dom";
import "../css/Navbar.css";

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();

  if (location.pathname === "/") return null;

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
