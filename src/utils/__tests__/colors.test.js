// src/utils/__tests__/colors.test.js
import { describe, it, expect, vi } from 'vitest';
import { getCardBorderStyle, getCardBackground, lightenColor } from '../colors';

// Mock getComputedStyle
globalThis.getComputedStyle = vi.fn(() => ({
  getPropertyValue: (prop) => {
    if (prop === '--colorless') return '#aaaaaa';
    if (prop === '--mtg-W') return '#f8f3e0';
    if (prop === '--multicolor-border') return '#FFD700';
    if (prop === '--colorless-bg') return '#f4f4f4';
    if (prop === '--mtg-bg-W') return '#fdf8ec';
    if (prop === '--mtg-bg-U') return '#e3f0fa';
    return '';
  },
}));

describe('getCardBorderStyle', () => {
  it('should return the correct border color for a colorless card', () => {
    const card = { color_identity: [] };
    const style = getCardBorderStyle(card);
    expect(style.borderColor).toBe('#aaaaaa');
  });

  it('should return the correct border color for a single-color card', () => {
    const card = { color_identity: ['W'] };
    const style = getCardBorderStyle(card);
    expect(style.borderColor).toBe('#f8f3e0');
  });

  it('should return the correct border color for a multi-color card', () => {
    const card = { color_identity: ['W', 'U'] };
    const style = getCardBorderStyle(card);
    expect(style.borderColor).toBe('#FFD700');
  });
});

describe('getCardBackground', () => {
  it('should return the correct background for a colorless card', () => {
    const card = { color_identity: [] };
    const background = getCardBackground(card);
    expect(background).toBe('#f4f4f4');
  });

  it('should return the correct background for a single-color card', () => {
    const card = { color_identity: ['W'] };
    const background = getCardBackground(card);
    expect(background).toBe('#fdf8ec');
  });

  it('should return the correct background for a multi-color card', () => {
    const card = { color_identity: ['W', 'U'] };
    const background = getCardBackground(card);
    expect(background).toBe('linear-gradient(to right, #fdf8ec 0%, #fdf8ec 50%, #e3f0fa 50%, #e3f0fa 100%)');
  });
});

describe('lightenColor', () => {
  it('should lighten a 6-digit hex color by the specified factor', () => {
    const color = '#333333';
    const lighterColor = lightenColor(color, 0.5);
    expect(lighterColor).toBe('rgb(153, 153, 153)');
  });

  it('should lighten a 3-digit hex color by the specified factor', () => {
    const color = '#333';
    const lighterColor = lightenColor(color, 0.5);
    expect(lighterColor).toBe('rgb(153, 153, 153)');
  });

  it('should return the original color if it is not a hex color', () => {
    const color = 'rgb(51, 51, 51)';
    const lighterColor = lightenColor(color, 0.5);
    expect(lighterColor).toBe('rgb(51, 51, 51)');
  });
});
