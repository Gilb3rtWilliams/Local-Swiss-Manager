import { THEMES } from "../themes.js";

// Theme dropdown with a small color preview. Styled by .tp-picker in
// css/theme.css, so it follows the active theme.
export default function ThemePicker({ theme, onChange }) {
  const current = THEMES.find((x) => x.id === theme) || THEMES[0];
  return (
    <label className="tp-picker" title="Theme">
      <span className="tp-picker-swatch" aria-hidden="true">
        {current.swatch.map((c) => (
          <i key={c} style={{ background: c }} />
        ))}
      </span>
      <select
        value={theme}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Theme"
      >
        {THEMES.map((x) => (
          <option key={x.id} value={x.id}>
            {x.label}
          </option>
        ))}
      </select>
    </label>
  );
}
