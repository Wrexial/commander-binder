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
import { initCardInteractions } from './cardInteractions.js';
import { createGlobalExportButton } from './layout.js';

export const mainState = {
  loggedInUserId: undefined,
  isLoggedIn: false,
  guestUserId: undefined,
};

function setupAuthenticatedUser(userButtonDiv, userActionsDiv, clerk) {
  clerk.mountUserButton(userButtonDiv);
  mainState.isLoggedIn = true;
  mainState.loggedInUserId = clerk.user.id;
  updateOwnedCounter();
  const shareButton = createShareButton(mainState.loggedInUserId);
  userActionsDiv.appendChild(shareButton);
  shareButton.classList.remove('hidden');
}

export async function setupUI() {
  const clerk = getClerk();
  const userActionsDiv = document.createElement('div');
  userActionsDiv.className = 'user-actions';

  const userButtonDiv = document.createElement('div');
  userButtonDiv.id = 'user-button';
  userActionsDiv.appendChild(userButtonDiv);

  if (mainState.guestUserId) {
    const guestModeText = createGuestModeText();
    userButtonDiv.appendChild(guestModeText);
    appState.isViewOnlyMode = true;
  } else if (clerk.user) {
    setupAuthenticatedUser(userButtonDiv, userActionsDiv, clerk);
  } else {
    const signInButton = createSignInButton(clerk);
    userButtonDiv.appendChild(signInButton);
    mainState.loggedInUserId = undefined;
    appState.isViewOnlyMode = true;
  }
  document.querySelector('.main-header').insertAdjacentElement('afterend', userActionsDiv);
}

document.addEventListener("DOMContentLoaded", async () => {
  await initClerk();
  const urlParams = new URLSearchParams(window.location.search);
  mainState.guestUserId = urlParams.get('user');
  const tooltip = document.getElementById("tooltip");
  const results = document.getElementById("results");

  await setupUI();
  await loadCardStates();

  initCardSettings();
  createGlobalExportButton();
  initSearch();
  initCardInteractions(results, tooltip);
  initLazyCards(results, tooltip);
});
