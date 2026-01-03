import { state } from './state.js';
import { createCardElement, attachCardHandlers } from './cards.js';
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
      const el = createCardElement(card);
      attachCardHandlers(el, card, tooltip);
      grid.appendChild(el);
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
    "https://api.scryfall.com/cards/search?q=type:legendary type:creature&unique=prints&order=released&dir=asc";

  // Start preloading
  fetchNextPage(results, tooltip);

  // Infinite scroll using IntersectionObserver
  const sentinel = document.createElement('div');
  sentinel.id = 'infinite-scroll-sentinel';
  sentinel.style.width = '100%';
  sentinel.style.height = '1px';
  results.appendChild(sentinel);

  const io = new IntersectionObserver(entries => {
    if (!state.nextPageUrl) {
      io.disconnect();
      sentinel.remove();
      return;
    }

    if (entries[0].isIntersecting) {
      fetchNextPage(results, tooltip);
    }
  }, { root: null, rootMargin: '1000px' });

  io.observe(sentinel);
}
