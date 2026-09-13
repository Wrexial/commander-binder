import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getShareToken } from '../share.js';
import { authenticatedFetch } from '../authenticatedFetch.js';

vi.mock('../authenticatedFetch.js', () => ({
  authenticatedFetch: vi.fn(),
}));

describe('getShareToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('posts to the share-link function and returns the token', async () => {
    authenticatedFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'abc123' }),
    });

    const token = await getShareToken();

    expect(token).toBe('abc123');
    expect(authenticatedFetch).toHaveBeenCalledWith('/.netlify/functions/share-link', {
      method: 'POST',
      body: JSON.stringify({ regenerate: false }),
    });
  });

  it('requests a rotation when regenerate is set', async () => {
    authenticatedFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'newtoken' }),
    });

    await getShareToken({ regenerate: true });

    expect(authenticatedFetch).toHaveBeenCalledWith('/.netlify/functions/share-link', {
      method: 'POST',
      body: JSON.stringify({ regenerate: true }),
    });
  });

  it('throws when the request fails', async () => {
    authenticatedFetch.mockResolvedValue({ ok: false, status: 401 });

    await expect(getShareToken()).rejects.toThrow('Failed to create share link (401)');
  });
});
