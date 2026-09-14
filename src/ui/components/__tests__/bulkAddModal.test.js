import { describe, beforeEach, afterEach, it, expect } from 'vitest';
import { createBulkAddModal } from '../bulkCardModal.js';

describe('bulkAddModal', () => {
  let modal;

  beforeEach(async () => {
    document.body.innerHTML = '';
    modal = await createBulkAddModal();
  });

  afterEach(() => {
    modal?.destroy?.();
    document.body.innerHTML = '';
  });

  it('should create and show the modal', () => {
    modal.show();

    const backdrop = document.querySelector('.list-modal-backdrop');
    expect(backdrop).not.toBeNull();
    expect(backdrop.style.display).toBe('block');
  });

  it('should remove the modal when the close button is clicked', () => {
    modal.show();

    const closeButton = Array.from(
      document.querySelectorAll('.modal-button-container button')
    ).find((button) => button.textContent === 'Close');
    expect(closeButton).not.toBeUndefined();

    closeButton.click();

    expect(document.querySelector('.list-modal-backdrop')).toBeNull();
  });
});
