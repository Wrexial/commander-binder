export function showListModal(title, list) {
    const modalBackdrop = document.createElement('div');
    modalBackdrop.style.position = 'fixed';
    modalBackdrop.style.left = '0';
    modalBackdrop.style.top = '0';
    modalBackdrop.style.width = '100%';
    modalBackdrop.style.height = '100%';
    modalBackdrop.style.backgroundColor = 'rgba(0,0,0,0.5)';
    modalBackdrop.style.zIndex = '999';
    modalBackdrop.className = 'list-modal-backdrop';

    const modal = document.createElement('div');
    modal.style.position = 'fixed';
    modal.style.left = '50%';
    modal.style.top = '50%';
    modal.style.transform = 'translate(-50%, -50%)';
    modal.style.backgroundColor = 'var(--bg-color, white)';
    modal.style.color = 'var(--text-color, black)';
    modal.style.padding = '20px';
    modal.style.zIndex = '1000';
    modal.style.border = '1px solid var(--border-color, black)';
    modal.style.borderRadius = '8px';
    modal.style.width = '80%';
    modal.style.maxWidth = '500px';
    modal.style.maxHeight = '80vh';
    modal.style.display = 'flex';
    modal.style.flexDirection = 'column';
    modal.className = 'list-modal';

    const modalHeader = document.createElement('h2');
    modalHeader.textContent = title;
    modalHeader.style.marginTop = '0';

    const contentArea = document.createElement('textarea');
    contentArea.readOnly = true;
    contentArea.value = list;
    contentArea.style.flexGrow = '1';
    contentArea.style.minHeight = '200px';
    contentArea.style.whiteSpace = 'pre';
    contentArea.style.overflow = 'auto';

    const closeButton = document.createElement('button');
    closeButton.textContent = 'Close';
    closeButton.style.marginTop = '10px';
    closeButton.addEventListener('click', () => {
        document.body.removeChild(modalBackdrop);
    });
    
    modalBackdrop.addEventListener('click', (e) => {
        if (e.target === modalBackdrop) {
            document.body.removeChild(modalBackdrop);
        }
    });

    modal.appendChild(modalHeader);
    modal.appendChild(contentArea);
    modal.appendChild(closeButton);
    modalBackdrop.appendChild(modal);
    document.body.appendChild(modalBackdrop);
}
