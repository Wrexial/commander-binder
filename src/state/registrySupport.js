/**
 * Small plumbing shared by the device/server registries (custom lists and
 * binders): view-mode detection, a change announcer, an id factory and a
 * serialized write queue.
 */
import { mainState } from './mainState.js';

/** True on a read-only share-link view. */
export function isShareView() {
  return Boolean(mainState.shareToken);
}

/** Signed-out visitors (and share-link guests) track data on this device. */
export function isLocalView() {
  return !isShareView() && !mainState.loggedInUserId;
}

/** Dispatch `<eventName>` on `document` so mounted UI can repaint. */
export function createAnnouncer(eventName) {
  return function announce() {
    if (typeof document !== 'undefined') {
      document.dispatchEvent(new CustomEvent(eventName));
    }
  };
}

/** A UUID factory, falling back to a prefixed timestamp + random id. */
export function createIdFactory(prefix) {
  return function newId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  };
}

/** Run async tasks one at a time, in order, so server replies can't reorder. */
export function createWriteQueue() {
  let tail = Promise.resolve();
  return function enqueue(task) {
    const run = tail.then(task, task);
    tail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };
}
