import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// jsdom has no layout, so axe can't check colour contrast there. These pure
// WCAG 2.1 calculations read the real `:root` tokens instead, so the theme's
// text-on-surface pairs stay legible.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const css = readFileSync(resolve(root, 'src/styles.css'), 'utf8');

/** The declared hex value of a `:root` token. */
function token(name) {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`));
  if (!match) throw new Error(`Token --${name} not found in src/styles.css`);
  return match[1];
}

function luminance(hex) {
  let value = hex.replace('#', '');
  if (value.length === 3)
    value = value
      .split('')
      .map((char) => char + char)
      .join('');
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(value.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** Foreground token → the surfaces it is rendered on as text. */
const TEXT_ON = {
  text: ['surface-0', 'surface-1', 'surface-2', 'surface-3', 'card-bg-default'],
  muted: ['surface-1', 'surface-2', 'surface-3', 'card-bg-default'],
  accent: ['surface-1', 'surface-2', 'surface-3'],
  'accent-strong': ['surface-1', 'surface-2', 'surface-3'],
  success: ['surface-1', 'surface-2', 'surface-3'],
  danger: ['surface-1', 'surface-2', 'surface-3'],
  focus: ['surface-1', 'surface-2', 'surface-3'],
  'button-text': ['button-bg'],
};

const PAIRS = Object.entries(TEXT_ON).flatMap(([fg, bgs]) => bgs.map((bg) => [fg, bg]));

describe('design token contrast', () => {
  it.each(PAIRS)('--%s on --%s meets WCAG AA', (fg, bg) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
  });
});
