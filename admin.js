/* 선생님 관리자 페이지 (admin.html)
 * 한눈에 보기 · 회원 관리(승인·이름/반/메모/번호/휴원) · 포인트 주기(여러 명 한 번에) · 점수 기본값(묶음별) · 월말 기록표(A4 인쇄) · 학부모 리포트 · 설정
 * 서버 동작(server/record.gs): admin, approve, studentUpdate, pointsGrant, pointsSetRates, monthStats (모두 선생님 로그인 필요)
 * 점수 항목을 추가하면 아래 RATES 에도 같은 키를 넣는다(서버 pointsDefaults_ 와 개수가 같아야 저장된다). */
(function () {
  'use strict';
  var BASE = new URL('./', location.href).href;
  var PHONE_AUTO_KEY = 'codingharu-teacher-phone-auto-v1';
  var $ = function (id) { return document.getElementById(id); };
  var view = $('view');
  var D = null, me = null;

  // ---- 점수 항목: 묶음 · 이름 · 언제 받나 ----
  var RATES = [
    ['블록 코딩 수업', [
      ['entry', '엔트리 수업', '프로젝트 1 워크북 등 · 수업 1회 완료'], ['entryWork', '엔트리 작품', '블록사전·기초·프로젝트 2·COS 문제 · 작품 1개(1차시에 2~3개)'],
      ['scratch', '스크래치 수업', '심화 창작 등 · 수업 1회 완료'], ['scratchWork', '스크래치 작품', '블록사전·기초·애니메이션 · 작품 1개(1차시에 2~3개)'],
      ['junior', '스크래치주니어 수업', '수업 1회 완료']]],
    ['파이썬', [
      ['pythonLesson', '파이썬 수업', '기초·COS Pro·농장 제외 · 수업 1회 완료'], ['easyUnit', '천천히 배우는 파이썬 기본', '단원의 개념 연습 14단계를 다 마칠 때 · 17단원'],
      ['pythonProblem', '파이썬 기초(정올) 문제', '문제 1개 맞힘'], ['pythonUnit', '파이썬 기초 단원 완료', '단원 문제를 다 풀었을 때 1번'],
      ['farm', '파이썬 코딩 농장', '차시 1개 통과'], ['pythonRobot', '파이썬 로봇 코딩', '1차시(미션 3 + 문제 3) 마칠 때 · 12차시'],
      ['pythonHigh', '파이썬 기초 융합 미션', '노트북(차시) 1개 완료 · 6차시']]],
    ['알고리즘 · 자격 · 대회', [
      ['algorithm', '알고리즘 수업', '알고리즘 워크북 1개 완료'], ['cosproProblem', 'COS Pro 문제', '문제 1개 맞힘'], ['cosproUnit', 'COS Pro 회차 완료', '10문제를 다 풀었을 때 1번'],
      ['koi', '정보올림피아드 연습', '문제 1개 처음 맞힘'], ['iot', '파이썬 스마트홈 IoT', '미션 1개 처음 통과'], ['bebras', '비버챌린지', '문제 1개 맞힘']]],
    ['코딩 놀이터 · 게임 · 타자', [
      ['codingLesson', '코딩 놀이터 수업', '비버·게임·탐정 제외 · 수업 1회 완료'], ['playground', '블록 코딩 100단계', '단계 1개 통과'], ['games', '블록 게임 만들기', '게임 단계 1개 통과'],
      ['detective', '코딩 탐정', '본문제·도전문제 1개'], ['typing', '타자 자리연습', '단계별 정확도 80% 이상 · 하루 1번'], ['typingWord', '타자 단어연습', '낱말 100개 끝낼 때'], ['typingSentence', '타자 문장연습', '문장 10개 끝낼 때']]],
    ['로봇 · 로블록스 · 웹 · 디지털', [
      ['robot', '로봇 수업', '수업 1회 완료'], ['roblox', '로블록스 수업', '수업 1회 완료'], ['doubleLesson', '2차시 분량 수업', '로블록스 세트·게임 작품 등 한 쪽이 2차시'],
      ['web', '웹 수업', '수업 1회 완료'], ['digital', '디지털 수업', '엑셀·바이브코딩·엔트리 AI·정보 내신 등 수업 1회']]],
    ['프로젝트 · 성인 · 기타', [
      ['aiProject', 'AI와 함께 만드는 12차시', '차시 체크 1번'], ['adult', '성인 수업', '수업 1회 완료'], ['otherLesson', '기타 수업', '특강·승급 미션·AI 프로젝트 연구소·새 수업 폴더 · 수업 1회']]]
  ];

  // ---- 도구 ----
  function el(tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }
  function btn(text, cls, onclick) { var b = el('button', text, 'ad-btn ' + (cls || '')); b.type = 'button'; if (onclick) b.onclick = onclick; return b; }
  var toastTimer = null;
  function toast(text, bad) { var t = $('toast'); t.textContent = text; t.className = 'ad-toast' + (bad ? ' bad' : ''); t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 3200); }
  function pad(n) { return ('0' + n).slice(-2); }
  function ym(ms) { var d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function ymd(ms) { var d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fmt(ms) { if (!ms) return '-'; return new Date(ms).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  function monthLabel(v) { var p = v.split('-'); return p[0] + '년 ' + Number(p[1]) + '월'; }
  function clean(t) { return String(t || '').replace(/^완료 · /, '').replace(/\s*[·|]\s*코드마루\s*$/, '').trim() || '이름 없는 수업'; }
  function isDone(w) { return String(w.workbook).indexOf('done:') === 0; }
  function table(head, rows, onRow) {
    var wrap = el('div', null, 'ad-table-wrap'), t = el('table', null, 'ad-table'), tr = el('tr');
    head.forEach(function (h) { tr.appendChild(el('th', h)); }); t.appendChild(tr);
    if (!rows.length) { var r0 = el('tr'), c0 = el('td', '아직 없어요.'); c0.colSpan = head.length; r0.appendChild(c0); t.appendChild(r0); }
    rows.forEach(function (r, i) {
      var row = el('tr');
      r.forEach(function (c) { var td = el('td'); if (c instanceof Node) td.appendChild(c); else td.textContent = c; row.appendChild(td); });
      if (onRow) onRow(row, i);
      t.appendChild(row);
    });
    wrap.appendChild(t); return wrap;
  }
  function pill(s) { var st = s.pending ? '대기' : (s.status === '휴원' ? '휴원' : '승인'); return el('span', st, 'ad-pill' + (st === '휴원' ? ' rest' : st === '대기' ? ' wait' : '')); }
  function api(action, body) { return CHRecord.api(action, Object.assign({ auth: CHRecord.auth() }, body || {})); }
  function students(all) { return (D ? D.students : []).filter(function (s) { return all || !s.pending; }); }
  function groupsOf() { var g = {}; students().forEach(function (s) { if (s.group) g[s.group] = 1; }); return Object.keys(g).sort(); }
  function byId(id) { return (D.students.filter(function (s) { return s.id === id; })[0]) || { name: id }; }
  var SITE = location.origin + '/';
  function pfUrl(s) { return s && s.slug ? SITE.replace(/^https?:\/\//, '') + s.slug : ''; }
  function typingTop(id) { var t = D.typing && D.typing[id]; return t && t.top ? (t.top['자리-ko'] > (t.top['단어-ko'] || 0) ? t.top['자리-ko'] : t.top['단어-ko'] || t.top['문장-ko'] || 0) : 0; }
  function copy(text) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast('복사했어요: ' + text); }, function () { prompt('아래 주소를 복사해 주세요.', text); });
  }
  function lastActive(id) {
    var last = 0;
    D.workbooks.forEach(function (w) { if (w.studentId === id && w.updatedAt > last) last = w.updatedAt; });
    D.visits.forEach(function (v) { if (v.studentId === id && v.last > last) last = v.last; });
    return last;
  }
  function doneIn(id, month) { return D.workbooks.filter(function (w) { return w.studentId === id && isDone(w) && w.done > 0 && (!month || ym(w.updatedAt) === month); }); }
  function groupSelect(withAll) {
    var s = el('select'); s.setAttribute('aria-label', '반');
    if (withAll) { var o = el('option', '전체 반'); o.value = '*'; s.appendChild(o); }
    groupsOf().forEach(function (g) { var o = el('option', g); o.value = g; s.appendChild(o); });
    var o2 = el('option', '반 없음'); o2.value = ''; s.appendChild(o2);
    return s;
  }

  // ---- 로그인 확인과 불러오기 ----
  async function load(silent) {
    if (!silent) view.innerHTML = '<p class="ad-note">학생 기록을 불러오는 중…</p>';
    try { D = await api('admin'); }
    catch (err) {
      if (/로그인|만료|선생님 목록|권한/.test(err.message || '')) return needLogin(err.message);
      view.innerHTML = ''; view.appendChild(el('p', '불러오지 못했어요: ' + err.message, 'ad-note')); return;
    }
    var waiting = D.students.filter(function (s) { return s.pending; }).length, badge = $('pendingBadge');
    badge.hidden = !waiting; badge.textContent = waiting;
    route();
  }
  function needLogin(m) {
    view.innerHTML = '';
    var c = el('div', null, 'ad-card');
    c.append(el('h1', '선생님 로그인이 필요해요'), el('p', m || '관리자 페이지는 구글 계정으로 선생님 로그인한 뒤에 열려요.', 'ad-note'));
    var a = el('a', '로그인하러 가기', 'ad-btn'); a.href = 'index.html'; c.appendChild(a);
    view.appendChild(c);
  }

  // ---- 화면 고르기 ----
  var VIEWS = { home: home, members: members, works: works, points: points, rates: rates, monthly: monthly, report: report, homeuse: homeuse, settings: settings };
  function route() {
    var name = (location.hash || '#home').slice(1).split('?')[0];
    if (!VIEWS[name]) name = 'home';
    document.querySelectorAll('.ad-nav a').forEach(function (a) { a.classList.toggle('on', a.dataset.view === name); });
    if (!D) return;
    view.innerHTML = '';
    VIEWS[name]();
    view.focus({ preventScroll: true });
    if (route.last !== name) scrollTo(0, 0);   // 다른 화면으로 가면 맨 위부터(같은 화면 새로고침은 자리 유지)
    route.last = name;
  }
  addEventListener('hashchange', route);

  // ---- 한눈에 보기 ----
  function home() {
    var now = D.now || Date.now(), today = ymd(now), month = ym(now);
    var ok = students(), waiting = D.students.filter(function (s) { return s.pending; }), resting = ok.filter(function (s) { return s.status === '휴원'; });
    var todayIds = {}; D.visits.forEach(function (v) { if (v.day === today) todayIds[v.studentId] = 1; });
    var monthDone = D.workbooks.filter(function (w) { return isDone(w) && w.done > 0 && ym(w.updatedAt) === month; }).length;
    var monthPts = (D.pointHistory || []).filter(function (r) { return r.amount > 0 && ym(r.at) === month; }).reduce(function (a, r) { return a + r.amount; }, 0);
    view.append(el('h1', '한눈에 보기'), el('p', new Date(now).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }) + ' · 코드마루 학생 현황', 'ad-note'));
    var stats = el('div', null, 'ad-stats');
    [[ok.length - resting.length, '수업 중인 학생'], [waiting.length, '가입 승인 대기', waiting.length > 0, '#members'], [Object.keys(todayIds).length, '오늘 접속한 학생'],
      [monthDone, '이번 달 완료한 수업'], [monthPts.toLocaleString() + ' P', '이번 달 받은 포인트(최근 내역)'], [resting.length, '쉬는 중(휴원)']].forEach(function (x) {
      var c = el(x[3] ? 'a' : 'div', null, 'ad-stat' + (x[2] ? ' hot' : '')); if (x[3]) { c.href = x[3]; c.style.textDecoration = 'none'; }
      c.append(el('b', String(x[0])), el('span', x[1])); stats.appendChild(c);
    });
    view.appendChild(stats);
    if (waiting.length) { view.appendChild(el('h2', '가입 승인 대기')); view.appendChild(approvals(waiting)); }
    var grid = el('div', null, 'ad-grid2');
    var a = el('div'); a.appendChild(el('h2', '최근 완료한 수업'));
    a.appendChild(table(['학생', '수업', '시각'], D.workbooks.filter(function (w) { return isDone(w) && w.done > 0; }).sort(function (x, y) { return y.updatedAt - x.updatedAt; }).slice(0, 10)
      .map(function (w) { return [byId(w.studentId).name, clean(w.title), fmt(w.updatedAt)]; })));
    var b = el('div'); b.appendChild(el('h2', '최근 포인트'));
    b.appendChild(table(['학생', '점수', '내용', '시각'], (D.pointHistory || []).slice(0, 10).map(function (r) { return [byId(r.studentId).name, (r.amount > 0 ? '+' : '') + r.amount, r.reason || r.kind || '-', fmt(r.at)]; })));
    grid.append(a, b); view.appendChild(grid);
  }

  function approvals(list) {
    return table(['이름', '가입 신청', ''], list.map(function (s) {
      var w = el('span'), yes = btn('승인', 'small'), no = btn('거절', 'small bad');
      no.style.marginLeft = '6px';
      function act(ok) {
        if (!ok && !confirm(s.name + ' 학생의 가입 신청을 거절할까요? 신청이 지워져요.')) return;
        yes.disabled = no.disabled = true;
        api('approve', { id: s.id, ok: ok }).then(function () { toast(ok ? s.name + ' 학생을 승인했어요.' : '거절했어요.'); load(true); }, function (e) { toast(e.message, true); yes.disabled = no.disabled = false; });
      }
      yes.onclick = function () { act(true); }; no.onclick = function () { act(false); };
      w.append(yes, no); return [s.name, s.memo || '-', w];
    }));
  }

  // ---- 회원 관리 ----
  var memberState = { q: '', g: '*', st: '*', pick: null };
  function members() {
    view.append(el('h1', '회원 관리'), el('p', '학생의 이름·반·메모·번호를 고치고, 쉬는 학생은 휴원으로 바꿔요. 휴원이면 로그인할 수 없고, 기록과 포인트는 그대로 남아요.', 'ad-note'));
    var waiting = D.students.filter(function (s) { return s.pending; });
    if (waiting.length) { view.appendChild(el('h2', '가입 승인 대기 ' + waiting.length + '명')); view.appendChild(approvals(waiting)); }
    view.appendChild(el('h2', '학생 목록'));
    var tools = el('div', null, 'ad-tools'), q = el('input'), g = groupSelect(true), st = el('select');
    q.type = 'search'; q.placeholder = '이름 검색'; q.value = memberState.q; q.setAttribute('aria-label', '이름 검색');
    [['*', '모든 상태'], ['승인', '수업 중'], ['휴원', '휴원']].forEach(function (x) { var o = el('option', x[1]); o.value = x[0]; st.appendChild(o); });
    g.value = memberState.g; st.value = memberState.st;
    tools.append(q, g, st); view.appendChild(tools);
    var listBox = el('div'), detailBox = el('div'); view.append(listBox, detailBox);
    var month = ym(D.now || Date.now());
    function draw() {
      memberState.q = q.value.trim(); memberState.g = g.value; memberState.st = st.value;
      var list = students().filter(function (s) {
        return (!memberState.q || s.name.indexOf(memberState.q) >= 0) && (memberState.g === '*' || (s.group || '') === memberState.g) &&
          (memberState.st === '*' || (memberState.st === '휴원' ? s.status === '휴원' : s.status !== '휴원'));
      }).sort(function (a, b) { return (a.group || '힣').localeCompare(b.group || '힣') || a.name.localeCompare(b.name); });
      listBox.textContent = '';
      listBox.appendChild(el('p', list.length + '명', 'ad-note'));
      listBox.appendChild(table(['이름', '반', '상태', '포인트', '타자', '이번 달 완료', '마지막 활동', '포트폴리오', ''], list.map(function (s) {
        return [s.name, s.group || '-', pill(s), (s.points || 0).toLocaleString() + ' P', typingTop(s.id) ? typingTop(s.id) + '타' : '-', doneIn(s.id, month).length + '개', fmt(lastActive(s.id)), s.slug ? '/' + s.slug : '-', btn('관리', 'small ghost', function () { memberState.pick = s.id; detail(); })];
      }), function (row, i) { if (list[i].id === memberState.pick) row.className = 'pick'; }));
    }
    function detail() {
      draw();
      var s = D.students.filter(function (x) { return x.id === memberState.pick; })[0];
      detailBox.textContent = ''; if (!s) return;
      var card = el('div', null, 'ad-card ad-detail');
      card.appendChild(el('h2', s.name + ' 학생 관리'));
      var grid = el('div', null, 'ad-grid2'), form = el('form');
      function field(label, input, hint) { var f = el('label', null, 'ad-field'); f.append(document.createTextNode(label), input); if (hint) f.appendChild(el('small', hint)); form.appendChild(f); return input; }
      var name = field('이름', el('input')); name.value = s.name; name.maxLength = 20; name.required = true;
      var group = field('반', el('input'), '예) 월수 4시 · 기존 반 이름을 고르거나 새로 써요'); group.value = s.group || ''; group.maxLength = 20;
      var dl = el('datalist'); dl.id = 'groupList'; groupsOf().forEach(function (x) { var o = el('option'); o.value = x; dl.appendChild(o); }); group.setAttribute('list', 'groupList'); form.appendChild(dl);
      var memo = field('메모', el('textarea'), '학부모 연락 시간, 특이 사항 등(학생에게는 보이지 않아요)'); memo.value = s.memo || ''; memo.maxLength = 200; memo.rows = 2;
      var pin = field('새 번호(4자리)', el('input'), '번호를 잊었을 때만 써요. 비워 두면 그대로예요.'); pin.inputMode = 'numeric'; pin.pattern = '\\d{4}'; pin.maxLength = 4; pin.placeholder = '예) 2580';
      var slug = field('포트폴리오 주소', el('input'), '학생이 codemaru.kr/주소 에서 로그인 번호로 자기 기록을 봐요. 영어 소문자 1~6자 + 숫자(예: lhr, lhr2)');
      slug.value = s.slug || ''; slug.maxLength = 9; slug.pattern = '[a-zA-Z]{1,6}[0-9]{0,3}'; slug.placeholder = '예) lhr'; slug.autocapitalize = 'off'; slug.spellcheck = false;
      var status = field('상태', el('select')); [['승인', '수업 중'], ['휴원', '휴원(로그인 막기)']].forEach(function (x) { var o = el('option', x[1]); o.value = x[0]; status.appendChild(o); }); status.value = s.status === '휴원' ? '휴원' : '승인';
      var save = btn('저장', ''); save.type = 'submit'; var close = btn('닫기', 'ghost', function () { memberState.pick = null; detailBox.textContent = ''; draw(); });
      var bar = el('div', null, 'ad-bar'); bar.append(save, close); form.appendChild(bar);
      form.onsubmit = function (e) {
        e.preventDefault();
        var body = { id: s.id, name: name.value.trim(), group: group.value.trim(), memo: memo.value.trim(), status: status.value };
        var sl = slug.value.trim().toLowerCase();
        if (sl && sl !== s.slug) { if (!/^[a-z]{1,6}\d{0,3}$/.test(sl)) { toast('주소는 영어 소문자 1~6자 뒤에 숫자 0~3자리예요.', true); return; } body.slug = sl; }
        if (pin.value.trim()) { if (!/^\d{4}$/.test(pin.value.trim())) { toast('번호는 숫자 4자리예요.', true); return; } body.pin = pin.value.trim(); }
        save.disabled = true;
        api('studentUpdate', body).then(function () { toast('저장했어요.'); load(true); }, function (err) { toast(err.message, true); save.disabled = false; });
      };
      var right = el('div');
      right.append(el('h3', '누적 ' + (s.points || 0).toLocaleString() + ' P' + (typingTop(s.id) ? ' · 한글 타자 최고 ' + typingTop(s.id) + '타' : '')));
      if (s.slug) {
        var pfb = el('div', null, 'ad-pf'), pfa = el('a', pfUrl(s)); pfa.href = SITE + s.slug; pfa.target = '_blank'; pfa.rel = 'noopener';
        pfb.append(el('span', '포트폴리오 '), pfa, btn('주소 복사', 'small ghost', function () { copy(pfUrl(s)); }),
          btn('안내문 복사', 'small ghost', function () { copy(s.name + ' 학생의 코딩 포트폴리오\n' + pfUrl(s) + '\n비밀번호: 학생이 로그인할 때 쓰는 4자리 번호\n(완료한 수업·만든 작품·타자 기록을 볼 수 있어요)'); }));
        right.appendChild(pfb);
      } else right.appendChild(el('p', '포트폴리오 주소는 승인한 뒤 관리자 페이지를 새로 열면 자동으로 생겨요.', 'ad-note'));
      var give = el('form', null, 'ad-tools'), amt = el('input'), why = el('input'), go = btn('포인트 반영', 'small'); go.type = 'submit';
      amt.type = 'number'; amt.placeholder = '+지급 / -차감'; amt.required = true; amt.style.width = '130px'; why.placeholder = '이유'; why.required = true; why.maxLength = 120;
      give.append(amt, why, go);
      give.onsubmit = function (e) { e.preventDefault(); go.disabled = true; grant([s.id], Number(amt.value), why.value.trim()).then(function () { load(true); }, function () { go.disabled = false; }); };
      right.appendChild(give);
      var allDone = doneIn(s.id).sort(function (a, b) { return b.updatedAt - a.updatedAt; });
      right.appendChild(el('h3', '완료한 수업 전체 ' + allDone.length + '개'));
      var hist = table(['수업', '시각'], allDone.map(function (w) { return [clean(w.title), fmt(w.updatedAt)]; })); hist.classList.add('ad-scroll'); right.appendChild(hist);
      right.appendChild(el('h3', '최근 포인트'));
      right.appendChild(table(['점수', '내용', '시각'], (D.pointHistory || []).filter(function (r) { return r.studentId === s.id; }).slice(0, 10).map(function (r) { return [(r.amount > 0 ? '+' : '') + r.amount, r.reason || r.kind, fmt(r.at)]; })));
      var links = el('div', null, 'ad-bar');
      var wl = el('a', '🎨 이 학생 작품 모아 보기', 'ad-btn small ghost'); wl.href = '#works'; wl.onclick = function () { worksState.sid = s.id; };
      var link = el('a', '🗂 이 학생 월말 기록표', 'ad-btn small ghost'); link.href = '#monthly'; link.onclick = function () { monthlyState.ids = [s.id]; };
      links.append(wl, link); right.appendChild(links);
      grid.append(form, right); card.appendChild(grid);
      card.appendChild(pastBox(s, allDone));
      // 학생 삭제(되돌릴 수 없음): 이름을 똑같이 써야 단추가 켜진다. 잠깐 쉬는 학생은 휴원으로.
      var danger = el('details', null, 'ad-danger'), dsum = el('summary', '학생 삭제');
      var dtext = el('p', s.name + ' 학생의 계정과 모든 기록(완료한 수업·수업 기록·포인트·월간 리포트·학부모 연락처·작품 게시판 글)을 지워요. 작품 파일은 Drive 휴지통으로 가요. 되돌릴 수 없어요. 잠깐 쉬는 학생이면 위의 상태를 「휴원」으로 바꿔 주세요.');
      var dform = el('form', null, 'ad-tools'), dname = el('input'), dgo = btn('영구 삭제', 'bad'); dgo.type = 'submit'; dgo.disabled = true;
      dname.placeholder = '확인: ' + s.name + ' 이라고 써 주세요'; dname.setAttribute('aria-label', '삭제 확인용 학생 이름'); dname.autocomplete = 'off'; dname.style.minWidth = '240px';
      dname.oninput = function () { dgo.disabled = dname.value.replace(/\s+/g, ' ').trim() !== s.name.replace(/\s+/g, ' ').trim(); };
      dform.append(dname, dgo);
      dform.onsubmit = function (e) {
        e.preventDefault();
        if (dgo.disabled || !confirm(s.name + ' 학생을 정말 지울까요? 되돌릴 수 없어요.')) return;
        dgo.disabled = true; dgo.textContent = '지우는 중…';
        api('studentDelete', { id: s.id, confirmName: dname.value.trim() }).then(function (o) {
          var r = (o.deleted && o.deleted.removed) || {};
          toast(s.name + ' 학생을 지웠어요(워크북 ' + (r.workbooks || 0) + '줄 · 수업 기록 ' + (r.visits || 0) + '줄 · 포인트 ' + (r.points || 0) + '줄 · 작품 ' + (r.gallery || 0) + '개).');
          memberState.pick = null; gallery = null; load(true);
        }, function (err) { toast(err.message, true); dgo.textContent = '영구 삭제'; dgo.disabled = false; });
      };
      danger.append(dsum, dtext, dform); card.appendChild(danger);
      detailBox.appendChild(card);
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    q.oninput = draw; g.onchange = draw; st.onchange = draw;
    if (memberState.pick) detail(); else draw();
  }

  // ---- 학생 작품(작품 게시판을 학생별로 모아 보기) ----
  // 선생님은 작품 게시판(galleryList)의 모든 작품을 본다: 나만 보기·승인 대기·숨김까지. 파일 작품은 안전하게 열리는 게시판 화면에서 연다.
  var gallery = null, worksState = { sid: '*', g: '*', st: '*', q: '' };
  var KIND = { entry: '엔트리', scratch: '스크래치', web: '웹 주소' }, VIS = { me: '나만', class: '우리 반', all: '모두' };
  var WSTATUS = { '대기': '승인 대기', '승인': '함께 보는 중', '숨김': '숨김', '개인': '나만 보기' };
  function loadGallery(force) {
    if (gallery && !force) return Promise.resolve(gallery);
    return api('galleryList').then(function (o) { gallery = o.items || []; return gallery; });
  }
  function works() {
    view.append(el('h1', '학생 작품'), el('p', '학생이 작품 게시판에 올린 작품을 학생별로 모아 봐요. 선생님에게는 나만 보기·승인 대기·숨긴 작품까지 모두 보여요. 승인·숨김과 파일 실행은 작품 게시판에서 해요.', 'ad-note'));
    var box = el('div'); view.appendChild(box);
    box.appendChild(el('p', '작품을 불러오는 중…', 'ad-note'));
    loadGallery(true).then(function () { drawWorks(box); }, function (e) { box.textContent = ''; box.appendChild(el('p', '작품을 불러오지 못했어요: ' + e.message, 'ad-note')); });
  }
  function drawWorks(box) {
    box.textContent = '';
    var tools = el('div', null, 'ad-tools'), who = el('select'), g = groupSelect(true), st = el('select'), q = el('input');
    who.setAttribute('aria-label', '학생'); st.setAttribute('aria-label', '상태'); q.type = 'search'; q.placeholder = '제목 검색'; q.setAttribute('aria-label', '제목 검색');
    var o0 = el('option', '모든 학생(학생별 요약)'); o0.value = '*'; who.appendChild(o0);
    students(true).slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (s) { var o = el('option', s.name + (s.group ? ' · ' + s.group : '')); o.value = s.id; who.appendChild(o); });
    [['*', '모든 상태'], ['대기', '승인 대기'], ['승인', '함께 보는 중'], ['개인', '나만 보기'], ['숨김', '숨김']].forEach(function (x) { var o = el('option', x[1]); o.value = x[0]; st.appendChild(o); });
    who.value = worksState.sid; if (who.value !== worksState.sid) who.value = '*'; g.value = worksState.g; st.value = worksState.st; q.value = worksState.q;
    var open = el('a', '작품 게시판 열기', 'ad-btn small ghost'); open.href = 'v/gallery/index.html'; open.target = '_blank'; open.rel = 'noopener';
    tools.append(who, g, st, q, open); box.appendChild(tools);
    var out = el('div'); box.appendChild(out);
    function pass(it) {
      return (worksState.g === '*' || (byId(it.studentId).group || '') === worksState.g) && (worksState.st === '*' || it.status === worksState.st) &&
        (!worksState.q || String(it.title).indexOf(worksState.q) >= 0);
    }
    function draw() {
      worksState.sid = who.value; worksState.g = g.value; worksState.st = st.value; worksState.q = q.value.trim();
      out.textContent = '';
      var list = gallery.filter(function (it) { return String(it.studentId).indexOf('T:') !== 0 && pass(it); });
      if (worksState.sid === '*') {
        var per = {}, thisMonth = ym(D.now || Date.now());
        list.forEach(function (it) { var p = per[it.studentId] || (per[it.studentId] = { n: 0, wait: 0, last: 0, month: 0 }); p.n++; if (it.status === '대기') p.wait++; if (it.at > p.last) p.last = it.at; if (ym(it.at) === thisMonth) p.month++; });
        var ids = Object.keys(per).sort(function (a, b) { return per[b].last - per[a].last; });
        out.appendChild(el('p', '작품 ' + list.length + '개 · 학생 ' + ids.length + '명', 'ad-note'));
        out.appendChild(table(['학생', '반', '작품', '이번 달', '승인 대기', '최근 올린 날', ''], ids.map(function (id) {
          var s = byId(id), p = per[id];
          return [s.name, s.group || '-', p.n + '개', p.month + '개', p.wait ? p.wait + '개' : '-', fmt(p.last), btn('모아 보기', 'small ghost', function () { who.value = id; draw(); })];
        })));
        return;
      }
      var mine = list.filter(function (it) { return it.studentId === worksState.sid; }), s = byId(worksState.sid);
      out.appendChild(el('h2', s.name + ' 학생 작품 ' + mine.length + '개'));
      if (!mine.length) { out.appendChild(el('p', '조건에 맞는 작품이 없어요.', 'ad-note')); return; }
      var grid = el('div', null, 'ad-works');
      mine.forEach(function (it) {
        var c = el('article', null, 'ad-work'), top = el('div', null, 'ad-work-top');
        var kind = it.file ? (it.file.ext || '파일').toUpperCase() + ' 파일' : (KIND[it.kind] || '웹');
        top.append(el('span', kind, 'ad-pill'), el('span', WSTATUS[it.status] || it.status, 'ad-pill' + (it.status === '대기' ? ' wait' : it.status === '숨김' ? ' rest' : '')), el('small', it.day + ' · ' + (VIS[it.vis] || it.vis)));
        c.append(top, el('h3', it.title));
        var lab = /^\[연구소:([a-z]+-\d{2})\]\s*/.exec(it.desc || ''), desc = String(it.desc || '').replace(/^\[연구소:[^\]]+\]\s*/, '');
        if (lab) c.appendChild(el('small', 'AI 프로젝트 연구소 · ' + lab[1], 'ad-work-lab'));
        if (desc) c.appendChild(el('p', desc.length > 140 ? desc.slice(0, 140) + '…' : desc));
        var bar = el('div', null, 'ad-bar');
        if (/^https:\/\//i.test(it.url)) { var a = el('a', '작품 열기', 'ad-btn small'); a.href = it.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; bar.appendChild(a); }
        if (it.file) { var f = el('a', '게시판에서 파일 열기', 'ad-btn small ghost'); f.href = 'v/gallery/index.html'; f.target = '_blank'; f.rel = 'noopener'; bar.appendChild(f); }
        c.appendChild(bar); grid.appendChild(c);
      });
      out.appendChild(grid);
    }
    who.onchange = draw; g.onchange = draw; st.onchange = draw; q.oninput = draw;
    draw();
  }

  // ---- 포인트 주기 ----
  function grant(ids, amount, reason) {
    if (!Number.isInteger(amount) || !amount) { toast('점수를 정수로 써 주세요.', true); return Promise.reject(); }
    if (!reason) { toast('이유를 써 주세요.', true); return Promise.reject(); }
    var done = 0, fail = [];
    return ids.reduce(function (p, id) {
      return p.then(function () {
        return api('pointsGrant', { studentId: id, amount: amount, reason: reason, requestId: crypto.randomUUID() }).then(function () { done++; }, function (e) { fail.push(byId(id).name + '(' + e.message + ')'); });
      });
    }, Promise.resolve()).then(function () {
      if (fail.length) toast(done + '명 반영, 실패: ' + fail.join(', '), true); else toast(done + '명에게 ' + (amount > 0 ? '+' : '') + amount + ' P 반영했어요.');
    });
  }
  function points() {
    view.append(el('h1', '포인트 주기'), el('p', '학생을 여러 명 골라 한 번에 주거나 뺄 수 있어요. 수업·문제 점수는 자동으로 들어가니, 여기서는 칭찬·상·정정처럼 선생님이 직접 주는 점수를 다뤄요.', 'ad-note'));
    var card = el('div', null, 'ad-card'), tools = el('div', null, 'ad-tools'), g = groupSelect(true);
    var all = btn('보이는 학생 모두 고르기', 'small ghost'), none = btn('모두 풀기', 'small ghost');
    tools.append(g, all, none); card.appendChild(tools);
    var box = el('div', null, 'ad-checks'), picked = {};
    function drawList() {
      box.textContent = '';
      var list = students().filter(function (s) { return s.status !== '휴원' && (g.value === '*' || (s.group || '') === g.value); });
      var last = null;
      list.sort(function (a, b) { return (a.group || '힣').localeCompare(b.group || '힣') || a.name.localeCompare(b.name); }).forEach(function (s) {
        if ((s.group || '반 없음') !== last) { last = s.group || '반 없음'; box.appendChild(el('h4', last)); }
        var l = el('label'), c = el('input'); c.type = 'checkbox'; c.checked = !!picked[s.id];
        c.onchange = function () { if (c.checked) picked[s.id] = 1; else delete picked[s.id]; count(); };
        l.append(c, document.createTextNode(s.name + ' · ' + (s.points || 0).toLocaleString() + 'P')); box.appendChild(l);
      });
      all.onclick = function () { list.forEach(function (s) { picked[s.id] = 1; }); drawList(); count(); };
    }
    none.onclick = function () { picked = {}; drawList(); count(); };
    g.onchange = drawList; card.appendChild(box);
    card.appendChild(el('h3', '점수'));
    var amt = el('input'); amt.type = 'number'; amt.placeholder = '+지급 / -차감'; amt.style.width = '150px'; amt.setAttribute('aria-label', '점수');
    var chips = el('div', null, 'ad-chips');
    [10, 30, 50, 100, -30, -50].forEach(function (n) { var c = el('button', (n > 0 ? '+' : '') + n, 'ad-chip'); c.type = 'button'; c.onclick = function () { amt.value = n; }; chips.appendChild(c); });
    var row1 = el('div', null, 'ad-tools'); row1.append(amt, chips); card.appendChild(row1);
    card.appendChild(el('h3', '이유'));
    var why = el('input'); why.placeholder = '이유 (학생 기록에 남아요)'; why.maxLength = 120; why.style.minWidth = '280px';
    var rchips = el('div', null, 'ad-chips');
    ['수업 태도 칭찬', '숙제 완료', '친구를 도와줌', '대회·자격 수상', '작품 발표', '정정(잘못 지급)'].forEach(function (t) { var c = el('button', t, 'ad-chip'); c.type = 'button'; c.onclick = function () { why.value = t; }; rchips.appendChild(c); });
    var row2 = el('div', null, 'ad-tools'); row2.append(why, rchips); card.appendChild(row2);
    var info = el('p', '', 'ad-note'), go = btn('포인트 반영');
    function count() { var n = Object.keys(picked).length; info.textContent = n ? n + '명 골랐어요.' : '학생을 골라 주세요.'; go.disabled = !n; }
    go.onclick = function () {
      var ids = Object.keys(picked), n = Number(amt.value);
      if (!confirm(ids.length + '명에게 ' + (n > 0 ? '+' : '') + n + ' P를 반영할까요?\n이유: ' + why.value.trim())) return;
      go.disabled = true; grant(ids, n, why.value.trim()).then(function () { picked = {}; load(true); }, function () { go.disabled = false; });
    };
    var bar = el('div', null, 'ad-bar'); bar.append(go, info); card.appendChild(bar);
    view.appendChild(card);
    drawList(); count();
    view.appendChild(el('h2', '최근 포인트 내역'));
    view.appendChild(table(['학생', '점수', '내용', '누가', '시각'], (D.pointHistory || []).slice(0, 60).map(function (r) { return [byId(r.studentId).name, (r.amount > 0 ? '+' : '') + r.amount, r.reason || r.kind || '-', r.by || '-', fmt(r.at)]; })));
  }

  // ---- 점수 기본값 ----
  function rates() {
    var cur = D.pointRates || {}, def = D.pointDefaults || {};
    view.append(el('h1', '점수 기본값'), el('p', '기준: 1차시(50분) 분량에 약 100점. 바꾼 값은 저장한 뒤 새로 들어가는 점수부터 적용되고, 이미 받은 점수는 바뀌지 않아요. 수업 하나만 다르게 하려면 그 수업 쪽 맨 아래 선생님 점수 칸을 써요.', 'ad-note'));
    var inputs = {}, form = el('form');
    RATES.forEach(function (grp) {
      var card = el('div', null, 'ad-card'); card.appendChild(el('h2', grp[0]));
      grp[1].forEach(function (r) {
        var row = el('div', null, 'ad-rate'), name = el('div'), input = el('input'), d0 = def[r[0]];
        name.append(el('b', r[1]), el('small', r[2]));
        input.type = 'number'; input.min = '0'; input.max = '100000'; input.step = '1'; input.required = true; input.value = cur[r[0]] != null ? cur[r[0]] : (d0 != null ? d0 : '');
        input.setAttribute('aria-label', r[1] + ' 점수');
        var dd = el('span', d0 != null ? '기본 ' + d0 : '', 'def');
        function mark() { input.classList.toggle('changed', d0 != null && Number(input.value) !== d0); }
        input.oninput = mark; mark(); inputs[r[0]] = input;
        row.append(name, input, dd); card.appendChild(row);
      });
      var reset = btn('이 묶음 기본값으로', 'small ghost', function () { grp[1].forEach(function (r) { if (def[r[0]] != null) { inputs[r[0]].value = def[r[0]]; inputs[r[0]].oninput(); } }); });
      card.appendChild(reset); form.appendChild(card);
    });
    var missing = Object.keys(def).filter(function (k) { return !inputs[k]; });
    if (missing.length) form.appendChild(el('p', '이 화면에 없는 서버 점수 항목: ' + missing.join(', ') + ' (admin.js RATES 에 넣어야 해요)', 'ad-note'));
    var save = btn('점수 저장'); save.type = 'submit';
    var allReset = btn('모두 기본값으로', 'ghost', function () { Object.keys(inputs).forEach(function (k) { if (def[k] != null) { inputs[k].value = def[k]; inputs[k].oninput(); } }); });
    var bar = el('div', null, 'ad-bar'); bar.append(save, allReset); form.appendChild(bar);
    form.onsubmit = function (e) {
      e.preventDefault();
      var out = {}; Object.keys(def).forEach(function (k) { out[k] = Number(inputs[k] ? inputs[k].value : def[k]); });
      save.disabled = true;
      api('pointsSetRates', { rates: out }).then(function () { toast('점수 기본값을 저장했어요.'); load(true); }, function (err) { toast(err.message, true); save.disabled = false; });
    };
    view.appendChild(form);
  }

  // ---- 월말 기록표 ----
  var monthlyState = { ids: null, month: null };
  function monthly() {
    var now = new Date(D.now || Date.now()), defMonth = now.getDate() <= 7 ? ym(new Date(now.getFullYear(), now.getMonth() - 1, 15).getTime()) : ym(now.getTime());
    view.append(el('h1', '월말 기록표'), el('p', '학생마다 A4 한 장짜리 한 달 학습 기록표를 만들어요. 선생님 의견을 쓰고 인쇄하거나 PDF로 저장해요. 의견은 이 기기에 저장돼요.', 'ad-note'));
    var card = el('div', null, 'ad-card no-print'), tools = el('div', null, 'ad-tools'), month = el('input'), g = groupSelect(true);
    month.type = 'month'; month.value = monthlyState.month || defMonth; month.setAttribute('aria-label', '기록표 달');
    tools.append(month, g); card.appendChild(tools);
    var box = el('div', null, 'ad-checks'), picked = {};
    (monthlyState.ids || []).forEach(function (id) { picked[id] = 1; });
    function drawList() {
      box.textContent = '';
      var list = students().filter(function (s) { return g.value === '*' || (s.group || '') === g.value; }).sort(function (a, b) { return (a.group || '힣').localeCompare(b.group || '힣') || a.name.localeCompare(b.name); });
      if (!monthlyState.ids) list.forEach(function (s) { if (s.status !== '휴원') picked[s.id] = 1; });
      var last = null;
      list.forEach(function (s) {
        if ((s.group || '반 없음') !== last) { last = s.group || '반 없음'; box.appendChild(el('h4', last)); }
        var l = el('label'), c = el('input'); c.type = 'checkbox'; c.checked = !!picked[s.id];
        c.onchange = function () { monthlyState.ids = monthlyState.ids || []; if (c.checked) picked[s.id] = 1; else delete picked[s.id]; };
        l.append(c, document.createTextNode(s.name + (s.status === '휴원' ? ' (휴원)' : ''))); box.appendChild(l);
      });
    }
    g.onchange = function () { picked = {}; monthlyState.ids = null; drawList(); };
    card.appendChild(box);
    var make = btn('기록표 만들기'), print = btn('인쇄 / PDF 저장', 'ghost', function () { window.print(); }); print.hidden = true;
    var bar = el('div', null, 'ad-bar'); bar.append(make, print); card.appendChild(bar);
    view.appendChild(card);
    var out = el('div', null, 'mr-print'); view.appendChild(out);
    drawList();
    make.onclick = async function () {
      var ids = Object.keys(picked); if (!ids.length) { toast('학생을 골라 주세요.', true); return; }
      monthlyState.month = month.value; make.disabled = true; out.textContent = ''; out.appendChild(el('p', '기록을 모으는 중…', 'ad-note no-print'));
      var stats = {};
      try { stats = (await api('monthStats', { month: month.value })).stats || {}; }
      catch (err) { toast('온 날·포인트 통계를 받지 못했어요(서버 새 버전 배포 필요). 수업 기록만으로 만들어요.', true); }
      await loadGallery().catch(function () {});
      out.textContent = '';
      ids.map(byId).sort(function (a, b) { return (a.group || '').localeCompare(b.group || '') || a.name.localeCompare(b.name); }).forEach(function (s) { out.appendChild(sheet(s, month.value, stats[s.id] || null)); });
      print.hidden = false; make.disabled = false;
      toast(ids.length + '명의 기록표를 만들었어요. 의견을 쓰고 인쇄해요.');
    };
  }
  function sheet(s, month, st) {
    var done = doneIn(s.id, month).sort(function (a, b) { return a.updatedAt - b.updatedAt; });
    var prog = [], seen = {};
    D.workbooks.forEach(function (w) {
      var wb = String(w.workbook);
      if (w.studentId !== s.id || isDone(w) || wb === 'done-index' || /~\d+$/.test(wb) || ym(w.updatedAt) !== month || !w.total || w.done >= w.total) return;
      var t = clean(w.title); if (seen[t]) return; seen[t] = 1; prog.push({ t: t, done: w.done, total: w.total });
    });
    var days = st ? st.days : Object.keys(D.visits.reduce(function (m, v) { if (v.studentId === s.id && v.day.slice(0, 7) === month) m[v.day] = 1; return m; }, {})).length;
    var earned = st ? st.earned : (D.pointHistory || []).filter(function (r) { return r.studentId === s.id && r.amount > 0 && ym(r.at) === month; }).reduce(function (a, r) { return a + r.amount; }, 0);
    var page = el('section', null, 'mr-sheet');
    var head = el('div', null, 'mr-head'), logo = el('img'); logo.src = 'icons/icon-192.png'; logo.width = 36; logo.height = 36; logo.alt = '';
    head.append(logo, el('h3', '코드마루 월말 학습 기록표'), el('span', monthLabel(month))); page.appendChild(head);
    var info = el('table', null, 'mr-info');
    [['이름', s.name, '반', s.group || '-'], ['기간', month + '-01 ~ ' + month + '-' + pad(new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate()), '발급일', ymd(Date.now())]].forEach(function (r) {
      var tr = el('tr'); tr.append(el('th', r[0]), el('td', r[1]), el('th', r[2]), el('td', r[3])); info.appendChild(tr);
    });
    page.appendChild(info);
    var sum = el('div', null, 'mr-sum');
    [[days + '일', '학원에서 공부한 날'], [done.length + '개', '완료한 수업'], ['+' + earned.toLocaleString(), '이번 달 받은 포인트'], [(s.points || 0).toLocaleString(), '누적 포인트']].forEach(function (x) { var d = el('div'); d.append(el('b', x[0]), el('span', x[1])); sum.appendChild(d); });
    page.appendChild(sum);
    page.appendChild(el('h4', '이번 달 완료한 수업'));
    // A4 한 장에 들어가게: 8개가 넘으면 두 줄씩(왼쪽·오른쪽) 놓고 최대 18개까지 적는다.
    var two = done.length > 8, MAX = two ? 18 : 8, shown = done.slice(0, MAX), half = two ? Math.ceil(shown.length / 2) : shown.length, cols = two ? 4 : 2;
    var lt = el('table', null, 'mr-list' + (two ? ' two' : '')), hr = el('tr'); hr.append(el('th', '날짜'), el('th', '수업')); if (two) hr.append(el('th', '날짜'), el('th', '수업')); lt.appendChild(hr);
    for (var i = 0; i < half; i++) {
      var tr = el('tr');
      (two ? [shown[i], shown[i + half]] : [shown[i]]).forEach(function (w) { tr.append(el('td', w ? ymd(w.updatedAt).slice(5) : ''), el('td', w ? clean(w.title) : '')); });
      lt.appendChild(tr);
    }
    if (!done.length) { var tr0 = el('tr'), td0 = el('td', '이번 달 완료 기록이 없어요.'); td0.colSpan = cols; tr0.appendChild(td0); lt.appendChild(tr0); }
    if (done.length > MAX) { var trm = el('tr'), tdm = el('td', '외 ' + (done.length - MAX) + '개'); tdm.colSpan = cols; trm.appendChild(tdm); lt.appendChild(trm); }
    page.appendChild(lt);
    var trun = ((D.typing && D.typing[s.id] && D.typing[s.id].runs) || []).filter(function (r) { return r.d.slice(0, 7) === month && r.l === 'ko' && r.a >= 80; });
    if (trun.length) {
      var tb = Math.max.apply(null, trun.map(function (r) { return r.s; }));
      page.appendChild(el('p', '⌨️ 이번 달 한글 타자 연습 ' + trun.length + '번 · 최고 분당 ' + tb + '타 · 평균 ' + Math.round(trun.reduce(function (a, r) { return a + r.s; }, 0) / trun.length) + '타', 'mr-works'));
    }
    var myWorks = (gallery || []).filter(function (it) { return it.studentId === s.id && it.day.slice(0, 7) === month && it.status !== '숨김'; });
    if (myWorks.length) {
      page.appendChild(el('h4', '이번 달 올린 작품 ' + myWorks.length + '개'));
      page.appendChild(el('p', myWorks.slice(0, 6).map(function (it) { return it.title; }).join(' · ') + (myWorks.length > 6 ? ' 외 ' + (myWorks.length - 6) + '개' : ''), 'mr-works'));
    }
    if (prog.length) {
      page.appendChild(el('h4', '진행 중인 과정'));
      var pt = el('table', null, 'mr-list');
      prog.slice(0, 6).forEach(function (p) { var tr = el('tr'); tr.append(el('td', p.t), el('td', p.done + ' / ' + p.total)); pt.appendChild(tr); });
      page.appendChild(pt);
    }
    var key = 'codemaru-monthly-' + month + '-' + s.id, saved = {};
    try { saved = JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { saved = {}; }
    function note(label, field, ph) {
      page.appendChild(el('h4', label));
      var b = el('div', null, 'mr-box'); b.contentEditable = 'true'; b.setAttribute('role', 'textbox'); b.setAttribute('aria-label', s.name + ' ' + label);
      b.textContent = saved[field] || ''; if (!b.textContent) b.dataset.ph = ph;
      b.oninput = function () { saved[field] = b.innerText.slice(0, 800); try { localStorage.setItem(key, JSON.stringify(saved)); } catch (e) {} };
      page.appendChild(b);
    }
    note('선생님 의견', 'comment', '');
    note('다음 달 계획', 'plan', '');
    var sign = el('div', null, 'mr-sign'); sign.append(el('div', '담당 선생님 확인'), el('div', '학부모 확인')); page.appendChild(sign);
    if (s.slug) page.appendChild(el('p', '📁 학생 포트폴리오 ' + pfUrl(s) + ' — 비밀번호는 학생 로그인 번호 4자리예요. 완료한 수업·작품·타자 기록을 언제든 볼 수 있어요.', 'mr-pf'));
    page.appendChild(el('p', '코드마루 코딩·AI 탐구학원 · 010-9855-1322', 'mr-foot'));
    return page;
  }

  // ---- 학부모 리포트 ----
  function report() {
    view.append(el('h1', '학부모 리포트'), el('p', '한 달 기록과 선생님 한마디로 그림 한 장을 만들어 카톡으로 보내요.', 'ad-note'));
    var box = el('div', null, 'ad-card'); view.appendChild(box);
    if (window.CHReport) CHReport.mount(box, D, students(), function (m) { if (m) toast(m); });
    else box.appendChild(el('p', '리포트 기능을 불러오지 못했어요.', 'ad-note'));
  }

  // ---- 설정 ----
  function isPhone() { return !!(navigator.userAgentData && navigator.userAgentData.mobile) || /iPhone|iPod|Android.*Mobile/i.test(navigator.userAgent || ''); }
  async function autoTeacherKey() {   // 정답 파일은 사이트 비밀번호로 잠겨 있어, 선생님 로그인한 이 기기의 사이트 열쇠를 정답 열쇠로 등록한다
    try {
      var k = await CHCore.loadKey(), had = await CHCore.loadTeacherKey().catch(function () { return null; });
      if (k && !had) { await CHCore.decrypt(k, await CHCore.getBuf(BASE, 'teacher-check.enc')); await CHCore.saveTeacherKey(k); }
    } catch (e) { /* 정답 파일이 없거나 열쇠가 다르면 그대로 둔다 */ }
  }
  // 지난 수업 완료 체크: 포인트 제도 전에 한 수업을 학생별로 완료로 적는다(포인트 없음). 수업 목록은 v/__projects.json
  var projectList = null;
  // 수업을 교재(큰 프로젝트)로 묶는다. 폴더 이름에서 끝의 해시·차시 번호를 떼어 같은 것끼리, 깊은 폴더는 윗폴더끼리 묶는다.
  // 이름표는 묶인 수업 제목의 앞쪽 공통 부분(없으면 폴더 이름)이고, 혼자 남은 수업은 '그 밖의 수업'으로 모은다.
  var BOOK_NAMES = { 'entry/dict-block': '엔트리 블록사전 #권', 'entry/work-basic': '엔트리 기초 #권 작품', 'entry/work-game': '엔트리 게임 #권 작품', 'entry/work-book': '엔트리 프로젝트 #권 작품', 'entry/project': '엔트리 프로젝트 #',
    'entry/cos2': 'COS 엔트리 문제', 'scratch/project-basic': '스크래치 기초 #권', 'scratch/project-game': '스크래치 게임 #권', 'scratch/project-animation': '스크래치 애니메이션 #', 'scratch/project-dictionary': '스크래치 블록사전 #', 'scratch/project-book': '스크래치 프로젝트 #권', 'scratch/project-block': '스크래치 블록 #권' };
  function groupLessons(leaves, titles) {
    titles = titles || {};
    function keyOf(path) {
      var parts = path.replace(/\/$/, '').split('/');
      if (parts.length > 2) { var mm = /^([a-z]+\d+)-\d+$/i.exec(parts[parts.length - 1]); return parts.slice(0, -1).join('/') + (mm ? '/' + mm[1] : ''); }   // junior/m3-2 → junior/m3 (월별 4회)
      var n = parts[1] || parts[0];
      return parts[0] + '/' + n.replace(/-[0-9a-f]{10,}$/, '').replace(/[-_](?:lesson|unit|work|set|step)[-_]?\d+$/i, '');   // 권 번호(basic4, block1)는 남긴다
    }
    var map = {}, order = [];
    leaves.forEach(function (f) { var k = keyOf(f.path); if (!map[k]) { map[k] = []; order.push(k); } map[k].push(f); });
    // 혼자 남은 것은 마지막 '-' 앞까지로 한 번 더 묶어 본다(cos2-02-snowball → cos2-02)
    var single = order.filter(function (k) { return map[k].length === 1; }), again = {};
    single.forEach(function (k) { var f = map[k][0], name = f.path.replace(/\/$/, ''), i = name.lastIndexOf('-'); var k2 = i > name.indexOf('/') ? name.slice(0, i) : ''; if (k2) (again[k2] = again[k2] || []).push(k); });
    Object.keys(again).forEach(function (k2) {
      if (again[k2].length < 2) return;
      if (!map[k2]) { map[k2] = []; order.push(k2); }
      again[k2].forEach(function (k) { map[k2] = map[k2].concat(map[k]); delete map[k]; });
    });
    function label(items, key) {
      if (titles[key + '/']) return titles[key + '/'];
      var jm = /^scratch\/junior\/m(\d+)$/.exec(key); if (jm) return '스크래치 주니어 ' + jm[1] + '개월차 (' + jm[1] + '권 · 4회)';
      var a = items[0].title || '', n = a.length;
      items.forEach(function (f) { var b = f.title || ''; var i = 0; while (i < n && i < b.length && a[i] === b[i]) i++; n = i; });
      var s = a.slice(0, n).replace(/[\s·\-_:(\[]+$/, '').replace(/\s\d*$/, '').trim();
      if (s.length >= 2) return s;

      var m = /^(.*?)-?(\d+)?(?:-\d+)?$/.exec(key), named = m && BOOK_NAMES[m[1]];
      if (named) return named.replace('#', m[2] || '').replace(/\s+권/, '권').trim();
      return key.split('/').slice(1).join('/') || key;
    }
    var groups = [], rest = [];
    order.sort(function (x, y) { return x.localeCompare(y, 'en', { numeric: true }); });
    order.forEach(function (k) {
      if (!map[k]) return;
      var items = map[k].slice().sort(function (x, y) { return x.path.localeCompare(y.path, 'en', { numeric: true }); });
      if (items.length > 1) groups.push({ key: k, label: label(items, k), items: items }); else rest.push(items[0]);
    });
    if (rest.length > 1) groups.push({ key: '', label: '그 밖의 수업', items: rest }); else if (rest.length) groups.push({ key: '', label: '', items: rest });
    return groups;
  }
  // 지난 수업 체크의 맨 위 묶음: 스크래치 주니어와 COS 급수 대비는 폴더 이름과 상관없이 따로 묶는다(스크래치·엔트리와 다른 카테고리)
  var COS1_SLUGS = ['doll-target', 'library-loan', 'cat-feeding', 'foot-size-average', 'digit-calculator', 'seagull-feeding', 'food-order', 'pedicure', 'pythagoras', 'leak-detector'];
  var SYN_TOPS = { 'cos3/': 'COS 3급 대비 (엔트리 준비)', 'cos2/': 'COS 2급 대비 (스크래치·엔트리 모의고사)', 'cos1/': 'COS 1급 대비 (스크래치·엔트리 모의고사)' };
  function topOf(path) {
    if (/^scratch\/junior\//.test(path)) return 'scratch/junior/';
    var m = /^entry\/([^\/]+)\/?$/.exec(path);
    if (m) {
      if (/^cos3(-|$)/.test(m[1])) return 'cos3/';
      if (/^cos2(-|$)/.test(m[1])) return 'cos2/';
      if (/^cos1(-|$)/.test(m[1]) || COS1_SLUGS.indexOf(m[1]) >= 0) return 'cos1/';
    }
    var sm = /^scratch\/(cos[12])-\d+\/?$/.exec(path);
    if (sm) return sm[1] + '/';
    return path.split('/')[0] + '/';
  }
  // ---- 엔트리·COS 묶음: 엔트리는 교재별로 한 달(8차시)씩, COS는 회차(10문제)별로 묶는다 ----
  var ENTRY_ORDER = null;   // 엔트리 수업 목록 카드 순서(교재 안의 차시 순서) — 폴더 이름이 해시라 목록 순서를 따른다
  function loadEntryOrder() {
    if (ENTRY_ORDER) return Promise.resolve(ENTRY_ORDER);
    return fetch('v/entry/index.html', { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : ''; }).then(function (t) {
      var o = {}, i = 0, re = /class="lesson-card"[^>]*href="(?:\.\.\/entry\/)?([^"\/]+)\/?"/g, m;
      while ((m = re.exec(t))) if (!(m[1] in o)) o[m[1]] = i++;
      ENTRY_ORDER = o; return o;
    }, function () { ENTRY_ORDER = {}; return ENTRY_ORDER; });
  }
  var ENTRY_BASIC1 = ['race', 'crab', 'hats', 'flower', 'firetruck', 'potion', 'maze', 'balloons'];
  var ENTRY_BOOKS = [   // [키, 이름, 시험] — 위에서부터 먼저 맞는 교재로 들어간다
    ['b1', '엔트리 블록사전 1', function (x) { return /^dict-block1-/.test(x); }],
    ['b2', '엔트리 블록사전 2', function (x) { return /^dict-block2-/.test(x); }],
    ['k1', '엔트리 기초 1권', function (x) { return /^book1-(lesson|unit)\d+$/.test(x); }],
    ['k2', '엔트리 기초 2권', function (x) { return /^basic2-lesson\d+$/.test(x); }],
    ['k3', '엔트리 기초 3권', function (x) { return /^basic3-lesson\d+$/.test(x); }],
    ['k4', '엔트리 기초 4권', function (x) { return /^basic4-lesson\d+$/.test(x); }],
    ['g1', '엔트리 게임 1권', function (x) { return /^game1-lesson\d+$/.test(x); }],
    ['g2', '엔트리 게임 2권', function (x) { return /^game2-lesson\d+$/.test(x); }],
    ['p1', '엔트리 프로젝트 1', function (x) { return ENTRY_BASIC1.indexOf(x) >= 0; }],
    ['p2', '엔트리 프로젝트 2', function (x) { return /^project2-/.test(x); }],
    ['w1', '스크래치 기초 1권 작품 (엔트리)', function (x) { return /^work-book1-/.test(x); }],
    ['w2', '스크래치 기초 2권 작품 (엔트리)', function (x) { return /^work-basic2-/.test(x); }],
    ['w3', '스크래치 기초 3권 작품 (엔트리)', function (x) { return /^work-basic3-/.test(x); }],
    ['w4', '스크래치 기초 4권 작품 (엔트리)', function (x) { return /^work-basic4-/.test(x); }],
    ['wg1', '스크래치 게임 1권 작품 (엔트리)', function (x) { return /^work-game1-/.test(x); }],
    ['wg2', '스크래치 게임 2권 작품 (엔트리)', function (x) { return /^work-game2-/.test(x); }],
    ['etc', '그 밖의 엔트리 수업', function () { return true; }]
  ];
  function slugOf(path) { var p = path.replace(/\/$/, '').split('/'); return p[p.length - 1]; }
  function byOrder(order) {
    return function (a, b) {
      var x = slugOf(a.path), y = slugOf(b.path);
      if (x in order && y in order) return order[x] - order[y];   // 목록에 없는 차시(project2-lesson 등)는 폴더 이름 순
      return a.path.localeCompare(b.path, 'en', { numeric: true });
    };
  }
  function entryGroups(leaves) {
    var order = ENTRY_ORDER || {}, by = {}, out = [];
    leaves.forEach(function (f) { var x = slugOf(f.path); for (var i = 0; i < ENTRY_BOOKS.length; i++) if (ENTRY_BOOKS[i][2](x)) { (by[i] = by[i] || []).push(f); break; } });
    ENTRY_BOOKS.forEach(function (B, i) {
      var items = (by[i] || []).sort(byOrder(order)); if (!items.length) return;
      var months = /^b[12]$/.test(B[0]) ? 1 : Math.ceil(items.length / 8);   // 블록사전은 권 하나를 통째로 둔다
      var size = months === 1 ? items.length : 8;
      for (var k = 0; k < months; k++) {
        var part = items.slice(k * size, k * size + size);
        var lab = months > 1 ? B[1] + ' · ' + (k + 1) + '달차 (' + (k * 8 + 1) + '~' + (k * 8 + part.length) + ')' : B[1] + ' (' + part.length + '차시)';
        out.push({ key: 'entry/' + B[0] + '-' + k, label: lab, items: part });
      }
    });
    return out;
  }
  function cosGroups(top, leaves) {
    var lv = top.charAt(3), by = {}, names = {}, keys = [];
    leaves.forEach(function (f) {
      var x = slugOf(f.path), k, n;
      var m3 = /^cos3-([a-z])(\d+)-\d+$/.exec(x);
      if (m3) { k = 'e-' + m3[1] + m3[2]; n = { m: '모의고사 ' + m3[2] + '회', g: '기출문제 ' + m3[2], s: '샘플 ' + m3[2], n: '최신기출' }[m3[1]] + ' (엔트리)'; }
      else if (/^cos2-02-/.test(x)) { k = 'e-m2'; n = '모의고사 2회 (엔트리 변환)'; }
      else if (/^scratch\//.test(f.path)) { k = 's'; n = '스크래치 모의고사 (회차별 문제·정답 파일)'; }
      else { k = 'e-m1'; n = '모의고사 1회 (엔트리 변환)'; }
      if (!by[k]) { by[k] = []; keys.push(k); names[k] = n; } by[k].push(f);
    });
    var rank = function (k) { return k === 's' ? 9 : ({ m: 0, g: 1, s: 2, n: 3 }[k.charAt(2)] || 0); };
    keys.sort(function (a, b) { return rank(a) - rank(b) || a.localeCompare(b, 'en', { numeric: true }); });
    return keys.map(function (k) { var it = by[k].sort(byOrder(ENTRY_ORDER || {})); return { key: top + k, label: 'COS ' + lv + '급 ' + names[k] + ' · ' + it.length + '개', items: it }; });
  }
  function smartGroups(top, leaves, titles) {
    if (top === 'entry/') return entryGroups(leaves);
    if (/^cos[123]\/$/.test(top)) return cosGroups(top, leaves);
    return null;
  }
  function pastBox(s, allDone) {
    var box = el('details', null, 'ad-past'); box.appendChild(el('summary', '지난 수업 완료 체크 (포인트 없이 기록만)'));
    var body = el('div'); box.appendChild(body);
    box.addEventListener('toggle', function () {
      if (!box.open || body.firstChild) return;
      body.appendChild(el('p', '수업 목록을 불러오는 중…', 'ad-note'));
      (projectList || (projectList = fetch('v/__projects.json', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('list'); return r.json(); })))
        .then(function (pj) { return loadEntryOrder().then(function () { body.textContent = ''; fill(pj.projects || []); }); },
              function () { projectList = null; body.textContent = '수업 목록은 이 기기에 교안 비밀번호가 들어가 있어야 보여요(다음 교안 동기화 뒤에 생겨요).'; });
    });
    function fill(list) {
      var done = {}; allDone.forEach(function (w) { done[String(w.workbook).slice(5)] = 1; });
      body.appendChild(el('p', '예전에 이미 배운 수업을 체크해 저장하면 완료 기록에만 들어가요. 포인트는 주지 않아요. 학생이 직접 완료한 수업은 그대로 둬요.', 'ad-note'));
      var form = el('form', null, 'ad-home'), month = el('input'), boxes = [];
      month.type = 'month'; month.setAttribute('aria-label', '수업한 달(선택)');
      var ml = el('label', '수업한 달(선택) '); ml.appendChild(month); ml.appendChild(el('small', ' 비우면 2026년 10월 31일(월별 리포트 시작 전)로 적어, 11월부터의 리포트에 들어가지 않아요. 달을 넣으면 그 달 기록으로 들어가요.'));
      form.appendChild(ml);
      var tops = {}, titleOf = {}; list.forEach(function (f) { titleOf[f.path] = f.title; });
      list.forEach(function (f) { var top = topOf(f.path); if (f.path !== top) (tops[top] = tops[top] || { title: '', items: [] }).items.push(f); else (tops[top] = tops[top] || { title: '', items: [] }).title = f.title; });
      Object.keys(tops).sort().forEach(function (top) {
        var T = tops[top]; if (!T.items.length) return;
        // 아래에 더 깊은 수업이 있는 폴더(목록 쪽)는 빼고, 맨 끝 수업만 체크 대상으로 둔다
        var leaves = T.items.filter(function (f) { return !T.items.some(function (o) { return o !== f && o.path.indexOf(f.path) === 0; }); });
        var g = el('details'), n = leaves.filter(function (f) { return done[f.path]; }).length;
        var sum = el('summary', (SYN_TOPS[top] || ((T.title || top) + ' · ' + top)) + ' (' + n + ' / ' + leaves.length + ')'); g.appendChild(sum);
        // 과목 안을 교재(큰 프로젝트)로 묶는다: 교재 체크 하나로 그 안의 수업이 모두 체크된다
        (smartGroups(top, leaves, titleOf) || groupLessons(leaves, titleOf)).forEach(function (G) {
          var mine = [];
          var holder = G.items.length > 1 ? el('details', null, 'ad-book') : g;
          if (G.items.length > 1) {
            var hs = el('summary'), all = el('input'); all.type = 'checkbox'; all.setAttribute('aria-label', G.label + ' 모두');
            var cnt = el('small');
            hs.append(all, document.createTextNode(' ' + G.label + ' '), cnt); holder.appendChild(hs); g.appendChild(holder);
            var sync = function () { var c = mine.filter(function (b) { return b.cb.checked; }).length; all.checked = c === mine.length; all.indeterminate = c > 0 && c < mine.length; cnt.textContent = c + ' / ' + mine.length; };
            all.onclick = function (e) { e.stopPropagation(); };
            all.onchange = function () { mine.forEach(function (b) { b.cb.checked = all.checked; }); sync(); };
            holder.addEventListener('change', sync); setTimeout(sync, 0);
          }
          G.items.forEach(function (f) {
            var lab = el('label'), cb = el('input'); cb.type = 'checkbox'; cb.checked = !!done[f.path]; cb.dataset.was = cb.checked ? '1' : '';
            lab.append(cb, document.createTextNode(' ' + (f.title || f.path) + ' '), el('small', f.path));
            holder.appendChild(lab); var item = { cb: cb, f: f }; boxes.push(item); mine.push(item);
          });
        });
        form.appendChild(g);
      });
      var info = el('p', '', 'ad-note'), save = btn('지난 수업 저장'); save.type = 'submit';
      function changed() { return boxes.filter(function (b) { return b.cb.checked !== !!b.cb.dataset.was; }); }
      function update() { var c = changed(); info.textContent = c.length ? '바뀐 수업 ' + c.length + '개 (완료 ' + c.filter(function (b) { return b.cb.checked; }).length + ' · 취소 ' + c.filter(function (b) { return !b.cb.checked; }).length + ')' : '바뀐 것이 없어요.'; save.disabled = !c.length; }
      form.addEventListener('change', update); update();
      form.append(info, save); body.appendChild(form);
      form.onsubmit = function (e) {
        e.preventDefault(); var c = changed(); if (!c.length) return;
        if (c.length > 400) { toast('한 번에 400개까지 저장할 수 있어요. 나눠서 저장해 주세요.', true); return; }
        save.disabled = true; save.textContent = '저장하는 중…';
        api('pastDone', { studentId: s.id, month: month.value || '', items: c.map(function (b) { return { key: b.f.path, title: b.f.title || b.f.path, done: b.cb.checked }; }) })
          .then(function (o) { toast(s.name + ': 지난 수업 ' + o.saved + '개를 저장했어요' + (o.skipped ? ' (학생이 직접 완료한 ' + o.skipped + '개는 그대로)' : '') + '. 포인트는 주지 않았어요.'); load(true); },
                function (err) { toast(/알 수 없는 요청/.test(err.message) ? '기록 서버(Apps Script)를 새 버전으로 배포해야 저장할 수 있어요.' : err.message, true); save.disabled = false; save.textContent = '지난 수업 저장'; });
      };
    }
    return box;
  }

  // 집 연습 수업: 체크한 수업은 학생이 집에서 이름·번호 로그인만으로 열고, 나머지는 교안 비밀번호를 넣은 기기(학원)에서만 열린다
  function homeuse() {
    view.append(el('h1', '집 연습 수업'), el('p', '체크한 수업은 학생이 집에서 이름·번호로 로그인만 하면 열리고 연습할 수 있어요. 체크하지 않은 수업은 지금처럼 교안 비밀번호를 넣은 기기(학원)에서만 열려요. 저장하면 다음 교안 동기화(15분 안)부터 바뀌어요.', 'ad-note'));
    var card = el('div', 'ad-note', 'ad-card'); card.textContent = '수업 목록을 불러오는 중…'; view.appendChild(card);
    Promise.all([fetch('v/__projects.json', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('list'); return r.json(); }),
                 api('homePaths').then(function (o) { return o.paths || []; })])
    .then(function (res) {
      card.textContent = '';
      var list = (res[0].projects || []).filter(function (f) { return f.path.split('/').length <= 3; }), chosen = {}; res[1].forEach(function (p) { chosen[p] = 1; });   // 집 연습은 1·2단계 폴더만
      if (!res[0].homeOn) card.appendChild(el('p', '지금은 집 연습이 꺼져 있어요. 수업을 체크해 저장하고, GitHub 저장소 비밀값과 Apps Script 스크립트 속성에 HOME_PASS(10자 이상, 둘이 같은 값)를 넣으면 다음 동기화부터 켜져요.', 'ad-note'));
      var form = el('form', null, 'ad-home'), boxes = [], tops = {};
      list.forEach(function (f) { var top = f.path.split('/')[0] + '/'; (tops[top] = tops[top] || []).push(f); });
      Object.keys(tops).sort().forEach(function (top) {
        var items = tops[top], head = items.filter(function (f) { return f.path === top; })[0];
        var g = el('details'); g.appendChild(el('summary', (head && head.title ? head.title + ' ' : '') + '· ' + top));
        items.forEach(function (f) {
          var lab = el('label'), cb = el('input'); cb.type = 'checkbox'; cb.value = f.path; cb.checked = !!chosen[f.path];
          lab.append(cb, document.createTextNode(' ' + (f.path === top ? '전체 · ' : '') + (f.title || f.path) + ' '), el('small', f.path + ' · ' + (f.bytes / 1048576).toFixed(1) + 'MB'));
          g.appendChild(lab); boxes.push({ cb: cb, f: f });
        });
        if (items.some(function (f) { return chosen[f.path]; })) g.open = true;
        form.appendChild(g);
      });
      var size = el('p', '', 'ad-note');
      function update() {
        var on = boxes.filter(function (b) { return b.cb.checked; }).map(function (b) { return b.f; });
        var top = on.filter(function (f) { return !on.some(function (o) { return o !== f && f.path.indexOf(o.path) === 0; }); });
        size.textContent = '체크한 수업 ' + top.length + '개 · 앱 용량이 약 ' + Math.round(top.reduce(function (s, f) { return s + f.bytes; }, 0) / 1048576) + 'MB 늘어나요(집 연습용으로 한 벌 더 잠그므로).';
      }
      form.addEventListener('change', update); update();
      var save = el('button', '집 연습 수업 저장', 'ad-btn'); save.type = 'submit';
      form.append(size, save); card.appendChild(form);
      form.onsubmit = function (e) {
        e.preventDefault(); save.disabled = true;
        api('homePathsSet', { paths: boxes.filter(function (b) { return b.cb.checked; }).map(function (b) { return b.f.path; }) })
          .then(function (o) { toast('집 연습 수업 ' + o.paths.length + '개를 저장했어요. 15분 안에 반영돼요.'); },
                function (err) { toast(/알 수 없는 요청/.test(err.message) ? '기록 서버(Apps Script)를 새 버전으로 배포해야 저장할 수 있어요.' : err.message, true); })
          .then(function () { save.disabled = false; });
      };
    }, function (err) {
      card.textContent = err && err.message === 'list' ? '수업 목록은 이 기기에 교안 비밀번호가 들어가 있고, 이 기능이 들어간 교안 동기화가 한 번 돈 뒤에 보여요.' : (/알 수 없는 요청/.test(err.message) ? '기록 서버(Apps Script)를 새 버전으로 배포해야 이 화면을 쓸 수 있어요.' : err.message);
    });
  }
  function settings() {
    view.append(el('h1', '설정'), el('p', me ? me.email + ' · 선생님' : '선생님', 'ad-note'));
    var c1 = el('div', null, 'ad-card'), keyState = el('p', '확인하는 중…');
    c1.append(el('h2', '선생님 정답 보기'), keyState);
    CHCore.loadTeacherKey().then(function (k) { keyState.textContent = k ? '켜져 있어요. 이 기기에서 수업 쪽 정답을 볼 수 있어요(12시간 뒤나 로그아웃하면 꺼져요).' : '꺼져 있어요. 사이트 비밀번호로 수업에 들어간 적이 있는 기기에서 다시 로그인하면 켜져요.'; }, function () { keyState.textContent = '확인하지 못했어요.'; });
    var c2 = el('div', null, 'ad-card'); c2.appendChild(el('h2', '이 기기'));
    if (isPhone()) {
      var l = el('label'), cb = el('input'); cb.type = 'checkbox';
      try { cb.checked = localStorage.getItem(PHONE_AUTO_KEY) === '1'; } catch (e) {}
      cb.onchange = function () { try { if (cb.checked) localStorage.setItem(PHONE_AUTO_KEY, '1'); else localStorage.removeItem(PHONE_AUTO_KEY); toast('저장했어요.'); } catch (e) { toast('저장하지 못했어요.', true); } };
      l.append(cb, document.createTextNode(' 이 휴대폰에서 다음 접속부터 구글 자동 로그인(내 휴대폰에서만)')); c2.appendChild(l);
    }
    var unpair = btn('이 기기 등록 해제', 'bad', function () {
      if (!confirm('이 태블릿의 등록을 풀까요? 학생이 이 태블릿에서 로그인하려면 선생님이 다시 로그인해야 해요.')) return;
      CHRecord.forgetDevice(); logout();
    });
    var bar = el('div', null, 'ad-bar'); bar.append(unpair); c2.appendChild(bar);
    c2.appendChild(el('p', '학생 태블릿은 선생님이 한 번 로그인해 등록해야 학생 로그인이 돼요. 기기를 바꾸거나 빌려준 뒤에는 등록을 풀어요.', 'ad-note'));
    var c3 = el('div', null, 'ad-card'); c3.appendChild(el('h2', '바로 가기'));
    var links = el('div', null, 'ad-bar');
    [['교안 열기', 'v/index.html'], ['배움 로드맵', 'roadmap.html'], ['학생 레벨 테스트', 'level-test.html'], ['수업 기록 시트 안내', 'SETUP.md']].forEach(function (x) { var a = el('a', x[0], 'ad-btn ghost'); a.href = x[1]; links.appendChild(a); });
    c3.appendChild(links);
    view.append(c1, c2, c3);
  }

  function logout() {
    CHCore.forgetTeacherKey().catch(function () {});
    try { localStorage.removeItem(PHONE_AUTO_KEY); } catch (e) {}
    CHRecord.endSession(); location.replace('index.html');
  }

  // ---- 시작 ----
  $('logout').onclick = function () { if (confirm('로그아웃할까요?')) logout(); };
  $('reload').onclick = function () { load(false).then(function () { toast('새로 불러왔어요.'); }); };
  var s = CHRecord.session();
  if (!s || s.role !== 'teacher' || !CHRecord.auth()) { needLogin(); return; }
  me = { email: s.email || '' }; $('who').textContent = me.email;
  autoTeacherKey();
  load(false);
})();
