import { state } from './state.js';
import { CARDS_PER_PAGE } from './config.js';
import { updateOwnedCounter } from './ui/ownedCounter.js';

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

function cardMatchesFilter(card, filter) {
    const not = filter.startsWith('!');
    if (not) {
        filter = filter.substring(1);
    }

    let match = false;
    if (filter.startsWith('t:')) {
        const typeTerm = filter.substring(2);
        const typeLine = card.cardData.type_line?.toLowerCase() || '';
        match = typeLine.includes(typeTerm);
    } else if (filter.startsWith('o:')) {
        const oracleTerm = filter.substring(2);
        const oracleText = card.cardData.oracle_text?.toLowerCase() || '';
        match = oracleText.includes(oracleTerm);
    } else if (filter.startsWith('c<')) {
        const queryColors = filter.substring(2).toUpperCase().split('');
        const cardColors = card.cardData.color_identity || [];
        match = cardColors.length > 0 && cardColors.every(color => queryColors.includes(color));
    } else if (filter.startsWith('c=')) {
        const queryColors = filter.substring(2).toUpperCase().split('').sort();
        const cardColors = (card.cardData.color_identity || []).sort();
        match = JSON.stringify(queryColors) === JSON.stringify(cardColors);
    } else if (filter.startsWith('s:')) {
        const setTerm = filter.substring(2);
        const setCode = card.cardData.set?.toLowerCase() || '';
        const setName = card.cardData.set_name?.toLowerCase() || '';
        if (state.seenSetCodes.has(setTerm)) {
            match = setCode === setTerm;
        } else {
            match = setCode.includes(setTerm) || setName.includes(setTerm);
        }
    } else if (filter.startsWith('d:')) {
        const dateTerm = filter.substring(2);
        const releaseDate = card.cardData.released_at || '';
        const releaseYear = parseInt(releaseDate.substring(0, 4), 10);
        if (dateTerm.includes('-')) {
            const [startYear, endYear] = dateTerm.split('-').map(y => parseInt(y, 10));
            match = releaseYear >= startYear && releaseYear <= endYear;
        } else {
            const year = parseInt(dateTerm, 10);
            match = releaseYear === year;
        }
    } else if (filter.startsWith('r:')) {
        const rarityTerm = filter.substring(2);
        const rarity = card.cardData.rarity?.toLowerCase() || '';
        match = rarity === rarityTerm;
    } else {
        const cardName = card.cardData.name.toLowerCase();
        match = cardName.includes(filter);
    }

    return not ? !match : match;
}

export function initSearch() {
  const searchInput = document.getElementById('search-input');
  if (!searchInput) return;

  const clearSearchButton = document.getElementById('clear-search');
  const noResultsMessage = document.getElementById('no-results-message');

  const debouncedFilter = debounce(() => {
    const searchTerm = searchInput.value.toLowerCase();
    
    let filters = [];
    if (searchTerm.includes('(')) {
        filters = searchTerm.match(/\(([^)]+)\)/g)?.map(f => f.slice(1, -1)) || [];
    } else if (searchTerm) {
        filters = [searchTerm];
    }

    let visibleCardCount = 0;
    document.querySelectorAll('.card').forEach(card => {
        const slotNumberEl = card.querySelector('.card-slot-number');

        if (filters.length > 0) {
            const isVisible = filters.every(filter => cardMatchesFilter(card, filter));

            if (isVisible) {
                visibleCardCount++;
                card.style.display = '';
            } else {
                card.style.display = 'none';
            }
        } else {
            card.style.display = '';
        }
    });

    updateOwnedCounter();

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
    updateOwnedCounter();
  });
}
