import { state } from './state.js';
import { createCardElement } from './cards.js';
import { fetchNextPage } from './fetcher.js';
import { startNewBinder } from './layout.js';

export async function setupDebugRow(tooltip) {
  const div = document.querySelector("#debug-row");
  div.innerHTML = "";
  return;
  
  const grid = document.querySelector("#debug-row .grid");
  if (!grid) return;

  for (const ref of debugCards) {
    try {
      const res = await fetch(`https://api.scryfall.com/cards/${ref.scryfallId}`);
      const card = await res.json();
      grid.appendChild(createCardElement(card, tooltip));
    } catch {
      console.warn("Failed debug card:", ref.name);
    }
  }
}

export function initLazyCards(results, tooltip) {
  results.innerHTML = "";

  // ⚡ Create first binder immediately to avoid null errors
  startNewBinder(results);

  state.nextPageUrl =
    "https://api.scryfall.com/cards/search?q=is:commander -(set:slc OR set:slu OR set:sld OR set:slp)&unique=prints&order=released&dir=asc";

  // Start preloading
  fetchNextPage(results, tooltip);

  // Polling to detect near-bottom
  const intervalId = setInterval(() => {
    if (!state.nextPageUrl) {
      clearInterval(intervalId);
      return;
    }
    const scrollY = window.scrollY || window.pageYOffset;
    const viewportHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    const threshold = 1000;

    if (documentHeight - (scrollY + viewportHeight) < threshold) {
      fetchNextPage(results, tooltip);
    }
  }, 150);
}
