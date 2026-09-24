// publishing/authStore.js
// ─────────────────────────────────────────────────────────────────────────
// Stores the login token in the OS keychain (macOS Keychain, Windows
// Credential Vault, or the Secret Service API on Linux -- typically
// gnome-keyring or KWallet, whichever the desktop environment provides).
// This is the standard place for a desktop app to keep a credential: it's
// encrypted at rest by the OS, tied to the logged-in OS user, and survives
// app updates/reinstalls (unlike a plain file under userData, which anyone
// with disk access could read).
//
// VERIFIED: I confirmed a real save/get/delete round-trip through Electron's
// actual runtime against a real Secret Service backend (gnome-keyring) --
// not just that the native module loads. A normal Linux desktop already
// has one of these running as part of the session; nothing extra to set up
// there. NOT verified here (no Mac/Windows available in this sandbox):
// macOS Keychain and Windows Credential Vault, though keytar's whole point
// is exposing the same three functions across all three, and this is by
// far the most-used niche for it.
//
// One real caveat worth knowing about Linux specifically: on a machine
// with NO Secret Service running at all (a bare server, some minimal
// window managers), keytar throws rather than silently falling back -- see
// isAvailable() below, which lets the app degrade instead of crashing.

const keytar = require("keytar");

const SERVICE = "swiss-manager-desktop";
const ACCOUNT = "auth-token"; // single account: one logged-in user per install

async function isAvailable() {
  try {
    await keytar.findCredentials(SERVICE);
    return true;
  } catch {
    return false; // no Secret Service / keychain backend on this machine
  }
}

async function saveToken(token) {
  await keytar.setPassword(SERVICE, ACCOUNT, token);
}

async function getToken() {
  try {
    return await keytar.getPassword(SERVICE, ACCOUNT);
  } catch {
    return null; // treat "keychain unavailable" the same as "not logged in"
  }
}

async function clearToken() {
  try {
    await keytar.deletePassword(SERVICE, ACCOUNT);
  } catch {
    // nothing to delete, or no backend -- either way, there's no token now
  }
}

module.exports = { isAvailable, saveToken, getToken, clearToken };
