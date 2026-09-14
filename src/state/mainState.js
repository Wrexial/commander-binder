// src/state/mainState.js
/**
 * Session-level state owned by `main.js`. It lives in `src/state/` rather than
 * in `main.js` so lower layers (e.g. `cardState.js`) can read it without
 * importing the app entry point, which would create an import cycle.
 */
export const mainState = {
  loggedInUserId: undefined,
  shareToken: undefined,
};
