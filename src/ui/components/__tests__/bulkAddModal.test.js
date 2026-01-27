/* global describe, beforeEach, afterEach, it, expect */
import { createBulkAddModal } from '../bulkAddModal';

describe('bulkAddModal', () => {
  let modal;

  beforeEach(() => {
    document.body.innerHTML = '';
    modal = createBulkAddModal();
  });

  afterEach(() => {
    const modalElement = document.getElementById('bulk-add-modal');
    if (modalElement) {
      modalElement.remove();
    }
  });

  it('should create and show the modal', () => {
    modal.show();
    const modalElement = document.getElementById('bulk-add-modal');
    expect(modalElement).not.toBeNull();
    expect(modalElement.style.display).toBe('block');
  });

  it('should hide the modal when the close button is clicked', () => {
    modal.show();
    const modalElement = document.getElementById('bulk-add-modal');
    const closeButton = modalElement.querySelector('.close-button');
    closeButton.click();
    expect(modalElement.style.display).toBe('none');
  });
});
