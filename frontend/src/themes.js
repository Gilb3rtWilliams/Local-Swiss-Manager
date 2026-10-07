import { useCallback, useState } from "react";

// Theme registry for the tournament module.
// The color tokens live in css/theme.css under
// `[data-theme="<id>"]`; this file lists what exists so the picker can render
// names and swatches. Keep ids in sync with the CSS.
//
// swatch: [background, card, accent] — used for the picker preview.

export const THEMES = [
  { id: "midnight", label: "Midnight Gold", swatch: ["#13131a", "#191924", "#d4a853"] },
  { id: "forest", label: "Forest", swatch: ["#0f1a14", "#16241b", "#4caf7a"] },
  { id: "ocean", label: "Ocean", swatch: ["#0b1622", "#112233", "#38a3f0"] },
  { id: "crimson", label: "Crimson", swatch: ["#1a1012", "#261619", "#e5484d"] },
  { id: "violet", label: "Violet", swatch: ["#15111f", "#1f192e", "#a78bfa"] },
  { id: "sunset", label: "Sunset", swatch: ["#1c1410", "#281c15", "#f08a3c"] },
  { id: "rose", label: "Rose", swatch: ["#1c1218", "#281a23", "#ec6fa8"] },
  { id: "lagoon", label: "Lagoon", swatch: ["#0a1a1a", "#102626", "#2dd4bf"] },
  { id: "nord", label: "Nord", swatch: ["#2e3440", "#3b4252", "#88c0d0"] },
  { id: "graphite", label: "Graphite", swatch: ["#111111", "#1b1b1b", "#e5e5e5"] },
  { id: "paper", label: "Paper (light)", swatch: ["#f4f1ea", "#ffffff", "#b7791f"] },
  { id: "daylight", label: "Daylight (light)", swatch: ["#eef3f9", "#ffffff", "#2563eb"] },
];

export const DEFAULT_THEME = "midnight";
export const THEME_STORAGE_KEY = "swiss-manager-theme";

export function isValidTheme(id) {
  return THEMES.some((t) => t.id === id);
}

// Returns [theme, setTheme]. The choice is remembered in localStorage and
// shared by every view that uses this hook.
export function useTheme() {
  const [theme, setThemeState] = useState(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      return isValidTheme(saved) ? saved : DEFAULT_THEME;
    } catch {
      return DEFAULT_THEME;
    }
  });

  const setTheme = useCallback((next) => {
    if (!isValidTheme(next)) return;
    setThemeState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* storage unavailable — the theme still applies for this session */
    }
  }, []);

  return [theme, setTheme];
}
