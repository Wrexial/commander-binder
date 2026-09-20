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

const localRows = [{ cardId: 'guest-owned', addedAt: '2024-01-01T00:00:00.000Z' }];
vi.mock('../state/localCollection.js', () => ({
  loadLocalCollection: vi.fn(async () => localRows),
  addLocalCard: vi.fn(async () => true),
  removeLocalCards: vi.fn(async () => {}),
  clearLocalCollection: vi.fn(async () => {}),
}));
vi.mock('../state/localWishlist.js', () => ({
  loadLocalWishlist: vi.fn(async () => []),
  addLocalWishlistCard: vi.fn(async () => true),
  removeLocalWishlistCards: vi.fn(async () => {}),
  clearLocalWishlist: vi.fn(async () => {}),
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

const guestCard = {
  id: 'guest-owned',
  name: 'Guest Owned Card',
  set: 'tst',
  set_name: 'Test Set',
  released_at: '2024-01-01',
  games: ['paper'],
  color_identity: [],
  prices: { eur: '1.00', eur_foil: null, usd: null },
};

describe('guest collection merged on sign-in', () => {
  let merged;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    merged = false;
    global.IntersectionObserver = MockIntersectionObserver;
    setupDom();

    // Disable Scryfall pacing so the integrated load paths stay fast.
    const { setRequestThrottle } = await import('../api/scryfall.js');
    setRequestThrottle({ spacingMs: 0, maxRequests: 0 });

    global.fetch = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes('/merge-owned')) {
        merged = true;
        return {
          ok: true,
          json: async () => [{ cardId: 'guest-owned', createdAt: '2024-01-01T00:00:00.000Z' }],
        };
      }
      if (u.includes('/owned-cards')) {
        // The account starts without the guest's card; it only appears once the
        // merge has run, so a passing assertion proves the merge path ran.
        return { ok: true, json: async () => (merged ? [{ cardId: 'guest-owned' }] : []) };
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
            data: [guestCard],
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });
  });

  it('uploads the local ids and renders the merged card as owned', async () => {
    await import('../main.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    await vi.waitFor(() => expect(document.querySelector('.card')).not.toBeNull());

    const mergeCall = global.fetch.mock.calls.find(([url]) => String(url).includes('/merge-owned'));
    expect(mergeCall).toBeTruthy();
    expect(JSON.parse(mergeCall[1].body)).toEqual({ cardIds: ['guest-owned'] });

    await vi.waitFor(() =>
      expect(document.querySelector('.card').classList.contains('owned')).toBe(true)
    );
  });
});
