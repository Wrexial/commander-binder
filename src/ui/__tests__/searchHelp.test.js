// src/ui/__tests__/searchHelp.test.js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initSearch } from '../search.js';

vi.mock('../../state/appState.js', () => ({
  appState: { seenSetCodes: new Set() },
}));

vi.mock('../components/ownedCounter.js', () => ({
  updateOwnedCounter: vi.fn(),
}));

// The help sheet is the only part under test; the filtering hooks just need to
// resolve without touching the database.
vi.mock('../../state/cardState.js', () => ({
  isCardOwned: vi.fn(() => false),
}));

describe('search syntax help', () => {
  let helpButton;
  let tooltip;
  let input;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.className = '';
    document.body.innerHTML = `
      <div id="card-settings">
        <div id="search-wrapper">
          <input id="search-input" />
          <button id="clear-search"></button>
          <button id="search-help" aria-expanded="false"></button>
          <div id="search-tooltip" style="display: none"></div>
        </div>
      </div>
      <div id="no-results-message"></div>
      <div id="owned-counter"></div>
    `;

    initSearch();

    helpButton = document.getElementById('search-help');
    tooltip = document.getElementById('search-tooltip');
    input = document.getElementById('search-input');
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('opens and closes the sheet from the help button', () => {
    helpButton.click();

    expect(tooltip.style.display).toBe('block');
    expect(helpButton.getAttribute('aria-expanded')).toBe('true');
    expect(document.body.classList.contains('search-help-open')).toBe(true);

    helpButton.click();

    expect(tooltip.style.display).toBe('none');
    expect(helpButton.getAttribute('aria-expanded')).toBe('false');
    expect(document.body.classList.contains('search-help-open')).toBe(false);
  });

  it('closes when the user taps outside the search area', () => {
    helpButton.click();
    expect(tooltip.style.display).toBe('block');

    document.getElementById('owned-counter').click();

    expect(tooltip.style.display).toBe('none');
    expect(helpButton.getAttribute('aria-expanded')).toBe('false');
  });

  it('stays open when the click lands inside the search area', () => {
    helpButton.click();

    input.click();

    expect(tooltip.style.display).toBe('block');
  });

  it('closes on Escape', () => {
    helpButton.click();

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(tooltip.style.display).toBe('none');
  });

  it('gets out of the way as soon as the user starts typing', () => {
    helpButton.click();

    input.value = 't:dragon';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(tooltip.style.display).toBe('none');
  });
});
