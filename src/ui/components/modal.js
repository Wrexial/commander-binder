/**
 * Shared modal shell used by the bulk, export and statistics dialogs.
 *
 * Creates the backdrop and dialog elements and wires up the common dismissal
 * behaviour (Escape, clicking the backdrop) so each modal only has to build its
 * own content. The caller appends content to `modal` and calls `close()` (or
 * wires it to a button).
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
  if (ariaLabel) modal.setAttribute('aria-label', ariaLabel);

  let closed = false;
  // A drag that starts inside the dialog and ends on the backdrop produces a
  // click on the backdrop; that is a scroll, not a dismissal.
  let pressStartedInside = false;

  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', handleKeyDown);
    backdrop.remove();
    onClose?.();
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') close();
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
  document.body.appendChild(backdrop);

  return {
    modal,
    close,
    show: () => {
      backdrop.style.display = 'block';
    },
  };
}
