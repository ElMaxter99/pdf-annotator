export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

const clampChannel = (value: number) => Math.max(0, Math.min(255, value));

/** Normalises `#abc`, `#aabbcc` and `rgb()/rgba()` strings to lowercase `#rrggbb`; other input is returned unchanged. */
export function normalizeColor(color: string): string {
  if (color.startsWith('#')) {
    const hex =
      color.length === 4
        ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
        : color;
    return hex.toLowerCase();
  }

  const match = color.match(
    /^rgba?\((\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(\d*\.?\d+))?\)$/i
  );
  if (!match) return color;

  const [, r, g, b] = match;
  const toHex = (value: string) => clampChannel(parseInt(value, 10)).toString(16).padStart(2, '0');

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Parses a user-typed hex colour (`#abc`, `abc`, `#aabbcc`) into `#rrggbb`, or `null` when invalid. */
export function normalizeHexInput(value: string): string | null {
  const match = value.trim().match(/^#?([a-f\d]{3}|[a-f\d]{6})$/i);
  if (!match) return null;
  let hex = match[1];
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((ch) => ch + ch)
      .join('');
  }
  return `#${hex.toLowerCase()}`;
}

/** Parses `rgb(r, g, b)` or `r, g, b` text, clamping each channel to 0-255. */
export function parseRgbText(value: string): RgbColor | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const rgbMatch = trimmed.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
  const fallbackMatch = trimmed.match(/^(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})$/);
  const match = rgbMatch ?? fallbackMatch;
  if (!match) return null;
  const [, r, g, b] = match;
  return {
    r: clampChannel(parseInt(r, 10)),
    g: clampChannel(parseInt(g, 10)),
    b: clampChannel(parseInt(b, 10)),
  };
}

export function rgbToHex(rgb: RgbColor): string {
  const toHex = (num: number) => num.toString(16).padStart(2, '0');
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

/** Extracts RGB channels from a hex or `rgb()/rgba()` colour. */
export function parseColorComponents(color: string): RgbColor | null {
  const hex = normalizeHexInput(color);
  if (hex) {
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16),
    };
  }

  const match = color.match(/^rgba?\((\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
  if (!match) return null;
  return {
    r: clampChannel(parseInt(match[1], 10)),
    g: clampChannel(parseInt(match[2], 10)),
    b: clampChannel(parseInt(match[3], 10)),
  };
}

export function toRgbString(color: string): string {
  const comps = parseColorComponents(color);
  if (!comps) return '';
  return `rgb(${comps.r}, ${comps.g}, ${comps.b})`;
}

/** Returns the colour as `#rrggbb`, or `null` when it cannot be expressed as hex. */
export function ensureHex(color: string): string | null {
  const normalized = normalizeColor(color);
  return normalized.startsWith('#') ? normalized : null;
}

export function hexToRgbComponents(color: string): RgbColor | null {
  const hex = normalizeColor(color).replace('#', '');
  if (hex.length !== 6) {
    return null;
  }
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  if ([r, g, b].some((value) => Number.isNaN(value))) {
    return null;
  }
  return { r, g, b };
}
