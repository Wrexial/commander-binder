import { cardStore } from './cardStore.js';
import { authenticatedFetch } from '../api/authenticatedFetch.js';

/**
 * Build the client-side state for one collection kind (owned or wishlist).
 *
 * Both collections share the same lifecycle — load from IndexedDB or the
 * server, toggle an in-memory set, and merge local records into the account on
 * sign-in — so the logic lives here once and each kind injects its endpoints,
 * storage and labels.
 *
 * @param {object} config
 * @param {string} config.label Human-readable name used in error logs.
 * @param {string} config.readPath
 * @param {string} config.togglePath
 * @param {string} config.batchPath
 * @param {() => boolean} config.isLocalMode
 * @param {() => object} config.readBody
 * @param {() => Promise<Array<{cardId: string, addedAt?: string}>>} config.loadLocal
 * @param {(cardId: string, addedAt: string) => Promise<unknown>} config.addLocal
 * @param {(cardIds: Iterable<string>) => Promise<unknown>} config.removeLocal
 * @param {() => Promise<unknown>} config.clearLocal
 * @param {(cardIds: string[]) => Promise<unknown>} config.mergeToAccount
 * @param {() => boolean} config.canMerge
 */
export function createCollectionState(config) {
  const {
    label,
    readPath,
    togglePath,
    batchPath,
    isLocalMode,
    readBody,
    loadLocal,
    addLocal,
    removeLocal,
    clearLocal,
    mergeToAccount,
    canMerge,
  } = config;

  const ids = new Set();
  /** Printing id -> ISO timestamp it was tracked (best effort). */
  const addedAt = new Map();
  let initialized = false;

  async function load() {
    if (isLocalMode()) {
      try {
        const rows = await loadLocal();
        rows.forEach(({ cardId, addedAt: at }) => {
          ids.add(cardId);
          if (at) addedAt.set(cardId, String(at));
        });
      } catch (err) {
        console.error(`Failed to load the local ${label}:`, err);
      } finally {
        // Always mark initialization complete so isPresent() returns a
        // deterministic result even if storage failed.
        initialized = true;
      }
      return;
    }

    try {
      // Signed-in callers are resolved server-side from their token; guests
      // pass the share token instead. Neither ever sends a raw user id.
      const res = await authenticatedFetch(readPath, {
        method: 'POST',
        body: JSON.stringify(readBody()),
      });
      if (!res.ok) return;

      const rows = await res.json();
      if (!Array.isArray(rows)) return;

      rows.forEach(({ cardId, createdAt }) => {
        ids.add(cardId);
        if (createdAt) addedAt.set(cardId, String(createdAt));
      });
    } catch (err) {
      console.error(`Failed to load ${label}:`, err);
    } finally {
      initialized = true;
    }
  }

  /**
   * True when the shown printing — or any other printing of the same name — is
   * in the collection. The UI renders one card per name, so a saved collection
   * may mark a printing other than the one displayed.
   */
  function isPresent(card) {
    if (!initialized) return false;
    if (ids.has(card.id)) return true;
    return cardStore.getPrintings(card.name).some((printing) => ids.has(printing.id));
  }

  async function toggle(card) {
    if (isLocalMode()) return toggleLocal(card);

    const wasPresent = isPresent(card);

    if (wasPresent) {
      // Unmark every printing of this name so the card is fully cleared.
      const all = new Set([card.id, ...cardStore.getPrintings(card.name).map((p) => p.id)]);

      await persist(batchPath, { cardIds: Array.from(all), isOwned: false });
      all.forEach((id) => {
        ids.delete(id);
        addedAt.delete(id);
      });
    } else {
      await persist(togglePath, { cardId: card.id, isOwned: true });
      ids.add(card.id);
      addedAt.set(card.id, new Date().toISOString());
    }

    return !wasPresent;
  }

  async function setMany(cards, present) {
    if (isLocalMode()) return setLocalMany(cards, present);

    await persist(batchPath, { cardIds: cards.map((c) => c.id), isOwned: present });

    for (const card of cards) {
      if (present) {
        ids.add(card.id);
        addedAt.set(card.id, new Date().toISOString());
      } else {
        ids.delete(card.id);
        addedAt.delete(card.id);
      }
    }
  }

  /**
   * Toggle a card for a signed-out visitor. The in-memory set is authoritative
   * for the session; IndexedDB is a best-effort mirror so the marks survive a
   * reload. As with the server path, unmarking clears every printing of the name.
   */
  async function toggleLocal(card) {
    const wasPresent = isPresent(card);
    const all = new Set([card.id, ...cardStore.getPrintings(card.name).map((p) => p.id)]);

    if (wasPresent) {
      all.forEach((id) => {
        ids.delete(id);
        addedAt.delete(id);
      });
      await persistLocal(() => removeLocal(all));
    } else {
      const at = new Date().toISOString();
      ids.add(card.id);
      addedAt.set(card.id, at);
      await persistLocal(() => addLocal(card.id, at));
    }

    return !wasPresent;
  }

  /** Apply a change to a batch of cards for a signed-out visitor. */
  async function setLocalMany(cards, present) {
    if (present) {
      const at = new Date().toISOString();
      for (const card of cards) {
        ids.add(card.id);
        addedAt.set(card.id, at);
      }
      await persistLocal(() => Promise.all(cards.map((c) => addLocal(c.id, at))));
    } else {
      for (const card of cards) {
        ids.delete(card.id);
        addedAt.delete(card.id);
      }
      await persistLocal(() => removeLocal(cards.map((c) => c.id)));
    }
  }

  /**
   * Upload the visitor's local collection into the signed-in account and clear
   * the local copy. The server merge is a union (never removes), so a failure
   * is safe to retry — the records stay in IndexedDB until a merge fully
   * succeeds.
   *
   * @returns {Promise<boolean>} true when local records were merged and cleared.
   */
  async function mergeLocalToAccount() {
    if (!canMerge()) return false;

    const rows = await loadLocal();
    if (rows.length === 0) return false;

    await mergeToAccount(rows.map((row) => row.cardId));
    await clearLocal();
    return true;
  }

  /**
   * Send a mutation and surface a failure to the caller. Local state is only
   * updated once the request succeeds, so a network error can't leave the UI
   * claiming a card was saved when it was not.
   */
  async function persist(path, body) {
    const res = await authenticatedFetch(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Failed to update ${label} (${res.status})`);
    }
  }

  /**
   * Run a local persistence step without letting a storage failure break a
   * toggle: the in-memory set already reflects the action for this session.
   */
  async function persistLocal(run) {
    try {
      await run();
    } catch (err) {
      console.error(`Failed to persist the local ${label}:`, err);
    }
  }

  return { load, isPresent, toggle, setMany, mergeLocalToAccount, ids, addedAt };
}
