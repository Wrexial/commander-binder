import { describe, it, expect, beforeEach, vi } from 'vitest';
import { showLoading, hideLoading, withLoading } from '../ui/loadingIndicator.js';
import { appState } from '../state/appState.js';

describe('loadingIndicator', () => {
  let loader;
  let results;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="loading-indicator" class="loading-indicator"></div>
      <div id="results"></div>
    `;
    loader = document.getElementById('loading-indicator');
    results = document.getElementById('results');
    appState.activeFetches = 0;
  });

  it('showLoading increments activeFetches and reveals the loader', () => {
    expect(appState.activeFetches).toBe(0);
    expect(loader.classList.contains('is-visible')).toBe(false);

    showLoading();

    expect(appState.activeFetches).toBe(1);
    expect(loader.classList.contains('is-visible')).toBe(true);
    expect(loader.textContent).toBe('Loading cards…');
  });

  it('marks the results region busy while loading', () => {
    showLoading();
    expect(results.getAttribute('aria-busy')).toBe('true');

    hideLoading();
    expect(results.getAttribute('aria-busy')).toBe('false');
  });

  it('hideLoading keeps the loader up while other fetches are in flight', () => {
    appState.activeFetches = 1;

    showLoading(); // activeFetches becomes 2
    hideLoading(); // activeFetches becomes 1

    expect(appState.activeFetches).toBe(1);
    expect(loader.classList.contains('is-visible')).toBe(true);
    expect(results.getAttribute('aria-busy')).toBe('true');
  });

  it('hideLoading hides the loader when activeFetches reaches 0', () => {
    appState.activeFetches = 1;

    hideLoading();

    expect(appState.activeFetches).toBe(0);
    expect(loader.classList.contains('is-visible')).toBe(false);
    expect(loader.textContent).toBe('');
  });

  it('hideLoading should not let activeFetches go below 0', () => {
    hideLoading();

    expect(appState.activeFetches).toBe(0);
    expect(loader.classList.contains('is-visible')).toBe(false);
  });

  it('should handle multiple show/hide calls correctly', () => {
    showLoading(); // activeFetches = 1
    showLoading(); // activeFetches = 2
    expect(appState.activeFetches).toBe(2);
    expect(loader.classList.contains('is-visible')).toBe(true);

    hideLoading(); // activeFetches = 1
    expect(appState.activeFetches).toBe(1);
    expect(loader.classList.contains('is-visible')).toBe(true);

    hideLoading(); // activeFetches = 0
    expect(appState.activeFetches).toBe(0);
    expect(loader.classList.contains('is-visible')).toBe(false);

    hideLoading(); // activeFetches stays at 0
    expect(appState.activeFetches).toBe(0);
    expect(loader.classList.contains('is-visible')).toBe(false);
  });

  it('should not fail if the loader and results elements do not exist', () => {
    document.body.innerHTML = '';

    expect(() => showLoading()).not.toThrow();
    expect(() => hideLoading()).not.toThrow();
  });

  it('shows a custom message', () => {
    showLoading('Loading binder…');
    expect(loader.textContent).toBe('Loading binder…');
  });

  it('withLoading shows the message, runs the task and hides again', async () => {
    const task = vi.fn(async () => 'done');

    await expect(withLoading('Signing in…', task)).resolves.toBe('done');

    expect(task).toHaveBeenCalledTimes(1);
    expect(appState.activeFetches).toBe(0);
    expect(loader.classList.contains('is-visible')).toBe(false);
  });

  it('withLoading hides the loader even when the task throws', async () => {
    await expect(
      withLoading('Loading…', async () => {
        throw new Error('nope');
      })
    ).rejects.toThrow('nope');

    expect(appState.activeFetches).toBe(0);
    expect(loader.classList.contains('is-visible')).toBe(false);
  });
});
