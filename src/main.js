// main.js
import { appState } from './state/appState.js';
import { initLazyCards } from './ui/lazyCardLoader.js';
import { initCardSettings } from "./ui/settingsUI.js";
import { loadCardStates } from "./state/cardState.js";
import { initSearch } from './ui/search.js';
import { initClerk, getClerk } from './auth/clerk.js';
import { createSignInButton } from './ui/components/SignInButton.js';
import { createGuestModeText } from './ui/components/GuestModeText.js';
import { updateOwnedCounter } from './ui/components/ownedCounter.js';
import { initCardInteractions } from './ui/cardInteractions.js';
import { 
  createExportOwnedButton, 
  createBulkAddButton, 
  createBulkCheckButton, 
  updateAllBinderCounts,
} from './ui/layout.js';
import { createBulkAddModal } from './ui/components/bulkAddModal.js';
import { createBulkCheckModal } from './ui/components/bulkCheckModal.js';
import { updateAllCardStates } from './ui/cards.js';
import { showToast } from './ui/components/toast.js';
import { showStatisticsModal } from './ui/statistics.js';
import { initSidebar, addButtonToSidebar } from './ui/components/sidebar.js';

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

function setupAuthenticatedUser(userButtonDiv, clerk) {
  clerk.mountUserButton(userButtonDiv);
  mainState.isLoggedIn = true;
  mainState.loggedInUserId = clerk.user.id;
  updateOwnedCounter();
  addButtonToSidebar('Share', () => {
    const url = new URL(window.location.href);
    url.searchParams.set('user', mainState.loggedInUserId);
    navigator.clipboard.writeText(url.href);
    showToast("Link copied to clipboard!");
  });

  addButtonToSidebar('Show Statistics', showStatisticsModal);

  createBulkAddButton(showBulkAddModal);
}

export async function setupUI() {
  const clerk = getClerk();
  const userActionsContainer = document.getElementById('user-actions');
  const openBtn = document.getElementById('openbtn');
  const sidebar = document.getElementById('sidebar');

  // Clear previous state
  userActionsContainer.innerHTML = '';
  sidebar.innerHTML = '';

  if (mainState.guestUserId) {
    const guestModeText = createGuestModeText();
    userActionsContainer.appendChild(guestModeText);
    addButtonToSidebar('Show Statistics', showStatisticsModal);
    appState.isViewOnlyMode = true;
    if (openBtn) openBtn.style.display = 'block';
  } else if (clerk.user) {
    const userButtonDiv = document.createElement('div');
    userButtonDiv.id = 'user-button';
    userActionsContainer.appendChild(userButtonDiv);
    setupAuthenticatedUser(userButtonDiv, clerk);
    if (openBtn) openBtn.style.display = 'block';
  } else {
    const signInButton = createSignInButton(clerk);
    userActionsContainer.appendChild(signInButton);
    mainState.loggedInUserId = undefined;
    appState.isViewOnlyMode = true;
    if (openBtn) openBtn.style.display = 'none';
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  initSidebar();
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
  createBulkCheckButton(showBulkCheckModal);
  createExportOwnedButton();

  initCardSettings();
  initSearch();
  initCardInteractions(results, tooltip);
});
