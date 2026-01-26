import { isCardOwned } from './cardState.js';
import { cardStore } from './loadedCards.js';
import { showToast } from './ui/toast.js';

function calculateStatistics(cards) {
    const totalCards = cards.length;
    let totalValue = 0;
    const colors = {};
    const types = {};
    const rarities = {};

    for (const card of cards) {
        // Total Value
        const price = card.prices.usd || card.prices.usd_foil || card.prices.usd_etched;
        if (price) {
            totalValue += parseFloat(price);
        }

        // Colors
        if (card.colors) {
            for (const color of card.colors) {
                colors[color] = (colors[color] || 0) + 1;
            }
        } else if (card.card_faces) {
            for (const face of card.card_faces) {
                if (face.colors) {
                    for (const color of face.colors) {
                        colors[color] = (colors[color] || 0) + 1;
                    }
                }
            }
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
        types,
        rarities,
    };
}

function createStatisticsHTML(stats) {
    return `
        <h2>Collection Statistics</h2>
        <p><strong>Total Cards:</strong> ${stats.totalCards}</p>
        <p><strong>Total Value:</strong> $${stats.totalValue}</p>
        <h3>Colors</h3>
        <ul>
            ${Object.entries(stats.colors).map(([color, count]) => `<li>${color}: ${count}</li>`).join('')}
        </ul>
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
    
    const stats = calculateStatistics(ownedCards);
    modal.innerHTML = createStatisticsHTML(stats);

    const closeButton = document.createElement('button');
    closeButton.textContent = 'Close';
    closeButton.addEventListener('click', () => {
        document.body.removeChild(modalBackdrop);
    });
    modal.appendChild(closeButton);

    modalBackdrop.appendChild(modal);
    document.body.appendChild(modalBackdrop);
}
