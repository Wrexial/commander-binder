// fetcher.js
import { CARDS_PER_PAGE, PAGES_PER_BINDER } from './config.js';
import { state } from './state.js';
import { showLoading, hideLoading } from './loader.js';
import { startNewBinder, startNewSection } from './layout.js';
import { createCardElement, attachCardHandlers } from './cards.js';

// At the start of your lazy loading init
state.pageCards = [];

export async function fetchNextPage(results, tooltip) {
  if (!state.nextPageUrl || state.isLoading) return;

  state.isLoading = true;
  showLoading();

  try {
    const url = state.nextPageUrl;

    const res = await fetch(url);
    const data = await res.json();

    for (const card of data.data) {
      if (!card.games.includes("paper")) continue;
      if (state.seenNames.has(card.name)) continue;

      state.seenNames.add(card.name);
      state.pageCards.push(card);

      // Only render when we hit CARDS_PER_PAGE
      if (state.pageCards.length === CARDS_PER_PAGE) {
        renderPage(results, tooltip);
      }
    }

    state.nextPageUrl = data.has_more ? data.next_page : null;

    // Only render leftover cards if this is the last API page
    if (!state.nextPageUrl && state.pageCards.length > 0) {
      renderPage(results, tooltip);
    }

  } catch (err) {
    console.error("Scryfall fetch failed:", err);
  } finally {
    state.isLoading = false;
    hideLoading();
  }

  if(state.nextPageUrl){
    fetchNextPage(results, tooltip);
  }
}

// helper function
function renderPage(results, tooltip) {
  const pageSets = new Map();
  state.pageCards.forEach(c => pageSets.set(c.set, {
    name: c.set_name,
    date: c.released_at
  }));

  startNewSection(pageSets);
  state.pageCards.forEach(c => {
    const el = createCardElement(c);
    attachCardHandlers(el, c, tooltip);
    state.grid.appendChild(el);
  });
  state.count += state.pageCards.length;

  if (state.count % (CARDS_PER_PAGE * PAGES_PER_BINDER) === 0) {
    startNewBinder(results);
  }

  state.pageCards = [];
}