// src/ui/pressIndicator.js
/**
 * A small ring that fills under the cursor while a mouse long-press is in
 * progress, so holding the button to open the preview has visible feedback.
 */

const RING_SIZE = 44;

let indicator = null;

function ensureIndicator() {
  if (indicator && indicator.isConnected) return indicator;

  indicator = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  indicator.setAttribute('class', 'press-indicator');
  indicator.setAttribute('viewBox', '0 0 36 36');
  indicator.setAttribute('aria-hidden', 'true');

  const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  track.setAttribute('class', 'press-indicator-track');
  track.setAttribute('cx', '18');
  track.setAttribute('cy', '18');
  track.setAttribute('r', '16');

  const fill = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  fill.setAttribute('class', 'press-indicator-fill');
  fill.setAttribute('cx', '18');
  fill.setAttribute('cy', '18');
  fill.setAttribute('r', '16');

  indicator.append(track, fill);
  document.body.appendChild(indicator);
  return indicator;
}

/**
 * Show the ring at a viewport point, drawing a full lap over `durationMs`.
 *
 * @param {number} clientX
 * @param {number} clientY
 * @param {number} durationMs
 */
export function showPressIndicator(clientX, clientY, durationMs) {
  const node = ensureIndicator();
  const half = RING_SIZE / 2;

  // Keep the ring fully on screen near the viewport edges.
  const x = Math.min(Math.max(clientX, half), window.innerWidth - half);
  const y = Math.min(Math.max(clientY, half), window.innerHeight - half);

  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
  node.style.setProperty('--press-duration', `${durationMs}ms`);
  node.classList.remove('active');
  // Force a reflow so the animation restarts even if the ring was just visible.
  void node.getBoundingClientRect();
  node.classList.add('active');
}

export function hidePressIndicator() {
  if (!indicator) return;
  indicator.classList.remove('active');
}
