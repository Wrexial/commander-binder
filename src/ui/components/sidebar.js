let toggleBtn = null;

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

export function addButtonToSidebar(text, onClick) {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  const button = document.createElement('button');
  button.textContent = text;
  button.addEventListener('click', () => {
    // Choosing an item closes the menu, so the modal it opens is the only thing
    // on screen and a second tap cannot land on the leftover menu.
    closeSidebar();
    onClick();
  });
  sidebar.appendChild(button);
}
