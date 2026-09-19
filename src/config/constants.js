// src/config/constants.js
export const VITE_CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
export const binderColors = ['#c84c4c', '#4c8cc8', '#4cc88c', '#c88cc8', '#c8b14c', '#8c4cc8'];

// Default card-grid dimensions (columns x rows) and binder capacity. These are
// only fallbacks: the live values live in `state/cardSettings.js` and can be
// changed by the user from the settings modal.
export const DEFAULT_GRID_COLUMNS = 5;
export const DEFAULT_GRID_ROWS = 4;
export const DEFAULT_PAGES_PER_BINDER = 64;
