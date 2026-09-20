import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveReadUser } from '../share';
import { getUserId, unauthorized } from '../auth';
import { db } from '../../../db';

vi.mock('../auth', () => ({
  getUserId: vi.fn(),
  unauthorized: vi.fn(() => ({
    statusCode: 401,
    body: JSON.stringify({ message: 'Unauthorized' }),
  })),
}));

vi.mock('../../../db', () => ({ db: { select: vi.fn() } }));

const event = { headers: {} } as never;

/** Make `db.select(...).from(...).where(...)` resolve to `rows`. */
function shareLookupReturns(rows: Array<{ userId: string }>) {
  vi.mocked(db.select).mockReturnValue({
    from: () => ({ where: async () => rows }),
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resolveReadUser', () => {
  it('resolves the owner from a share token and flags the read as shared', async () => {
    shareLookupReturns([{ userId: 'owner-1' }]);

    await expect(resolveReadUser(event, 'tok')).resolves.toEqual({
      ok: true,
      userId: 'owner-1',
      shared: true,
    });
  });

  it('rejects a non-string share token', async () => {
    const result = await resolveReadUser(event, 42);

    expect(result.ok).toBe(false);
    expect(db.select).not.toHaveBeenCalled();
    expect(getUserId).not.toHaveBeenCalled();
  });

  it('returns unauthorized for an unknown share token', async () => {
    shareLookupReturns([]);

    const result = await resolveReadUser(event, 'missing');

    expect(result.ok).toBe(false);
    expect(unauthorized).toHaveBeenCalled();
  });

  it('falls back to the verified session when no share token is present', async () => {
    vi.mocked(getUserId).mockResolvedValue('caller-1');

    await expect(resolveReadUser(event, undefined)).resolves.toEqual({
      ok: true,
      userId: 'caller-1',
      shared: false,
    });
    expect(db.select).not.toHaveBeenCalled();
  });

  it('returns unauthorized when there is no share token and no session', async () => {
    vi.mocked(getUserId).mockResolvedValue(null);

    const result = await resolveReadUser(event, undefined);

    expect(result.ok).toBe(false);
    expect(unauthorized).toHaveBeenCalled();
  });
});
