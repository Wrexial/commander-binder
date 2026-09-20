import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createBinder,
  deleteBinder,
  fetchBinders,
  mergeBinders,
  updateBinder,
} from '../binders.js';
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
  authenticatedFetch.mockResolvedValue(respond({ binders: [] }));
});

describe('binders API', () => {
  it('loads the caller binders through the read endpoint', async () => {
    authenticatedFetch.mockResolvedValue(respond({ binders: [{ id: 'b1' }] }));

    await expect(fetchBinders()).resolves.toEqual([{ id: 'b1' }]);
    expect(authenticatedFetch).toHaveBeenCalledWith('/.netlify/functions/binders', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  });

  it('passes a share token as a read capability', async () => {
    await fetchBinders({ shareToken: 'tok' });

    expect(authenticatedFetch).toHaveBeenCalledWith('/.netlify/functions/binders', {
      method: 'POST',
      body: JSON.stringify({ shareToken: 'tok' }),
    });
  });

  it('creates a binder', async () => {
    await createBinder({
      name: 'Binder 1',
      columns: 3,
      rows: 4,
      pages: 2,
      slots: { '0:0:0': 'card-a' },
      isPublic: true,
    });

    expect(authenticatedFetch.mock.calls.at(-1)[0]).toBe('/.netlify/functions/manage-binder');
    expect(authenticatedFetch.mock.calls.at(-1)[1].method).toBe('POST');
    expect(sentBody()).toEqual({
      action: 'create',
      name: 'Binder 1',
      columns: 3,
      rows: 4,
      pages: 2,
      slots: { '0:0:0': 'card-a' },
      isPublic: true,
    });
  });

  it('sends only the fields present on an update', async () => {
    await updateBinder('b1', { name: 'Trade', isPublic: false });

    expect(sentBody()).toEqual({
      action: 'update',
      binderId: 'b1',
      name: 'Trade',
      isPublic: false,
    });
  });

  it('deletes a binder', async () => {
    await deleteBinder('b1');

    expect(sentBody()).toEqual({ action: 'delete', binderId: 'b1' });
  });

  it('unions local binders into the account', async () => {
    await mergeBinders([{ id: 'local-1', name: 'Local' }]);

    expect(authenticatedFetch).toHaveBeenCalledWith('/.netlify/functions/merge-binders', {
      method: 'POST',
      body: JSON.stringify({ binders: [{ id: 'local-1', name: 'Local' }] }),
    });
  });

  it('returns [] when the payload has no binders array', async () => {
    authenticatedFetch.mockResolvedValue(respond({ binders: 'nope' }));

    await expect(fetchBinders()).resolves.toEqual([]);
  });

  it('throws the server message on a failed request', async () => {
    authenticatedFetch.mockResolvedValue(
      respond({ message: 'Binder limit reached' }, { ok: false, status: 400 })
    );

    await expect(fetchBinders()).rejects.toThrow('Binder limit reached');
  });

  it('falls back to the status message when the error body is not JSON', async () => {
    authenticatedFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json');
      },
    });

    await expect(fetchBinders()).rejects.toThrow('Request failed (500)');
  });
});
