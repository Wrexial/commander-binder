import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  addListItems,
  createList,
  deleteList,
  fetchLists,
  mergeLists,
  removeListItems,
  updateList,
} from '../lists.js';
import { authenticatedFetch } from '../authenticatedFetch.js';

vi.mock('../authenticatedFetch.js', () => ({ authenticatedFetch: vi.fn() }));

/** A fetch response whose JSON body is `body`. */
function respond(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

/** The parsed JSON body of the most recent call. */
function sentBody() {
  const [, options] = authenticatedFetch.mock.calls.at(-1);
  return JSON.parse(options.body);
}

beforeEach(() => {
  vi.clearAllMocks();
  authenticatedFetch.mockResolvedValue(respond({ lists: [] }));
});

describe('lists API', () => {
  it('loads the caller lists through the read endpoint', async () => {
    authenticatedFetch.mockResolvedValue(respond({ lists: [{ id: 'L1' }] }));

    await expect(fetchLists()).resolves.toEqual([{ id: 'L1' }]);
    expect(authenticatedFetch).toHaveBeenCalledWith('/.netlify/functions/lists', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  });

  it('passes a share token as a read capability', async () => {
    await fetchLists({ shareToken: 'tok' });

    expect(authenticatedFetch).toHaveBeenCalledWith('/.netlify/functions/lists', {
      method: 'POST',
      body: JSON.stringify({ shareToken: 'tok' }),
    });
  });

  it('creates a list', async () => {
    await createList({ name: 'Trade pile', notes: 'spares', isPublic: true });

    expect(sentBody()).toEqual({
      action: 'create',
      name: 'Trade pile',
      notes: 'spares',
      isPublic: true,
    });
  });

  it('updates a list', async () => {
    await updateList('L1', { name: 'Renamed' });

    expect(sentBody()).toEqual({ action: 'update', listId: 'L1', name: 'Renamed' });
  });

  it('deletes a list', async () => {
    await deleteList('L1');

    expect(sentBody()).toEqual({ action: 'delete', listId: 'L1' });
  });

  it('adds and removes list items', async () => {
    await addListItems('L1', ['card-a', 'card-b']);
    expect(sentBody()).toEqual({ action: 'add', listId: 'L1', cardIds: ['card-a', 'card-b'] });

    await removeListItems('L1', ['card-a']);
    expect(sentBody()).toEqual({ action: 'remove', listId: 'L1', cardIds: ['card-a'] });
  });

  it('unions local lists into the account', async () => {
    await mergeLists([{ id: 'local-1', name: 'Local' }]);

    expect(authenticatedFetch).toHaveBeenCalledWith('/.netlify/functions/merge-lists', {
      method: 'POST',
      body: JSON.stringify({ lists: [{ id: 'local-1', name: 'Local' }] }),
    });
  });

  it('returns [] when the payload has no lists array', async () => {
    authenticatedFetch.mockResolvedValue(respond({ lists: null }));

    await expect(fetchLists()).resolves.toEqual([]);
  });

  it('throws the server message on a failed request', async () => {
    authenticatedFetch.mockResolvedValue(
      respond({ message: 'Too many lists' }, { ok: false, status: 400 })
    );

    await expect(fetchLists()).rejects.toThrow('Too many lists');
  });

  it('falls back to the status message when the error body is not JSON', async () => {
    authenticatedFetch.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('not json');
      },
    });

    await expect(fetchLists()).rejects.toThrow('Request failed (502)');
  });
});
