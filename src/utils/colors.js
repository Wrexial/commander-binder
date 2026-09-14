/**
 * Cache of resolved CSS custom properties. The theme variables are static for
 * the lifetime of the page, but `getComputedStyle` forces a style flush on
 * every call. Card creation asks for the same handful of variables thousands
 * of times, so resolve each one once.
 * @type {Map<string, string>|null}
 */
let cssVarCache = null;

/** Drop memoized CSS variables (after a theme change, or in tests). */
export function clearCssVarCache() {
  cssVarCache = null;
}

function getCssVar(name, fallback) {
  if (!cssVarCache) cssVarCache = new Map();

  const cached = cssVarCache.get(name);
  if (cached !== undefined) return cached;

  const v = getComputedStyle(document.documentElement).getPropertyValue(name);
  const value = (v || fallback).trim();
  cssVarCache.set(name, value);
  return value;
}

export function getCardBorderStyle(card) {
  const colors = card.color_identity || [];

  if (colors.length === 0) {
    return { borderColor: getCssVar('--colorless', '#aaaaaa') };
  }

  if (colors.length === 1) {
    return { borderColor: getCssVar(`--mtg-${colors[0]}`, getCssVar('--colorless', '#aaaaaa')) };
  }

  // Multicolor
  return { borderColor: getCssVar('--multicolor-border', '#FFD700') };
}

export function getCardBackground(card) {
  const colors = card.color_identity || [];

  if (colors.length === 0) return getCssVar('--colorless-bg', '#f4f4f4');
  if (colors.length === 1)
    return getCssVar(`--mtg-bg-${colors[0]}`, getCssVar('--colorless-bg', '#f4f4f4'));

  // Multicolor: vertical stripes using CSS variables
  const percentStep = 100 / colors.length;
  let gradientStops = [];

  colors.forEach((c, i) => {
    const color = getCssVar(`--mtg-bg-${c}`, getCssVar('--colorless-bg', '#f4f4f4'));
    const start = i * percentStep;
    const end = (i + 1) * percentStep;
    gradientStops.push(`${color} ${start}%`, `${color} ${end}%`);
  });

  return `linear-gradient(to right, ${gradientStops.join(', ')})`;
}
