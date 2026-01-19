
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { fetchNextPage } from '../fetcher.js';
import { appState } from '../appState.js';
import * as loadingIndicator from '../loadingIndicator.js';
import * as layout from '../layout.js';
import * as cards from '../cards.js';
import * as ownedCounter from '../ui/ownedCounter.js';
import * as cardState from '../cardState.js';
import * as toast from '../ui/toast.js';

// Mock modules
vi.mock('../loadingIndicator.js');
vi.mock('../layout.js');
vi.mock('../cards.js');
vi.mock('../ui/ownedCounter.js');
vi.mock('../cardState.js');
vi.mock('../ui/toast.js');

describe('fetchNextPage', () => {
  beforeEach(() => {
    // Reset mocks and appState before each test
    vi.clearAllMocks();
    appState.nextPageUrl = 'https://api.scryfall.com/cards/search?q=test';
    appState.isLoading = false;
    appState.seenNames = new Set();
    appState.seenSetCodes = new Set();
    appState.pageCards = [];
    appState.count = 0;
    appState.binder = document.createElement('div');
    const header = document.createElement('div');
    header.className = 'binder-header';
    appState.binder.appendChild(header);

    appState.grid = {
      appendChild: vi.fn(),
    };
    // Provide a default, basic mock for fetch to prevent TypeErrors
    global.fetch = vi.fn(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ has_more: false, data: [] }),
    }));
  });

  it('should do nothing if already loading', async () => {
    appState.isLoading = true;
    await fetchNextPage(null, null);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should do nothing if there is no next page URL', async () => {
    appState.nextPageUrl = null;
    await fetchNextPage(null, null);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should fetch data, process it, and render a page', async () => {
    // Create 9 unique cards
    const mockCards = Array(9).fill(0).map((_, i) => ({
      name: `Test Card ${i}`,
      set: 'test',
      set_name: 'Test Set',
      released_at: '2024-01-01',
      games: ['paper'],
    }));
    const mockResponse = {
      ok: true,
      json: () => Promise.resolve({
        has_more: false,
        next_page: null,
        data: mockCards,
      }),
    };
    global.fetch.mockResolvedValue(mockResponse);
    cards.createCardElement.mockReturnValue(document.createElement('div'));
    cardState.isCardOwned.mockReturnValue(false);

    await fetchNextPage(null, null);

    expect(loadingIndicator.showLoading).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith('https://api.scryfall.com/cards/search?q=test');
    expect(layout.startNewSection).toHaveBeenCalledTimes(1);
    expect(cards.createCardElement).toHaveBeenCalledTimes(9);
    expect(ownedCounter.updateOwnedCounter).toHaveBeenCalled();
    expect(loadingIndicator.hideLoading).toHaveBeenCalled();
    expect(appState.isLoading).toBe(false);
    expect(appState.nextPageUrl).toBeNull();
  });

  it('should handle fetch errors gracefully', async () => {
    // Prevent recursion on error by clearing the next page URL
    toast.showToast.mockImplementation(() => {
      appState.nextPageUrl = null;
    });
    global.fetch.mockRejectedValue(new Error('API Error'));

    await fetchNextPage(null, null);

    expect(loadingIndicator.showLoading).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith('https://api.scryfall.com/cards/search?q=test');
    expect(toast.showToast).toHaveBeenCalledWith('Failed to fetch cards from Scryfall. Please try again later.', 'error');
    expect(loadingIndicator.hideLoading).toHaveBeenCalled();
    expect(appState.isLoading).toBe(false);
  });

  it('should filter out cards that are not in paper or have been seen', async () => {
    const mockCards = [
      { name: 'Card 1', set: 'tst', games: ['paper'] },
      { name: 'Card 2', set: 'tst', games: ['mtgo'] }, // Should be filtered
      { name: 'Card 1', set: 'tst', games: ['paper'] }, // Should be filtered (duplicate name)
    ];
    const mockResponse = {
      ok: true,
      json: () => Promise.resolve({ has_more: false, next_page: null, data: mockCards }),
    };
    global.fetch.mockResolvedValue(mockResponse);
    cards.createCardElement.mockReturnValue(document.createElement('div'));

    await fetchNextPage(null, null);

    expect(cards.createCardElement).toHaveBeenCalledTimes(1);
    expect(cards.createCardElement).toHaveBeenCalledWith(mockCards[0], 0);
  });
});
