// fetcher.js
import { CARDS_PER_PAGE, PAGES_PER_BINDER } from './config.js';
import { appState } from './appState.js';
import { showLoading, hideLoading } from './loadingIndicator.js';
import { startNewBinder, startNewSection } from './layout.js';
import { createCardElement, updateCardState } from './cards.js';
import { updateOwnedCounter } from './ui/ownedCounter.js';
import { isCardMissing } from './cardState.js';
import { showToast } from './ui/toast.js';

async function fetchScryfallData(url) {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
    }
    return res.json();
}

function processScryfallData(data) {
    const newCards = [];
    for (const card of data.data) {
        if (!card.games.includes("paper")) continue;
        if (appState.seenNames.has(card.name)) continue;

        appState.seenNames.add(card.name);
        appState.seenSetCodes.add(card.set.toLowerCase());
        newCards.push(card);
    }
    return newCards;
}

export async function fetchNextPage(results, tooltip) {
    if (!appState.nextPageUrl || appState.isLoading) return;

    appState.isLoading = true;
    showLoading();

    try {
        const data = await fetchScryfallData(appState.nextPageUrl);
        const newCards = processScryfallData(data);
        appState.pageCards.push(...newCards);

        while (appState.pageCards.length >= CARDS_PER_PAGE) {
            renderPage(results, tooltip, appState.pageCards.splice(0, CARDS_PER_PAGE));
        }

        appState.nextPageUrl = data.has_more ? data.next_page : null;

        if (!appState.nextPageUrl && appState.pageCards.length > 0) {
            renderPage(results, tooltip, [...appState.pageCards]);
            appState.pageCards = [];
        }

    } catch (err) {
        console.error("Scryfall fetch failed:", err);
        showToast("Failed to fetch cards from Scryfall. Please try again later.", "error");
    } finally {
        appState.isLoading = false;
        hideLoading();
    }

    if (appState.nextPageUrl) {
        fetchNextPage(results, tooltip);
    }
}

function renderPage(results, tooltip, pageCards) {
    const pageSets = new Map();
    pageCards.forEach(c => pageSets.set(c.set, {
        name: c.set_name,
        date: c.released_at
    }));

    startNewSection(pageSets);
    pageCards.forEach((c, i) => {
        const cardIndex = appState.count + i;
        const el = createCardElement(c, cardIndex);
        el.dataset.cardIndex = cardIndex;
        appState.grid.appendChild(el);
        updateCardState(el);

        appState.binder.totalCards++;
        if (!isCardMissing(c)) {
            appState.binder.ownedCards++;
        }
    });
    const ownedCountEl = appState.binder.querySelector(".owned-count");
    if (ownedCountEl) {
        ownedCountEl.textContent = `Owned: ${appState.binder.ownedCards}/${appState.binder.totalCards}`;
    }

    const dates = Array.from(pageSets.values()).map(set => set.date);
    const minDate = dates.reduce((min, d) => (d < min ? d : min), dates[0]);
    const maxDate = dates.reduce((max, d) => (d > max ? d : max), dates[0]);

    if (!appState.binder.startDate || minDate < appState.binder.startDate) {
        appState.binder.startDate = minDate;
    }
    if (!appState.binder.endDate || maxDate > appState.binder.endDate) {
        appState.binder.endDate = maxDate;
    }

    updateBinderHeader();

    appState.count += pageCards.length;
    updateOwnedCounter();

    if (appState.count % (CARDS_PER_PAGE * PAGES_PER_BINDER) === 0) {
        startNewBinder(results);
    }
}

function updateBinderHeader() {
    const header = appState.binder.querySelector(".binder-header");
    const binderNumber = Math.floor(appState.count / (CARDS_PER_PAGE * PAGES_PER_BINDER)) + 1;

    // Ensure click listener for collapse is attached to the whole header
    if (header && !header.hasAttribute('data-has-click-listener')) {
        header.setAttribute('data-has-click-listener', 'true');
        header.addEventListener('click', (e) => {
            // Prevent collapse when clicking export button
            if (e.target.closest('.export-missing-button')) return;
            appState.binder.classList.toggle('collapsed');
        });
    }

    if (header && appState.binder.startDate && appState.binder.endDate) {
        const startYear = new Date(appState.binder.startDate).getFullYear();
        const endYear = new Date(appState.binder.endDate).getFullYear();
        
        let container = header.querySelector('.binder-header-content');
        if (!container) {
            // Clear existing content if it's not structured yet
            const exportBtn = header.querySelector('.export-missing-button');
            header.innerHTML = ''; // Start fresh

            container = document.createElement('div');
            container.className = 'binder-header-content';
            header.appendChild(container);

            if (exportBtn) header.appendChild(exportBtn); // Re-append button
        }

        // We'll update the innerHTML of container to match the requested layout
        // Mobile Layout:
        // Top Left: Binder X
        // Bottom Left: Dates
        // Top Right: Owned Count
        // Bottom Right: Export Button (handled by grid layout in CSS)

        // On desktop, we might want to keep it simple, but let's use spans so CSS can handle it.
        
        // Check if we already have the structure
        const titleSpan = container.querySelector('.binder-title');
        
        if (!titleSpan) {
            container.innerHTML = `
                <div class="binder-title">Binder ${binderNumber}</div>
                <div class="binder-dates">(${startYear} - ${endYear})</div>
                <div class="binder-owned owned-count">Owned: 0/0</div>
            `;
        } else {
            // Update values
            container.querySelector('.binder-title').textContent = `Binder ${binderNumber}`;
            container.querySelector('.binder-dates').textContent = `(${startYear} - ${endYear})`;
            // owned-count is updated by layout.js, but we might need to initialize it? 
            // layout.js updates it based on DOM query.
        }
    }
}

function startNewBinder(results) {
  const newBinder = document.createElement("div");
  newBinder.className = "binder";
  
  const header = document.createElement("h2");
  header.className = "binder-header";
  header.textContent = "Binder "; // Initial text
  
  // Create export button immediately so it's always there
  const exportBtn = document.createElement('button');
  exportBtn.className = 'export-missing-button';
  exportBtn.textContent = 'Export Binder';
  exportBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const binderCards = newBinder.querySelectorAll('.card');
      const missingNames = Array.from(binderCards)
        .filter(card => !card.classList.contains('owned'))
        .map(card => card.cardData.name);
      
      if(missingNames.length) {
        import('./ui/modal.js').then(m => m.showListModal('Missing from Binder', missingNames));
      } else {
        alert('No missing cards in this binder.');
      }
  });
  header.appendChild(exportBtn);

  // Add click listener for collapsing
  header.addEventListener('click', (e) => {
      if (e.target.closest('.export-missing-button')) return;
      newBinder.classList.toggle('collapsed');
  });

  newBinder.appendChild(header);
  results.appendChild(newBinder);

  appState.binder = newBinder;
}
