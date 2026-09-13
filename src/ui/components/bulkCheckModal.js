import { createBulkCardModal } from './bulkCardModal.js';

/**
 * Open the Bulk Check modal.
 *
 * @returns {Promise<{ show: () => void, destroy: () => void }>}
 */
export async function createBulkCheckModal() {
    if (document.querySelector('.list-modal-backdrop')) {
        // Another modal is already open; leave it in place.
        return { show: () => {}, destroy: () => {} };
    }

    return createBulkCardModal('check');
}
