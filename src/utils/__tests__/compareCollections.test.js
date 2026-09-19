import { describe, it, expect } from 'vitest';
import { diffCollections } from '../compareCollections.js';

describe('diffCollections', () => {
  it('splits ids into owner-only, viewer-only and shared', () => {
    const diff = diffCollections(['a', 'b'], ['b', 'c']);

    expect(new Set(diff.ownerOnly)).toEqual(new Set(['a']));
    expect(new Set(diff.viewerOnly)).toEqual(new Set(['c']));
    expect(new Set(diff.shared)).toEqual(new Set(['b']));
  });

  it('groups different printings of the same card with a custom key', () => {
    const keyOf = (id) => id.split('#')[0];
    const diff = diffCollections(['card#1'], ['card#2'], keyOf);

    expect(diff.ownerOnly).toEqual([]);
    expect(diff.viewerOnly).toEqual([]);
    expect(diff.shared).toEqual(['card']);
  });

  it('handles empty and disjoint collections', () => {
    expect(diffCollections([], [])).toEqual({ ownerOnly: [], viewerOnly: [], shared: [] });

    const disjoint = diffCollections(['a'], ['b']);
    expect(disjoint.ownerOnly).toEqual(['a']);
    expect(disjoint.viewerOnly).toEqual(['b']);
    expect(disjoint.shared).toEqual([]);
  });

  it('deduplicates repeated ids', () => {
    const diff = diffCollections(['a', 'a'], ['a']);

    expect(diff.shared).toEqual(['a']);
    expect(diff.ownerOnly).toEqual([]);
  });
});
