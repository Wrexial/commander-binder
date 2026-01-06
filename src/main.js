// main.js
import { appState } from './appState.js';
import { initLazyCards } from './lazyCardLoader.js';
import { initCardSettings } from "./settingsUI.js";
import { loadCardStates } from "./cardState.js";
import { initSearch } from './search.js';
import { Clerk } from "@clerk/clerk-js";
import { updateOwnedCounter } from './ui/ownedCounter.js';
import { clerkDarkTheme } from './clerk-dark-theme.js';
import { showToast } from './ui/toast.js';

export var loggedInUserId = undefined;
export var isLoggedIn = false;
export var guestUserId = undefined;
document.addEventListener("DOMContentLoaded", async () => {
  const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  const clerk = new Clerk(clerkPubKey);
  await clerk.load({
    // Set load options here
  });

  const urlParams = new URLSearchParams(window.location.search);
  guestUserId = urlParams.get('user');
  if (guestUserId) {
    appState.isViewOnlyMode = true;
  }

  const tooltip = document.getElementById("tooltip");
  const results = document.getElementById("results");

  if (clerk.isSignedIn) {
    const userButtonDiv = document.getElementById('user-button');
    clerk.mountUserButton(userButtonDiv, { appearance: clerkDarkTheme });
    isLoggedIn = true;
    loggedInUserId = clerk.user.id;
    updateOwnedCounter();

    if (!guestUserId) {
      const shareButton = document.getElementById('share-button');
      shareButton.classList.remove('hidden');
      shareButton.addEventListener('click', () => {
        const url = new URL(window.location.href);
        url.searchParams.set('user', loggedInUserId);
        navigator.clipboard.writeText(url.href);
        showToast("Link copied to clipboard!");
      });
    }
  } else {
    loggedInUserId = undefined;
    appState.isViewOnlyMode = true;
    const userButtonDiv = document.getElementById('user-button');
    const signInButton = document.createElement('button');
    signInButton.textContent = 'Sign In';
    signInButton.className = 'sign-in-button';
    signInButton.addEventListener('click', () => clerk.openSignIn());
    userButtonDiv.appendChild(signInButton);
  }

  await loadCardStates();
  initCardSettings(tooltip);
  initSearch();
  initLazyCards(results, tooltip);
});
