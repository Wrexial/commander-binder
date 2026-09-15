// src/utils/pointer.js

const HOVER_QUERY = '(hover: hover)';

/**
 * True when the device has a real pointer, so hover previews and right-click
 * shortcuts make sense. Touch devices synthesize mouse events, which is why the
 * media query — not the event type — is the reliable signal.
 *
 * @returns {boolean}
 */
export function isHoverCapable() {
  return typeof window.matchMedia === 'function' && window.matchMedia(HOVER_QUERY).matches;
}
