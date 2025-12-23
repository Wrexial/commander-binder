import { binderColors, CARDS_PER_PAGE, PAGES_PER_BINDER } from './config.js';
import { state } from './state.js';
import { positionTooltip } from './tooltip.js';

export function startNewBinder(results) {
  const binderNumber = Math.floor(state.count / (CARDS_PER_PAGE * PAGES_PER_BINDER)) + 1;

  const newBinder = document.createElement("div");
  newBinder.className = "binder";

  const color = binderColors[(binderNumber - 1) % binderColors.length];
  newBinder.style.borderColor = color;
  newBinder.style.background = lightenColor(color, 0.9);

  const header = document.createElement("h2");
  header.textContent = `Binder ${binderNumber}`;
  header.style.color = color;

  newBinder.appendChild(header);
  results.appendChild(newBinder);

  state.binder = newBinder;
}

export function startNewSection(pageSets = new Map()) {
  const pageNumber = Math.floor(state.count / CARDS_PER_PAGE) + 1;

  state.section = document.createElement("div");
  state.section.className = "section";

  const firstSet = pageSets.values().next().value;
  const pageDate = firstSet ? new Date(firstSet.date).getFullYear() : "Unknown";

  const header = document.createElement("h3");
  header.textContent = `Page ${pageNumber}${pageDate ? ` — ${pageDate}` : ""} — `;

  const setTooltip = document.getElementById("set-tooltip");

  const setCodes = Array.from(pageSets.entries()).map(([setCode, setObj]) => {
    const span = document.createElement("span");
    span.textContent = setCode.toUpperCase();
    span.style.cursor = "help";

    // Custom tooltip events
    span.addEventListener("mouseenter", e => {
        setTooltip.textContent = setObj.name;
        setTooltip.style.display = "block";
        positionTooltip(e, setTooltip);
    });
    span.addEventListener("mousemove", e => positionTooltip(e, setTooltip));
    span.addEventListener("mouseleave", () => {
        setTooltip.textContent = "";
        setTooltip.style.display = "none";
    });

    return span;
  });

  setCodes.forEach((span, index) => {
    header.appendChild(span);
    if (index < setCodes.length - 1) {
      header.appendChild(document.createTextNode(", "));
    }
  });

  state.grid = document.createElement("div");
  state.grid.className = "grid";

  state.section.appendChild(header);
  state.section.appendChild(state.grid);
  state.binder.appendChild(state.section);
}

export function lightenColor(color, factor) {
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);

  return `rgb(
    ${Math.round(r + (255 - r) * factor)},
    ${Math.round(g + (255 - g) * factor)},
    ${Math.round(b + (255 - b) * factor)}
  )`;
}
