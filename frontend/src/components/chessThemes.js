// Board color themes for the Chess960 board. A single source of truth so
// the theme dropdown (Chess960.jsx) and the actual rendering (ChessBoard.jsx)
// never drift out of sync — add a theme here and it appears in both places.
// Board color themes for the Chess960 board. A single source of truth so
// the theme dropdown (Chess960.jsx) and the actual rendering (ChessBoard.jsx)
// never drift out of sync — add a theme here and it appears in both places.
export const BOARD_THEMES = {
  walnut: {
    label: "Walnut",
    light: "#f4efe2",
    dark: "#6b4a34",
    border: "#6b4a34",
  },
  classic: {
    label: "Classic Green",
    light: "#eeeed2",
    dark: "#769656",
    border: "#4b6b3a",
  },
  ocean: {
    label: "Ocean",
    light: "#e8f1f5",
    dark: "#2b6777",
    border: "#1f4c58",
  },
  emerald: {
    label: "Emerald",
    light: "#eef3e6",
    dark: "#3f6b4a",
    border: "#2d4f36",
  },
  slate: {
    label: "Slate",
    light: "#e9e9ec",
    dark: "#4a4a55",
    border: "#33333c",
  },
  coral: {
    label: "Coral",
    light: "#fdf1e8",
    dark: "#c9724f",
    border: "#9c5033",
  },

  // New Themes
  mahogany: {
    label: "Mahogany",
    light: "#f6ece3",
    dark: "#5a2d1d",
    border: "#3d1d13",
  },
  midnight: {
    label: "Midnight",
    light: "#dfe6ef",
    dark: "#1e2a44",
    border: "#111a2c",
  },
  lavender: {
    label: "Lavender",
    light: "#f4f1fa",
    dark: "#7466a6",
    border: "#564a80",
  },
  sand: {
    label: "Desert Sand",
    light: "#f9f2dc",
    dark: "#c2a26c",
    border: "#92784d",
  },
  ruby: {
    label: "Ruby",
    light: "#f9ecec",
    dark: "#8b2f3b",
    border: "#611f28",
  },
  royal: {
    label: "Royal Blue",
    light: "#edf4fc",
    dark: "#2f5d9b",
    border: "#21426f",
  },
  forest: {
    label: "Forest",
    light: "#edf4e8",
    dark: "#355e3b",
    border: "#264229",
  },
  obsidian: {
    label: "Obsidian",
    light: "#d8d8d8",
    dark: "#222222",
    border: "#111111",
  },
  rosewood: {
    label: "Rosewood",
    light: "#f7ece9",
    dark: "#70393f",
    border: "#51282d",
  },
  gold: {
    label: "Golden",
    light: "#fff8dc",
    dark: "#b8860b",
    border: "#8a6508",
  },
};

export const DEFAULT_BOARD_THEME = "walnut";

// Piece color themes, independent of the board theme — pieces are rendered
// as Unicode glyphs (outline chars for White, solid chars for Black; see
// ChessBoard.jsx's pieceAt()), recolored via fill + text-shadow. Each theme
// needs to stay readable against *any* board theme above, not just one, so
// every fill keeps the same light-fill-with-dark-shadow (White) /
// dark-fill-with-light-shadow (Black) contrast pattern as the original —
// only the hue changes.
export const PIECE_THEMES = {
  cburnett: {
    label: "Classic 2D (Cburnett)",
    folder: "cburnett",
    shadow: "drop-shadow(0 2px 3px rgba(0, 0, 0, 0.4))",
  },
  merida: {
    label: "Tournament (Merida)",
    folder: "merida",
    shadow: "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3))",
  },
  alpha: {
    label: "Modern (Alpha)",
    folder: "alpha",
    shadow: "drop-shadow(0 2px 4px rgba(0, 0, 0, 0.35))",
  },
  maestro: {
    label: "Elegant (Maestro)",
    folder: "maestro",
    shadow: "drop-shadow(0 2px 3px rgba(0, 0, 0, 0.3))",
  },
  // New Piece Themes
  celtic: {
    label: "Celtic",
    folder: "celtic",
    shadow: "drop-shadow(0 2px 3px rgba(0, 0, 0, 0.4))",
  },
  fantasy: {
    label: "Fantasy",
    folder: "fantasy",
    shadow: "drop-shadow(0 2px 3px rgba(0, 0, 0, 0.4))",
  },
  chessnut: {
    label: "Chessnut",
    folder: "chessnut",
    shadow: "drop-shadow(0 2px 3px rgba(0, 0, 0, 0.4))",
  },
  spatial: {
    label: "Spatial",
    folder: "spatial",
    shadow: "drop-shadow(0 2px 3px rgba(0, 0, 0, 0.4))",
  },
  "kiwen-suwi": {
    label: "Kiwen Suwi",
    folder: "kiwen-suwi",
    shadow: "drop-shadow(0 2px 3px rgba(0, 0, 0, 0.4))",
  },
  rhosgfx: {
    label: "RhosGFX",
    folder: "rhosgfx",
    shadow: "drop-shadow(0 2px 3px rgba(0, 0, 0, 0.4))",
  },
};

export const DEFAULT_PIECE_THEME = "cburnett";
