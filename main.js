// main.js
import { initLazyCards } from './init.js';
import { initCardSettings } from "./settingsUI.js";
import { loadCardStates } from "./cardState.js";
import { initSearch } from './search.js';
import { Clerk } from "@clerk/clerk-js";
import { updateOwnedCounter } from './ui/ownedCounter.js';

export var loggedInUserId = undefined;
export var isLoggedIn = false;
document.addEventListener("DOMContentLoaded", async () => {
  const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  const clerk = new Clerk(clerkPubKey);
  await clerk.load({
    // Set load options here
  });

  if (clerk.isSignedIn) {
    const userButtonDiv = document.getElementById('user-button');
    clerk.mountUserButton(userButtonDiv);
    isLoggedIn = true;
    loggedInUserId = clerk.user.id;

    const tooltip = document.getElementById("tooltip");
    const results = document.getElementById("results");

    await loadCardStates();
    initCardSettings(tooltip);
    initSearch();
    updateOwnedCounter();
    initLazyCards(results, tooltip);
  } else {
    loggedInUserId = false;
    const signInDiv = document.getElementById('sign-in');
    signInDiv.style.display = 'block';
    clerk.mountSignIn(signInDiv);
  }
});
