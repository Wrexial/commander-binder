// src/components/ShareButton.js
import { showToast } from './toast.js';

export function createShareButton(userId) {
  const shareButton = document.createElement('button');
  shareButton.id = 'share-button';
  shareButton.textContent = 'Share';
  shareButton.classList.add('hidden');

  shareButton.addEventListener('click', () => {
    const url = new URL(window.location.href);
    url.searchParams.set('user', userId);
    navigator.clipboard.writeText(url.href);
    showToast("Link copied to clipboard!");
  });

  return shareButton;
}
