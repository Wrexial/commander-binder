import { vi, describe, it, expect, beforeEach } from 'vitest';
import { initLazyCards } from '../ui/lazyCardLoader.js';
import { appState } from '../state/appState.js';
import * as feed from '../ui/cardFeed.js';
import * as layout from '../ui/layout.js';
import { getLegendaryCreatures, verifyBulkCoverage } from '../api/bulkData.js';
import { setBulkCardSource } from '../api/scryfall.js';

// Mock dependencies
vi.mock('../ui/cardFeed.js');
vi.mock('../api/scryfall.js', () => ({
  setBulkCardSource: vi.fn(),
  BULK_SOURCE_SENTINEL: 'bulk-sentinel',
}));
vi.mock('../api/bulkData.js', () => ({
  getLegendaryCreatures: vi.fn(),
  verifyBulkCoverage: vi.fn(),
}));
vi.mock('../ui/layout.js');

let mockInstances = [];
class MockIntersectionObserver {
  constructor(callback) {
    this.callback = callback;
    mockInstances.push(this);
  }
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();

  mockIntersect(isIntersecting) {
    this.callback([{ isIntersecting }]);
  }
}

beforeEach(() => {
  // Reset mocks and state before each test
  vi.clearAllMocks();
  mockInstances = [];
  global.IntersectionObserver = MockIntersectionObserver;
  appState.nextPageUrl = 'initial-url';
  appState.binder = {
    querySelector: vi.fn().mockReturnValue({ textContent: '' }),
  };
  document.body.innerHTML = ''; // Clear DOM

  // The bulk path runs fire-and-forget; keep its defaults benign so it never
  // falls back (or logs) unless a test says so.
  getLegendaryCreatures.mockResolvedValue({ cards: [] });
  verifyBulkCoverage.mockReturnValue({ missingSampleIds: [], count: 0 });
  setBulkCardSource.mockReturnValue(false);
});

describe('initLazyCards', () => {
  it('should initialize correctly, set up observer, and fetch initial page', () => {
    const results = document.createElement('div');
    document.body.appendChild(results);

    initLazyCards(results, 'tooltip');

    // Check for initial setup
    expect(results.innerHTML).toContain('id="infinite-scroll-sentinel"');
    expect(layout.startNewBinder).toHaveBeenCalledWith(results);
    expect(appState.nextPageUrl).toBe(
      'https://api.scryfall.com/cards/search?q=type:legendary type:creature&unique=prints&order=released&dir=asc'
    );

    // Check that initial fetch is called
    expect(feed.fetchNextPage).toHaveBeenCalledWith(results, 'tooltip');
    expect(feed.fetchNextPage).toHaveBeenCalledTimes(1);

    // Check that IntersectionObserver was created and observes the sentinel
    expect(mockInstances.length).toBe(1);
    const observerInstance = mockInstances[0];
    expect(observerInstance.observe).toHaveBeenCalled();
    const sentinel = results.querySelector('#infinite-scroll-sentinel');
    expect(observerInstance.observe).toHaveBeenCalledWith(sentinel);
  });

  it('should fetch next page when sentinel intersects', () => {
    const results = document.createElement('div');
    initLazyCards(results, 'tooltip');

    // Reset the mock call count from initialization
    feed.fetchNextPage.mockClear();

    // Get the observer instance to manually trigger it
    const observerInstance = mockInstances[0];
    observerInstance.mockIntersect(true);

    expect(feed.fetchNextPage).toHaveBeenCalledWith(results, 'tooltip');
    expect(feed.fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('should not fetch next page when sentinel does not intersect', () => {
    const results = document.createElement('div');
    initLazyCards(results, 'tooltip');

    feed.fetchNextPage.mockClear();

    const observerInstance = mockInstances[0];
    observerInstance.mockIntersect(false);

    expect(feed.fetchNextPage).not.toHaveBeenCalled();
  });

  it('should disconnect observer when there is no next page', () => {
    const results = document.createElement('div');
    initLazyCards(results, 'tooltip');

    // Set nextPageUrl to null to simulate end of results
    appState.nextPageUrl = null;

    const observerInstance = mockInstances[0];
    const sentinel = results.querySelector('#infinite-scroll-sentinel');

    observerInstance.mockIntersect(true); // Trigger intersection

    expect(observerInstance.disconnect).toHaveBeenCalled();
    expect(sentinel.isConnected).toBe(false); // Check if sentinel is removed from DOM
    expect(feed.fetchNextPage).toHaveBeenCalledTimes(1); // Only the initial call
  });

  it('swaps to bulk data once the subset covers the first page', async () => {
    getLegendaryCreatures.mockResolvedValue({ cards: [{ id: 'a' }] });
    verifyBulkCoverage.mockReturnValue({ missingSampleIds: [], count: 1 });
    setBulkCardSource.mockReturnValue(true);

    const results = document.createElement('div');
    initLazyCards(results, 'tooltip');
    feed.fetchNextPage.mockClear();

    await vi.waitFor(() => expect(feed.fetchNextPage).toHaveBeenCalled());

    expect(setBulkCardSource).toHaveBeenCalledWith([{ id: 'a' }]);
    expect(appState.autoLoad).toBe(true);
  });

  it('falls back to the search API when the subset misses the first page', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    getLegendaryCreatures.mockResolvedValue({ cards: [] });
    verifyBulkCoverage.mockReturnValue({ missingSampleIds: ['x'], count: 0 });

    const results = document.createElement('div');
    initLazyCards(results, 'tooltip');
    // `initLazyCards` clears the sample ids; set them before the async pass.
    appState.apiSampleIds = ['x'];
    feed.fetchNextPage.mockClear();

    await vi.waitFor(() => expect(feed.fetchNextPage).toHaveBeenCalled());

    expect(verifyBulkCoverage).toHaveBeenCalledWith([], { sampleIds: ['x'] });
    expect(setBulkCardSource).not.toHaveBeenCalled();
    expect(appState.autoLoad).toBe(true);
    warn.mockRestore();
  });

  it('falls back to the search API when bulk data is unavailable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    getLegendaryCreatures.mockRejectedValue(new Error('offline'));

    const results = document.createElement('div');
    initLazyCards(results, 'tooltip');
    feed.fetchNextPage.mockClear();

    await vi.waitFor(() => expect(feed.fetchNextPage).toHaveBeenCalled());

    expect(setBulkCardSource).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('logs when the bulk count differs from the search total', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    getLegendaryCreatures.mockResolvedValue({ cards: [{ id: 'a' }] });
    verifyBulkCoverage.mockReturnValue({ missingSampleIds: [], count: 5 });
    setBulkCardSource.mockReturnValue(true);
    appState.apiTotalCards = 7;

    const results = document.createElement('div');
    initLazyCards(results, 'tooltip');
    // `initLazyCards` clears the totals; set it before the async bulk pass runs.
    appState.apiTotalCards = 7;

    await vi.waitFor(() => expect(info).toHaveBeenCalled());

    info.mockRestore();
  });
});
