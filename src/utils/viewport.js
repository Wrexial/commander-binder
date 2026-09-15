// src/utils/viewport.js
//
// Publishes live viewport measurements as CSS custom properties on <html> so
// stylesheets can position sticky/fixed UI without magic numbers.

export const STICKY_BAR_VAR = '--card-settings-height';
export const KEYBOARD_INSET_VAR = '--kb-inset';

function setRootVar(name, value) {
  document.documentElement.style.setProperty(name, value);
}

/**
 * Mirror an element's height into a CSS variable. Sticky elements (the binder
 * headers) sit directly below the toolbar instead of guessing its height, which
 * breaks as soon as the bar wraps or the user scales text.
 *
 * @param {HTMLElement|null} element
 * @param {string} [varName]
 * @returns {() => void} teardown
 */
export function trackStickyBarHeight(element, varName = STICKY_BAR_VAR) {
  if (!element) return () => {};

  let lastHeight = -1;
  const apply = () => {
    const height = Math.round(element.getBoundingClientRect().height);
    if (height === lastHeight) return; // avoid ResizeObserver feedback loops
    lastHeight = height;
    setRootVar(varName, `${height}px`);
  };

  apply();
  window.addEventListener('resize', apply);

  if (typeof ResizeObserver !== 'function') {
    return () => window.removeEventListener('resize', apply);
  }

  const observer = new ResizeObserver(apply);
  observer.observe(element);
  return () => {
    observer.disconnect();
    window.removeEventListener('resize', apply);
  };
}

/**
 * Publish how much of the layout viewport the on-screen keyboard covers, so
 * bottom-anchored UI (toasts, the search help sheet) is not hidden behind it on
 * iOS, where `position: fixed` ignores the keyboard by default.
 *
 * @returns {() => void} teardown
 */
export function trackKeyboardInset() {
  const viewport = window.visualViewport;
  if (!viewport) return () => {};

  let lastInset = -1;
  const apply = () => {
    const inset = Math.max(
      0,
      Math.round(window.innerHeight - viewport.height - viewport.offsetTop)
    );
    if (inset === lastInset) return;
    lastInset = inset;
    setRootVar(KEYBOARD_INSET_VAR, `${inset}px`);
  };

  apply();
  viewport.addEventListener('resize', apply);
  viewport.addEventListener('scroll', apply);
  return () => {
    viewport.removeEventListener('resize', apply);
    viewport.removeEventListener('scroll', apply);
  };
}

/**
 * Wire up every viewport tracker the UI depends on.
 *
 * @param {HTMLElement|null} [stickyBar] toolbar whose height the sticky sections follow
 * @returns {() => void} teardown
 */
export function initViewportMetrics(stickyBar = document.getElementById('card-settings')) {
  const stopStickyBar = trackStickyBarHeight(stickyBar);
  const stopKeyboard = trackKeyboardInset();
  return () => {
    stopStickyBar();
    stopKeyboard();
  };
}
