let toggleBtn = null;

/**
 * Sidebar sections, in the order they render. Buttons attach to one by id via
 * `addButtonToSidebar`'s third argument.
 */
const SECTIONS = [
  { id: 'collection', title: 'Collection' },
  { id: 'browse', title: 'Browse' },
  { id: 'sharing', title: 'Sharing' },
  { id: 'settings', title: 'Settings' },
];

/** Cached section bodies, so repeated `addButtonToSidebar` calls append. */
const sectionBodies = new Map();

/**
 * The body element for a section, created (in order) on first use. Re-creates
 * after the sidebar is cleared, since the cached node would be detached.
 */
function getSectionBody(sidebar, sectionId) {
  const cached = sectionBodies.get(sectionId);
  if (cached && cached.isConnected) return cached;

  const section = document.createElement('div');
  section.className = 'sidebar-section';
  section.dataset.section = sectionId;

  const config = SECTIONS.find((entry) => entry.id === sectionId);
  if (config) {
    const heading = document.createElement('h2');
    heading.className = 'sidebar-section-title';
    heading.textContent = config.title;
    section.appendChild(heading);
  }

  const body = document.createElement('div');
  body.className = 'sidebar-section-body';
  section.appendChild(body);

  // Keep sections in the declared order even if they are populated out of order.
  const order = SECTIONS.findIndex((entry) => entry.id === sectionId);
  const next = [...sidebar.querySelectorAll('.sidebar-section')].find(
    (el) => SECTIONS.findIndex((entry) => entry.id === el.dataset.section) > order
  );
  sidebar.insertBefore(section, next || null);

  sectionBodies.set(sectionId, body);
  return body;
}

/** Open/close the menu while keeping the button and the body in sync. */
function setSidebarOpen(isOpen) {
  document.body.classList.toggle('sidebar-open', isOpen);
  toggleBtn?.classList.toggle('is-active', isOpen);
  toggleBtn?.setAttribute('aria-expanded', String(isOpen));
}

/** Close the menu (used by the backdrop and by any sidebar action). */
function closeSidebar() {
  setSidebarOpen(false);
}

export function initSidebar() {
  toggleBtn = document.getElementById('openbtn');
  const backdrop = document.getElementById('sidebar-backdrop');

  toggleBtn.addEventListener('click', () => {
    setSidebarOpen(!document.body.classList.contains('sidebar-open'));
  });

  if (backdrop) {
    backdrop.addEventListener('click', closeSidebar);
  }
}

export function addButtonToSidebar(text, onClick, sectionId = 'collection', order = 0) {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  const button = document.createElement('button');
  button.textContent = text;
  button.dataset.order = String(order);
  button.addEventListener('click', () => {
    // Choosing an item closes the menu, so the modal it opens is the only thing
    // on screen and a second tap cannot land on the leftover menu.
    closeSidebar();
    onClick();
  });

  // Insert before the first button with a higher order, so callers declare an
  // order instead of relying on the sequence they happen to run in.
  const body = getSectionBody(sidebar, sectionId);
  const next = [...body.querySelectorAll('button')].find(
    (existing) => Number(existing.dataset.order || 0) > order
  );
  body.insertBefore(button, next || null);
}
