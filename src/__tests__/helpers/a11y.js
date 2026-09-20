// src/__tests__/helpers/a11y.js
/**
 * Automated accessibility checks for mounted UI, backed by axe-core.
 *
 * jsdom has no layout, so contrast can't be computed and the `region` rule
 * (which expects a full page) is noise; both are disabled. Everything else
 * (roles, names, labels, ARIA relationships) is checked.
 */
import axe from 'axe-core';

/**
 * Run axe against a mounted container.
 *
 * @param {HTMLElement} [container=document.body]
 * @returns {Promise<{violations: object[], summary: string}>}
 */
export async function analyzeA11y(container = document.body) {
  const results = await axe.run(container, {
    rules: {
      'color-contrast': { enabled: false },
      region: { enabled: false },
    },
  });

  const summary = results.violations
    .map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.nodes
          .map((node) => `${node.target.join(' ')} — ${node.failureSummary}`)
          .join('; ')}`
    )
    .join('\n');

  return { violations: results.violations, summary };
}
