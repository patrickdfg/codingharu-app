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

/* 공개 교육과정 안내: 자료 로그인 전에 과정과 프로젝트를 살펴본다. */
(() => {
  const dialog = document.getElementById('courseDialog');
  const panels = dialog.querySelectorAll('[data-course-panel]');
  document.querySelectorAll('[data-course]').forEach(button => button.addEventListener('click', () => {
    panels.forEach(panel => {
      panel.hidden = panel.dataset.coursePanel !== button.dataset.course;
      if (!panel.hidden) document.getElementById('courseDetailTitle').textContent = panel.dataset.title;
    });
    dialog.showModal();
    dialog.scrollTop = 0;
  }));
  dialog.addEventListener('click', event => {
    if (event.target.closest('[data-course-close], [data-auth], a')) dialog.close();
    else if (event.target === dialog) {
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    }
  }, true);
  window.addEventListener('hashchange', () => dialog.close());
})();

/* Public class photos: pause on hover, focus, or button. */
(()=>{const strip=document.querySelector('.moments-strip');if(!strip)return;const group=document.createElement('div');group.className='moments-group';while(strip.firstChild)group.appendChild(strip.firstChild);const copy=group.cloneNode(true);copy.setAttribute('aria-hidden','true');copy.querySelectorAll('a').forEach(a=>a.tabIndex=-1);const track=document.createElement('div');track.className='moments-track';track.append(group,copy);strip.appendChild(track);const button=document.createElement('button');button.className='moments-pause';button.type='button';button.setAttribute('aria-pressed','false');button.textContent='Ⅱ 사진 흐름 멈추기';button.addEventListener('click',()=>{const pause=button.getAttribute('aria-pressed')!=='true';button.setAttribute('aria-pressed',String(pause));button.textContent=pause?'▶ 사진 흐름 재생하기':'Ⅱ 사진 흐름 멈추기';track.classList.toggle('is-paused',pause)});strip.insertAdjacentElement('afterend',button)})();
