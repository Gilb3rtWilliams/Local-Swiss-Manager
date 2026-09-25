// frontend/src/auth/AuthWidget.jsx
import { useState } from "react";
import { useAuth } from "./AuthContext";
import AccountMenu from "./AccountMenu";

export default function AuthWidget() {
  const { status, login } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (status === "checking") return null;
  if (status === "loggedIn") return <AccountMenu />;

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await login(email.trim(), password);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error || "Login failed.");
    } else {
      setOpen(false);
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className="navbar-link"
        onClick={() => setOpen((o) => !o)}
      >
        Publishing sign-in
      </button>
      {open && (
        <form
          onSubmit={handleSubmit}
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 6px)",
            width: 260,
            padding: 16,
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: 8,
            boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
            zIndex: 50,
          }}
        >
          <input
            type="email"
            placeholder="Email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
            style={{
              width: "100%",
              padding: 8,
              marginBottom: 8,
              boxSizing: "border-box",
            }}
          />
          <input
            type="password"
            placeholder="Password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
            style={{
              width: "100%",
              padding: 8,
              marginBottom: 8,
              boxSizing: "border-box",
            }}
          />
          {error && (
            <div style={{ color: "#a33", fontSize: 12, marginBottom: 8 }}>
              {error}
            </div>
          )}
          <button
            type="submit"
            className="btn-primary btn-sm"
            disabled={submitting}
            style={{ width: "100%" }}
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
          <p
            style={{
              fontSize: 11,
              color: "#888",
              marginTop: 8,
              marginBottom: 0,
            }}
          >
            Only needed to publish tournaments online. The app works fully
            offline without this.
          </p>
        </form>
      )}
    </div>
  );
}
