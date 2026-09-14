// src/utils/cardImages.js
import { getImage } from "./imageCache.js";

const MULTI_FACE_LAYOUTS = ["modal_dfc", "transform", "double_faced_token"];

/**
 * Pick the best display URL from a Scryfall `image_uris` object.
 *
 * Prefers the WebP `grid` variant: it has the same 488x680 dimensions as the
 * `normal` JPEG at roughly half the bytes, and it is the exact URL desktop
 * tiles load, so the tooltip reuses what is already in the HTTP/app cache.
 *
 * @param {object} [uris]
 * @returns {string|null}
 */
function pickDisplayUrl(uris) {
  return uris?.grid || uris?.normal || uris?.small || uris?.thumb || null;
}

/**
 * Resolve a face's display URL, tolerating responses that expose the URL
 * directly on the face rather than under `image_uris`.
 * @param {object} [face]
 * @returns {string|null}
 */
function faceDisplayUrl(face) {
  return pickDisplayUrl(face?.image_uris) || face?.normal || null;
}

/**
 * Tile image URLs for a card: a small `thumb` for phones and a sharper `grid`
 * for wider viewports. Multi-face layouts use the front face.
 *
 * @param {object} card
 * @returns {{ thumb: string, grid: string }|null}
 */
export function getCardImageUrls(card) {
  const uris = card?.image_uris || card?.card_faces?.[0]?.image_uris;
  if (!uris) return null;

  const thumb = uris.thumb || uris.small || uris.normal;
  if (!thumb) return null;

  return { thumb, grid: uris.grid || uris.normal || thumb };
}

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
      const url = faceDisplayUrl(face);
      return url ? [{ url, key: `${card.id}-${index}` }] : [];
    });
  }

  const url =
    faceDisplayUrl(card) ||
    faceDisplayUrl(card.card_faces?.[0]);

  return url ? [{ url, key: card.id }] : [];
}

/** Start loading a card's image(s) so the tooltip can show them instantly. */
export function preloadCardImages(card) {
  getCardImages(card).forEach(({ url }) => getImage(url));
}
