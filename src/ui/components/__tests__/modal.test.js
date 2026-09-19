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

  it('starts hidden and is revealed by show()', () => {
    const { show } = createModal({});
    const backdrop = document.querySelector('.list-modal-backdrop');

    expect(backdrop.style.display).toBe('none');
    show();
    expect(backdrop.style.display).toBe('block');
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

  it('ignores the backdrop click produced by a drag that began inside the dialog', () => {
    const { modal } = createModal({});

    // Press inside the dialog (scrolling its content), release on the backdrop.
    modal.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    document.querySelector('.list-modal-backdrop').click();

    expect(document.querySelector('.list-modal-backdrop')).not.toBeNull();
  });

  it('closes on the next backdrop tap once the drag-click has been swallowed', () => {
    const { modal } = createModal({});

    modal.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    document.querySelector('.list-modal-backdrop').click();
    document.querySelector('.list-modal-backdrop').click();

    expect(document.querySelector('.list-modal-backdrop')).toBeNull();
  });

  it('moves focus into the dialog on show()', () => {
    const { modal, show } = createModal({});
    const first = document.createElement('button');
    const second = document.createElement('button');
    modal.append(first, second);

    show();

    expect(document.activeElement).toBe(first);
  });

  it('focuses the dialog itself when it has no controls', () => {
    const { modal, show } = createModal({});

    show();

    expect(document.activeElement).toBe(modal);
  });

  it('traps Tab inside the dialog', () => {
    const { modal, show } = createModal({});
    const first = document.createElement('button');
    const last = document.createElement('button');
    modal.append(first, last);
    show();

    last.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(first);

    first.focus();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true })
    );
    expect(document.activeElement).toBe(last);
  });

  it('restores focus to the trigger on close', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();

    const { show, close } = createModal({});
    show();
    close();

    expect(document.activeElement).toBe(trigger);
  });

  it('falls back to the page chrome when the trigger is no longer visible', () => {
    const trigger = document.createElement('button');
    const hamburger = document.createElement('button');
    hamburger.id = 'openbtn';
    document.body.append(trigger, hamburger);
    trigger.focus();

    const { show, close } = createModal({});
    show();
    trigger.style.visibility = 'hidden';
    close();

    expect(document.activeElement).toBe(hamburger);
  });
});
