// src/components/GuestModeText.js
export function createGuestModeText() {
  const guestModeText = document.createElement('div');
  guestModeText.textContent = 'Guest Mode';
  guestModeText.className = 'guest-mode-text';
  return guestModeText;
}
