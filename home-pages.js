// 공개 홈의 메뉴별 화면 전환(#/about 같은 주소)과 소식·수상자격 목록(news.json, results.json) 표시. 목록이 비어 있으면 그 메뉴는 숨긴다.
(() => {
  'use strict';
  const PAGES = { home: '', about: '학원 소개', courses: '교육과정', learning: '수업 방식', ai: 'AI 탐구', projects: '프로젝트', inquiry: '탐구 기록', growth: '성장 방향', certificates: '자격증', works: '작품 갤러리', news: '소식', results: '수상·자격', admission: '입학 상담' };
  const OLD = { courses: 'courses', learning: 'learning', curriculum: 'ai', projects: 'projects', prove: 'inquiry', faq: 'admission', consult: 'admission' };
  const empty = { news: true, results: true };
  const root = document.documentElement, baseTitle = document.title;
  const links = () => document.querySelectorAll('.home-nav a, .tile-grid a');
  const navigation = document.getElementById('publicNavigation'), toggle = document.querySelector('.nav-toggle');
  const groups = Array.from(navigation.querySelectorAll('.nav-group'));
  function closeNavigation() {
    groups.forEach(group => { group.open = false; });
    toggle.setAttribute('aria-expanded', 'false');
    navigation.classList.remove('is-open');
  }
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    closeNavigation();
    toggle.setAttribute('aria-expanded', String(open));
    navigation.classList.toggle('is-open', open);
  });
  groups.forEach(group => group.addEventListener('toggle', () => {
    if (group.open) groups.forEach(other => { if (other !== group) other.open = false; });
  }));
  groups.forEach(group => {
    group.querySelector('summary').addEventListener('click', event => {
      if (event.detail && group.open && window.matchMedia('(hover:hover) and (min-width:981px)').matches) event.preventDefault();
    });
    group.addEventListener('pointerenter', event => {
      if (event.pointerType === 'mouse' && window.matchMedia('(min-width:981px)').matches) group.open = true;
    });
    group.addEventListener('pointerleave', event => {
      if (event.pointerType === 'mouse' && !group.matches(':focus-within')) group.open = false;
    });
  });
  navigation.addEventListener('click', event => {
    if (!event.target.closest('a, button[data-auth]')) return;
    const summary = event.target.closest('.nav-group')?.querySelector('summary');
    const mobile = toggle.getAttribute('aria-expanded') === 'true';
    closeNavigation();
    if (mobile) toggle.focus(); else if (summary) summary.focus();
  });
  document.addEventListener('pointerdown', event => {
    if (!event.target.closest('.home-header')) closeNavigation();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || (!groups.some(group => group.open) && toggle.getAttribute('aria-expanded') !== 'true')) return;
    const summary = groups.find(group => group.open)?.querySelector('summary');
    const mobile = toggle.getAttribute('aria-expanded') === 'true';
    closeNavigation();
    if (mobile) toggle.focus(); else if (summary) summary.focus();
    event.preventDefault();
  });
  window.matchMedia('(max-width:980px)').addEventListener('change', closeNavigation);

  function route(first) {
    const h = location.hash.slice(1);
    let page = 'home', anchor = '';
    const m = /^\/([a-z]*)/.exec(h);
    if (m) page = m[1] || 'home';
    else if (OLD[h]) { page = OLD[h]; anchor = h; }
    else if (h) return; // 본문 바로 가기 같은 다른 주소는 그대로 둔다
    if (!(page in PAGES) || empty[page]) page = 'home';
    root.setAttribute('data-page', page);
    document.querySelectorAll('.home-nav a').forEach(a => {
      if (a.getAttribute('href') === '#/' + page) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    groups.forEach(group => group.classList.toggle('is-current', !!group.querySelector('[aria-current="page"]')));
    document.title = PAGES[page] ? PAGES[page] + ' · 코드마루' : baseTitle;
    const target = anchor && document.getElementById(anchor);
    if (target) target.scrollIntoView();
    else if (!first) window.scrollTo(0, 0);
  }

  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  function fill(page, file, boxId, meta) {
    const box = document.getElementById(boxId);
    if (!box) return;
    fetch(file, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(d => {
      const items = d && Array.isArray(d.items) ? d.items.filter(x => x && x.title) : [];
      if (!items.length) return;
      items.slice(0, 60).forEach(it => {
        const a = el('article', 'list-item'), m = el('div', 'meta');
        meta(it).forEach((x, i) => { if (x) m.appendChild(el('span', i ? null : 'tag', String(x).slice(0, 30))); });
        a.appendChild(m);
        a.appendChild(el('h3', null, String(it.title).slice(0, 100)));
        if (it.body) a.appendChild(el('p', null, String(it.body).slice(0, 600)));
        box.appendChild(a);
      });
      empty[page] = false;
      links().forEach(a => { if (a.getAttribute('href') === '#/' + page) a.hidden = false; });
      route(true);
    }).catch(() => {});
  }

  window.addEventListener('hashchange', () => route(false));
  route(true);
  fill('news', 'news.json', 'newsList', it => [it.tag || '소식', it.date]);
  fill('results', 'results.json', 'resultsList', it => [it.kind || '실적', it.year, it.grade]);
})();
