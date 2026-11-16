// EMBERLINE — the look plan, in one place. Own palette: dusk steel, ember amber,
// ash teal. The same names are the CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#10141a', // sky / fog
  ground: '#1a1d22', // asphalt
  surface: '#232830', // walls, containers (dark steel)
  hairline: '#313842', // crates, cover
  ink: '#e9e6df', // light / HUD text
  muted: '#98a0a8', // secondary text
  accent: '#f0a830', // EMBER team amber
  ember: '#f0a830',
  ash: '#3fc1b0', // ASH team teal
  danger: '#e5484d', // damage / bomb
  rust: '#a85f2a', // rust-orange containers
  gold: '#d9b45b',
};

export function shade(name) {
  return PALETTE[name];
}
