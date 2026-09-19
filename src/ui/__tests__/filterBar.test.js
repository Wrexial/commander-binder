import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../state/cardStore.js', () => ({
  cardStore: { getAll: vi.fn(() => []) },
}));

import { initFilterBar } from '../filterBar.js';
import { filters, resetFilters } from '../../state/filters.js';
import { cardStore } from '../../state/cardStore.js';

/** The segment button with `text` inside the filter group labelled `groupLabel`. */
function segment(groupLabel, text) {
  const group = [...document.querySelectorAll('.filter-group')].find(
    (groupEl) => groupEl.querySelector('.filter-group-label')?.textContent === groupLabel
  );
  return [...group.querySelectorAll('.filter-segment')].find((el) => el.textContent === text);
}

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
    expect(panel.querySelectorAll('.filter-group')).toHaveLength(6);

    toggle.click();
    expect(panel.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    toggle.click();
    expect(panel.hidden).toBe(true);
  });

  it('applies the collection filter and updates the badge', () => {
    const onChange = vi.fn();
    initFilterBar({ onChange });

    segment('Collection', 'Owned').click();

    expect(filters.collection).toBe('owned');
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

    // The colour-mode control lives in the "Colours" group, alongside the
    // colour pips; find it by label so a new group can't shift the index.
    const colourGroup = [...document.querySelectorAll('.filter-group')].find(
      (groupEl) => groupEl.querySelector('.filter-group-label')?.textContent === 'Colours'
    );
    const modes = colourGroup
      .querySelector('.filter-segmented')
      .querySelectorAll('.filter-segment');
    modes[1].click(); // Exact
    expect(filters.colorMode).toBe('exact');
    modes[0].click(); // Exclusive
    expect(filters.colorMode).toBe('exclusive');
    expect(onChange).toHaveBeenCalled();
  });

  it('filters to the wishlist lens', () => {
    const onChange = vi.fn();
    initFilterBar({ onChange });

    segment('Collection', 'Wanted').click();

    expect(filters.collection).toBe('wanted');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(activeBadgeText()).toBe('1');
  });

  it('shows a removable chip for each active filter', () => {
    const onChange = vi.fn();
    initFilterBar({ onChange });

    segment('Collection', 'Owned').click();
    document.querySelector('.filter-chip-mythic').click();

    const chips = () =>
      [...document.querySelectorAll('.filter-active-chip')].map((el) => el.textContent);
    expect(chips()).toEqual(['Owned', 'Mythic']);

    document.querySelector('.filter-active-chip').click();

    expect(filters.collection).toBe('all');
    expect(chips()).toEqual(['Mythic']);
    expect(onChange).toHaveBeenCalled();
  });

  it('selects a set from the loaded collection', () => {
    initFilterBar({ onChange: vi.fn() });

    const select = document.querySelector('.filter-set');
    expect(select.querySelectorAll('option')).toHaveLength(3); // Any + dom + ice

    select.value = 'ice';
    select.dispatchEvent(new Event('change'));

    expect(filters.set).toBe('ice');
  });

  it('lists sets newest first, right after "Any set"', () => {
    cardStore.getAll.mockReturnValue([
      { name: 'Old', set: 'old', set_name: 'Old Set', released_at: '1993-01-01' },
      { name: 'New', set: 'new', set_name: 'New Set', released_at: '2023-01-01' },
      { name: 'Mid', set: 'mid', set_name: 'Mid Set', released_at: '2005-01-01' },
    ]);

    initFilterBar({ onChange: vi.fn() });

    const codes = [...document.querySelectorAll('.filter-set option')].map((o) => o.value);
    expect(codes).toEqual(['', 'new', 'mid', 'old']);
  });

  it('renders the colour pips as mana symbols', () => {
    initFilterBar({ onChange: vi.fn() });

    const pip = document.querySelector('.filter-pip-W');
    const img = pip.querySelector('img');

    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toContain('card-symbols/W.svg');
    expect(img.getAttribute('alt')).toBe('');
    expect(pip.getAttribute('aria-label')).toBe('White');
  });

  it('changes the sort through the dedicated callback', () => {
    const onChange = vi.fn();
    const onSortChange = vi.fn();
    initFilterBar({ onChange, onSortChange });

    const select = document.querySelector('.filter-sort');
    select.value = 'name-asc';
    select.dispatchEvent(new Event('change'));

    expect(filters.sort).toBe('name-asc');
    expect(onSortChange).toHaveBeenCalledTimes(1);
    // Sorting rebuilds the grid (which re-applies filters), so the plain
    // filter callback must not run again.
    expect(onChange).not.toHaveBeenCalled();
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
      JSON.stringify({ filters: { collection: 'missing', colors: ['G'], set: 'dom' } })
    );
    const onChange = vi.fn();

    initFilterBar({ onChange });

    expect(filters.collection).toBe('missing');
    expect(filters.colors).toEqual(['G']);
    expect(filters.set).toBe('dom');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('applies filters pushed by tile chips', () => {
    const onChange = vi.fn();
    initFilterBar({ onChange });

    document.dispatchEvent(new CustomEvent('filter:set', { detail: { set: 'ice' } }));

    expect(filters.set).toBe('ice');
    expect(onChange).toHaveBeenCalledTimes(1);
    // The bar's own control reflects the pushed filter.
    expect(document.querySelector('.filter-set').value).toBe('ice');
  });
});

function activeBadgeText() {
  return document.getElementById('filter-count').textContent;
}
