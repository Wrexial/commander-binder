// src/ui/components/confirmDialog.js
/**
 * A promise-based confirmation dialog built on the shared modal shell. It
 * replaces the blocking, unthemed `window.confirm` used for destructive actions
 * so they match the rest of the app and keep the focus trap.
 */
import { createModal } from './modal.js';

/**
 * Ask the visitor to confirm an action.
 *
 * @param {object} options
 * @param {string} options.message Body text describing the action.
 * @param {string} [options.title='Are you sure?'] Dialog heading.
 * @param {string} [options.confirmText='Confirm'] Confirm button label.
 * @param {string} [options.cancelText='Cancel'] Cancel button label.
 * @param {boolean} [options.danger=false] Style the confirm button as destructive.
 * @returns {Promise<boolean>} `true` when confirmed; `false` on cancel, Escape or
 *   a backdrop click.
 */
export function confirmDialog({
  message,
  title = 'Are you sure?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    let confirmed = false;

    const { modal, show, close } = createModal({
      className: 'confirm-modal',
      ariaLabel: title,
      // Resolve once, however the dialog was dismissed.
      onClose: () => resolve(confirmed),
    });

    const header = document.createElement('div');
    header.className = 'bulk-modal-header';
    const heading = document.createElement('h2');
    heading.textContent = title;
    header.appendChild(heading);

    const body = document.createElement('p');
    body.className = 'confirm-modal-message';
    body.textContent = message;

    const footer = document.createElement('div');
    footer.className = 'modal-button-container';

    // Cancel is first in DOM order, so the modal's initial focus lands there —
    // a destructive action is never one Enter press away.
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = cancelText;
    cancelButton.addEventListener('click', close);

    const confirmButton = document.createElement('button');
    confirmButton.type = 'button';
    confirmButton.className = danger ? 'danger' : 'primary';
    confirmButton.textContent = confirmText;
    confirmButton.addEventListener('click', () => {
      confirmed = true;
      close();
    });

    footer.append(cancelButton, confirmButton);
    modal.append(header, body, footer);

    show();
  });
}
