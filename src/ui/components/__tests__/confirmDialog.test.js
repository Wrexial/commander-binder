import { describe, it, expect, afterEach, vi } from 'vitest';
import { confirmDialog } from '../confirmDialog.js';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  document.body.className = '';
});

/** The button inside the open dialog whose label is `text`. */
function button(text) {
  return [...document.querySelectorAll('.confirm-modal button')].find(
    (candidate) => candidate.textContent === text
  );
}

describe('confirmDialog', () => {
  it('renders the title and message and confirms', async () => {
    const result = confirmDialog({
      title: 'Delete binder?',
      message: 'Delete “Trade”?',
      danger: true,
    });

    expect(document.querySelector('.confirm-modal h2').textContent).toBe('Delete binder?');
    expect(document.querySelector('.confirm-modal-message').textContent).toBe('Delete “Trade”?');

    button('Confirm').click();

    await expect(result).resolves.toBe(true);
    expect(document.querySelector('.list-modal-backdrop')).toBeNull();
  });

  it('resolves false when cancelled', async () => {
    const result = confirmDialog({ message: 'Delete it?' });

    button('Cancel').click();

    await expect(result).resolves.toBe(false);
  });

  it('resolves false on Escape', async () => {
    const result = confirmDialog({ message: 'Delete it?' });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    await expect(result).resolves.toBe(false);
  });

  it('resolves false when the backdrop is clicked', async () => {
    const result = confirmDialog({ message: 'Delete it?' });

    document.querySelector('.list-modal-backdrop').click();

    await expect(result).resolves.toBe(false);
  });

  it('focuses the cancel button first so a destructive action is not one Enter away', () => {
    confirmDialog({ message: 'Delete it?', danger: true });

    expect(document.activeElement.textContent).toBe('Cancel');
  });

  it('styles the confirm button by intent', () => {
    confirmDialog({ message: 'Delete it?', danger: true });
    expect(button('Confirm').classList.contains('danger')).toBe(true);

    document.body.innerHTML = '';
    confirmDialog({ message: 'Keep going?' });
    expect(button('Confirm').classList.contains('primary')).toBe(true);
  });
});
