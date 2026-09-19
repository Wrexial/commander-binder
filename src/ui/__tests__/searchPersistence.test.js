import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../state/cardState.js', () => ({
  isCardOwned: vi.fn(() => false),
  getOwnedCardIds: vi.fn(() => new Set()),
}));
vi.mock('../../state/appState.js', () => ({
  appState: { seenSetCodes: new Set(), seenNames: new Set() },
}));

let search;

function makeCard(name) {
  const card = document.createElement('div');
  card.className = 'card';
  card.cardData = { name, type_line: 'Legendary Creature', color_identity: [] };
  return card;
}

function setupDom() {
  document.body.innerHTML = `
    <div id="search-wrapper">
      <input id="search-input" />
      <button id="clear-search"></button>
      <button id="search-help"></button>
      <div id="search-tooltip"></div>
    </div>
    <div id="owned-counter"></div>
    <div id="no-results-message"></div>
    <div class="binder"><div class="section"></div></div>
  `;
  const section = document.querySelector('.section');
  section.append(makeCard('Alpha'), makeCard('Beta'));
}

describe('search persistence', () => {
  beforeEach(async () => {
    // Fresh module state so `activeQuery` can't bleed between tests.
    vi.resetModules();
    sessionStorage.clear();
    setupDom();
    search = await import('../search.js');
  });

  it('restores the saved query on init and filters rendered cards', () => {
    sessionStorage.setItem('viewState', JSON.stringify({ search: 'alpha' }));

    search.initSearch();

    expect(document.getElementById('search-input').value).toBe('alpha');
    const cards = document.querySelectorAll('.card');
    expect(cards[0].style.display).toBe('');
    expect(cards[1].style.display).toBe('none');
  });

  it('reapplies the active query to cards from a later page', () => {
    sessionStorage.setItem('viewState', JSON.stringify({ search: 'alpha' }));
    search.initSearch();

    document.querySelector('.section').appendChild(makeCard('Beta'));

    search.reapplySearchFilter();

    expect(document.querySelectorAll('.card')[2].style.display).toBe('none');
  });

  it('does not filter new cards when no query is active', () => {
    search.initSearch();

    const late = makeCard('Gamma');
    document.querySelector('.section').appendChild(late);

    search.reapplySearchFilter();

    expect(late.style.display).toBe('');
  });

  it('re-shows every card once the last filter is removed', async () => {
    const { filters, resetFilters } = await import('../../state/filters.js');
    search.initSearch();

    // Hide every card with a rarity none of them satisfy.
    filters.rarities = ['mythic'];
    search.reapplySearchFilter();
    expect(
      [...document.querySelectorAll('.card')].every((card) => card.style.display === 'none')
    ).toBe(true);

    // Clearing the last filter must still re-run the filter; the guarded
    // `reapplySearchFilter` would skip it and leave the grid hidden.
    filters.rarities = [];
    search.refreshCardFilter();
    resetFilters();

    expect([...document.querySelectorAll('.card')].every((card) => card.style.display === '')).toBe(
      true
    );
  });

  it('keeps an empty binder visible when no query or filter is active', () => {
    // The first binder is created before its page renders. A filter pass in
    // that window (e.g. after the owned state loads) must not hide the whole
    // grid — it is just not populated yet. Regression: binder 1 stayed
    // `display: none` while the collection loaded.
    document.body.innerHTML = `
      <div id="search-wrapper"><input id="search-input" /><button id="clear-search"></button></div>
      <div id="owned-counter"></div>
      <div id="no-results-message"></div>
      <div class="binder"></div>
    `;

    search.initSearch();
    search.refreshCardFilter();

    expect(document.querySelector('.binder').style.display).toBe('');
  });
});
