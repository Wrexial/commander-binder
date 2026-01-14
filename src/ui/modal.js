export function showListModal(title, list) {
    let currentPage = 0;
    const cardsPerPage = 150;
    const totalPages = Math.ceil(list.length / cardsPerPage);

    const modalBackdrop = document.createElement('div');
    modalBackdrop.className = 'list-modal-backdrop';

    const modal = document.createElement('div');
    modal.className = 'list-modal';

    const modalHeader = document.createElement('h2');
    modalHeader.textContent = title;

    const contentArea = document.createElement('div');
    contentArea.className = 'modal-content-area';

    const pageIndicator = document.createElement('p');
    pageIndicator.style.textAlign = 'center';

    const prevButton = document.createElement('button');
    prevButton.textContent = 'Previous';
    prevButton.addEventListener('click', () => {
        if (currentPage > 0) {
            currentPage--;
            renderPage();
        }
    });

    const nextButton = document.createElement('button');
    nextButton.textContent = 'Next';
    nextButton.addEventListener('click', () => {
        if (currentPage < totalPages - 1) {
            currentPage++;
            renderPage();
        }
    });

    const renderPage = () => {
        const start = currentPage * cardsPerPage;
        const end = start + cardsPerPage;
        contentArea.textContent = list.slice(start, end).join('\n');
        pageIndicator.textContent = `Page ${currentPage + 1} of ${totalPages}`;
        prevButton.disabled = currentPage === 0;
        nextButton.disabled = currentPage === totalPages - 1;
    };

    const closeButton = document.createElement('button');
    closeButton.textContent = 'Close';
    closeButton.dataset.testid = 'close-button';
    closeButton.addEventListener('click', () => {
        const modalBackdrop = document.querySelector('.list-modal-backdrop');
        if (modalBackdrop) {
            document.body.removeChild(modalBackdrop);
        }
    });

    const copyButton = document.createElement('button');
    copyButton.textContent = 'Copy to Clipboard';
    copyButton.dataset.testid = 'copy-button';
    copyButton.addEventListener('click', () => {
        navigator.clipboard.writeText(contentArea.textContent);
        copyButton.textContent = 'Copied!';
        setTimeout(() => {
            copyButton.textContent = 'Copy to Clipboard';
        }, 2000);
    });
    
    modalBackdrop.addEventListener('click', (e) => {
        if (e.target === modalBackdrop) {
            document.body.removeChild(modalBackdrop);
        }
    });

    const paginationContainer = document.createElement('div');
    paginationContainer.className = 'pagination-container';
    paginationContainer.appendChild(prevButton);
    paginationContainer.appendChild(pageIndicator);
    paginationContainer.appendChild(nextButton);

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'modal-button-container';
    buttonContainer.appendChild(copyButton);
    buttonContainer.appendChild(closeButton);

    modal.appendChild(modalHeader);
    modal.appendChild(contentArea);
    modal.appendChild(paginationContainer);
    modal.appendChild(buttonContainer);
    modalBackdrop.appendChild(modal);
    document.body.appendChild(modalBackdrop);
    
    renderPage();
}
