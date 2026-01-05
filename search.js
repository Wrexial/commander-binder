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

  const debouncedSearch = debounce(() => {
    const searchTerm = searchInput.value.toLowerCase();
    document.querySelectorAll('.card').forEach(cardElement => {
      const cardName = cardElement.cardData?.name.toLowerCase();
      if (cardName) {
        cardElement.style.display = cardName.includes(searchTerm) ? '' : 'none';
      }
    });
  }, 250);

  searchInput.addEventListener('input', debouncedSearch);
}
