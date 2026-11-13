// 공개 홈 '학생 탐구 카드': showcase.json 의 공개 동의 작품을 보여 주고, 비어 있으면 견본 카드를 보여 준다. 이름은 싣지 않고 학년만 쓴다.
(() => {
  'use strict';
  const box = document.getElementById('proveWorks'), note = document.getElementById('proveWorksNote');
  if (!box) return;
  const SAMPLES = [
    { grade: '견본 · 초등 고학년', theme: '안전', title: '비 오는 날 스쿨존 제동거리 알림이', summary: '속력과 노면 상태로 멈추는 거리를 계산해 위험할 때 알려 주는 프로그램을 설계한 보고서 견본이에요.', tools: ['Python'] },
    { grade: '견본 · 초등 중학년', theme: '환경과 에너지', title: '교실 불 끄기 지킴이', summary: '빛 센서로 빈 교실의 불이 켜져 있는지 알아내고 알림을 주는 작품의 탐구 과정을 정리한 견본이에요.', tools: ['Entry', '로봇·센서'] },
    { grade: '견본 · 중등', theme: '학교생활 도우미', title: '급식 메뉴 알레르기 확인 도우미', summary: '메뉴에서 조심할 재료를 찾아 표시하는 프로그램을 만들며 막힌 곳과 해결한 방법을 적은 견본이에요.', tools: ['Python', 'AI'] }
  ];
  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  function card(it, sample) {
    const a = el('article', 'prove-card');
    if (sample) a.appendChild(el('span', 'sample', '견본'));
    a.appendChild(el('span', 'who', String(it.grade || '').slice(0, 30) + (it.theme ? ' · ' + String(it.theme).slice(0, 20) : '')));
    a.appendChild(el('h4', null, String(it.title || '').slice(0, 80)));
    a.appendChild(el('p', null, String(it.summary || '').slice(0, 160)));
    const t = el('div', 'tools'); (it.tools || []).slice(0, 4).forEach(x => t.appendChild(el('span', null, String(x).slice(0, 16)))); a.appendChild(t);
    return a;
  }
  function show(items, sample) {
    box.textContent = ''; items.slice(0, 6).forEach(it => box.appendChild(card(it, sample)));
    if (note) note.textContent = sample ? '아래는 보고서 모양을 보여 주는 견본이에요. 학생 작품은 학부모 동의를 받은 것만 학년 표시로 싣습니다.' : '학부모 동의를 받은 작품만 학년 표시로 싣습니다.';
  }
  show(SAMPLES, true);
  fetch('showcase.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(d => {
    const items = d && Array.isArray(d.items) ? d.items.filter(x => x && x.title) : [];
    if (items.length) show(items, false);
  }).catch(() => {});
})();
