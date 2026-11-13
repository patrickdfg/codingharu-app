// 공개 홈의 메뉴별 화면 전환(#/about 같은 주소)과 소식·수상자격 목록(news.json, results.json) 표시. 목록이 비어 있으면 그 메뉴는 숨긴다.
(() => {
  'use strict';
  const PAGES = { home: '', about: '학원 소개', courses: '교육과정', inquiry: '탐구·포트폴리오', works: '학생 작품', news: '소식', results: '수상·자격', admission: '입학 상담' };
  const OLD = { courses: 'courses', learning: 'about', curriculum: 'about', projects: 'works', prove: 'inquiry', faq: 'admission', consult: 'admission' };
  const empty = { news: true, results: true };
  const root = document.documentElement, baseTitle = document.title;
  const links = () => document.querySelectorAll('.home-nav a, .tile-grid a');

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
