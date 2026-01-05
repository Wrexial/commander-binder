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

  const debouncedFilter = debounce(() => {
    const searchTerm = searchInput.value.toLowerCase();
    
    if (searchTerm.startsWith('t:')) {
      const typeTerm = searchTerm.substring(2);
      document.querySelectorAll('.card').forEach(card => {
        const typeLine = card.cardData.type_line?.toLowerCase() || '';
        const oracleText = card.cardData.oracle_text?.toLowerCase() || '';
        const cardName = card.cardData.name.toLowerCase();

        if (typeLine.includes(typeTerm) || oracleText.includes(typeTerm)) {
          card.style.display = '';
        } else {
          card.style.display = 'none';
        }
      });
    } else {
      document.querySelectorAll('.card').forEach(card => {
        const cardName = card.cardData.name.toLowerCase();
        card.style.display = cardName.includes(searchTerm) ? '' : 'none';
      });
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
  }, 250);

  searchInput.addEventListener('input', debouncedFilter);
}
