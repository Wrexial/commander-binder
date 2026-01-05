import { state } from '../state.js';
import { disabledCards } from '../cardState.js';

export function updateOwnedCounter() {
    const ownedCounter = document.getElementById('owned-counter');
    const searchInput = document.getElementById('search-input');
    if (!ownedCounter || !searchInput) return;

    const searchTerm = searchInput.value;
    
    if (searchTerm) {
        const visibleCards = Array.from(document.querySelectorAll('.card')).filter(c => c.style.display !== 'none');
        const ownedVisibleCards = visibleCards.filter(c => c.classList.contains('owned')).length;
        ownedCounter.textContent = `Owned: ${ownedVisibleCards}/${visibleCards.length}`;
    } else {
        const totalCards = state.seenNames.size;
        const totalOwned = disabledCards.size;
        ownedCounter.textContent = `Owned: ${totalOwned}/${totalCards}`;
    }
}
