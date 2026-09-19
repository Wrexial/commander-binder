import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../state/cardState.js', () => ({
  isCardOwned: vi.fn(() => false),
  getOwnedCardIds: vi.fn(() => new Set()),
}));
vi.mock('../../state/appState.js', () => ({
  appState: { seenSetCodes: new Set(), seenNames: new Set() },
}));
vi.mock('../../state/wishlistState.js', () => ({ isCardWanted: vi.fn(() => false) }));
vi.mock('../../state/cardStore.js', () => ({
  cardStore: { getAll: vi.fn(() => []), getPrintings: vi.fn(() => []) },
}));

import { initFilterBar } from '../filterBar.js';
import { initSearch, refreshCardFilter } from '../search.js';
import { filters } from '../../state/filters.js';
import { cardStore } from '../../state/cardStore.js';
import { isCardOwned } from '../../state/cardState.js';

function makeCard(name, { rarity = 'common', colors = [], set = 'dom', price = 5 } = {}) {
  const card = document.createElement('div');
  card.className = 'card';
  card.cardData = {
    name,
    rarity,
    set,
    color_identity: colors,
    prices: { eur: String(price), eur_foil: null },
    type_line: 'Legendary Creature',
  };
  return card;
}

function setupDom() {
  document.body.innerHTML = `
    <input id="search-input" />
    <button id="clear-search"></button>
    <button id="search-help"></button>
    <div id="search-tooltip"></div>
    <div id="owned-counter"></div>
    <div id="no-results-message"></div>
    <button id="filter-toggle" aria-expanded="false"><span id="filter-count" hidden></span></button>
    <div id="filter-panel" hidden></div>
    <div class="binder"><div class="section"></div></div>
  `;
  const section = document.querySelector('.section');
  section.append(makeCard('Alpha', { rarity: 'mythic' }), makeCard('Beta', { rarity: 'common' }));
}

function wire() {
  initSearch();
  initFilterBar({ onChange: refreshCardFilter });
}

const cards = () => [...document.querySelectorAll('.card')];
const allVisible = () => cards().every((card) => card.style.display === '');
const cardEl = (name) => cards().find((card) => card.cardData.name === name);

/** The Collection group's segment button with the given text. */
function collectionSegment(text) {
  const group = [...document.querySelectorAll('.filter-group')].find(
    (groupEl) => groupEl.querySelector('.filter-group-label')?.textContent === 'Collection'
  );
  return [...group.querySelectorAll('.filter-segment')].find((el) => el.textContent === text);
}

beforeEach(() => {
  sessionStorage.clear();
  isCardOwned.mockReturnValue(false);
  cardStore.getAll.mockReturnValue([]);
  setupDom();
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('filter integration', () => {
  it('un-hides cards when a rarity filter is removed', () => {
    wire();
    const chip = document.querySelector('.filter-chip-mythic');

    chip.click();
    expect(cardEl('Beta').style.display).toBe('none');

    chip.click();
    expect(allVisible()).toBe(true);
    expect(JSON.parse(sessionStorage.getItem('viewState')).filters.rarities).toEqual([]);
  });

  it('un-hides cards when a colour filter is removed', () => {
    wire();
    const pip = document.querySelector('.filter-pip-W');

    pip.click();
    expect(allVisible()).toBe(false);

    pip.click();
    expect(allVisible()).toBe(true);
    expect(JSON.parse(sessionStorage.getItem('viewState')).filters.colors).toEqual([]);
  });

  it('un-hides cards when the owned filter is cleared', () => {
    isCardOwned.mockReturnValue(true);
    wire();

    collectionSegment('Owned').click();
    expect(allVisible()).toBe(true);

    collectionSegment('Missing').click();
    expect(allVisible()).toBe(false);

    collectionSegment('All').click();
    expect(allVisible()).toBe(true);
  });

  it('un-hides cards when a set filter is cleared', () => {
    cardStore.getAll.mockReturnValue([
      { name: 'Alpha', set: 'dom', set_name: 'Dominaria', released_at: '2018-04-27' },
      { name: 'Beta', set: 'ice', set_name: 'Ice Age', released_at: '1995-06-01' },
    ]);
    wire();

    const select = document.querySelector('.filter-set');
    select.value = 'ice';
    select.dispatchEvent(new Event('change'));
    expect(cardEl('Alpha').style.display).toBe('none');

    select.value = '';
    select.dispatchEvent(new Event('change'));
    expect(allVisible()).toBe(true);
    expect(JSON.parse(sessionStorage.getItem('viewState')).filters.set).toBe('');
  });

  it('un-hides cards when a price filter is cleared', () => {
    vi.useFakeTimers();
    wire();

    const max = document.querySelectorAll('.filter-price')[1];
    max.value = '1';
    max.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(400);
    expect(allVisible()).toBe(false);

    max.value = '';
    max.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(400);
    expect(allVisible()).toBe(true);
    expect(JSON.parse(sessionStorage.getItem('viewState')).filters.priceMax).toBeNull();
  });

  it('does not re-apply filters when reloading an empty saved state', async () => {
    sessionStorage.setItem(
      'viewState',
      JSON.stringify({
        filters: {
          owned: 'all',
          colors: [],
          colorMode: 'any',
          rarities: [],
          set: '',
          priceMin: null,
          priceMax: null,
          sort: 'release-asc',
        },
      })
    );

    wire();

    expect(allVisible()).toBe(true);
  });

  it('un-hides cards when the search query is cleared', () => {
    vi.useFakeTimers();
    wire();

    const input = document.getElementById('search-input');
    input.value = 'alpha';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(300);
    expect(cardEl('Beta').style.display).toBe('none');

    document.getElementById('clear-search').click();
    expect(allVisible()).toBe(true);
    expect(JSON.parse(sessionStorage.getItem('viewState')).search).toBe('');
  });

  it('keeps a cleared price cleared even if another filter change syncs first', () => {
    vi.useFakeTimers();
    wire();

    const max = document.querySelectorAll('.filter-price')[1];
    max.value = '1';
    max.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(400);
    expect(allVisible()).toBe(false);

    // Clear the price, then touch another filter before the debounce fires.
    max.value = '';
    max.dispatchEvent(new Event('input'));
    document.querySelector('.filter-chip-mythic').click();
    vi.advanceTimersByTime(400);

    expect(filters.priceMax).toBeNull();
  });
});
