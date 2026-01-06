// cards.js
import { showTooltip, hideTooltip, positionTooltip } from './tooltip.js';
import { cardSettings } from "./cardSettings.js";
import { appState } from "./appState.js";
import { isCardMissing, toggleCardOwned, setCardsOwned } from "./cardState.js";
import {loggedInUserId} from './main.js';
import { getCardBorderStyle, getCardBackground } from './utils/colors.js';
import { showUndo } from './ui/toast.js';
import { updateOwnedCounter } from './ui/ownedCounter.js';
import { CARDS_PER_PAGE } from './config.js';


export function createCardElement(card, cardIndex) {
  const div = document.createElement("div");
  div.className = "card";
  div.cardData = card;

  const slotNumberEl = document.createElement('span');
  slotNumberEl.className = 'card-slot-number';
  slotNumberEl.textContent = `#${(cardIndex % CARDS_PER_PAGE) + 1}`;
  slotNumberEl.style.display = 'block';
  div.appendChild(slotNumberEl);

  const nameEl = document.createElement('span');
  nameEl.className = 'card-name';
  nameEl.textContent = card.name;
  div.appendChild(nameEl);

  if (card.related_uris?.edhrec) {
    const edhrecBtn = document.createElement("a");
    edhrecBtn.className = "edhrec-link";
    edhrecBtn.href = card.related_uris.edhrec;
    edhrecBtn.target = "_blank";
    edhrecBtn.rel = "noopener noreferrer";

    const icon = document.createElement("img");
    icon.src = "edhrec-icon.png";
    icon.alt = "EDHREC";

    edhrecBtn.appendChild(icon);
    div.appendChild(edhrecBtn);

    // If user enabled persistent reveal, show the EDHREC link by default
    if (cardSettings.persistentReveal) {
      div.classList.add('reveal-links');
    }
  }

  const borderStyle = getCardBorderStyle(card);
  div.style.setProperty('--card-border', borderStyle.borderColor);
  div.style.setProperty('--card-bg', getCardBackground(card));
  div.style.setProperty('--card-text', '#111111');

  if (!isCardMissing(card)) {
    div.classList.add("owned");
  }

  if (appState.isViewOnlyMode) {
    const ownedBadge = document.createElement('span');
    ownedBadge.className = 'owned-badge';
    ownedBadge.textContent = 'Owned';
    div.appendChild(ownedBadge);
    return div;
  }

  const toggleBtn = document.createElement("button");
  toggleBtn.className = "card-toggle";
  // Toggle indicates whether you own the card (checkmark when owned)
    toggleBtn.title = !isCardMissing(card) ? "Mark as missing" : "Mark as owned";
    toggleBtn.setAttribute('aria-label', !isCardMissing(card) ? 'Mark as missing' : 'Mark as owned');
    toggleBtn.setAttribute('aria-pressed', (!isCardMissing(card)).toString());
    // toggle button has no visible checkmark; owned state shown via badge
    toggleBtn.textContent = "";

    if (!isCardMissing(card)) {
      // visually indicate this card is owned by the user
      div.classList.add("owned");
    }

    div.appendChild(toggleBtn);

    // Owned badge (hidden by default, shown when .owned class present)
    const ownedBadge = document.createElement('span');
    ownedBadge.className = 'owned-badge';
    ownedBadge.textContent = 'Owned';
    div.appendChild(ownedBadge);

    // Reserve space / keep layout stable when toggles exist
    div.classList.add('has-toggle');
  
  return div;
}

export function attachCardHandlers(div, card, tooltip) {
  let pressTimer;

  if (cardSettings.showTooltip) {
    div.addEventListener("mouseenter", (e)=>{
      // announce tooltip for screen readers by linking the card to the tooltip
      div.setAttribute('aria-describedby', 'tooltip');
      showTooltip(e, card, tooltip);
    });

    div.addEventListener("mousemove", e =>{
      positionTooltip(e, tooltip);
    });

    div.addEventListener("mouseleave", () =>{
      hideTooltip(tooltip);
      div.removeAttribute('aria-describedby');
    });

    // keyboard accessibility: Enter/Space to activate toggle, 'r' to reveal EDHREC, Escape to hide tooltip
    div.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        div.click();
      } else if (e.key === 'r' || e.key === 'R') {
        div.classList.toggle('reveal-links');
      } else if (e.key === 'Escape') {
        hideTooltip(tooltip);
        div.removeAttribute('aria-describedby');
      }
    });
  }

  const edhrecBtn = div.querySelector('.edhrec-link');
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  if (edhrecBtn) {
    // On touch devices, require a long-press on the card to reveal the link.
    // When revealed, the link becomes tappable for a short window.
    if (isTouch) {
      let revealTimer;
      let hideTimer;
      let suppressUntil = 0; // timestamp until which card click/toggle is suppressed after a long-press

      const startReveal = (e) => {
        // start long-press timer to reveal
        clearTimeout(revealTimer);
        revealTimer = setTimeout(() => {
          div.classList.add('reveal-links');
          div.setAttribute('aria-describedby', 'tooltip');
          suppressUntil = Date.now() + 650; // suppress clicks/toggles briefly

          // show tooltip at the touch point if enabled and card is enabled
          if (cardSettings.showTooltip) {
            try {
              const touch = e.touches && e.touches[0] ? e.touches[0] : e;
              const fakeEvent = { clientX: touch.clientX, clientY: touch.clientY };
              showTooltip(fakeEvent, card, tooltip);
            } catch (err) {
              // ignore
            }
          }

          // show a one-time reveal hint on first use on this device
          try {
            if (isTouch && !localStorage.getItem('seenRevealHint')) {
              const hint = document.createElement('div');
              hint.className = 'reveal-hint';
              hint.textContent = 'Long-press to reveal; tap the icon to open';
              div.appendChild(hint);
              // show and auto-hide
              requestAnimationFrame(() => hint.classList.add('visible'));
              setTimeout(() => {
                hint.classList.remove('visible');
                setTimeout(() => hint.remove(), 300);
              }, 2500);
              localStorage.setItem('seenRevealHint', '1');
            }
          } catch (e) {
            // ignore localStorage errors
          }

          // auto-hide after a bit and hide tooltip as well (longer on mobile so user sees the reveal)
          clearTimeout(hideTimer);
          hideTimer = setTimeout(() => {
            div.classList.remove('reveal-links');
            hideTooltip(tooltip);
            div.removeAttribute('aria-describedby');
          }, 3000);
        }, 350);
      };

      const cancelReveal = () => {
        clearTimeout(revealTimer);
      };

      div.addEventListener('touchstart', startReveal, { passive: true });
      div.addEventListener('touchmove', cancelReveal, { passive: true });
      div.addEventListener('touchend', cancelReveal, { passive: true });

      // If user taps the EDHREC icon, reveal it on first tap (prevent navigation), allow navigation on second tap
      edhrecBtn.addEventListener('touchstart', (ev) => {
        if (!div.classList.contains('reveal-links')) {
          // reveal and prevent the navigation on the first tap
          ev.preventDefault();
          ev.stopPropagation();
          clearTimeout(hideTimer);
          div.classList.add('reveal-links');
          suppressUntil = Date.now() + 650;
          hideTimer = setTimeout(() => {
            div.classList.remove('reveal-links');
            hideTooltip(tooltip);
            div.removeAttribute('aria-describedby');
          }, 3000);
        }
        // if already revealed, allow the tap through
      }, { passive: false });

      // When revealed, use touchend to open immediately to avoid relying on click synthesis which is inconsistent
      edhrecBtn.addEventListener('touchend', (ev) => {
        if (div.classList.contains('reveal-links')) {
          ev.preventDefault();
          ev.stopPropagation();
          // open in new tab/window
          window.open(edhrecBtn.href, '_blank', 'noopener');
          // hide reveal and tooltip immediately
          clearTimeout(hideTimer);
          div.classList.remove('reveal-links');
          hideTooltip(tooltip);
        }
      }, { passive: false });

      // Prevent native context menu (long-press) on touch devices for EDHREC link and card
      edhrecBtn.addEventListener('contextmenu', (ev) => {
        if (isTouch) ev.preventDefault();
      });
      div.addEventListener('contextmenu', (ev) => {
        if (isTouch) ev.preventDefault();
      });

      // Also guard click events for safety
      edhrecBtn.addEventListener('click', (ev) => {
        if (!div.classList.contains('reveal-links')) {
          ev.preventDefault();
          ev.stopPropagation();
        }
        // else allow default navigation
      });

      // expose suppressUntil for outer click handler
      div._suppressToggleUntil = () => suppressUntil;
    } else {
      // Non-touch devices keep small press-to-open convenience
      edhrecBtn.addEventListener("touchstart", e => {
        pressTimer = setTimeout(() => {
          window.open(edhrecBtn.href, "_blank", "noopener");
        }, 500);
      });

      edhrecBtn.addEventListener("touchend", () => {
        clearTimeout(pressTimer);
      });
    }
  }

  if (appState.isViewOnlyMode) return;

  div.addEventListener("click", async e => {
    if (e.target.closest(".edhrec-link")) return;

    // On touch devices, suppress click actions briefly after a long-press reveal
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouch) {
      const suppressUntil = typeof div._suppressToggleUntil === 'function' ? div._suppressToggleUntil() : 0;
      if (suppressUntil && Date.now() < suppressUntil) {
        // ignore this click (it likely came from the long-press gesture)
        return;
      }
    }

    // record previous enabled state for undo
    const wasMissing = isCardMissing(card);

    e.stopPropagation();
    const isOwned = await toggleCardOwned(card);
    div.classList.toggle("owned", isOwned);

    const binder = div.closest(".binder");
    if (binder) {
      if (!isOwned) {
        binder.ownedCards--;
      } else {
        binder.ownedCards++;
      }
      const ownedCountEl = binder.querySelector(".owned-count");
      if (ownedCountEl) {
        ownedCountEl.textContent = `Owned: ${binder.ownedCards}/${binder.totalCards}`;
      }
    }

    const toggleBtn = div.querySelector('.card-toggle');
    if (toggleBtn) {
      // toggle button has no visible checkmark; owned state shown via badge
      toggleBtn.textContent = "";
      toggleBtn.setAttribute('aria-pressed', isOwned.toString());
      toggleBtn.setAttribute('aria-label', isOwned ? 'Mark as missing' : 'Mark as owned');
      // keep has-toggle present to avoid layout shifts
      div.classList.add('has-toggle');
    }

    // show undo toast
    try {
      showUndo(isOwned ? 'Marked as owned' : 'Marked as missing', async () => {
        await setCardsOwned([card], !wasMissing);
        // update UI to reflect undo
        div.classList.toggle('owned', !wasMissing);
        if (toggleBtn) {
              // update badge visibility (toggle button has no visible text)
          toggleBtn.textContent = '';
          toggleBtn.setAttribute('aria-pressed', (!wasMissing).toString());
          toggleBtn.setAttribute('aria-label', wasMissing ? 'Mark as owned' : 'Mark as missing');
        }

        const binder = div.closest(".binder");
        if (binder) {
          if (!wasMissing) {
            binder.ownedCards++;
          } else {
            binder.ownedCards--;
          }
          const ownedCountEl = binder.querySelector(".owned-count");
          if (ownedCountEl) {
            ownedCountEl.textContent = `Owned: ${binder.ownedCards}/${binder.totalCards}`;
          }
        }
      }, { duration: 5000 });
    } catch (err) {
      // ignore toast errors
    }

    // Don't show tooltip on touch devices when toggling; long-press already shows it when desired
    if (!isTouch && !isOwned && cardSettings.showTooltip) {
      showTooltip(e, card, tooltip);
    } else {
      hideTooltip(tooltip);
    }

    updateOwnedCounter();
  });
}

export function rerenderCards(tooltip) {
  document.querySelectorAll('.card').forEach(div => {
    const card = div.cardData;
    if (!card) return;

    // Toggle EDHREC link
    let edhrecBtn = div.querySelector('.edhrec-link');
    if (card.related_uris?.edhrec) {
      if (!edhrecBtn) {
        edhrecBtn = document.createElement("a");
        edhrecBtn.className = "edhrec-link";
        edhrecBtn.href = card.related_uris.edhrec;
        edhrecBtn.target = "_blank";
        edhrecBtn.rel = "noopener noreferrer";

        const icon = document.createElement("img");
        icon.src = "edhrec-icon.png";
        icon.alt = "EDHREC";

        edhrecBtn.appendChild(icon);
        div.appendChild(edhrecBtn);
      }
      div.classList.toggle('reveal-links', cardSettings.persistentReveal);
    } else if (edhrecBtn) {
      edhrecBtn.remove();
    }

    // Toggle colors
    const borderStyle = getCardBorderStyle(card);
    div.style.setProperty('--card-border', borderStyle.borderColor);
    div.style.setProperty('--card-bg', getCardBackground(card));
    div.style.setProperty('--card-text', '#111111');

    if (appState.isViewOnlyMode) {
      const toggleBtn = div.querySelector('.card-toggle');
      if (toggleBtn) {
        toggleBtn.remove();
      }
      return;
    }

    // Toggle owned card controls
    let toggleBtn = div.querySelector('.card-toggle');
    if (!toggleBtn) {
      toggleBtn = document.createElement("button");
      toggleBtn.className = "card-toggle";
      toggleBtn.title = !isCardMissing(card) ? "Mark as missing" : "Mark as owned";
      toggleBtn.setAttribute('aria-label', !isCardMissing(card) ? 'Mark as missing' : 'Mark as owned');
      toggleBtn.setAttribute('aria-pressed', (!isCardMissing(card)).toString());
      toggleBtn.textContent = "";
      div.appendChild(toggleBtn);

      const ownedBadge = document.createElement('span');
      ownedBadge.className = 'owned-badge';
      ownedBadge.textContent = 'Owned';
      div.appendChild(ownedBadge);

      div.classList.add('has-toggle');
    }

    attachCardHandlers(div, card, tooltip);
  });
}