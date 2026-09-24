// LoginScreen.jsx  (renderer -- drop into your existing React app)
// ─────────────────────────────────────────────────────────────────────────
// Reads/writes auth state via useAuth() (see AuthContext.jsx) rather than
// calling window.swissManagerDesktop directly, so login logic lives in one
// place -- any other component (a header, a settings screen) can react to
// the same state via useAuth() too.
//
// USAGE: rendered automatically by <AuthGate> (see AuthGate.jsx) when
// status is "loggedOut" -- you don't need to render this yourself.

import { useState } from "react";
import { useAuth } from "./AuthContext";

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    const result = await login(email.trim(), password);

    setSubmitting(false);
    if (!result.ok) {
      setError(result.error || "Login failed.");
    }
    // On success, AuthProvider's status flips to "loggedIn" and <AuthGate>
    // swaps this screen out on its own -- nothing else to do here.
  }

  return (
    <div style={styles.wrap}>
      <form style={styles.card} onSubmit={handleSubmit}>
        <h1 style={styles.title}>Swiss Manager</h1>
        <p style={styles.subtitle}>
          Sign in with your Swiss Manager account to continue.
        </p>

        <label style={styles.label} htmlFor="login-email">
          Email
        </label>
        <input
          id="login-email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={styles.input}
          disabled={submitting}
        />

        <label style={styles.label} htmlFor="login-password">
          Password
        </label>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={styles.input}
          disabled={submitting}
        />

        {error && (
          <div style={styles.error} role="alert">
            {error}
          </div>
        )}

        <button type="submit" style={styles.button} disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>

        <p style={styles.hint}>
          Running a tournament with no internet? Sign in once while online --
          you'll stay signed in offline for a couple of weeks after that.
        </p>
      </form>
    </div>
  );
}

const styles = {
  wrap: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
    background: "#f4f4f6",
  },
  card: {
    width: 340,
    padding: 32,
    background: "#fff",
    borderRadius: 12,
    boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
  },
  title: { margin: "0 0 4px", fontSize: 22 },
  subtitle: { margin: "0 0 20px", color: "#666", fontSize: 14 },
  label: {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 4,
    marginTop: 12,
  },
  input: {
    width: "100%",
    padding: "8px 10px",
    fontSize: 14,
    borderRadius: 6,
    border: "1px solid #ccc",
    boxSizing: "border-box",
  },
  error: {
    marginTop: 14,
    padding: "8px 10px",
    background: "#fdecea",
    color: "#a33",
    borderRadius: 6,
    fontSize: 13,
  },
  button: {
    width: "100%",
    marginTop: 20,
    padding: "10px 0",
    fontSize: 14,
    fontWeight: 600,
    color: "#fff",
    background: "#2b6cb0",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
  },
  hint: { marginTop: 16, fontSize: 12, color: "#888", lineHeight: 1.4 },
};
