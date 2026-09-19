import { vi, describe, it, expect, beforeEach } from 'vitest';

/** Signed-in mode: every call goes through the API, never IndexedDB. */
vi.mock('../mainState.js', () => ({ mainState: { loggedInUserId: 'user-1' } }));

vi.mock('../../api/binders.js', () => ({
  fetchBinders: vi.fn(),
  createBinder: vi.fn(),
  updateBinder: vi.fn(),
  deleteBinder: vi.fn(),
  mergeBinders: vi.fn(),
}));

vi.mock('../localBinders.js', () => ({
  loadLocalBinders: vi.fn(async () => []),
  saveLocalBinder: vi.fn(async () => true),
  removeLocalBinder: vi.fn(async () => true),
  clearLocalBinders: vi.fn(async () => undefined),
}));

vi.mock('../cardSettings.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getSetting: vi.fn(() => 3),
}));

import {
  assignCardToSlot,
  canEditBinders,
  createBinder,
  deleteBinder,
  getActiveBinder,
  getBinders,
  loadBinders,
  mergeLocalBindersToAccount,
  resetBinders,
} from '../bindersState.js';
import { mainState } from '../mainState.js';
import {
  createBinder as apiCreateBinder,
  deleteBinder as apiDeleteBinder,
  fetchBinders,
  mergeBinders as apiMergeBinders,
  updateBinder as apiUpdateBinder,
} from '../../api/binders.js';
import { clearLocalBinders, loadLocalBinders } from '../localBinders.js';

function record(overrides = {}) {
  return {
    id: 'b1',
    name: 'Binder 1',
    columns: 3,
    rows: 3,
    pages: 1,
    slots: {},
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(async () => {
  localStorage.clear();
  mainState.shareToken = undefined;
  await resetBinders();
  vi.clearAllMocks();
  fetchBinders.mockResolvedValue([record()]);
});

describe('bindersState (server mode)', () => {
  it('loads and sanitizes the server set', async () => {
    fetchBinders.mockResolvedValue([record({ slots: { '0:0:0': 'card-a', bad: 'x' } })]);

    await loadBinders();

    expect(fetchBinders).toHaveBeenCalledTimes(1);
    expect(getBinders()).toHaveLength(1);
    expect(getActiveBinder().slots).toEqual({ '0:0:0': 'card-a' });
  });

  it('creates a default binder when the account has none', async () => {
    fetchBinders.mockResolvedValue([]);
    apiCreateBinder.mockResolvedValue([record({ id: 'new', name: 'Binder 1' })]);

    await loadBinders();

    expect(apiCreateBinder).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Binder 1', slots: {} })
    );
    expect(getActiveBinder().id).toBe('new');
  });

  it('persists slot changes and adopts the server reply', async () => {
    fetchBinders.mockResolvedValue([record({ slots: { '0:0:0': 'card-a' } })]);
    await loadBinders();

    apiUpdateBinder.mockImplementation(async (id, payload) => [
      record({ id, slots: payload.slots }),
    ]);

    await assignCardToSlot('b1', '0:0:1', 'card-b');

    expect(apiUpdateBinder).toHaveBeenCalledWith(
      'b1',
      expect.objectContaining({ slots: { '0:0:0': 'card-a', '0:0:1': 'card-b' } })
    );
    expect(getActiveBinder().slots['0:0:1']).toBe('card-b');
  });

  it('creates a binder through the API and activates it', async () => {
    fetchBinders.mockResolvedValue([]);
    apiCreateBinder.mockResolvedValueOnce([record({ id: 'seed', name: 'Binder 1' })]);
    await loadBinders();

    apiCreateBinder.mockResolvedValueOnce([
      record({ id: 'seed', name: 'Binder 1' }),
      record({ id: 'b2', name: 'Binder 2' }),
    ]);
    const created = await createBinder({ columns: 4, rows: 4 });

    expect(created.name).toBe('Binder 2');
    expect(getActiveBinder().id).toBe('b2');
  });

  it('deletes through the API and reseeds the last binder', async () => {
    fetchBinders.mockResolvedValue([record()]);
    await loadBinders();

    apiDeleteBinder.mockResolvedValue([]);
    apiCreateBinder.mockResolvedValue([record({ id: 'reseed', name: 'Binder 1' })]);

    await deleteBinder('b1');

    expect(apiDeleteBinder).toHaveBeenCalledWith('b1');
    expect(getBinders()).toHaveLength(1);
    expect(getActiveBinder().id).toBe('reseed');
  });

  it('merges device-local binders into the account and clears them', async () => {
    loadLocalBinders.mockResolvedValue([
      record({ id: 'local-1', name: 'Local', slots: { '0:0:0': 'card-a' } }),
    ]);
    apiMergeBinders.mockResolvedValue([
      record({ id: 'srv-1', name: 'Local', slots: { '0:0:0': 'card-a' } }),
    ]);

    const merged = await mergeLocalBindersToAccount();

    expect(merged).toBe(true);
    expect(apiMergeBinders).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Local', slots: { '0:0:0': 'card-a' } }),
    ]);
    expect(clearLocalBinders).toHaveBeenCalledTimes(1);
    expect(getBinders()).toHaveLength(1);
  });

  it('is a no-op when there are no local binders to merge', async () => {
    loadLocalBinders.mockResolvedValue([]);

    expect(await mergeLocalBindersToAccount()).toBe(false);
    expect(apiMergeBinders).not.toHaveBeenCalled();
  });

  it('loads only the owner\u2019s public binders in share mode', async () => {
    mainState.shareToken = 'tok';
    fetchBinders.mockResolvedValue([record({ isPublic: true })]);

    await loadBinders();

    expect(fetchBinders).toHaveBeenCalledWith({ shareToken: 'tok' });
    expect(canEditBinders()).toBe(false);
    expect(getBinders()).toHaveLength(1);
  });

  it('does not seed a binder for a share visitor with nothing public', async () => {
    mainState.shareToken = 'tok';
    fetchBinders.mockResolvedValue([]);

    await loadBinders();

    expect(apiCreateBinder).not.toHaveBeenCalled();
    expect(getBinders()).toHaveLength(0);
  });

  it('blocks every edit in share mode', async () => {
    mainState.shareToken = 'tok';
    fetchBinders.mockResolvedValue([record({ isPublic: true })]);
    await loadBinders();

    expect(await assignCardToSlot('b1', '0:0:0', 'card-a')).toBeNull();
    expect(await createBinder({ name: 'X' })).toBeNull();
    expect(await deleteBinder('b1')).toBeUndefined();
    expect(apiUpdateBinder).not.toHaveBeenCalled();
    expect(apiCreateBinder).not.toHaveBeenCalled();
  });
});
