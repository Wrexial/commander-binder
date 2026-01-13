import { describe, it, expect, beforeEach } from 'vitest';
import { showLoading, hideLoading } from '../loadingIndicator.js';
import { appState } from '../appState.js';

describe('loadingIndicator', () => {
  let loader;

  beforeEach(() => {
    // Set up our DOM element
    document.body.innerHTML = '<div id="loading-indicator" style="display: none;"></div>';
    loader = document.getElementById('loading-indicator');
    // Reset state
    appState.activeFetches = 0;
  });

  it('showLoading should increment activeFetches and display the loader', () => {
    expect(appState.activeFetches).toBe(0);
    expect(loader.style.display).toBe('none');

    showLoading();

    expect(appState.activeFetches).toBe(1);
    expect(loader.style.display).toBe('block');
  });

  it('hideLoading should decrement activeFetches', () => {
    appState.activeFetches = 1;
    showLoading(); // activeFetches becomes 2
    
    hideLoading(); // activeFetches becomes 1

    expect(appState.activeFetches).toBe(1);
    expect(loader.style.display).toBe('block'); // Still visible
  });

  it('hideLoading should hide the loader when activeFetches reaches 0', () => {
    appState.activeFetches = 1;
    
    hideLoading(); // activeFetches becomes 0

    expect(appState.activeFetches).toBe(0);
    expect(loader.style.display).toBe('none');
  });

  it('hideLoading should not let activeFetches go below 0', () => {
    appState.activeFetches = 0;

    hideLoading(); // Attempt to decrement below 0

    expect(appState.activeFetches).toBe(0);
    expect(loader.style.display).toBe('none');
  });

  it('should handle multiple show/hide calls correctly', () => {
    showLoading(); // activeFetches = 1
    showLoading(); // activeFetches = 2
    expect(appState.activeFetches).toBe(2);
    expect(loader.style.display).toBe('block');

    hideLoading(); // activeFetches = 1
    expect(appState.activeFetches).toBe(1);
    expect(loader.style.display).toBe('block');

    hideLoading(); // activeFetches = 0
    expect(appState.activeFetches).toBe(0);
    expect(loader.style.display).toBe('none');

    hideLoading(); // activeFetches = 0
    expect(appState.activeFetches).toBe(0);
    expect(loader.style.display).toBe('none');
  });

  it('should not fail if the loader element does not exist', () => {
    // Remove the element
    document.body.innerHTML = '';
    
    // These calls should not throw an error
    expect(() => showLoading()).not.toThrow();
    expect(() => hideLoading()).not.toThrow();
  });
});
