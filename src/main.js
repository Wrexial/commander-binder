// main.js
import { appState } from './appState.js';
import { initLazyCards } from './lazyCardLoader.js';
import { initCardSettings } from "./settingsUI.js";
import { loadCardStates } from "./cardState.js";
import { initSearch } from './search.js';
import { initClerk, getClerk } from './clerk.js';
import { createSignInButton } from './components/SignInButton.js';
import { createGuestModeText } from './components/GuestModeText.js';
import { createShareButton } from './components/ShareButton.js';
import { updateOwnedCounter } from './ui/ownedCounter.js';
import { showToast } from './ui/toast.js';

export let loggedInUserId = undefined;
export let isLoggedIn = false;
export let guestUserId = undefined;

async function setupUI() {
  const clerk = getClerk();
  const userActionsDiv = document.createElement('div');
  userActionsDiv.className = 'user-actions';

  const userButtonDiv = document.createElement('div');
  userButtonDiv.id = 'user-button';
  userActionsDiv.appendChild(userButtonDiv);

  if (guestUserId) {
    const guestModeText = createGuestModeText();
    userButtonDiv.appendChild(guestModeText);
    appState.isViewOnlyMode = true;
  } else if (clerk.user) {
    setupAuthenticatedUser(userButtonDiv, userActionsDiv, clerk);
  } else {
    const signInButton = createSignInButton(clerk);
    userButtonDiv.appendChild(signInButton);
    loggedInUserId = undefined;
    appState.isViewOnlyMode = true;
  }
  document.querySelector('.main-header').insertAdjacentElement('afterend', userActionsDiv);
}

function setupAuthenticatedUser(userButtonDiv, userActionsDiv, clerk) {
  clerk.mountUserButton(userButtonDiv);
  isLoggedIn = true;
  loggedInUserId = clerk.user.id;
  updateOwnedCounter();
  const shareButton = createShareButton(loggedInUserId);
  userActionsDiv.appendChild(shareButton);
  shareButton.classList.remove('hidden');
}

import { initCardInteractions } from './cardInteractions.js';

document.addEventListener("DOMContentLoaded", async () => {
  await initClerk();
  const urlParams = new URLSearchParams(window.location.search);
  guestUserId = urlParams.get('user');
  const tooltip = document.getElementById("tooltip");
  const results = document.getElementById("results");

  await setupUI();
  await loadCardStates();

  initCardSettings(tooltip);
  initSearch();
  initCardInteractions(results, tooltip);
  initLazyCards(results, tooltip);
});
