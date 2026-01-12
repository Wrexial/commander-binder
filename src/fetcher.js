// fetcher.js
import { CARDS_PER_PAGE, PAGES_PER_BINDER } from './config.js';
import { appState } from './appState.js';
import { showLoading, hideLoading } from './loadingIndicator.js';
import { startNewBinder, startNewSection } from './layout.js';
import { createCardElement, attachCardHandlers } from './cards.js';
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

        if (appState.pageCards.length >= CARDS_PER_PAGE) {
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
        attachCardHandlers(el, c, tooltip);
        appState.grid.appendChild(el);

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

    if (header && appState.binder.startDate && appState.binder.endDate) {
        const startYear = new Date(appState.binder.startDate).getFullYear();
        const endYear = new Date(appState.binder.endDate).getFullYear();
        header.childNodes[0].nodeValue = `Binder ${binderNumber} (${startYear} - ${endYear}) `;
    }
}
