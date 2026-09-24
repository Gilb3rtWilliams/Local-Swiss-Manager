// AuthGate.jsx  (renderer -- drop into your existing React app)
// ─────────────────────────────────────────────────────────────────────────
// The actual integration point. Wrap your existing app's root render with
// this -- nothing inside your existing app needs to change or know this
// exists, unless a component specifically wants auth info via useAuth().
//
// BEFORE (e.g. in your index.js / main.jsx):
//
//   import App from "./App";
//   root.render(<App />);
//
// AFTER:
//
//   import App from "./App";
//   import AuthGate from "./AuthGate";
//   root.render(
//     <AuthGate>
//       <App />
//     </AuthGate>
//   );
//
// That's the whole integration. <App /> renders exactly as before, but only
// once someone's actually signed in -- <AuthGate> shows a splash screen
// while checking, then <LoginScreen> if signed out, and swaps to <App />
// the moment login succeeds. No changes needed inside App.jsx itself.

import { AuthProvider, useAuth } from "./AuthContext";
import LoginScreen from "./LoginScreen";

function Gate({ children }) {
  const { status } = useAuth();

  if (status === "checking") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          color: "#888",
        }}
      >
        Loading…
      </div>
    );
  }
  if (status === "loggedOut") {
    return <LoginScreen />;
  }
  return children;
}

export default function AuthGate({ children }) {
  return (
    <AuthProvider>
      <Gate>{children}</Gate>
    </AuthProvider>
  );
}
