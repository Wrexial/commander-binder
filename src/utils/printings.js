/**
 * The next (or previous) printing to show when cycling a tile, statistics row or
 * the modal preview, wrapping around. Returns `null` when the card has no other
 * printing.
 *
 * @param {object[]} printings Release-ordered printings of the card.
 * @param {object} card The printing currently displayed.
 * @param {number} [direction] +1 for the next printing, -1 for the previous.
 * @returns {object|null}
 */
export function nextPrinting(printings, card, direction = 1) {
  if (!Array.isArray(printings) || printings.length <= 1 || !card) return null;

  const index = printings.findIndex((printing) => printing.id === card.id);
  if (index === -1) return printings[0];

  const step = direction < 0 ? -1 : 1;
  return printings[(index + step + printings.length) % printings.length];
}
