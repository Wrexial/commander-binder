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
 * Custom lists and binders both have UUIDs, so their target ids are prefixed in
 * the picker to keep the two namespaces from ever colliding (`list:<id>` /
 * `binder:<id>`). `resolveTarget` strips the prefix before touching state.
 */
const BINDER_TARGET_PREFIX = 'binder:';
const LIST_TARGET_PREFIX = 'list:';

export function binderTargetId(binderId) {
  return `${BINDER_TARGET_PREFIX}${binderId}`;
}

export function listTargetId(listId) {
  return `${LIST_TARGET_PREFIX}${listId}`;
}

function isBinderTargetId(targetId) {
  return typeof targetId === 'string' && targetId.startsWith(BINDER_TARGET_PREFIX);
}

function isListTargetId(targetId) {
  return typeof targetId === 'string' && targetId.startsWith(LIST_TARGET_PREFIX);
}

function binderIdFromTarget(targetId) {
  return isBinderTargetId(targetId) ? targetId.slice(BINDER_TARGET_PREFIX.length) : null;
}

function listIdFromTarget(targetId) {
  return isListTargetId(targetId) ? targetId.slice(LIST_TARGET_PREFIX.length) : null;
}

/** Every selectable target, in display order: collections, lists, then binders. */
export function buildTargetOptions() {
  return [
    ...COLLECTION_TARGETS,
    ...getLists().map((list) => ({ id: listTargetId(list.id), label: list.name })),
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

  // Lists are `list:<id>`; a bare id is still accepted so older callers keep
  // working.
  const listId = listIdFromTarget(id) ?? (typeof id === 'string' ? id : null);
  return { kind: 'list', id: listId, name: (listId && getList(listId)?.name) || 'list' };
}
