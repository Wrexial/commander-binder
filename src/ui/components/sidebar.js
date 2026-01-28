export function initSidebar() {
  const toggleBtn = document.getElementById('openbtn');
  const backdrop = document.getElementById('sidebar-backdrop');

  function closeSidebar() {
    document.body.classList.remove('sidebar-open');
    toggleBtn.classList.remove('is-active');
  }

  toggleBtn.addEventListener('click', () => {
    const isOpen = document.body.classList.toggle('sidebar-open');
    toggleBtn.classList.toggle('is-active', isOpen);
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
    button.addEventListener('click', onClick);
    sidebar.appendChild(button);
}

export function addLinkToSidebar(text, href) {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    const link = document.createElement('a');
    link.textContent = text;
    link.href = href;
    sidebar.appendChild(link);
}

