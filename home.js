/* Public landing-page controls; authentication remains in index.html. */
(() => {
  'use strict';
  document.querySelectorAll('[data-auth]').forEach(button => {
    button.addEventListener('click', async () => {
      const auth = window.CHHomeAuth;
      if (!auth) return;
      button.disabled = true;
      try { await auth.open(button.dataset.auth, button.dataset.target); }
      finally { button.disabled = false; }
    });
  });
  const dialog = document.getElementById('authDialog');
  if (dialog) {
    const sync = () => {
      document.body.classList.toggle('auth-open', dialog.open);
      document.dispatchEvent(new CustomEvent('home:overlay', { detail: { open: dialog.open } }));
    };
    new MutationObserver(sync).observe(dialog, { attributes: true, attributeFilter: ['open'] });
    sync();
  }
  const tabs = [document.getElementById('tabLogin'), document.getElementById('tabJoin')];
  tabs.forEach((tab, index) => tab?.addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1-index;
    tabs[next].click(); tabs[next].focus();
  }));
})();
