import { createBulkCardModal } from './bulkCardModal.js';

/**
 * Open the Bulk Add modal.
 *
 * @returns {Promise<{ show: () => void, destroy: () => void }>}
 */
export async function createBulkAddModal() {
    if (document.querySelector('.list-modal-backdrop')) {
        // Another modal is already open; leave it in place.
        return { show: () => {}, destroy: () => {} };
    }

    return createBulkCardModal('add');
}
