// state.js
export const appState = {
  isViewOnlyMode: false,
  nextPageUrl: null,
  isLoading: false,
  pendingFetch: false,
  autoLoad: false,
  activeFetches: 0,
  count: 0,
  seenNames: new Set(),
  seenSetCodes: new Set(),
  binder: null,
  section: null,
  grid: null,
  pageCards: [],
  // Coverage sample captured from the first API page, used to sanity-check the
  // bulk-data subset before trusting it.
  apiTotalCards: null,
  apiSampleIds: null
};
