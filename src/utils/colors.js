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

export function getCardTextColor(card) {
    const colors = card.color_identity || [];

    if (colors.length === 0) {
        return '#e0e0e0';
    }

    if (colors.length === 1) {
        switch (colors[0]) {
            case 'W':
            case 'U':
                return '#1a202c';
            case 'B':
            case 'R':
            case 'G':
                return '#e0e0e0';
        }
    }

    return '#e0e0e0';
}

export function lightenColor(color, factor) {
  // Accept rgb() or hex values; if color is not hex, just return it with a simple overlay
  const hexMatch = color.match(/#([0-9a-fA-F]{6})/);
  if (!hexMatch) return color;

  const hex = hexMatch[0];
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  return `rgb(${Math.round(r + (255 - r) * factor)}, ${Math.round(
    g + (255 - g) * factor
  )}, ${Math.round(b + (255 - b) * factor)})`;
}
