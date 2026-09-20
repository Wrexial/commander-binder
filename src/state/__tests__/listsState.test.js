import { describe, it, expect, vi, beforeEach } from 'vitest';

const localStore = vi.hoisted(() => ({ rows: [] }));
const mainState = vi.hoisted(() => ({ mainState: { loggedInUserId: null, shareToken: null } }));
const cardStore = vi.hoisted(() => ({ getPrintings: vi.fn(() => []) }));
const api = vi.hoisted(() => ({
  fetchLists: vi.fn(async () => []),
  createList: vi.fn(async () => []),
  updateList: vi.fn(async () => []),
  deleteList: vi.fn(async () => []),
  addListItems: vi.fn(async () => []),
  removeListItems: vi.fn(async () => []),
  mergeLists: vi.fn(async () => []),
}));

vi.mock('../mainState.js', () => mainState);
vi.mock('../cardStore.js', () => ({ cardStore }));
vi.mock('../../api/lists.js', () => api);
vi.mock('../localLists.js', () => ({
  loadLocalLists: vi.fn(async () => localStore.rows.map((row) => ({ ...row }))),
  saveLocalList: vi.fn(async (list) => {
    localStore.rows = localStore.rows.filter((row) => row.id !== list.id).concat(list);
    return true;
  }),
  removeLocalList: vi.fn(async (id) => {
    localStore.rows = localStore.rows.filter((row) => row.id !== id);
    return true;
  }),
  clearLocalLists: vi.fn(async () => {
    localStore.rows = [];
    return true;
  }),
}));

import * as listsState from '../listsState.js';

function resetMocks() {
  mainState.mainState.loggedInUserId = null;
  mainState.mainState.shareToken = null;
  localStore.rows = [];
  cardStore.getPrintings.mockReturnValue([]);
  for (const fn of Object.values(api)) fn.mockReset();
  api.fetchLists.mockResolvedValue([]);
  api.createList.mockResolvedValue([]);
  api.updateList.mockResolvedValue([]);
  api.deleteList.mockResolvedValue([]);
  api.addListItems.mockResolvedValue([]);
  api.removeListItems.mockResolvedValue([]);
  api.mergeLists.mockResolvedValue([]);
}

/** A server list record, as the API returns it. */
function serverRecord(overrides = {}) {
  return {
    id: 'srv-1',
    name: 'Server list',
    notes: '',
    isPublic: false,
    cardIds: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(async () => {
  resetMocks();
  await listsState.loadLists();
});

describe('listsState (guest/local mode)', () => {
  it('creates a list, assigns it an id and persists it locally', async () => {
    const list = await listsState.createList({ name: '  Trade pile ', notes: 'spares' });

    expect(list.id).toBeTruthy();
    expect(list.name).toBe('Trade pile');
    expect(listsState.getLists()).toHaveLength(1);
    expect(localStore.rows).toHaveLength(1);
    expect(localStore.rows[0].name).toBe('Trade pile');
  });

  it('rejects a blank or duplicate name (case-insensitive)', async () => {
    await listsState.createList({ name: 'Trade pile' });
    await expect(listsState.createList({ name: 'trade pile' })).rejects.toThrow(/already exists/);
    await expect(listsState.createList({ name: '   ' })).rejects.toThrow(/name/i);
  });

  it('adds a card and matches it by any printing of the same name', async () => {
    const list = await listsState.createList({ name: 'Deck' });
    const card = { id: 'p1', name: 'Atraxa' };
    cardStore.getPrintings.mockImplementation((name) =>
      name === 'Atraxa'
        ? [
            { id: 'p1', name: 'Atraxa' },
            { id: 'p2', name: 'Atraxa' },
          ]
        : []
    );

    await listsState.addCardsToList(list.id, [card]);

    expect(listsState.isInList(list.id, card)).toBe(true);
    expect(listsState.isInList(list.id, { id: 'p2', name: 'Atraxa' })).toBe(true);
    expect(listsState.isInList(list.id, { id: 'x', name: 'Other' })).toBe(false);
    expect(listsState.getListsForCard(card)).toHaveLength(1);
  });

  it('removes every printing of a card name', async () => {
    const list = await listsState.createList({ name: 'Deck' });
    const card = { id: 'p1', name: 'Atraxa' };
    cardStore.getPrintings.mockReturnValue([{ id: 'p2', name: 'Atraxa' }]);

    await listsState.addCardsToList(list.id, [card]);
    await listsState.removeCardsFromList(list.id, [card]);

    expect(listsState.getList(list.id).cardIds.size).toBe(0);
  });

  it('renames, edits and deletes a list', async () => {
    const list = await listsState.createList({ name: 'Deck' });

    await listsState.updateList(list.id, { name: 'Renamed', isPublic: true });
    expect(listsState.getList(list.id).name).toBe('Renamed');
    expect(listsState.getList(list.id).isPublic).toBe(true);

    await listsState.deleteList(list.id);
    expect(listsState.getLists()).toHaveLength(0);
    expect(localStore.rows).toHaveLength(0);
  });

  it('merges local lists into the account and clears the local copy', async () => {
    localStore.rows = [
      {
        id: 'local-1',
        name: 'Trade pile',
        notes: '',
        isPublic: false,
        cardIds: ['p1'],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ];
    mainState.mainState.loggedInUserId = 'user_1';
    api.mergeLists.mockResolvedValue([
      {
        id: 'srv-1',
        name: 'Trade pile',
        notes: '',
        isPublic: false,
        cardIds: ['p1'],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]);

    const merged = await listsState.mergeLocalListsToAccount();

    expect(merged).toBe(true);
    expect(api.mergeLists).toHaveBeenCalledTimes(1);
    expect(localStore.rows).toHaveLength(0);
    expect(listsState.getLists()[0].id).toBe('srv-1');
  });
});

describe('listsState (signed-in / share mode)', () => {
  it('adopts the server list set after a create', async () => {
    mainState.mainState.loggedInUserId = 'user_1';
    api.createList.mockResolvedValue([
      {
        id: 'srv-2',
        name: 'New',
        notes: '',
        isPublic: false,
        cardIds: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]);

    const created = await listsState.createList({ name: 'New' });

    expect(created.id).toBe('srv-2');
    expect(listsState.getLists()).toHaveLength(1);
  });

  it('loads only public lists from a share token, read-only', async () => {
    mainState.mainState.shareToken = 'tok';
    api.fetchLists.mockResolvedValue([
      {
        id: 'pub',
        name: 'Public',
        notes: '',
        isPublic: true,
        cardIds: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]);

    await listsState.loadLists();

    expect(api.fetchLists).toHaveBeenCalledWith({ shareToken: 'tok' });
    expect(listsState.canEditLists()).toBe(false);
    expect(listsState.getLists()).toHaveLength(1);
    await expect(listsState.createList({ name: 'X' })).rejects.toThrow(/read-only/);
    await expect(listsState.deleteList('pub')).rejects.toThrow(/read-only/);
  });

  it('updates a list through the API and adopts the reply', async () => {
    mainState.mainState.loggedInUserId = 'user_1';
    api.fetchLists.mockResolvedValue([serverRecord({ cardIds: ['p1'] })]);
    await listsState.loadLists();
    api.updateList.mockResolvedValue([
      serverRecord({ name: 'Renamed', notes: 'n', isPublic: true, cardIds: ['p1'] }),
    ]);

    await listsState.updateList('srv-1', { name: 'Renamed', notes: 'n', isPublic: true });

    expect(api.updateList).toHaveBeenCalledWith('srv-1', {
      name: 'Renamed',
      notes: 'n',
      isPublic: true,
    });
    expect(listsState.getList('srv-1').name).toBe('Renamed');
    expect(listsState.getList('srv-1').isPublic).toBe(true);
  });

  it('deletes a list through the API', async () => {
    mainState.mainState.loggedInUserId = 'user_1';
    api.fetchLists.mockResolvedValue([serverRecord()]);
    await listsState.loadLists();
    api.deleteList.mockResolvedValue([]);

    await listsState.deleteList('srv-1');

    expect(api.deleteList).toHaveBeenCalledWith('srv-1');
    expect(listsState.getLists()).toHaveLength(0);
  });

  it('adds unique printing ids through the API', async () => {
    mainState.mainState.loggedInUserId = 'user_1';
    api.fetchLists.mockResolvedValue([serverRecord()]);
    await listsState.loadLists();
    api.addListItems.mockResolvedValue([serverRecord({ cardIds: ['a', 'b'] })]);

    await listsState.addCardsToList('srv-1', [{ id: 'a' }, { id: 'a' }, { id: 'b' }, null]);

    expect(api.addListItems).toHaveBeenCalledWith('srv-1', ['a', 'b']);
    expect(listsState.getListCardIds('srv-1')).toEqual(['a', 'b']);
  });

  it('removes every printing of a name through the API', async () => {
    mainState.mainState.loggedInUserId = 'user_1';
    api.fetchLists.mockResolvedValue([serverRecord({ cardIds: ['p1', 'p2'] })]);
    await listsState.loadLists();
    cardStore.getPrintings.mockReturnValue([{ id: 'p2', name: 'Atraxa' }]);
    api.removeListItems.mockResolvedValue([serverRecord({ cardIds: [] })]);

    await listsState.removeCardsFromList('srv-1', [{ id: 'p1', name: 'Atraxa' }]);

    expect(api.removeListItems).toHaveBeenCalledWith('srv-1', ['p1', 'p2']);
    expect(listsState.getListCardIds('srv-1')).toEqual([]);
  });

  it('toggles a batch in and out of a list', async () => {
    mainState.mainState.loggedInUserId = 'user_1';
    api.fetchLists.mockResolvedValue([serverRecord()]);
    await listsState.loadLists();
    api.addListItems.mockResolvedValue([serverRecord({ cardIds: ['a'] })]);

    expect(await listsState.toggleCardsInList('srv-1', [{ id: 'a' }])).toBe(true);
    expect(api.addListItems).toHaveBeenCalledWith('srv-1', ['a']);

    api.removeListItems.mockResolvedValue([serverRecord({ cardIds: [] })]);
    expect(await listsState.toggleCardsInList('srv-1', [{ id: 'a' }])).toBe(false);
    expect(api.removeListItems).toHaveBeenCalledWith('srv-1', ['a']);
  });

  it('is a no-op when there are no cards to add or remove', async () => {
    mainState.mainState.loggedInUserId = 'user_1';
    api.fetchLists.mockResolvedValue([serverRecord()]);
    await listsState.loadLists();

    await listsState.addCardsToList('srv-1', []);
    await listsState.removeCardsFromList('srv-1', []);

    expect(api.addListItems).not.toHaveBeenCalled();
    expect(api.removeListItems).not.toHaveBeenCalled();
  });

  it('rejects updates for an unknown list or a blank/duplicate name', async () => {
    mainState.mainState.loggedInUserId = 'user_1';
    api.fetchLists.mockResolvedValue([
      serverRecord({ id: 'a', name: 'One' }),
      serverRecord({ id: 'b', name: 'Two' }),
    ]);
    await listsState.loadLists();

    await expect(listsState.updateList('missing', { name: 'X' })).rejects.toThrow(/not found/i);
    await expect(listsState.updateList('b', { name: '   ' })).rejects.toThrow(/name/i);
    await expect(listsState.updateList('b', { name: 'One' })).rejects.toThrow(/already exists/);
    await expect(listsState.addCardsToList('missing', [{ id: 'a' }])).rejects.toThrow(/not found/i);
  });

  it('blocks every mutation in a share view', async () => {
    mainState.mainState.shareToken = 'tok';
    api.fetchLists.mockResolvedValue([serverRecord()]);
    await listsState.loadLists();

    await expect(listsState.updateList('srv-1', { name: 'X' })).rejects.toThrow(/read-only/);
    await expect(listsState.addCardsToList('srv-1', [{ id: 'a' }])).rejects.toThrow(/read-only/);
    await expect(listsState.removeCardsFromList('srv-1', [{ id: 'a' }])).rejects.toThrow(
      /read-only/
    );
  });
});
