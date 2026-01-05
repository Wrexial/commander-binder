// fetcher.js
import { CARDS_PER_PAGE, PAGES_PER_BINDER } from './config.js';
import { state } from './state.js';
import { showLoading, hideLoading } from './loader.js';
import { startNewBinder, startNewSection } from './layout.js';
import { createCardElement, attachCardHandlers } from './cards.js';
import { updateOwnedCounter } from './ui/ownedCounter.js';

import { isCardEnabled } from './cardState.js';
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
  state.pageCards.forEach((c, i) => {
    const cardIndex = state.count + i;
    const el = createCardElement(c, cardIndex);
    el.dataset.cardIndex = cardIndex;
    attachCardHandlers(el, c, tooltip);
    state.grid.appendChild(el);

    state.binder.totalCards++;
    if (!isCardEnabled(c)) {
      state.binder.ownedCards++;
    }
  });
  const ownedCountEl = state.binder.querySelector(".owned-count");
  if (ownedCountEl) {
    ownedCountEl.textContent = `Owned: ${state.binder.ownedCards}/${state.binder.totalCards}`;
  }

  const dates = Array.from(pageSets.values()).map(set => set.date);
  const minDate = dates.reduce((min, d) => (d < min ? d : min), dates[0]);
  const maxDate = dates.reduce((max, d) => (d > max ? d : max), dates[0]);

  if (!state.binder.startDate || minDate < state.binder.startDate) {
    state.binder.startDate = minDate;
  }
  if (!state.binder.endDate || maxDate > state.binder.endDate) {
    state.binder.endDate = maxDate;
  }

  updateBinderHeader();

  state.count += state.pageCards.length;
  updateOwnedCounter();

  if (state.count % (CARDS_PER_PAGE * PAGES_PER_BINDER) === 0) {
    startNewBinder(results);
  }

  state.pageCards = [];
}

function updateBinderHeader() {
  const header = state.binder.querySelector(".binder-header");
  const binderNumber = Math.floor(state.count / (CARDS_PER_PAGE * PAGES_PER_BINDER)) + 1;

  if (header && state.binder.startDate && state.binder.endDate) {
    const startYear = new Date(state.binder.startDate).getFullYear();
    const endYear = new Date(state.binder.endDate).getFullYear();
    header.childNodes[0].nodeValue = `Binder ${binderNumber} (${startYear} - ${endYear}) `;
  }
}