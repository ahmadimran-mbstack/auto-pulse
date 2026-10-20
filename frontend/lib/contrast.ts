// Pure functions for calculating color contrast according to WCAG 2.1 specifications

// Converts an 8-bit hex channel (0-255) to a linear sRGB value
function sRGBtoLin(colorChannel: number): number {
  const normalized = colorChannel / 255;
  if (normalized <= 0.04045) {
    return normalized / 12.92;
  }
  return Math.pow((normalized + 0.055) / 1.055, 2.4);
}

// Parses a 6-digit hex string into RGB numbers
export function parseHexColor(hex: string): { r: number; g: number; b: number } | null {
  const cleanHex = hex.trim().replace(/^#/, "");
  if (!/^[0-9A-Fa-f]{6}$/.test(cleanHex)) {
    return null;
  }
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return { r, g, b };
}

// Calculates relative luminance for an RGB color (0.0 to 1.0)
export function getRelativeLuminance(r: number, g: number, b: number): number {
  const rLin = sRGBtoLin(r);
  const gLin = sRGBtoLin(g);
  const bLin = sRGBtoLin(b);
  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

// Calculates contrast ratio between two hex colors (1:1 to 21:1)
export function getContrastRatio(hex1: string, hex2: string): number {
  const rgb1 = parseHexColor(hex1);
  const rgb2 = parseHexColor(hex2);

  if (!rgb1 || !rgb2) {
    return 1;
  }

  const lum1 = getRelativeLuminance(rgb1.r, rgb1.g, rgb1.b);
  const lum2 = getRelativeLuminance(rgb2.r, rgb2.g, rgb2.b);

  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);

  return (brightest + 0.05) / (darkest + 0.05);
}

// Picks either white or dark ink text for maximum contrast against a background
export function getRecommendedTextColor(bgHex: string): "#FFFFFF" | "#0F172A" {
  const whiteRatio = getContrastRatio(bgHex, "#FFFFFF");
  const darkRatio = getContrastRatio(bgHex, "#0F172A");

  return whiteRatio >= darkRatio ? "#FFFFFF" : "#0F172A";
}

// Checks if the recommended text color achieves WCAG AA minimum contrast of 4.5:1
export function hasAccessibleContrast(bgHex: string): boolean {
  const textHex = getRecommendedTextColor(bgHex);
  const ratio = getContrastRatio(bgHex, textHex);
  return ratio >= 4.5;
}
