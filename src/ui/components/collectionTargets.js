// src/ui/components/collectionTargets.js
/**
 * Shared target descriptors for the add/check/export modals: the two built-in
 * collections plus every custom list and binder.
 *
 * Kept dependency-light (lists/binders state only) so both the modals and
 * `layout.js` can build the same target list. `layout.js` importing the helpers
 * from `collectionModal.js` would create an import cycle, since that module
 * already depends on `layout.js`.
 */
import { getList, getLists } from '../../state/listsState.js';
import { getBinder, getBinders } from '../../state/bindersState.js';
/** The two collections the add/export/recent modals can target. */
export const COLLECTION_TARGETS = [
  { id: 'owned', label: 'Collection' },
  { id: 'wishlist', label: 'Wishlist' },
];

/**
 * Binder targets are prefixed in the target picker so a binder id can never be
 * mistaken for a custom-list id (both are UUIDs).
 */
const BINDER_TARGET_PREFIX = 'binder:';

export function binderTargetId(binderId) {
  return `${BINDER_TARGET_PREFIX}${binderId}`;
}

function isBinderTargetId(targetId) {
  return typeof targetId === 'string' && targetId.startsWith(BINDER_TARGET_PREFIX);
}

function binderIdFromTarget(targetId) {
  return isBinderTargetId(targetId) ? targetId.slice(BINDER_TARGET_PREFIX.length) : null;
}

/** Every selectable target, in display order: collections, lists, then binders. */
export function buildTargetOptions() {
  return [
    ...COLLECTION_TARGETS,
    ...getLists().map((list) => ({ id: list.id, label: list.name })),
    ...getBinders().map((binder) => ({
      id: binderTargetId(binder.id),
      label: `Binder: ${binder.name}`,
    })),
  ];
}

/**
 * Classify a target id so the modals can share the owned/wishlist/binder/list
 * branching and just supply the action-specific copy.
 *
 * @param {string} id
 * @returns {{kind: 'owned'|'wishlist'|'binder'|'list', id?: string, name: string}}
 */
export function resolveTarget(id) {
  if (id === 'wishlist') return { kind: 'wishlist', name: 'wishlist' };
  if (id === 'owned') return { kind: 'owned', name: 'collection' };

  const binderId = binderIdFromTarget(id);
  if (binderId)
    return { kind: 'binder', id: binderId, name: getBinder(binderId)?.name || 'binder' };

  return { kind: 'list', id, name: getList(id)?.name || 'list' };
}
