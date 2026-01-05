import { CARDS_PER_PAGE } from './config.js';

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

export function initSearch() {
  const searchInput = document.getElementById('search-input');
  if (!searchInput) return;

  const clearSearchButton = document.getElementById('clear-search');
  const noResultsMessage = document.getElementById('no-results-message');

  const debouncedFilter = debounce(() => {
    const searchTerm = searchInput.value.toLowerCase();
    
    let visibleCardCount = 0;
    document.querySelectorAll('.card').forEach(card => {
      const slotNumberEl = card.querySelector('.card-slot-number');
      if (searchTerm) {
        let isVisible = false;
        if (searchTerm.startsWith('t:')) {
          const typeTerm = searchTerm.substring(2);
          const typeLine = card.cardData.type_line?.toLowerCase() || '';
          const oracleText = card.cardData.oracle_text?.toLowerCase() || '';
          isVisible = typeLine.includes(typeTerm) || oracleText.includes(typeTerm);
        } else {
          const cardName = card.cardData.name.toLowerCase();
          isVisible = cardName.includes(searchTerm);
        }

        if (isVisible) {
          visibleCardCount++;
          const cardIndex = parseInt(card.dataset.cardIndex, 10);
          slotNumberEl.textContent = `#${(cardIndex % CARDS_PER_PAGE) + 1}`;
          slotNumberEl.style.display = 'block';
          card.style.display = '';
        } else {
          slotNumberEl.style.display = 'none';
          card.style.display = 'none';
        }
      } else {
        slotNumberEl.style.display = 'none';
        card.style.display = '';
      }
    });

    // Handle "no results" message
    if (visibleCardCount === 0 && searchTerm) {
      noResultsMessage.style.display = 'block';
    } else {
      noResultsMessage.style.display = 'none';
    }

    // Hide empty sections and binders
    document.querySelectorAll('.binder').forEach(binder => {
      let visibleCardsInBinder = 0;
      binder.querySelectorAll('.section').forEach(section => {
        const visibleCardsInSection = Array.from(section.querySelectorAll('.card')).filter(card => card.style.display !== 'none').length;
        if (visibleCardsInSection === 0) {
          section.style.display = 'none';
        } else {
          section.style.display = '';
          visibleCardsInBinder++;
        }
      });

      if (visibleCardsInBinder === 0) {
        binder.style.display = 'none';
      } else {
        binder.style.display = '';
      }
    });

    // Show/hide clear button
    if (searchInput.value) {
      clearSearchButton.style.display = 'block';
    } else {
      clearSearchButton.style.display = 'none';
    }
  }, 250);

  searchInput.addEventListener('input', debouncedFilter);

  clearSearchButton.addEventListener('click', () => {
    searchInput.value = '';
    debouncedFilter();
  });
}
