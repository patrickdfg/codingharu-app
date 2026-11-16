/* 학생 포트폴리오 (codemaru.kr/<주소>, 404.html 이 보여 준다)
 * 학생 4자리 번호(로그인 번호)를 넣으면 서버 portfolio 요청으로 그 학생 한 명의 기록만 받아 보여 준다.
 * 번호는 이 탭에만(sessionStorage) 기억하고, 탭을 닫거나 '잠그기'를 누르면 지운다. 검색에 나오지 않는다(noindex). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var main = $('pf');
  var path = decodeURIComponent(location.pathname).replace(/^\/+|\/+$/g, '');
  var SLUG_RE = /^[a-z]{1,6}\d{0,3}$/i;
  var KIND = { entry: '엔트리', scratch: '스크래치', web: '웹', zip: '압축 파일', html: '웹 파일' };
  var TYPING = { '자리-ko': '한글 자리연습', '자리-en': '영어 자리연습', '단어-ko': '한글 낱말', '단어-en': '영어 낱말', '문장-ko': '한글 문장', '문장-en': '영어 문장' };

  function el(tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }
  function pad(n) { return ('0' + n).slice(-2); }
  function ymd(ms) { var d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function clean(t) { return String(t || '').replace(/^완료 · /, '').replace(/\s*[·|]\s*(?:코드마루|코딩하루)\s*$/, '').trim() || '이름 없는 수업'; }
  function monthLabel(v) { var p = v.split('-'); return p[0] + '년 ' + Number(p[1]) + '월'; }

  // ---- 같은 계정의 다른 저장소 사이트(codemaru.kr/zoom 등): GitHub 에 그 이름의 공개 저장소가 있고 Pages 가 켜져 있으면 그 사이트를 화면 가득 보여 준다 ----
  // 공개 API(api.github.com/repos/…)의 has_pages 로 확인하고 결과는 이 탭에 기억한다. 확인에 실패하면 아래(포트폴리오·없는 페이지)로 넘어간다.
  var OWNER = 'patrickdfg';
  function showSite(name) {
    document.title = name + ' · 코드마루';
    document.documentElement.style.height = document.body.style.height = '100%'; document.body.style.margin = '0';
    document.body.textContent = '';
    var f = document.createElement('iframe'); f.src = 'https://' + OWNER + '.github.io/' + name + '/' + location.search + location.hash;
    f.title = name; f.allow = 'fullscreen; clipboard-write; camera; microphone'; f.allowFullscreen = true;
    f.style.cssText = 'display:block;border:0;width:100%;height:100%;position:fixed;inset:0';
    document.body.appendChild(f);
  }
  function siteCheck(name) {
    var key = 'codemaru-site-' + name.toLowerCase(), hit = null;
    try { hit = sessionStorage.getItem(key); } catch (e) {}
    if (hit) return Promise.resolve(hit === 'y');
    return fetch('https://api.github.com/repos/' + OWNER + '/' + encodeURIComponent(name), { headers: { Accept: 'application/vnd.github+json' } })
      .then(function (r) { if (r.status === 404) return { has_pages: false }; if (!r.ok) throw new Error('api'); return r.json(); })
      .then(function (d) { var ok = !!d.has_pages && !d.private; try { sessionStorage.setItem(key, ok ? 'y' : 'n'); } catch (e) {} return ok; })
      .catch(function () { return false; });
  }
  if (/^[a-z0-9][a-z0-9._-]{0,38}$/i.test(path) && path.toLowerCase() !== 'codingharu-app') {
    main.appendChild(el('p', '여는 중…', 'pf-note'));
    siteCheck(path).then(function (ok) { if (ok) showSite(path); else { main.textContent = ''; rest(); } });
  } else rest();

  function rest() {
  // ---- 없는 주소 ----
  if (!SLUG_RE.test(path)) {
    document.title = '없는 페이지 · 코드마루'; $('pfKind').textContent = '';
    var c = el('section', null, 'pf-card pf-center');
    c.append(el('h1', '찾는 페이지가 없어요'), el('p', '주소를 다시 확인해 주세요.', 'pf-note'));
    var a = el('a', '처음 화면으로', 'pf-btn'); a.href = '/'; c.appendChild(a);
    main.appendChild(c); return;
  }
  var slug = path.toLowerCase();
  if (location.pathname !== '/' + slug) history.replaceState(null, '', '/' + slug + location.search);
  var PIN_KEY = 'codemaru-portfolio-' + slug;
  document.title = slug + ' 포트폴리오 · 코드마루';

  var cfg = null;
  function config() {
    if (!cfg) cfg = fetch('/record-config.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; });
    return cfg;
  }
  async function api(action, body) {
    var c = await config();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(c.apiUrl || '')) throw new Error('기록 서버가 아직 연결되지 않았어요.');
    var r = await fetch(c.apiUrl, { method: 'POST', body: JSON.stringify(Object.assign({ action: action }, body)), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow' });
    if (!r.ok) throw new Error('기록 서버에 연결하지 못했어요 (' + r.status + ').');
    var out = await r.json();
    if (!out.ok) throw new Error(out.error || '기록 서버 오류');
    return out;
  }
  function savedPin() { try { return sessionStorage.getItem(PIN_KEY) || ''; } catch (e) { return ''; } }
  function keepPin(p) { try { if (p) sessionStorage.setItem(PIN_KEY, p); else sessionStorage.removeItem(PIN_KEY); } catch (e) {} }

  // ---- 번호 넣기 ----
  function lockView(msg) {
    main.textContent = ''; $('pfLock').hidden = true;
    var c = el('section', null, 'pf-card pf-center');
    var f = el('form', null, 'pf-unlock'), pin = el('input'), go = el('button', '열기', 'pf-btn');
    c.append(el('p', 'codemaru.kr/' + slug, 'pf-slug'), el('h1', '나의 코딩 포트폴리오'),
      el('p', '로그인할 때 쓰는 학생 번호 4자리를 넣어 주세요.', 'pf-note'));
    pin.type = 'password'; pin.inputMode = 'numeric'; pin.autocomplete = 'off'; pin.maxLength = 4; pin.pattern = '\\d{4}'; pin.required = true;
    pin.placeholder = '번호 4자리'; pin.setAttribute('aria-label', '학생 번호 4자리');
    go.type = 'submit';
    var say = el('p', msg || '', 'pf-msg'); say.setAttribute('role', 'status');
    f.append(pin, go); c.append(f, say,
      el('p', '번호를 잊었으면 선생님께 물어보세요. 여러 번 틀리면 한 시간 동안 열 수 없어요.', 'pf-note small'));
    f.onsubmit = function (e) {
      e.preventDefault();
      if (!/^\d{4}$/.test(pin.value)) { say.textContent = '숫자 4자리로 넣어 주세요.'; return; }
      go.disabled = true; say.textContent = '여는 중…';
      open(pin.value).catch(function (err) { go.disabled = false; say.textContent = err.message; pin.select(); });
    };
    main.appendChild(c); pin.focus();
  }

  async function open(pin) {
    var d = await api('portfolio', { slug: slug, pin: pin });
    keepPin(pin); render(d, pin);
  }

  // ---- 포트폴리오 ----
  function render(d, pin) {
    main.textContent = ''; $('pfLock').hidden = false;
    document.title = d.student.name + ' 포트폴리오 · 코드마루';
    var days = d.days || [], lessons = d.lessons || [], works = d.works || [], progress = d.progress || [], typing = d.typing || null;
    var firstMs = Math.min.apply(null, [Date.now()].concat(days.map(function (x) { return new Date(x + 'T00:00:00').getTime(); }), lessons.map(function (x) { return x.at || Date.now(); })));
    var together = Math.max(1, Math.round((Date.now() - firstMs) / 86400000));

    var hero = el('section', null, 'pf-hero');
    hero.append(el('p', 'codemaru.kr/' + slug, 'pf-slug'), el('h1', d.student.name + '의 코딩 포트폴리오'),
      el('p', '코드마루와 함께한 지 ' + together.toLocaleString() + '일 · 학원에서 공부한 날 ' + days.length + '일', 'pf-note'));
    main.appendChild(hero);

    var bestTyping = 0;
    if (typing && typing.top) Object.keys(typing.top).forEach(function (k) { if (/-ko$/.test(k) && typing.top[k] > bestTyping) bestTyping = typing.top[k]; });
    var stats = el('div', null, 'pf-stats');
    [[lessons.length + '개', '완료한 수업'], [works.length + '개', '만든 작품'], [(d.points || 0).toLocaleString() + ' P', '모은 포인트'], [bestTyping ? bestTyping + '타' : '-', '한글 타자 최고(분당)']]
      .forEach(function (x) { var s = el('div', null, 'pf-stat'); s.append(el('b', x[0]), el('span', x[1])); stats.appendChild(s); });
    main.appendChild(stats);

    // 작품
    main.appendChild(el('h2', '🎨 내가 만든 작품'));
    if (!works.length) main.appendChild(el('p', '아직 작품 게시판에 올린 작품이 없어요. 수업에서 만든 작품을 게시판에 올리면 여기에 모여요.', 'pf-note'));
    else {
      var grid = el('div', null, 'pf-works');
      works.forEach(function (w) {
        var c = el('article', null, 'pf-work'), top = el('div', null, 'pf-work-top');
        top.append(el('span', w.file ? (w.file.ext || '파일').toUpperCase() : (KIND[w.kind] || '웹'), 'pf-pill'), el('small', w.day || ''));
        c.append(top, el('h3', w.title));
        var desc = String(w.desc || '').replace(/^\[연구소:[^\]]+\]\s*/, '');
        if (/^\[연구소:/.test(w.desc || '')) c.appendChild(el('small', 'AI 프로젝트 연구소', 'pf-lab'));
        if (desc) c.appendChild(el('p', desc.length > 160 ? desc.slice(0, 160) + '…' : desc));
        var bar = el('div', null, 'pf-bar');
        if (/^https:\/\//i.test(w.url)) { var a = el('a', '작품 열기', 'pf-btn small'); a.href = w.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; bar.appendChild(a); }
        if (w.file) {
          var b = el('button', '파일 받기', 'pf-btn small ghost'); b.type = 'button';
          b.onclick = function () {
            b.disabled = true; b.textContent = '받는 중…';
            api('portfolioFile', { slug: slug, pin: pin, id: w.id }).then(function (f) {
              var bytes = Uint8Array.from(atob(f.data), function (ch) { return ch.charCodeAt(0); });
              var url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));   // 열지 않고 내려받기만 한다
              var link = el('a'); link.href = url; link.download = f.name; document.body.appendChild(link); link.click(); link.remove();
              setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
              b.disabled = false; b.textContent = '파일 받기';
            }, function (err) { b.disabled = false; b.textContent = '파일 받기'; alert(err.message); });
          };
          bar.appendChild(b);
        }
        c.appendChild(bar); grid.appendChild(c);
      });
      main.appendChild(grid);
    }

    // 공부한 날(최근 20주)
    main.appendChild(el('h2', '📅 공부한 날'));
    main.appendChild(heatmap(days));

    // 진행 중인 과정
    if (progress.length) {
      main.appendChild(el('h2', '🚀 지금 하고 있는 과정'));
      var pl = el('div', null, 'pf-card');
      progress.slice(0, 8).forEach(function (p) {
        var row = el('div', null, 'pf-prog'), pct = Math.round(p.done * 100 / p.total), m = el('span', null, 'pf-meter'), i = el('i');
        i.style.width = Math.min(100, pct) + '%'; m.appendChild(i);
        row.append(el('b', clean(p.title)), m, el('small', p.done + ' / ' + p.total)); pl.appendChild(row);
      });
      main.appendChild(pl);
    }

    // 타자
    if (typing && typing.runs && typing.runs.length) {
      main.appendChild(el('h2', '⌨️ 타자 기록'));
      var tc = el('div', null, 'pf-card');
      var tops = el('div', null, 'pf-typing');
      Object.keys(TYPING).forEach(function (k) { if (typing.top && typing.top[k]) { var t = el('div'); t.append(el('b', typing.top[k] + '타'), el('span', TYPING[k] + ' 최고')); tops.appendChild(t); } });
      tc.appendChild(tops);
      var ko = typing.runs.filter(function (r) { return r.l === 'ko' && r.a >= 80; }).slice(-20);
      if (ko.length >= 2) { tc.appendChild(el('p', '최근 한글 연습 ' + ko.length + '번의 분당 타수', 'pf-note small')); tc.appendChild(spark(ko)); }
      main.appendChild(tc);
    }

    // 완료한 수업(달별)
    main.appendChild(el('h2', '✅ 완료한 수업 ' + lessons.length + '개'));
    if (!lessons.length) main.appendChild(el('p', '아직 완료한 수업이 없어요.', 'pf-note'));
    var byMonth = {};
    lessons.forEach(function (l) { var m = l.at ? ymd(l.at).slice(0, 7) : '날짜 없음'; (byMonth[m] = byMonth[m] || []).push(l); });
    Object.keys(byMonth).sort().reverse().forEach(function (m, i) {
      var det = el('details', null, 'pf-month'); if (i < 2) det.open = true;
      det.appendChild(el('summary', (m === '날짜 없음' ? m : monthLabel(m)) + ' · ' + byMonth[m].length + '개'));
      var ul = el('ul');
      byMonth[m].forEach(function (l) { var li = el('li'); li.append(el('span', l.at ? ymd(l.at).slice(5).replace('-', '.') : '', 'pf-date'), document.createTextNode(clean(l.title))); ul.appendChild(li); });
      det.appendChild(ul); main.appendChild(det);
    });

    main.appendChild(el('p', '이 페이지는 학생 번호를 아는 사람만 열 수 있어요. 다 봤으면 위의 「잠그기」를 눌러 주세요.', 'pf-note small pf-foot'));
    main.focus({ preventScroll: true });
  }

  function heatmap(days) {
    var set = {}; days.forEach(function (d) { set[d] = 1; });
    var wrap = el('div', null, 'pf-card pf-heat-wrap');
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var start = new Date(today); start.setDate(start.getDate() - (19 * 7) - start.getDay());   // 20주 전 일요일
    var W = 20, cell = 14, gap = 3, ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 ' + (W * (cell + gap) + 24) + ' ' + (7 * (cell + gap) + 18)); svg.setAttribute('class', 'pf-heat');
    svg.setAttribute('role', 'img'); var count = 0;
    for (var w = 0; w < W; w++) for (var d = 0; d < 7; d++) {
      var day = new Date(start); day.setDate(start.getDate() + w * 7 + d);
      if (day > today) continue;
      var key = ymd(day.getTime()), on = !!set[key]; if (on) count++;
      var r = document.createElementNS(ns, 'rect');
      r.setAttribute('x', 24 + w * (cell + gap)); r.setAttribute('y', 16 + d * (cell + gap)); r.setAttribute('width', cell); r.setAttribute('height', cell); r.setAttribute('rx', 3);
      r.setAttribute('class', on ? 'on' : 'off');
      var t = document.createElementNS(ns, 'title'); t.textContent = key + (on ? ' 공부함' : ''); r.appendChild(t); svg.appendChild(r);
      if (day.getDate() === 1) { var mt = document.createElementNS(ns, 'text'); mt.setAttribute('x', 24 + w * (cell + gap)); mt.setAttribute('y', 11); mt.textContent = (day.getMonth() + 1) + '월'; svg.appendChild(mt); }
    }
    ['일', '', '화', '', '목', '', '토'].forEach(function (n, i) { if (!n) return; var tx = document.createElementNS(ns, 'text'); tx.setAttribute('x', 0); tx.setAttribute('y', 16 + i * (cell + gap) + 11); tx.textContent = n; svg.appendChild(tx); });
    svg.setAttribute('aria-label', '최근 20주 동안 공부한 날 ' + count + '일');
    wrap.append(svg, el('p', '최근 20주 동안 ' + count + '일 공부했어요. 파란 칸이 학원에서 공부한 날이에요.', 'pf-note small'));
    return wrap;
  }

  function spark(runs) {
    var ns = 'http://www.w3.org/2000/svg', Wd = 520, H = 120, max = Math.max.apply(null, runs.map(function (r) { return r.s; })), min = Math.min.apply(null, runs.map(function (r) { return r.s; }));
    var lo = Math.max(0, min - 20), hi = max + 20, n = runs.length;
    var X = function (i) { return 30 + i * (Wd - 50) / (n - 1); }, Y = function (v) { return 10 + (H - 30) * (1 - (v - lo) / (hi - lo || 1)); };
    var svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 ' + Wd + ' ' + H); svg.setAttribute('class', 'pf-spark');
    svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', '분당 타수 ' + runs.map(function (r) { return r.s; }).join(', '));
    var line = document.createElementNS(ns, 'polyline'); line.setAttribute('points', runs.map(function (r, i) { return X(i) + ',' + Y(r.s); }).join(' ')); svg.appendChild(line);
    runs.forEach(function (r, i) {
      var c = document.createElementNS(ns, 'circle'); c.setAttribute('cx', X(i)); c.setAttribute('cy', Y(r.s)); c.setAttribute('r', i === n - 1 ? 5 : 3.5);
      var t = document.createElementNS(ns, 'title'); t.textContent = r.d + ' · ' + r.s + '타 · 정확도 ' + r.a + '%'; c.appendChild(t); svg.appendChild(c);
    });
    [[max, Y(max)], [runs[n - 1].s, Y(runs[n - 1].s)]].forEach(function (x, i) { if (i && x[0] === max) return; var tx = document.createElementNS(ns, 'text'); tx.setAttribute('x', 0); tx.setAttribute('y', x[1] + 4); tx.textContent = x[0]; svg.appendChild(tx); });
    return svg;
  }

  $('pfLock').onclick = function () { keepPin(''); lockView('잠갔어요. 다시 보려면 번호를 넣어 주세요.'); };
  var p0 = savedPin();
  if (p0) { main.appendChild(el('p', '여는 중…', 'pf-note pf-center')); open(p0).catch(function (err) { keepPin(''); lockView(err.message); }); }
  else lockView();
  }
})();
