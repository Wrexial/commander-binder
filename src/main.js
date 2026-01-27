// main.js
import { appState } from './state/appState.js';
import { initLazyCards } from './ui/lazyCardLoader.js';
import { initCardSettings } from "./ui/settingsUI.js";
import { loadCardStates } from "./state/cardState.js";
import { initSearch } from './ui/search.js';
import { initClerk, getClerk } from './auth/clerk.js';
import { createSignInButton } from './ui/components/SignInButton.js';
import { createGuestModeText } from './ui/components/GuestModeText.js';
import { createShareButton } from './ui/components/ShareButton.js';
import { updateOwnedCounter } from './ui/components/ownedCounter.js';
import { initCardInteractions } from './ui/cardInteractions.js';
import { createGlobalExportButton, createGlobalExportOwnedButton, createGlobalBulkAddButton, createGlobalBulkCheckButton, updateAllBinderCounts } from './ui/layout.js';
import { createBulkAddModal } from './ui/components/bulkAddModal.js';
import { createBulkCheckModal } from './ui/components/bulkCheckModal.js';
import { updateAllCardStates } from './ui/cards.js';
import { showStatisticsModal } from './ui/statistics.js';

async function showBulkAddModal() {
  const modal = await createBulkAddModal();
  if (modal) {
    modal.show();
  }
}

async function showBulkCheckModal() {
  const modal = await createBulkCheckModal();
  if (modal) {
    modal.show();
  }
}

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

  const statsButton = document.createElement('button');
  statsButton.textContent = 'Show Statistics';
  statsButton.className = 'stats-button';
  statsButton.addEventListener('click', showStatisticsModal);
  userActionsDiv.appendChild(statsButton);

  createGlobalBulkAddButton(showBulkAddModal);
  
  shareButton.classList.remove('hidden');
}

export async function setupUI() {
  const clerk = getClerk();
  const userActionsDiv = document.getElementById('user-actions');

  const userButtonDiv = document.createElement('div');
  userButtonDiv.id = 'user-button';
  userActionsDiv.appendChild(userButtonDiv);

  if (mainState.guestUserId) {
    const guestModeText = createGuestModeText();
    userButtonDiv.appendChild(guestModeText);
    const statsButton = document.createElement('button');
    statsButton.textContent = 'Show Statistics';
    statsButton.className = 'stats-button';
    statsButton.addEventListener('click', showStatisticsModal);
    userActionsDiv.appendChild(statsButton);
    appState.isViewOnlyMode = true;
  } else if (clerk.user) {
    setupAuthenticatedUser(userButtonDiv, userActionsDiv, clerk);
  } else {
    const signInButton = createSignInButton(clerk);
    userButtonDiv.appendChild(signInButton);
    mainState.loggedInUserId = undefined;
    appState.isViewOnlyMode = true;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await initClerk();
  const urlParams = new URLSearchParams(window.location.search);
  mainState.guestUserId = urlParams.get('user');
  const tooltip = document.getElementById("tooltip");
  const results = document.getElementById("results");

  await setupUI();
  await loadCardStates();
  updateAllCardStates();
  
  initLazyCards(results, tooltip);
  updateAllBinderCounts();

  initCardSettings();
  createGlobalBulkCheckButton(showBulkCheckModal);
  createGlobalExportOwnedButton();
  createGlobalExportButton();
  initSearch();
  initCardInteractions(results, tooltip);
});
