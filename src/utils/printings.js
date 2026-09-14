/**
 * The next printing to show when cycling a tile or statistics row, wrapping
 * back to the first. Returns `null` when the card has no other printing.
 *
 * @param {object[]} printings Release-ordered printings of the card.
 * @param {object} card The printing currently displayed.
 * @returns {object|null}
 */
export function nextPrinting(printings, card) {
  if (!Array.isArray(printings) || printings.length <= 1 || !card) return null;

  const index = printings.findIndex((printing) => printing.id === card.id);
  const nextIndex = index === -1 ? 0 : (index + 1) % printings.length;
  return printings[nextIndex];
}
