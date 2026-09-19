/**
 * Selector for the controls a modal can move focus between, in DOM order.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Shared modal shell used by the bulk, export and statistics dialogs.
 *
 * Creates the backdrop and dialog elements and wires up the common behaviour:
 * dismissal (Escape, clicking the backdrop), a focus trap, and moving focus into
 * the dialog on `show()` and back to the trigger on close. Each modal only has
 * to build its own content.
 *
 * @param {{className?: string, ariaLabel?: string, onClose?: () => void}} [options]
 * @returns {{modal: HTMLElement, show: () => void, close: () => void}}
 */
export function createModal({ className = '', ariaLabel = '', onClose } = {}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'list-modal-backdrop';

  const modal = document.createElement('div');
  modal.className = `list-modal${className ? ` ${className}` : ''}`;
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  // Focusable as a fallback when the dialog has no controls of its own.
  modal.tabIndex = -1;
  if (ariaLabel) modal.setAttribute('aria-label', ariaLabel);

  // Captured before the dialog is focused so focus can be handed back.
  const returnFocusTo = document.activeElement;

  let closed = false;
  // A drag that starts inside the dialog and ends on the backdrop produces a
  // click on the backdrop; that is a scroll, not a dismissal.
  let pressStartedInside = false;

  function isVisible(el) {
    // Walk ancestors too: an element inside a `display:none` panel is not a
    // valid focus target even though its own display is fine.
    for (let node = el; node instanceof HTMLElement; node = node.parentElement) {
      if (node.hidden) return false;
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  }

  function focusable() {
    return Array.from(modal.querySelectorAll(FOCUSABLE_SELECTOR)).filter(isVisible);
  }

  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', handleKeyDown);
    backdrop.remove();
    restoreFocus();
    onClose?.();
  }

  /** Send focus back where it came from, or to the page chrome if that trigger
   *  is no longer visible (e.g. a modal opened from the now-closed sidebar). */
  function restoreFocus() {
    if (returnFocusTo && returnFocusTo.isConnected && isVisible(returnFocusTo)) {
      returnFocusTo.focus();
      return;
    }
    const fallback = document.getElementById('openbtn');
    if (fallback && isVisible(fallback)) fallback.focus();
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      close();
      return;
    }
    if (event.key !== 'Tab') return;

    const items = focusable();
    if (items.length === 0) {
      // Nothing to move to: keep focus on the dialog itself.
      event.preventDefault();
      modal.focus();
      return;
    }

    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;

    if (event.shiftKey) {
      if (active === first || !modal.contains(active)) {
        event.preventDefault();
        last.focus();
      }
    } else if (active === last || !modal.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  }

  modal.addEventListener('pointerdown', () => {
    pressStartedInside = true;
  });

  backdrop.addEventListener('click', (event) => {
    if (event.target !== backdrop) return;
    if (pressStartedInside) {
      pressStartedInside = false;
      return;
    }
    close();
  });
  document.addEventListener('keydown', handleKeyDown);

  backdrop.appendChild(modal);
  // Created hidden so a modal can be built once and shown later (e.g. the
  // Binder Builder's card picker). `show()` reveals it.
  backdrop.style.display = 'none';
  document.body.appendChild(backdrop);

  return {
    modal,
    close,
    show: () => {
      backdrop.style.display = 'block';
      (focusable()[0] ?? modal).focus();
    },
  };
}
