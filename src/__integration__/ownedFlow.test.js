import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@clerk/clerk-js', () => ({
  Clerk: class {
    constructor() {
      this.user = { id: 'user-1' };
      this.session = { getToken: async () => 'token' };
    }
    async load() {}
    mountUserButton() {}
    openSignIn() {}
  },
}));
vi.mock('@clerk/themes', () => ({ dark: {} }));
// The first-run tour schedules a self-rescheduling timer; it is not what these
// tests exercise, and leaving it pending can fire after jsdom is torn down.
vi.mock('../state/onboarding.js', () => ({
  isTourDone: vi.fn(() => true),
  markTourDone: vi.fn(),
  isGuestWelcomeDismissed: vi.fn(() => true),
  dismissGuestWelcome: vi.fn(),
}));

// jsdom has no Scryfall bulk endpoint, so the bulk path always falls back to the
// search API here. That fallback is expected: keep its warning out of the test
// output so real warnings stand out.
const realWarn = console.warn;
vi.spyOn(console, 'warn').mockImplementation((...args) => {
  if (typeof args[0] === 'string' && args[0].startsWith('Scryfall bulk data')) return;
  realWarn(...args);
});

class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function setupDom() {
  document.body.innerHTML = `
    <button id="openbtn"></button>
    <div id="sidebar"></div>
    <div id="sidebar-backdrop"></div>
    <div id="user-actions"></div>
    <div id="results"></div>
    <div id="tooltip"></div>
    <div id="set-tooltip"></div>
    <div id="owned-counter"></div>
    <div id="loading-indicator"></div>
    <input id="search-input" />
    <button id="clear-search"></button>
    <div id="search-tooltip"></div>
    <div id="no-results-message"></div>
  `;
}

const ownedCard = {
  id: 'c-owned',
  name: 'Owned Card',
  set: 'tst',
  set_name: 'Test Set',
  released_at: '2024-01-01',
  games: ['paper'],
  color_identity: [],
  prices: { eur: '1.00', eur_foil: null, usd: null },
};

function makeCard(i, prefix = 'Card') {
  return {
    id: `${prefix}-${i}`,
    name: `${prefix} ${i}`,
    set: 'tst',
    set_name: 'Test Set',
    released_at: '2024-01-01',
    games: ['paper'],
    color_identity: [],
    prices: { eur: null, eur_foil: null, usd: null },
  };
}

describe('owned markers applied on load', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    global.IntersectionObserver = MockIntersectionObserver;
    setupDom();
    // Disable Scryfall pacing so the integrated load paths stay fast.
    const { setRequestThrottle } = await import('../api/scryfall.js');
    setRequestThrottle({ spacingMs: 0, maxRequests: 0 });
    global.fetch = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes('/owned-cards')) {
        return { ok: true, json: async () => [{ cardId: 'c-owned' }] };
      }
      if (u.includes('api.scryfall.com')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({
            has_more: false,
            next_page: null,
            total_cards: 1,
            data: [ownedCard],
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });
  });

  it('adds the .owned class to a saved card when it renders', async () => {
    await import('../main.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    await vi.waitFor(() => expect(document.querySelector('.card')).not.toBeNull());

    const card = document.querySelector('.card');
    expect(card.classList.contains('owned')).toBe(true);
  });

  it('marks a card when the saved printing differs from the displayed one', async () => {
    // The app renders the oldest printing for a name, but the user may have
    // saved a different printing. The card should still show as owned.
    const oldest = {
      ...ownedCard,
      id: 'dual-old',
      name: 'Dual Card',
      released_at: '2020-01-01',
    };
    const newest = {
      ...ownedCard,
      id: 'dual-new',
      name: 'Dual Card',
      released_at: '2024-01-01',
    };

    global.fetch = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes('/owned-cards')) {
        return { ok: true, json: async () => [{ cardId: 'dual-new' }] };
      }
      if (u.includes('api.scryfall.com')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({
            has_more: false,
            next_page: null,
            total_cards: 2,
            data: [oldest, newest],
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    await import('../main.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    await vi.waitFor(() => expect(document.querySelector('.card')).not.toBeNull());

    const card = document.querySelector('.card');
    expect(card.cardData.id).toBe('dual-old');
    expect(card.classList.contains('owned')).toBe(true);
  });

  it('marks owned cards that arrive on later, background-loaded pages', async () => {
    // Page 1 is a full 175 cards, so page 2 loads via the auto-load path.
    // The owned card is the *first* card of page 2.
    const page1 = Array.from({ length: 175 }, (_, i) => makeCard(i, 'P1'));
    const page2 = [
      { ...ownedCard, id: 'c-owned', name: 'Later Owned Card' },
      ...Array.from({ length: 19 }, (_, i) => makeCard(i, 'P2')),
    ];

    global.fetch = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes('/owned-cards')) {
        return { ok: true, json: async () => [{ cardId: 'c-owned' }] };
      }
      if (u.includes('api.scryfall.com')) {
        const body = u.includes('page=2')
          ? { has_more: false, next_page: null, total_cards: 195, data: page2 }
          : {
              has_more: true,
              next_page: 'https://api.scryfall.com/cards/search?page=2',
              total_cards: 195,
              data: page1,
            };
        return { ok: true, status: 200, headers: { get: () => null }, json: async () => body };
      }
      return { ok: true, json: async () => ({}) };
    });

    await import('../main.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    await vi.waitFor(() => {
      const card = [...document.querySelectorAll('.card')].find(
        (c) => c.cardData?.id === 'c-owned'
      );
      expect(card).toBeTruthy();
    });

    const ownedEl = [...document.querySelectorAll('.card')].find(
      (c) => c.cardData?.id === 'c-owned'
    );
    expect(ownedEl.classList.contains('owned')).toBe(true);
  });

  it('applies marks when the owned state resolves after cards have rendered', async () => {
    let resolveOwned;
    const ownedResponse = new Promise((resolve) => {
      resolveOwned = () => resolve({ ok: true, json: async () => [{ cardId: 'c-owned' }] });
    });

    global.fetch = vi.fn((url) => {
      const u = String(url);
      if (u.includes('/owned-cards')) return ownedResponse;
      if (u.includes('api.scryfall.com')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({
            has_more: false,
            next_page: null,
            total_cards: 1,
            data: [ownedCard],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    await import('../main.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    // Cards render before the owned state has arrived...
    await vi.waitFor(() => expect(document.querySelector('.card')).not.toBeNull());
    expect(document.querySelector('.card').classList.contains('owned')).toBe(false);

    // ...and are marked once it does.
    resolveOwned();
    await vi.waitFor(() =>
      expect(document.querySelector('.card').classList.contains('owned')).toBe(true)
    );
  });
});
