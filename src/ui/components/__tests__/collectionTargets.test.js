import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../state/listsState.js', () => ({
  getLists: vi.fn(() => [{ id: 'L1', name: 'Trade pile' }]),
  getList: vi.fn((id) => (id === 'L1' ? { id: 'L1', name: 'Trade pile' } : null)),
}));

vi.mock('../../../state/bindersState.js', () => ({
  getBinders: vi.fn(() => [{ id: 'B1', name: 'Trade binder' }]),
  getBinder: vi.fn((id) => (id === 'B1' ? { id: 'B1', name: 'Trade binder' } : null)),
}));

import {
  binderTargetId,
  buildTargetOptions,
  listTargetId,
  resolveTarget,
} from '../collectionTargets.js';

describe('target id prefixes', () => {
  it('namespaces list and binder ids', () => {
    expect(listTargetId('L1')).toBe('list:L1');
    expect(binderTargetId('B1')).toBe('binder:B1');
  });

  it('builds options with prefixed list and binder ids', () => {
    expect(buildTargetOptions()).toEqual([
      { id: 'owned', label: 'Collection' },
      { id: 'wishlist', label: 'Wishlist' },
      { id: 'list:L1', label: 'Trade pile' },
      { id: 'binder:B1', label: 'Binder: Trade binder' },
    ]);
  });

  it('resolves a prefixed list target', () => {
    expect(resolveTarget('list:L1')).toEqual({ kind: 'list', id: 'L1', name: 'Trade pile' });
  });

  it('resolves a prefixed binder target', () => {
    expect(resolveTarget('binder:B1')).toEqual({
      kind: 'binder',
      id: 'B1',
      name: 'Trade binder',
    });
  });

  it('still accepts a bare list id from older callers', () => {
    expect(resolveTarget('L1')).toEqual({ kind: 'list', id: 'L1', name: 'Trade pile' });
  });

  it('resolves the built-in collections', () => {
    expect(resolveTarget('owned')).toEqual({ kind: 'owned', name: 'collection' });
    expect(resolveTarget('wishlist')).toEqual({ kind: 'wishlist', name: 'wishlist' });
  });
});
