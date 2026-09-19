import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

vi.mock('../cardSettings.js', () => ({
  cardSettings: { showTooltip: true, displayMode: 'images' },
  applySettings: vi.fn(() => true),
  onSettingsChange: vi.fn(),
}));
vi.mock('../../api/userSettings.js', () => ({
  loadUserSettings: vi.fn(),
  saveUserSettings: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('../mainState.js', () => ({
  mainState: { loggedInUserId: undefined },
}));

import { initSettingsSync, pullSettings } from '../settingsSync.js';
import { applySettings, onSettingsChange } from '../cardSettings.js';
import { loadUserSettings, saveUserSettings } from '../../api/userSettings.js';
import { mainState } from '../mainState.js';

/** The change listener registered once by `initSettingsSync`. */
let notify;

beforeAll(() => {
  initSettingsSync();
  notify = onSettingsChange.mock.calls[0][0];
});

beforeEach(() => {
  vi.clearAllMocks();
  mainState.loggedInUserId = undefined;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('initSettingsSync', () => {
  it('pushes a debounced copy of the settings when signed in', () => {
    vi.useFakeTimers();
    mainState.loggedInUserId = 'user-1';

    notify();
    expect(saveUserSettings).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(saveUserSettings).toHaveBeenCalledWith({ showTooltip: true, displayMode: 'images' });
  });

  it('does not push for guests', () => {
    vi.useFakeTimers();

    notify();
    vi.advanceTimersByTime(1000);

    expect(saveUserSettings).not.toHaveBeenCalled();
  });
});

describe('pullSettings', () => {
  it('applies the remote settings', async () => {
    mainState.loggedInUserId = 'user-1';
    loadUserSettings.mockResolvedValueOnce({ displayMode: 'list' });

    await expect(pullSettings()).resolves.toBe(true);
    expect(applySettings).toHaveBeenCalledWith({ displayMode: 'list' });
  });

  it('is a no-op for guests', async () => {
    await expect(pullSettings()).resolves.toBe(false);
    expect(loadUserSettings).not.toHaveBeenCalled();
  });

  it('reports no change when nothing is stored remotely', async () => {
    mainState.loggedInUserId = 'user-1';
    loadUserSettings.mockResolvedValueOnce(null);

    await expect(pullSettings()).resolves.toBe(false);
    expect(applySettings).not.toHaveBeenCalled();
  });

  it('swallows load failures', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mainState.loggedInUserId = 'user-1';
    loadUserSettings.mockRejectedValueOnce(new Error('boom'));

    await expect(pullSettings()).resolves.toBe(false);
  });
});
