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
  ivory: {
    label: "Ivory & Charcoal",
    white: {
      fill: "#fdfaf3",
      shadow: "0 0 1px #241811, 0 1px 2px rgba(0, 0, 0, 0.5)",
    },
    black: { fill: "#1b1a17", shadow: "0 1px 1px rgba(255, 255, 255, 0.25)" },
  },
  onyx: {
    label: "Onyx & Pearl",
    white: {
      fill: "#ffffff",
      shadow: "0 0 1px #33322d, 0 1px 3px rgba(0, 0, 0, 0.55)",
    },
    black: { fill: "#0a0a0a", shadow: "0 1px 1px rgba(255, 255, 255, 0.35)" },
  },
  royal: {
    label: "Ruby & Sapphire",
    white: {
      fill: "#c23b4e",
      shadow: "0 0 1px #4a0f18, 0 1px 2px rgba(0, 0, 0, 0.5)",
    },
    black: { fill: "#274a77", shadow: "0 1px 1px rgba(255, 255, 255, 0.3)" },
  },
  metallic: {
    label: "Gold & Silver",
    white: {
      fill: "#e0b84b",
      shadow: "0 0 1px #5c4718, 0 1px 2px rgba(0, 0, 0, 0.5)",
    },
    black: { fill: "#7d838a", shadow: "0 1px 1px rgba(255, 255, 255, 0.3)" },
  },
  forest: {
    label: "Sage & Pine",
    white: {
      fill: "#cfe0c3",
      shadow: "0 0 1px #33421f, 0 1px 2px rgba(0, 0, 0, 0.5)",
    },
    black: { fill: "#22392a", shadow: "0 1px 1px rgba(255, 255, 255, 0.25)" },
  },
};

export const DEFAULT_PIECE_THEME = "ivory";
