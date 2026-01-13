import { vi, describe, it, expect, beforeEach } from 'vitest';
import { initLazyCards } from '../lazyCardLoader.js';
import { appState } from '../appState.js';
import * as fetcher from '../fetcher.js';
import * as layout from '../layout.js';

// Mock dependencies
vi.mock('../fetcher.js');
vi.mock('../layout.js');

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
});

describe('initLazyCards', () => {
  it('should initialize correctly, set up observer, and fetch initial page', () => {
    const results = document.createElement('div');
    document.body.appendChild(results);

    initLazyCards(results, 'tooltip');

    // Check for initial setup
    expect(results.innerHTML).toContain('id="infinite-scroll-sentinel"');
    expect(layout.startNewBinder).toHaveBeenCalledWith(results);
    expect(appState.nextPageUrl).toBe('https://api.scryfall.com/cards/search?q=type:legendary type:creature&unique=prints&order=released&dir=asc');

    // Check that initial fetch is called
    expect(fetcher.fetchNextPage).toHaveBeenCalledWith(results, 'tooltip');
    expect(fetcher.fetchNextPage).toHaveBeenCalledTimes(1);

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
    fetcher.fetchNextPage.mockClear();

    // Get the observer instance to manually trigger it
    const observerInstance = mockInstances[0];
    observerInstance.mockIntersect(true);

    expect(fetcher.fetchNextPage).toHaveBeenCalledWith(results, 'tooltip');
    expect(fetcher.fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('should not fetch next page when sentinel does not intersect', () => {
    const results = document.createElement('div');
    initLazyCards(results, 'tooltip');

    fetcher.fetchNextPage.mockClear();

    const observerInstance = mockInstances[0];
    observerInstance.mockIntersect(false);

    expect(fetcher.fetchNextPage).not.toHaveBeenCalled();
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
    expect(fetcher.fetchNextPage).toHaveBeenCalledTimes(1); // Only the initial call
  });
});
