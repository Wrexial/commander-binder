import { isCardOwned } from './cardState.js';
import { cardStore } from './loadedCards.js';
import { showToast } from './ui/toast.js';

function calculateStatistics(cards) {
    const totalCards = cards.length;
    let totalValue = 0;
    const colors = { W: 0, U: 0, B: 0, R: 0, G: 0 };
    const colorCombinations = {};
    const types = {};
    const rarities = {};
    const pricedCards = [];

    for (const card of cards) {
        // Total Value
        const printings = cardStore.getPrintings(card.name);
        const prices = printings.flatMap(p => [
            p.prices.eur,
            p.prices.eur_foil,
        ]).filter(p => p !== null).map(p => parseFloat(p));
        const price = prices.length > 0 ? Math.min(...prices) : null;

        if (price) {
            const priceValue = parseFloat(price);
            totalValue += priceValue;
            pricedCards.push({ name: card.name, price: priceValue });
        }

        // Colors
        let cardColors = card.colors;
        if (card.card_faces && (!cardColors || cardColors.length === 0)) {
            cardColors = card.card_faces.reduce((acc, face) => acc.concat(face.colors || []), []);
        }
        cardColors = [...new Set(cardColors)]; // Remove duplicates for MDFCs

        if (cardColors.length > 0) {
            // Individual colors
            for (const color of cardColors) {
                colors[color]++;
            }

            // Color combinations
            const key = cardColors.sort().join('');
            colorCombinations[key] = (colorCombinations[key] || 0) + 1;
        }

        // Types
        const typeLine = card.type_line.split(' // ')[0];
        const supertypes = typeLine.split(' — ')[0].split(' ');
        for (const type of supertypes) {
            types[type] = (types[type] || 0) + 1;
        }

        // Rarities
        const rarity = card.rarity;
        rarities[rarity] = (rarities[rarity] || 0) + 1;
    }

    const top5ValuableCards = pricedCards.sort((a, b) => b.price - a.price).slice(0, 5);
    const averageCardValue = totalCards > 0 ? (totalValue / totalCards).toFixed(2) : 0;

    return {
        totalCards,
        totalValue: totalValue.toFixed(2),
        colors,
        colorCombinations,
        types,
        rarities,
        top5ValuableCards,
        averageCardValue,
    };
}

function createManaSymbol(symbol) {
    return `<img src="https://svgs.scryfall.io/card-symbols/${symbol}.svg" class="mana-symbol" alt="${symbol}">`;
}

function createStatisticsHTML(stats) {
    const colorEntries = Object.entries(stats.colors)
        .filter(([, count]) => count > 0)
        .map(([color, count]) => `<li>${createManaSymbol(color)}: ${count}</li>`).join('');

    const colorCombinationEntries = Object.entries(stats.colorCombinations)
        .sort((a, b) => b[1] - a[1])
        .map(([combo, count]) => `<li>${combo.split('').map(createManaSymbol).join('')}: ${count}</li>`)
        .join('');

    const top5ValuableCardsEntries = stats.top5ValuableCards
        .map(card => `<li>${card.name} - €${card.price.toFixed(2)}</li>`)
        .join('');

    return `
        <div class="stats-summary">
            <div><strong>Total Cards:</strong> ${stats.totalCards}</div>
            <div><strong>Total Value:</strong> €${stats.totalValue}</div>
            <div><strong>Average Card Value:</strong> €${stats.averageCardValue}</div>
        </div>
        
        <h3>Colors</h3>
        <ul class="statistics-list">${colorEntries}</ul>

        <h3>Color Combinations</h3>
        <ul class="statistics-list">${colorCombinationEntries}</ul>

        <h3>Top 5 Most Valuable Cards</h3>
        <ul class="statistics-list">${top5ValuableCardsEntries}</ul>

        <h3>Types</h3>
        <ul>
            ${Object.entries(stats.types).map(([type, count]) => `<li>${type}: ${count}</li>`).join('')}
        </ul>
        <h3>Rarities</h3>
        <ul>
            ${Object.entries(stats.rarities).map(([rarity, count]) => `<li>${rarity}: ${count}</li>`).join('')}
        </ul>
    `;
}


export async function showStatisticsModal() {
    const allCards = cardStore.getAll();
    const ownedCards = allCards.filter(isCardOwned);

    if (ownedCards.length === 0) {
        showToast("No owned cards have been loaded yet. Scroll to load more cards.", "warning");
        return;
    }

    const modalBackdrop = document.createElement('div');
    modalBackdrop.className = 'list-modal-backdrop';

    const modal = document.createElement('div');
    modal.className = 'list-modal';
    
    const modalHeader = document.createElement('h2');
    modalHeader.textContent = 'Collection Statistics';

    const contentArea = document.createElement('div');
    contentArea.className = 'modal-content-area';
    const stats = calculateStatistics(ownedCards);
    contentArea.innerHTML = createStatisticsHTML(stats);

    const paginationContainer = document.createElement('div');
    paginationContainer.className = 'pagination-container';

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'modal-button-container';

    const closeButton = document.createElement('button');
    closeButton.textContent = 'Close';
    closeButton.addEventListener('click', () => {
        document.body.removeChild(modalBackdrop);
    });
    buttonContainer.appendChild(closeButton);

    modal.appendChild(modalHeader);
    modal.appendChild(contentArea);
    modal.appendChild(paginationContainer);
    modal.appendChild(buttonContainer);
    modalBackdrop.appendChild(modal);
    document.body.appendChild(modalBackdrop);

    modalBackdrop.addEventListener('click', (e) => {
        if (e.target === modalBackdrop) {
            document.body.removeChild(modalBackdrop);
        }
    });
}
