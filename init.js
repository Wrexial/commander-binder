import { state } from './state.js';
import { createCardElement, attachCardHandlers } from './cards.js';
import { fetchNextPage } from './fetcher.js';
import { startNewBinder } from './layout.js';



export function initLazyCards(results, tooltip) {
  results.innerHTML = "";

  // ⚡ Create first binder immediately to avoid null errors
  startNewBinder(results);

  const ownedCountEl = state.binder.querySelector(".owned-count");
  if (ownedCountEl) {
    ownedCountEl.textContent = `Owned: ${state.binder.ownedCards}/${state.binder.totalCards}`;
  }

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
