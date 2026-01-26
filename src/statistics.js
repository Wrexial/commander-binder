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

    for (const card of cards) {
        // Total Value
        const price = card.prices.eur || card.prices.eur_foil;
        if (price) {
            totalValue += parseFloat(price);
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

    return {
        totalCards,
        totalValue: totalValue.toFixed(2),
        colors,
        colorCombinations,
        types,
        rarities,
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

    return `
        <div class="stats-summary">
            <div><strong>Total Cards:</strong> ${stats.totalCards}</div>
            <div><strong>Total Value:</strong> €${stats.totalValue}</div>
        </div>
        
        <h3>Colors</h3>
        <ul class="statistics-list">${colorEntries}</ul>

        <h3>Color Combinations</h3>
        <ul class="statistics-list">${colorCombinationEntries}</ul>

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
    modal.appendChild(buttonContainer);
    modalBackdrop.appendChild(modal);
    document.body.appendChild(modalBackdrop);
}
