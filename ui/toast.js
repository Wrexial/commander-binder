export function showToast(message, { duration = 4000, actionText, action } = {}) {
  const container = document.getElementById('toast');
  if (!container) return;

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

  let hideTimeout = setTimeout(hide, duration);

  function hide() {
    clearTimeout(hideTimeout);
    container.classList.remove('show');
    container.innerHTML = '';
  }

  return { hide };
}

export function showUndo(message, undoAction, options = {}) {
  return showToast(message, { actionText: 'Undo', action: undoAction, ...options });
}