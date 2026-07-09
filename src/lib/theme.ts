// Theme color utilities. Keep simple.
// Handles custom accent color with contrast validation.

export function hexToRgba(hex: string, alpha: number): string {
  let r = 0, g = 0, b = 0;

  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length === 7) {
    r = parseInt(hex.slice(1, 3), 16);
    g = parseInt(hex.slice(3, 5), 16);
    b = parseInt(hex.slice(5, 7), 16);
  }

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function isValidAccentColor(hex: string): boolean {
  if (!hex || !hex.startsWith('#')) return false;

  let r = 0, g = 0, b = 0;

  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length === 7) {
    r = parseInt(hex.slice(1, 3), 16);
    g = parseInt(hex.slice(3, 5), 16);
    b = parseInt(hex.slice(5, 7), 16);
  } else {
    return false;
  }

  // Simple luminance (0-1). Reject colors too close to black or white.
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.15 && luminance < 0.85;
}

export function applyAccentColor(color: string) {
  if (!isValidAccentColor(color)) {
    color = '#06b6d4'; // fallback to cyan
  }

  const root = document.documentElement;
  root.style.setProperty('--accent', color);
  root.style.setProperty('--accent-bg', hexToRgba(color, 0.12));
  root.style.setProperty('--accent-border', hexToRgba(color, 0.55));

  // Note: theme-color meta is set statically in index.html with media queries
  // for light/dark background colors (white/dark per system). This makes the
  // status bar (time/battery area) solid, not transparent.
}

// Call this on app start
export function initTheme() {
  // Will be called after settings load
}

export function applyUltraDarkMode(enabled: boolean) {
  const root = document.documentElement;
  if (enabled) {
    root.classList.add('ultra-dark');
  } else {
    root.classList.remove('ultra-dark');
  }
}
