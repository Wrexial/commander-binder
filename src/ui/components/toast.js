import { getSetting } from '../../state/cardSettings.js';

/** Distance (px) a toast must be dragged before it is dismissed. */
const SWIPE_DISMISS_DISTANCE = 60;

/** How long the dismiss animation runs before the toast is torn down. */
const DISMISS_ANIMATION_MS = 200;

// ---------------- Swipe to dismiss (mobile) ----------------
// Any-direction swipe flings the toast away; a short drag springs back. The
// gesture can be turned off with the `swipeDismissToast` setting.
let swipe = null;
const swipeBound = new WeakSet();

function onSwipeStart(event) {
  if (!getSetting('swipeDismissToast')) return;

  const container = event.currentTarget;
  const touch = event.touches[0];
  if (!touch) return;

  swipe = { container, startX: touch.clientX, startY: touch.clientY, dx: 0, dy: 0 };
}

function onSwipeMove(event) {
  if (!swipe) return;
  const touch = event.touches[0];
  if (!touch) return;

  const dx = touch.clientX - swipe.startX;
  const dy = touch.clientY - swipe.startY;
  swipe.dx = dx;
  swipe.dy = dy;

  if (event.cancelable) event.preventDefault();

  const { container } = swipe;
  container.classList.add('dragging');
  container.style.transform = `translateX(-50%) translate(${dx}px, ${dy}px)`;
  container.style.opacity = String(Math.max(0.2, 1 - Math.hypot(dx, dy) / 220));
}

function onSwipeEnd(event) {
  if (!swipe) return;
  const { container, dx, dy } = swipe;
  swipe = null;

  container.classList.remove('dragging');

  if (event?.type !== 'touchcancel' && Math.hypot(dx, dy) >= SWIPE_DISMISS_DISTANCE) {
    // Fling the toast in the direction of the swipe, then tear it down — but
    // only if no newer toast has replaced it in the meantime.
    const hide = container._hide;
    container.style.transform = `translateX(-50%) translate(${dx * 3}px, ${dy * 3}px)`;
    container.style.opacity = '0';
    window.setTimeout(() => {
      if (container._hide === hide) hide?.();
    }, DISMISS_ANIMATION_MS);
    return;
  }

  // Snap back to the resting position.
  container.style.transform = '';
  container.style.opacity = '';
}

function bindToastSwipe(container) {
  if (swipeBound.has(container)) return;
  swipeBound.add(container);
  container.addEventListener('touchstart', onSwipeStart, { passive: true });
  // Not passive: a drag must not also scroll the page behind the toast.
  container.addEventListener('touchmove', onSwipeMove, { passive: false });
  container.addEventListener('touchend', onSwipeEnd);
  container.addEventListener('touchcancel', onSwipeEnd);
}

export function showToast(message, options = {}) {
  const container = document.getElementById('toast');
  if (!container) return;

  // `showToast(message, 'success')` is the common shorthand; a config object
  // carries the longer-lived actions. Accept either.
  const {
    duration = 4000,
    actionText,
    action,
    type,
  } = typeof options === 'string' ? { type: options } : options;

  // cancel any existing hide timeout so an old timer can't hide this new toast
  if (container._hideTimeout) {
    clearTimeout(container._hideTimeout);
    container._hideTimeout = null;
  }

  // Clear anything a previous swipe left behind.
  container.classList.remove('dragging');
  container.style.transform = '';
  container.style.opacity = '';
  container.innerHTML = '';

  const msg = document.createElement('span');
  msg.className = 'toast-message';
  msg.textContent = message;
  container.appendChild(msg);

  if (actionText && typeof action === 'function') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action';
    btn.textContent = actionText;
    btn.addEventListener('click', () => {
      action();
      hide();
    });
    container.appendChild(btn);
  }

  // An explicit dismiss control: swipe needs a touch screen and the auto-hide
  // timer is too short to read a long message.
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'toast-close';
  close.setAttribute('aria-label', 'Dismiss notification');
  close.title = 'Dismiss';
  close.innerHTML = '&times;';
  close.addEventListener('click', () => hide());
  container.appendChild(close);

  container.dataset.type = type || '';

  bindToastSwipe(container);
  container._hide = hide;

  container.classList.add('show');

  const hideTimeout = setTimeout(hide, duration);
  container._hideTimeout = hideTimeout;

  function hide() {
    if (container._hideTimeout) {
      clearTimeout(container._hideTimeout);
      container._hideTimeout = null;
    }
    container.classList.remove('show', 'dragging');
    container.style.transform = '';
    container.style.opacity = '';
    container.innerHTML = '';
    container._hide = null;
  }

  return { hide };
}

export function showUndo(message, undoAction, options = {}) {
  return showToast(message, { actionText: 'Undo', action: undoAction, ...options });
}
