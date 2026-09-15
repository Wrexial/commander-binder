export function initSidebar() {
  const toggleBtn = document.getElementById('openbtn');
  const backdrop = document.getElementById('sidebar-backdrop');

  function setOpen(isOpen) {
    document.body.classList.toggle('sidebar-open', isOpen);
    toggleBtn.classList.toggle('is-active', isOpen);
    toggleBtn.setAttribute('aria-expanded', String(isOpen));
  }

  function closeSidebar() {
    setOpen(false);
  }

  toggleBtn.addEventListener('click', () => {
    setOpen(!document.body.classList.contains('sidebar-open'));
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
