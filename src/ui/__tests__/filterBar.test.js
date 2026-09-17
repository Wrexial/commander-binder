import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../state/cardStore.js', () => ({
  cardStore: { getAll: vi.fn(() => []) },
}));

import { initFilterBar } from '../filterBar.js';
import { filters, resetFilters } from '../../state/filters.js';
import { cardStore } from '../../state/cardStore.js';

function setupDom() {
  document.body.innerHTML = `
    <button id="filter-toggle" type="button" aria-expanded="false">
      Filters <span id="filter-count" hidden></span>
    </button>
    <div id="filter-panel" hidden></div>
  `;
}

beforeEach(() => {
  sessionStorage.clear();
  resetFilters();
  document.body.innerHTML = '';
  cardStore.getAll.mockReturnValue([
    { name: 'A', set: 'dom', set_name: 'Dominaria' },
    { name: 'B', set: 'ice', set_name: 'Ice Age' },
  ]);
  setupDom();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('initFilterBar', () => {
  it('builds the controls and opens/closes the panel', () => {
    initFilterBar({ onChange: vi.fn() });

    const toggle = document.getElementById('filter-toggle');
    const panel = document.getElementById('filter-panel');

    expect(panel.hidden).toBe(true);
    expect(panel.querySelectorAll('.filter-group')).toHaveLength(5);

    toggle.click();
    expect(panel.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    toggle.click();
    expect(panel.hidden).toBe(true);
  });

  it('applies the owned filter and updates the badge', () => {
    const onChange = vi.fn();
    initFilterBar({ onChange });

    const ownedSegment = document
      .querySelectorAll('.filter-group')[0]
      .querySelectorAll('.filter-segment')[1]; // Owned
    ownedSegment.click();

    expect(filters.owned).toBe('owned');
    expect(onChange).toHaveBeenCalledTimes(1);

    const badge = document.getElementById('filter-count');
    expect(badge.textContent).toBe('1');
    expect(badge.hidden).toBe(false);
  });

  it('toggles colour pips and the colour mode', () => {
    const onChange = vi.fn();
    initFilterBar({ onChange });

    document.querySelector('.filter-pip-W').click();
    document.querySelector('.filter-pip-U').click();
    expect(filters.colors).toEqual(['W', 'U']);

    document.querySelector('.filter-pip-W').click();
    expect(filters.colors).toEqual(['U']);

    // The colour-mode control is the second segmented group (after Collection).
    const modes = document
      .querySelectorAll('.filter-segmented')[1]
      .querySelectorAll('.filter-segment');
    modes[1].click(); // All
    expect(filters.colorMode).toBe('all');
    expect(onChange).toHaveBeenCalled();
  });

  it('selects a set from the loaded collection', () => {
    initFilterBar({ onChange: vi.fn() });

    const select = document.querySelector('.filter-select');
    expect(select.querySelectorAll('option')).toHaveLength(3); // Any + dom + ice

    select.value = 'ice';
    select.dispatchEvent(new Event('change'));

    expect(filters.set).toBe('ice');
  });

  it('resets every filter', () => {
    const onChange = vi.fn();
    initFilterBar({ onChange });

    document.querySelector('.filter-pip-W').click();
    document.querySelector('.filter-reset').click();

    expect(filters.colors).toEqual([]);
    expect(activeBadgeText()).toBe('0');
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('restores persisted filters and re-applies them', () => {
    sessionStorage.setItem(
      'viewState',
      JSON.stringify({ filters: { owned: 'missing', colors: ['G'], set: 'dom' } })
    );
    const onChange = vi.fn();

    initFilterBar({ onChange });

    expect(filters.owned).toBe('missing');
    expect(filters.colors).toEqual(['G']);
    expect(filters.set).toBe('dom');
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

function activeBadgeText() {
  return document.getElementById('filter-count').textContent;
}
