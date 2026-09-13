// src/components/GuestModeText.js

/**
 * Returns the site's base URL (no query string or hash), so exiting guest
 * view drops the `?share=<token>` parameter.
 */
export function getBaseUrl() {
  return window.location.origin + window.location.pathname;
}

/**
 * Builds the "Guest Mode" indicator together with an "Exit Guest View" button
 * that returns the visitor to the base site URL.
 *
 * @param {() => void} [onExit] Optional exit handler (defaults to navigating
 *   to the base URL). Useful for testing.
 */
export function createGuestModeText(onExit) {
  const container = document.createElement('div');
  container.className = 'guest-mode-container';

  const guestModeText = document.createElement('div');
  guestModeText.textContent = 'Guest Mode';
  guestModeText.className = 'guest-mode-text';

  const exitButton = document.createElement('button');
  exitButton.type = 'button';
  exitButton.textContent = 'Exit Guest View';
  exitButton.className = 'exit-guest-button';
  exitButton.addEventListener('click', () => {
    if (typeof onExit === 'function') {
      onExit();
      return;
    }
    window.location.href = getBaseUrl();
  });

  container.appendChild(guestModeText);
  container.appendChild(exitButton);
  return container;
}
