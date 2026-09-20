// src/ui/__tests__/toast.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { showToast, showUndo } from '../toast';
import { getSetting, setSetting } from '../../../state/cardSettings.js';

/** jsdom has no TouchEvent; build an event carrying `touches`. */
function touch(type, clientX, clientY, { cancelable = true } = {}) {
  const event = new Event(type, { bubbles: true, cancelable });
  event.touches = [{ clientX, clientY }];
  return event;
}

describe('toast', () => {
  let toastContainer;

  beforeEach(() => {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast';
    document.body.appendChild(toastContainer);
    vi.useFakeTimers();
  });

  afterEach(() => {
    document.body.removeChild(toastContainer);
    vi.useRealTimers();
  });

  it('should show a toast with a message', () => {
    showToast('Hello, world!');
    expect(toastContainer.textContent).toContain('Hello, world!');
    expect(toastContainer.classList.contains('show')).toBe(true);
  });

  it('should hide the toast after the default duration', () => {
    showToast('Hello, world!');
    vi.runAllTimers();
    expect(toastContainer.classList.contains('show')).toBe(false);
  });

  it('should show a toast with an action button', () => {
    const action = vi.fn();
    showToast('Hello, world!', { actionText: 'Click me', action });
    const button = toastContainer.querySelector('.toast-action');
    expect(button.textContent).toBe('Click me');
    button.click();
    expect(action).toHaveBeenCalled();
  });

  it('accepts a bare type string and tags the toast for styling', () => {
    showToast('Saved', 'success');
    expect(toastContainer.dataset.type).toBe('success');
    vi.runAllTimers();
  });

  it('dismisses from the close control', () => {
    showToast('Hello');

    const close = toastContainer.querySelector('.toast-close');
    expect(close).not.toBeNull();
    close.click();

    expect(toastContainer.classList.contains('show')).toBe(false);
    expect(toastContainer.innerHTML).toBe('');
  });

  it('should show an undo toast', () => {
    const undoAction = vi.fn();
    showUndo('Action completed', undoAction);
    const button = toastContainer.querySelector('.toast-action');
    expect(button.textContent).toBe('Undo');
    button.click();
    expect(undoAction).toHaveBeenCalled();
  });

  it('dismisses the toast after a swipe in any direction', () => {
    showToast('Hello');

    toastContainer.dispatchEvent(touch('touchstart', 100, 100));
    toastContainer.dispatchEvent(touch('touchmove', 160, 130));

    expect(toastContainer.classList.contains('dragging')).toBe(true);
    expect(toastContainer.style.transform).toContain('translate');

    toastContainer.dispatchEvent(touch('touchend', 160, 130));
    // Animates away, then tears down.
    vi.advanceTimersByTime(250);

    expect(toastContainer.classList.contains('show')).toBe(false);
    expect(toastContainer.innerHTML).toBe('');
  });

  it('springs back when the swipe is too short', () => {
    showToast('Hello');

    toastContainer.dispatchEvent(touch('touchstart', 100, 100));
    toastContainer.dispatchEvent(touch('touchmove', 115, 108));
    toastContainer.dispatchEvent(touch('touchend', 115, 108));

    expect(toastContainer.classList.contains('dragging')).toBe(false);
    expect(toastContainer.style.transform).toBe('');
    expect(toastContainer.style.opacity).toBe('');
    expect(toastContainer.classList.contains('show')).toBe(true);

    vi.runAllTimers();
  });

  it('ignores swipes when swipe-dismiss is turned off', () => {
    const original = getSetting('swipeDismissToast');
    setSetting('swipeDismissToast', false);

    try {
      showToast('Hello');
      toastContainer.dispatchEvent(touch('touchstart', 100, 100));
      toastContainer.dispatchEvent(touch('touchmove', 200, 200));

      expect(toastContainer.classList.contains('dragging')).toBe(false);
    } finally {
      setSetting('swipeDismissToast', original);
      vi.runAllTimers();
    }
  });
});
