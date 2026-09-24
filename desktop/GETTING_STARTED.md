# Swiss Manager Desktop — setup & build

## Layout this expects

```
repo/
  server/          <- your existing core Express app (tournament CRUD,
                       pairings, chessGame.js routes). NOT publish.js /
                       tournamentsPublic.js — those stay on Railway.
  client/
    build/          <- your React production build (CRA). If you're on
                       Vite, that's client/dist — update scripts/prep.js.
  desktop/          <- this project
```

If `server/app.js` doesn't already export `module.exports = (db) => expressApp`
and construct its Postgres pool lazily/optionally, that's the one change
needed on the server side first — see the comment at the top of `main.js`.

## First-time setup

```
cd desktop
npm install        # also downloads Electron itself and rebuilds
                    # better-sqlite3 for Electron's Node ABI (this can
                    # take a few minutes the first time)
```

## Run it in development

```
npm start           # copies in server/ + client/build, then launches Electron
```

`npm start` always re-runs the copy step first, so editing your server or
frontend and re-running `npm start` picks up the changes (rebuild the React
app first if you changed frontend code — `npm start` copies the _build
output_, it doesn't build it).

## Package a real installer

```
npm run dist         # full installer for your current OS (nsis/dmg/AppImage+deb)
npm run dist:dir      # faster: just the unpacked app, no installer — good for testing
```

Output lands in `desktop/release/`. Building a Windows installer from
Mac/Linux (or vice versa) needs extra tooling (Wine, etc.) — easiest is to
build each platform's installer on that platform, or use a CI runner per OS.

## Wiring in the login screen

Four files landed in `renderer/` — `AuthContext.jsx`, `LoginScreen.jsx`,
`AuthGate.jsx`, `AccountMenu.jsx`. Copy them into your React app's `src/`,
then wrap your existing root render:

```jsx
// before
root.render(<App />);

// after
import AuthGate from "./AuthGate";
root.render(
  <AuthGate>
    <App />
  </AuthGate>,
);
```

That's the whole integration — `<App />` renders unchanged, just gated
behind sign-in. Drop `<AccountMenu />` into your existing header/toolbar
wherever that lives; it needs no props, just `useAuth()` internally.

Drop `<PublishToggle tournamentId={tournament.id} />` into your existing
tournament screen (wherever it already shows that tournament's name/status)
-- it needs only the local tournament id, and handles registering, syncing,
turning off, and showing the shareable link entirely on its own.

Run `migrations/002_add_visibility.sql` against your Postgres database too
-- it's what makes turning publishing off actually hide the tournament from
public view, not just stop it from receiving new updates.

## Things to fill in before this is real

- **`getAuthToken()` in `main.js`** — currently a placeholder. You'll need a
  login screen and somewhere to persist the token (OS keychain via `keytar`
  is the standard choice for a desktop app).
- **`/api/me/entitlement`** — referenced by `publishing/entitlement.js`, not
  yet built on the server.
- **App icons** — `build-resources/` is currently empty; electron-builder
  wants an icon there (`icon.icns` for Mac, `icon.ico` for Windows,
  `icon.png` for Linux) or it'll use a default Electron icon.
- **`appId`/`productName`/code signing** in `package.json`'s `build` block —
  fine for testing, but Windows/Mac will show scary "unknown publisher"
  warnings without a real code-signing certificate before a public release.
