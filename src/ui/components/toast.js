export function showToast(message, { duration = 4000, actionText, action } = {}) {
  const container = document.getElementById('toast');
  if (!container) return;

  // cancel any existing hide timeout so an old timer can't hide this new toast
  if (container._hideTimeout) {
    clearTimeout(container._hideTimeout);
    container._hideTimeout = null;
  }

  container.innerHTML = '';
  const msg = document.createElement('span');
  msg.className = 'toast-message';
  msg.textContent = message;
  container.appendChild(msg);

  if (actionText && typeof action === 'function') {
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.textContent = actionText;
    btn.addEventListener('click', () => {
      action();
      hide();
    });
    container.appendChild(btn);
  }

  container.classList.add('show');

  const hideTimeout = setTimeout(hide, duration);
  container._hideTimeout = hideTimeout;

  function hide() {
    if (container._hideTimeout) {
      clearTimeout(container._hideTimeout);
      container._hideTimeout = null;
    }
    container.classList.remove('show');
    container.innerHTML = '';
  }

  return { hide };
}

export function showUndo(message, undoAction, options = {}) {
  return showToast(message, { actionText: 'Undo', action: undoAction, ...options });
}