import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../toast.js', () => ({ showToast: vi.fn() }));

import { createExportModal } from '../exportModal.js';
import { showToast } from '../toast.js';

beforeEach(() => {
  document.body.innerHTML = '';
  showToast.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('exportModal', () => {
  it('lists the names sorted and copies the visible list', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });

    const modal = createExportModal(['Sol Ring', 'Arcane Signet']);
    modal.show();

    const rows = [...document.querySelectorAll('.bulk-row')].map((row) => row.textContent);
    expect(rows).toEqual(['Arcane Signet', 'Sol Ring']);

    document.querySelector('.export-copy').click();
    await Promise.resolve();
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith('Arcane Signet\nSol Ring');
    expect(showToast).toHaveBeenCalledWith('Copied 2 cards.', 'success');
  });

  it('filters the visible list while keeping the total', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });

    const modal = createExportModal(['Sol Ring', 'Arcane Signet', 'Mana Crypt']);
    modal.show();

    const input = document.querySelector('.bulk-search-input');
    input.value = 'arcane';
    input.dispatchEvent(new Event('input'));

    expect([...document.querySelectorAll('.bulk-row')].map((row) => row.textContent)).toEqual([
      'Arcane Signet',
    ]);
    expect(document.querySelector('.export-copy').textContent).toBe('Copy all 3 cards');

    const chips = [...document.querySelectorAll('.bulk-summary-chip')];
    expect(chips[1].textContent).toContain('3');

    // Filtering only affects the preview; Copy still exports everything.
    document.querySelector('.export-copy').click();
    await Promise.resolve();
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith('Arcane Signet\nMana Crypt\nSol Ring');
  });

  it('shows an empty state and disables the actions when there is nothing to export', () => {
    const modal = createExportModal([]);
    modal.show();

    expect(document.querySelector('.bulk-empty')).not.toBeNull();
    expect(document.querySelector('.export-copy').disabled).toBe(true);
    expect(document.querySelector('.export-download').disabled).toBe(true);
  });

  it('downloads the visible names as a text file', () => {
    const createObjectURL = vi.fn(() => 'blob:mock');
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    const modal = createExportModal(['Sol Ring']);
    modal.show();
    document.querySelector('.export-download').click();

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('Downloaded 1 card.', 'success');
  });

  it('closes on Escape', () => {
    const modal = createExportModal(['Sol Ring']);
    modal.show();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(document.querySelector('.list-modal-backdrop')).toBeNull();
  });
});
