import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";

// Client-side gate for the UX — redirects to /login if you're not signed in.
// This is NOT the security boundary; that's requireAdmin on the backend.
// Someone could disable JS and still get bounced by the server on every
// actual request. This just avoids flashing an admin page and then having
// every fetch on it fail with a 401.
export default function RequireAuth({ children }) {
  const { authenticated } = useAuth();
  const location = useLocation();

  if (authenticated === null) {
    return (
      <div className="container">
        <p className="muted">Checking session…</p>
      </div>
    );
  }
  if (!authenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
}
