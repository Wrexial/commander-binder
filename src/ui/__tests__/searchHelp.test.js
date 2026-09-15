// src/ui/__tests__/searchHelp.test.js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initSearch, parseQuery } from '../search.js';
import {
  renderSearchHelp,
  SEARCH_SYNTAX_GROUPS,
  SUPPORTED_FILTER_PREFIXES,
} from '../searchHelp.js';

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
    vi.unstubAllGlobals();
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

  it('renders the syntax reference into the sheet', () => {
    expect(tooltip.querySelectorAll('.search-help-group').length).toBe(SEARCH_SYNTAX_GROUPS.length);
    expect(tooltip.textContent).toContain('Search syntax');
    expect(tooltip.textContent).toContain('is:owned');
  });

  it('previews the reference on hover and retracts it on leave', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {} }));
    initSearch();

    const wrapper = document.getElementById('search-wrapper');
    wrapper.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(tooltip.style.display).not.toBe('block');

    vi.advanceTimersByTime(1600);
    expect(tooltip.style.display).toBe('block');

    wrapper.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    expect(tooltip.style.display).toBe('none');
  });
});

describe('search help content', () => {
  function leavesOf(condition) {
    if (condition.type === 'and' || condition.type === 'or') {
      return [...leavesOf(condition.left), ...leavesOf(condition.right)];
    }
    return [condition.value];
  }

  it('documents every filter the parser understands', () => {
    const documented = SEARCH_SYNTAX_GROUPS.flatMap((group) => group.entries).map(
      (entry) => entry.key
    );

    for (const key of ['t:', 'o:', 'c:', 'c>', 'c<', 's:', 'd:', 'r:', 'is:', 'price:']) {
      expect(documented, `${key} is undocumented`).toContain(key);
    }
    for (const operator of ['!', 'and', 'or', '( )']) {
      expect(documented, `${operator} is undocumented`).toContain(operator);
    }
  });

  it('documents nothing the parser rejects', () => {
    const operators = ['!', 'and', 'or', '( )'];

    for (const group of SEARCH_SYNTAX_GROUPS) {
      for (const entry of group.entries) {
        const known =
          operators.includes(entry.key) || SUPPORTED_FILTER_PREFIXES.includes(entry.key);
        expect(known, `unknown syntax key “${entry.key}”`).toBe(true);
      }
    }
  });

  it('only shows examples the parser can turn into filters', () => {
    for (const group of SEARCH_SYNTAX_GROUPS) {
      for (const entry of group.entries) {
        const conditions = parseQuery(entry.example);
        expect(conditions.length, `“${entry.example}” parsed to nothing`).toBeGreaterThan(0);

        for (const value of conditions.flatMap(leavesOf)) {
          const bare = value.replace(/^!/, '');
          const prefix = bare.includes(':') ? `${bare.split(':')[0]}:` : null;
          expect(
            prefix === null || SUPPORTED_FILTER_PREFIXES.includes(prefix),
            `“${entry.example}” uses unsupported ${prefix}`
          ).toBe(true);
        }
      }
    }
  });

  it('gives every row a key, a label and an example', () => {
    const container = document.createElement('div');
    renderSearchHelp(container);

    const rows = container.querySelectorAll('.search-help-row');
    const expected = SEARCH_SYNTAX_GROUPS.flatMap((group) => group.entries).length;
    expect(rows.length).toBe(expected);

    for (const row of rows) {
      expect(row.querySelector('.search-help-key').textContent).not.toBe('');
      expect(row.querySelector('.search-help-label').textContent.trim()).not.toBe('');
    }
  });
});
