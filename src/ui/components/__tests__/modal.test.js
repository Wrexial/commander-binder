import { describe, it, expect, afterEach } from 'vitest';
import { createModal } from '../modal.js';

describe('createModal', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('creates a backdrop holding a labelled dialog in the body', () => {
    const { modal } = createModal({ className: 'bulk-modal', ariaLabel: 'Test' });

    const backdrop = document.querySelector('.list-modal-backdrop');
    expect(backdrop).not.toBeNull();
    expect(backdrop.contains(modal)).toBe(true);
    expect(modal.classList.contains('list-modal')).toBe(true);
    expect(modal.classList.contains('bulk-modal')).toBe(true);
    expect(modal.getAttribute('aria-label')).toBe('Test');
  });

  it('closes on close() and runs the onClose callback exactly once', () => {
    let closes = 0;
    const { close } = createModal({ onClose: () => closes++ });

    close();
    close();

    expect(document.querySelector('.list-modal-backdrop')).toBeNull();
    expect(closes).toBe(1);
  });

  it('closes on Escape', () => {
    createModal({});
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.list-modal-backdrop')).toBeNull();
  });

  it('closes on a backdrop click but not a content click', () => {
    const { modal } = createModal({});

    modal.click();
    expect(document.querySelector('.list-modal-backdrop')).not.toBeNull();

    document.querySelector('.list-modal-backdrop').click();
    expect(document.querySelector('.list-modal-backdrop')).toBeNull();
  });
});
