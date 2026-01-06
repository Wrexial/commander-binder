// state.js
export const appState = {
  isViewOnlyMode: false,
  nextPageUrl: null,
  isLoading: false,
  activeFetches: 0,
  count: 0,
  seenNames: new Set(),
  seenSetCodes: new Set(),
  binder: null,
  section: null,
  grid: null,
  pageCards: []
};
