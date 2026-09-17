// main.js
import { appState } from './state/appState.js';
import { initLazyCards } from './ui/lazyCardLoader.js';
import { initCardSettings } from './ui/settingsUI.js';
import { loadCardStates } from './state/cardState.js';
import { initSearch } from './ui/search.js';
import { initClerk, getClerk } from './auth/clerk.js';
import { createSignInButton } from './ui/components/SignInButton.js';
import { createGuestModeText } from './ui/components/GuestModeText.js';
import { createGuestWelcome } from './ui/components/GuestWelcome.js';
import { isGuestWelcomeDismissed } from './state/onboarding.js';
import { updateOwnedCounter } from './ui/components/ownedCounter.js';
import { initCardInteractions } from './ui/cardInteractions.js';
import {
  createExportOwnedButton,
  createBulkAddButton,
  createBulkCheckButton,
  updateAllBinderCounts,
} from './ui/layout.js';
import { updateAllCardStates } from './ui/cards.js';
import { showToast } from './ui/components/toast.js';
import { getShareToken } from './api/share.js';
import { initSidebar, addButtonToSidebar } from './ui/components/sidebar.js';
import { initViewportMetrics } from './utils/viewport.js';
import { initScrollPosition } from './ui/scrollPosition.js';
import { initYearScrubber } from './ui/yearScrubber.js';
import { mainState } from './state/mainState.js';

/**
 * The bulk and statistics dialogs are the heaviest UI modules (hundreds of
 * lines each), so they are pulled in on demand rather than shipping in the
 * first bundle. Vite emits them as separate chunks.
 */
const loadBulkAddModal = async () =>
  (await import('./ui/components/bulkCardModal.js')).createBulkAddModal();
const loadBulkCheckModal = async () =>
  (await import('./ui/components/bulkCardModal.js')).createBulkCheckModal();

async function showStatistics() {
  const { showStatisticsModal } = await import('./ui/statistics.js');
  await showStatisticsModal();
}

async function showModal(loadModal) {
  const modal = await loadModal();
  if (modal) {
    modal.show();
  }
}

function setupAuthenticatedUser(userButtonDiv, clerk) {
  clerk.mountUserButton(userButtonDiv);
  mainState.loggedInUserId = clerk.user.id;
  updateOwnedCounter();

  addButtonToSidebar('🔗 Share', async () => {
    try {
      const token = await getShareToken();
      const url = new URL(window.location.href);
      url.searchParams.delete('user');
      url.searchParams.set('share', token);
      await navigator.clipboard.writeText(url.href);
      showToast('Link copied to clipboard!');
    } catch (err) {
      console.error('Failed to create share link:', err);
      showToast('Could not create a share link.', 'error');
    }
  });

  addButtonToSidebar('♻️ Regenerate Share Link', async () => {
    try {
      await getShareToken({ regenerate: true });
      showToast('Share link regenerated. Old links no longer work.', 'success');
    } catch (err) {
      console.error('Failed to regenerate share link:', err);
      showToast('Could not regenerate the share link.', 'error');
    }
  });

  addButtonToSidebar('📊 Show Statistics', showStatistics);

  createBulkAddButton(() => showModal(loadBulkAddModal));
}

/**
 * Show/hide the sidebar hamburger and flag the body so the mobile top bars can
 * reserve room for it (the button is fixed, so it would otherwise overlap the
 * header logo and the sticky search bar).
 * @param {HTMLElement|null} button
 * @param {boolean} visible
 */
function setHamburgerVisible(button, visible) {
  if (button) button.style.display = visible ? 'block' : 'none';
  document.body.classList.toggle('has-hamburger', visible);
}

export async function setupUI() {
  const clerk = getClerk();
  const userActionsContainer = document.getElementById('user-actions');
  const openBtn = document.getElementById('openbtn');
  const sidebar = document.getElementById('sidebar');
  const welcomeMount = document.getElementById('guest-welcome');

  // Clear previous state
  userActionsContainer.innerHTML = '';
  sidebar.innerHTML = '';
  welcomeMount?.replaceChildren();

  if (mainState.shareToken) {
    const guestModeText = createGuestModeText();
    userActionsContainer.appendChild(guestModeText);
    addButtonToSidebar('📊 Show Statistics', showStatistics);
    appState.isViewOnlyMode = true;
    setHamburgerVisible(openBtn, true);
  } else if (clerk.user) {
    const userButtonDiv = document.createElement('div');
    userButtonDiv.id = 'user-button';
    userActionsContainer.appendChild(userButtonDiv);
    setupAuthenticatedUser(userButtonDiv, clerk);
    setHamburgerVisible(openBtn, true);
  } else {
    const signInButton = createSignInButton(clerk);
    userActionsContainer.appendChild(signInButton);
    mainState.loggedInUserId = undefined;
    appState.isViewOnlyMode = true;
    setHamburgerVisible(openBtn, false);
    renderGuestWelcome(clerk, welcomeMount);
  }
}

/**
 * First-run prompt for signed-out visitors, shown once until dismissed or they
 * sign in. Share-token guests get the separate "Guest Mode" indicator instead.
 * @param {object} clerk
 * @param {HTMLElement|null} mount
 */
function renderGuestWelcome(clerk, mount) {
  if (!mount || isGuestWelcomeDismissed()) return;

  mount.appendChild(
    createGuestWelcome({
      onSignIn: () => clerk.openSignIn(),
      onDismiss: () => mount.replaceChildren(),
    })
  );
}

document.addEventListener('DOMContentLoaded', async () => {
  initSidebar();
  await initClerk();
  const urlParams = new URLSearchParams(window.location.search);
  mainState.shareToken = urlParams.get('share');
  const tooltip = document.getElementById('tooltip');
  const results = document.getElementById('results');

  await setupUI();
  initScrollPosition();

  // Load saved marks in parallel with the card grid so Clerk/Netlify/DB
  // latency does not delay the first cards. Marks are re-applied here once
  // the owned state arrives (cards may already be rendered).
  loadCardStates()
    .then(() => {
      updateAllCardStates();
      updateAllBinderCounts();
      updateOwnedCounter();
    })
    .catch((err) => console.error('Failed to load card states:', err));

  initLazyCards(results, tooltip);
  initYearScrubber();
  updateAllBinderCounts();
  createBulkCheckButton(() => showModal(loadBulkCheckModal));
  createExportOwnedButton();

  initCardSettings();
  initViewportMetrics();
  initSearch();
  initCardInteractions(results, tooltip);
});
