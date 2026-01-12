function getCssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name);
  return (v || fallback).trim();
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
  if (colors.length === 1) return getCssVar(`--mtg-bg-${colors[0]}`, getCssVar('--colorless-bg', '#f4f4f4'));

  // Multicolor: vertical stripes using CSS variables
  const percentStep = 100 / colors.length;
  let gradientStops = [];

  colors.forEach((c, i) => {
    const color = getCssVar(`--mtg-bg-${c}`, getCssVar('--colorless-bg', '#f4f4f4'));
    const start = i * percentStep;
    const end = (i + 1) * percentStep;
    gradientStops.push(`${color} ${start}%`, `${color} ${end}%`);
  });

  return `linear-gradient(to right, ${gradientStops.join(", ")})`;
}


export function lightenColor(color, factor) {
  // Accept rgb() or hex values; if color is not hex, just return it with a simple overlay
  const hexMatch = color.match(/#([0-9a-fA-F]{3,6})/);
  if (!hexMatch) return color;

  let hex = hexMatch[1];
  if (hex.length === 3) {
    hex = hex.split('').map(char => char + char).join('');
  }
  
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);

  const newR = Math.round(r + (255 - r) * factor);
  const newG = Math.round(g + (255 - g) * factor);
  const newB = Math.round(b + (255 - b) * factor);

  return `rgb(${newR}, ${newG}, ${newB})`;
}
