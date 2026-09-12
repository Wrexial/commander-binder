// src/utils/cardImages.js
import { getImage } from "./imageCache.js";

const MULTI_FACE_LAYOUTS = ["modal_dfc", "transform", "double_faced_token"];

/**
 * Normalise the image URLs needed to display a card. Returns one entry per
 * face for multi-face layouts, otherwise a single entry.
 *
 * Used by both the tooltip (to render) and hover preloading (to fetch early),
 * so the two can never disagree about which URLs a card needs.
 *
 * @param {object} card
 * @returns {{ url: string, key: string }[]}
 */
export function getCardImages(card) {
  if (!card) return [];

  if (
    card.card_faces &&
    MULTI_FACE_LAYOUTS.includes(card.layout) &&
    card.card_faces.length === 2
  ) {
    return card.card_faces.flatMap((face, index) => {
      let url = face?.image_uris?.normal;
      if (!url && face?.image_uris === undefined) {
        // Some responses expose the URL directly on the face.
        url = face?.normal;
      }
      return url ? [{ url, key: `${card.id}-${index}` }] : [];
    });
  }

  const url =
    card.image_uris?.normal ||
    card.card_faces?.[0]?.image_uris?.normal ||
    card.card_faces?.[0]?.normal;

  return url ? [{ url, key: card.id }] : [];
}

/** Start loading a card's image(s) so the tooltip can show them instantly. */
export function preloadCardImages(card) {
  getCardImages(card).forEach(({ url }) => getImage(url));
}
