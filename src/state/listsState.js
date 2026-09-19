/**
 * Custom named lists ("Trade pile", "Deck: Atraxa") with list-level notes.
 *
 * Unlike `collectionState`, this is not one flat set: a user has many lists,
 * each with its own membership. The module keeps a registry (`id -> list`) and
 * mirrors the server/local split the collections use:
 *  - signed-in callers read/write the server,
 *  - signed-out visitors keep device-local lists in IndexedDB (merged on
 *    sign-in),
 *  - share-link visitors see the owner's *public* lists, read-only.
 *
 * Every successful mutation (and load) dispatches `lists:changed` on `document`
 * so the tile badges, the filter dropdown and the manager modal can refresh
 * without importing this module's internals.
 */
import { mainState } from './mainState.js';
import { cardStore } from './cardStore.js';
import {
  addListItems as apiAddListItems,
  createList as apiCreateList,
  deleteList as apiDeleteList,
  fetchLists,
  mergeLists as apiMergeLists,
  removeListItems as apiRemoveListItems,
  updateList as apiUpdateList,
} from '../api/lists.js';
import { clearLocalLists, loadLocalLists, removeLocalList, saveLocalList } from './localLists.js';

/** id -> { id, name, notes, isPublic, createdAt, updatedAt, cardIds: Set<string> } */
const lists = new Map();
let initialized = false;

/** True while the signed-out visitor is tracking lists on this device. */
function isLocalMode() {
  return !mainState.loggedInUserId && !mainState.shareToken;
}

/** True when the current view is a read-only share link. */
function isShareMode() {
  return Boolean(mainState.shareToken);
}

/** Lists can be edited except in a share view. */
export function canEditLists() {
  return !isShareMode();
}

/** True once lists have loaded (or loaded empty) from their source. */
export function areListsLoaded() {
  return initialized;
}

function announce() {
  if (typeof document !== 'undefined') {
    document.dispatchEvent(new CustomEvent('lists:changed'));
  }
}

function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeList(record) {
  return {
    id: record.id,
    name: String(record.name || ''),
    notes: String(record.notes || ''),
    isPublic: Boolean(record.isPublic),
    createdAt: record.createdAt || null,
    updatedAt: record.updatedAt || null,
    cardIds: new Set(Array.isArray(record.cardIds) ? record.cardIds : []),
  };
}

/** Replace the whole registry with a fresh server/local snapshot. */
function applyLists(records) {
  lists.clear();
  for (const record of records || []) {
    if (!record || typeof record.id !== 'string') continue;
    lists.set(record.id, normalizeList(record));
  }
  initialized = true;
  announce();
}

/** Serialize a list for IndexedDB (Sets are not structured-clone friendly here). */
function toRecord(list) {
  return {
    id: list.id,
    name: list.name,
    notes: list.notes,
    isPublic: list.isPublic,
    createdAt: list.createdAt,
    updatedAt: list.updatedAt,
    cardIds: [...list.cardIds],
  };
}

async function persistLocal(list) {
  try {
    await saveLocalList(toRecord(list));
  } catch (err) {
    console.error('Failed to persist the local list:', err);
  }
}

/** Every list, oldest first (then by name), for stable rendering. */
export function getLists() {
  return [...lists.values()].sort((a, b) => {
    const at = a.createdAt || '';
    const bt = b.createdAt || '';
    return at.localeCompare(bt) || a.name.localeCompare(b.name);
  });
}

export function getList(id) {
  return lists.get(id) || null;
}

export function getListByName(name) {
  const target = String(name || '').toLowerCase();
  return getLists().find((list) => list.name.toLowerCase() === target) || null;
}

/** How many named lists the user has. */
export function getListsCount() {
  return lists.size;
}

/** Every printing id that belongs to a list (used by export/share code). */
export function getListCardIds(id) {
  return [...(lists.get(id)?.cardIds || [])];
}

/** The ids of the lists a card belongs to (name-aware, like an owned check). */
export function getListsForCard(card) {
  if (!card) return [];
  // Deliberately unsorted: this runs once per mounted tile, so avoid the
  // `getLists()` sort and keep the hot path linear.
  const result = [];
  for (const list of lists.values()) {
    if (isInList(list.id, card)) result.push(list);
  }
  return result;
}

/**
 * True when the shown printing — or any other printing of the same name — is in
 * the list. The grid renders one tile per card name, so a list may hold a
 * printing other than the one displayed.
 */
export function isInList(id, card) {
  if (!card) return false;
  const list = lists.get(id);
  if (!list) return false;
  if (list.cardIds.has(card.id)) return true;
  return cardStore.getPrintings(card.name).some((printing) => list.cardIds.has(printing.id));
}

/** Every printing of each card, so removal fully clears a name. */
function allPrintingIds(cards) {
  const ids = new Set();
  for (const card of cards) {
    if (!card) continue;
    ids.add(card.id);
    for (const printing of cardStore.getPrintings(card.name)) ids.add(printing.id);
  }
  return [...ids];
}

/** Read the lists from whichever source applies to the current session. */
export async function loadLists() {
  if (isShareMode()) {
    try {
      applyLists(await fetchLists({ shareToken: mainState.shareToken }));
    } catch (err) {
      console.error('Failed to load shared lists:', err);
      applyLists([]);
    }
    return;
  }

  if (isLocalMode()) {
    try {
      applyLists(await loadLocalLists());
    } catch (err) {
      console.error('Failed to load local lists:', err);
      applyLists([]);
    }
    return;
  }

  try {
    applyLists(await fetchLists());
  } catch (err) {
    console.error('Failed to load lists:', err);
    initialized = true;
  }
}

/** Reject a duplicate name the same way the server does (case-insensitive). */
function assertNameFree(name, exceptId) {
  const target = name.toLowerCase();
  const clash = getLists().find(
    (list) => list.id !== exceptId && list.name.toLowerCase() === target
  );
  if (clash) throw new Error('A list with that name already exists.');
}

/**
 * Create a new list.
 * @param {{name: string, notes?: string, isPublic?: boolean}} input
 */
export async function createList({ name, notes = '', isPublic = false }) {
  if (!canEditLists()) throw new Error('Lists are read-only in a shared view.');

  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('Please enter a list name.');
  assertNameFree(trimmed, null);

  if (isLocalMode()) {
    const now = new Date().toISOString();
    const list = {
      id: newId(),
      name: trimmed,
      notes: String(notes || ''),
      isPublic: Boolean(isPublic),
      createdAt: now,
      updatedAt: now,
      cardIds: new Set(),
    };
    lists.set(list.id, list);
    await persistLocal(list);
    announce();
    return list;
  }

  applyLists(await apiCreateList({ name: trimmed, notes, isPublic }));
  return getListByName(trimmed);
}

/** Rename a list, edit its notes or change its visibility. */
export async function updateList(id, { name, notes, isPublic }) {
  if (!canEditLists()) throw new Error('Lists are read-only in a shared view.');

  const list = lists.get(id);
  if (!list) throw new Error('List not found.');

  const trimmed = String(name ?? list.name).trim();
  if (!trimmed) throw new Error('Please enter a list name.');
  assertNameFree(trimmed, id);

  const nextNotes = String(notes ?? list.notes);
  const nextPublic = Boolean(isPublic ?? list.isPublic);

  if (isLocalMode()) {
    list.name = trimmed;
    list.notes = nextNotes;
    list.isPublic = nextPublic;
    list.updatedAt = new Date().toISOString();
    await persistLocal(list);
    announce();
    return list;
  }

  applyLists(await apiUpdateList(id, { name: trimmed, notes: nextNotes, isPublic: nextPublic }));
  return getList(id);
}

/** Delete a list and its membership. */
export async function deleteList(id) {
  if (!canEditLists()) throw new Error('Lists are read-only in a shared view.');

  if (isLocalMode()) {
    lists.delete(id);
    try {
      await removeLocalList(id);
    } catch (err) {
      console.error('Failed to remove the local list:', err);
    }
    announce();
    return;
  }

  applyLists(await apiDeleteList(id));
}

/** Add cards (by their displayed printing) to a list. */
export async function addCardsToList(id, cards) {
  if (!canEditLists()) throw new Error('Lists are read-only in a shared view.');
  if (!lists.has(id)) throw new Error('List not found.');

  const cardIds = [...new Set(cards.filter(Boolean).map((card) => card.id))];
  if (cardIds.length === 0) return;

  if (isLocalMode()) {
    const list = lists.get(id);
    cardIds.forEach((cardId) => list.cardIds.add(cardId));
    list.updatedAt = new Date().toISOString();
    await persistLocal(list);
    announce();
    return;
  }

  applyLists(await apiAddListItems(id, cardIds));
}

/** Remove cards from a list, clearing every printing of each card's name. */
export async function removeCardsFromList(id, cards) {
  if (!canEditLists()) throw new Error('Lists are read-only in a shared view.');

  const cardIds = allPrintingIds(cards);
  if (cardIds.length === 0) return;

  if (isLocalMode()) {
    const list = lists.get(id);
    if (!list) return;
    cardIds.forEach((cardId) => list.cardIds.delete(cardId));
    list.updatedAt = new Date().toISOString();
    await persistLocal(list);
    announce();
    return;
  }

  applyLists(await apiRemoveListItems(id, cardIds));
}

/**
 * Flip membership for a batch of cards. When every card is already in the list
 * the whole batch is removed; otherwise the missing ones are added, so a mixed
 * selection converges on "in the list".
 *
 * @returns {Promise<boolean>} whether the cards are now in the list.
 */
export async function toggleCardsInList(id, cards) {
  const batch = (Array.isArray(cards) ? cards : [cards]).filter(Boolean);
  if (batch.length === 0) return false;

  const allPresent = batch.every((card) => isInList(id, card));
  if (allPresent) await removeCardsFromList(id, batch);
  else await addCardsToList(id, batch);
  return !allPresent;
}

/** Flip a single card's membership in one list; returns the new state. */
export async function toggleCardInList(id, card) {
  return toggleCardsInList(id, [card]);
}

/**
 * Upload the visitor's device-local lists into the signed-in account and clear
 * the local copy. The server merge unions by name, so a failure is safe to
 * retry — the records stay in IndexedDB until a merge fully succeeds.
 *
 * @returns {Promise<boolean>} true when local lists were merged and cleared.
 */
export async function mergeLocalListsToAccount() {
  if (!mainState.loggedInUserId) return false;

  const records = await loadLocalLists();
  if (records.length === 0) return false;

  const merged = await apiMergeLists(records.map(toRecord));
  applyLists(merged);
  try {
    await clearLocalLists();
  } catch (err) {
    console.error('Failed to clear local lists after merge:', err);
  }
  return true;
}
