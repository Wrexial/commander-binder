/**
 * Compare two collections of printing ids at the card level.
 *
 * The `keyOf` resolver decides what "the same card" means: callers pass the
 * card's name (so different printings of one card match) while the default
 * compares ids directly. Keys are returned as-is so the caller can resolve a
 * display label for each.
 *
 * @param {Iterable<string>} ownerIds
 * @param {Iterable<string>} viewerIds
 * @param {(id: string) => string} [keyOf]
 * @returns {{ ownerOnly: string[], viewerOnly: string[], shared: string[] }}
 */
export function diffCollections(ownerIds, viewerIds, keyOf = (id) => id) {
  const owner = new Set();
  for (const id of ownerIds) owner.add(keyOf(id));

  const viewer = new Set();
  for (const id of viewerIds) viewer.add(keyOf(id));

  const ownerOnly = [];
  const shared = [];
  for (const key of owner) {
    if (viewer.has(key)) shared.push(key);
    else ownerOnly.push(key);
  }

  const viewerOnly = [];
  for (const key of viewer) {
    if (!owner.has(key)) viewerOnly.push(key);
  }

  return { ownerOnly, viewerOnly, shared };
}
