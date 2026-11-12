/* 교안 화면마다 서비스 워커가 끼워 넣는 작은 스크립트.
 *  - 새 교안이 올라오면 화면 아래에 알려 준다. 멋대로 새로고침하지 않아서 쓰던 답안이 안 날아간다.
 *  - '앱 설치' 단추를 진짜 설치에 연결한다.
 */
(function () {
  var base = new URL('./', document.currentScript ? document.currentScript.src : location.href).pathname;
  var standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;

  // ---- 새 교안 알림 ----
  var current = null, shown = false;
  function check() {
    fetch(base + 'version.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (v) {
      if (current === null) { current = v.v; return; }
      if (v.v !== current && !shown) banner();
    }).catch(function () {});
  }
  function banner() {
    shown = true;
    var b = document.createElement('div');
    b.setAttribute('data-ch-app', '');
    b.setAttribute('role', 'status');
    b.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483647;display:flex;gap:12px;align-items:center;' +
      'justify-content:space-between;padding:12px 16px;border-radius:14px;background:#0056d2;color:#fff;font:600 16px/1.4 sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.3)';
    b.innerHTML = '<span>새 교안이 올라왔어요. 지금 입력 중인 내용은 그대로 두었어요.</span>';
    var go = document.createElement('button');
    go.textContent = '새로고침';
    go.style.cssText = 'flex:none;padding:10px 16px;border:0;border-radius:10px;background:#fff;color:#0056d2;font:700 16px sans-serif';
    go.onclick = function () { location.reload(); };
    var later = document.createElement('button');
    later.textContent = '나중에';
    later.style.cssText = 'flex:none;padding:10px 12px;border:0;background:transparent;color:#fff;font:600 15px sans-serif';
    later.onclick = function () { b.remove(); shown = false; };
    b.append(go, later);
    document.body.appendChild(b);
  }
  check();
  setInterval(check, 60000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) check(); });

  // ---- 글자 크기 막대: 화면에 자체 − + 단추가 없는 페이지(워크북·알고리즘 등)에만 붙인다 ----
  if (!document.querySelector('[data-font-step]')) {
    var step = 0;
    try { step = parseInt(localStorage.getItem('codingharu-zoom'), 10) || 0; } catch (e) {}
    var pages = document.querySelectorAll('.page');          // A4 고정 쪽이면 쪽만, 아니면 본문 전체를 키운다
    var targets = pages.length ? pages : [document.body];
    if (pages.length) {                                      // 인쇄용 A4 쪽 → 화면 폭에 맞춰 이어지는 긴 페이지
      var flow = document.createElement('style');
      flow.setAttribute('data-ch-app', '');
      flow.textContent = 'body{background:#fff!important}' +
        '.page{width:auto!important;max-width:210mm;height:auto!important;margin:0 auto!important;padding:6mm 5mm 3mm;overflow:visible!important;' +
        'box-shadow:none!important;border-bottom:.3mm solid #dde5ef}' +
        '.page .content{position:static!important;height:auto!important}' +
        '.page .foot{position:static!important;margin-top:3mm}' +
        '.page img{max-width:100%}';
      document.head.appendChild(flow);
    }
    var bar = document.createElement('div');
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', '글자 크기 조절');
    bar.id = 'ch-zoom';
    bar.innerHTML = '<button type="button" aria-label="글자 작게">−</button><span aria-hidden="true"></span><button type="button" aria-label="글자 크게">+</button>';
    var st = document.createElement('style');
    st.setAttribute('data-ch-app', '');
    st.textContent = '#ch-zoom{position:fixed;bottom:14px;right:14px;z-index:2147483646;display:flex;align-items:center;gap:4px;padding:4px;' +
      'border-radius:10px;background:rgba(255,255,255,.95);border:1px solid #dae1ed;box-shadow:0 2px 8px rgba(0,0,0,.2);zoom:1!important}' +
      '#ch-zoom button{width:36px;height:36px;border:1px solid #dae1ed;border-radius:8px;background:#fff;color:#0056d2;font:700 20px/1 sans-serif}' +
      '#ch-zoom span{min-width:44px;text-align:center;font:12px sans-serif;color:#0056d2}' +
      // 머리줄 안(디자인 통일 2단계): 공통 머리줄의 글자 −/+ 와 같은 크기. 좁은 화면에서는 퍼센트 글자를 숨긴다.
      '#ch-zoom.in-bar{position:static;box-shadow:none;border:0;background:none;border-radius:0;padding:0;gap:5px;flex:none;margin-left:4px}' +
      '#ch-zoom.in-bar button{width:32px;height:32px;border-radius:7px;font:700 18px/1 sans-serif}#ch-zoom.in-bar button:disabled{opacity:.4}' +
      '#ch-zoom.in-bar span{min-width:38px;font-size:11px}' +
      '@media (max-width:1050px){.chtop>#ch-zoom.in-bar{order:1;margin-left:auto}.chtop>#ch-zoom.in-bar+#ch-student{margin-left:4px}}' +
      '@media (max-width:1350px){#ch-zoom.in-bar span{display:none}}@media (max-width:560px){.chtop>#ch-zoom.in-bar{display:none}}' +   // 폰에서는 머리줄이 두꺼워지지 않게 글자 조절을 숨긴다(두 손가락 확대가 있다)
      // 떠 있을 때(머리줄이 없는 쪽)는 아래 오른쪽에 두고, 겹치는 'AI 사고력 미션' 단추를 그 위로 올린다
      'body:has(#ch-zoom:not(.in-bar)) .ch-thinking-launch{bottom:76px}' +
      '@media print{#ch-zoom{display:none!important}}';
    document.head.appendChild(st);
    var label = bar.querySelector('span'), btns = bar.querySelectorAll('button');
    function applyZoom() {
      var z = 1 + step * 0.1;
      for (var i = 0; i < targets.length; i++) targets[i].style.zoom = z;
      label.textContent = Math.round(z * 100) + '%';
      btns[0].disabled = step <= -3; btns[1].disabled = step >= 10;
      try { localStorage.setItem('codingharu-zoom', String(step)); } catch (e) {}
    }
    btns[0].onclick = function () { step = Math.max(-3, step - 1); applyZoom(); };
    btns[1].onclick = function () { step = Math.min(10, step + 1); applyZoom(); };
    var zbar = document.querySelector('.chtop, header.top');   // 머리줄이 없으면 떠 있는 채로 둔다
    if (zbar) { bar.className = 'in-bar'; zbar.appendChild(bar); } else document.documentElement.appendChild(bar);
    applyZoom();
    // 머리줄이 문서가 다 읽힌 뒤에 생기는 쪽이면 그때 옮긴다(글자 막대 → 계정 라벨 순서로 맨 오른쪽에)
    document.addEventListener('DOMContentLoaded', function () {
      var b2 = document.querySelector('.chtop, header.top'); if (!b2) return;
      var z2 = document.getElementById('ch-zoom'), t2 = document.getElementById('ch-student');
      [z2, t2].forEach(function (el) { if (el && el.parentNode !== b2) { el.classList.add('in-bar'); b2.appendChild(el); } });
    });
  }

  // ---- 파일 내려받기 ----
  // 안드로이드 크롬은 download 링크를 서비스 워커를 거치지 않고 다시 직접 요청한다(여기엔 없는 가상 주소라 실패).
  // 그래서 앱 안에서 받아 풀어서 그 데이터로 저장하게 한다.
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || e.defaultPrevented) return;
    var u = new URL(a.href, location.href);
    if (u.origin !== location.origin || u.pathname.indexOf(base + 'v/') !== 0) return;
    if (!(a.hasAttribute('download') || /\.(ent|rbxl)$/i.test(u.pathname))) return;
    e.preventDefault();
    var name = decodeURIComponent(u.pathname.split('/').pop());
    fetch(u.href).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.blob();
    }).then(function (blob) {
      var url = URL.createObjectURL(new Blob([blob], { type: 'application/octet-stream' }));
      var tmp = document.createElement('a');
      tmp.href = url; tmp.download = name; tmp.style.display = 'none';
      document.body.appendChild(tmp); tmp.click(); tmp.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    }).catch(function () { alert('파일을 받지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.'); });
  }, true);

  // ---- 앱 설치 단추 ----
  // 설치할 수 있을 때만 단추를 보인다: 앱으로 실행 중이거나, 설치를 마쳤거나,
  // 설치 창을 띄울 수 없는 상태(이미 설치됨 포함)면 숨긴다.
  var deferred = null, installed = false;
  try { installed = localStorage.getItem('chInstalled') === '1'; } catch (e) {}
  var style = document.createElement('style');
  style.setAttribute('data-ch-app', '');   // 워크북 [저장]이 이 표시가 붙은 것을 빼고 저장한다
  document.head.appendChild(style);
  function sync() {
    var hide = standalone || installed || !deferred;
    style.textContent = hide ? '[data-install]{display:none !important}' : '';
  }
  sync();
  addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; installed = false; sync(); });
  addEventListener('appinstalled', function () {
    installed = true; deferred = null;
    try { localStorage.setItem('chInstalled', '1'); } catch (e) {}
    sync();
  });
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-install]');
    if (!t) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (deferred) { deferred.prompt(); deferred.userChoice.finally(function () { deferred = null; sync(); }); }
  }, true);
})();

/* ---- 수업 기록: 학생 이름 표시·바꾸기, 워크북 기록을 기록 서버(구글 시트)와 주고받기, 연 페이지 기록 ----
 * record-config.json 이 비어 있으면 아무것도 하지 않는다. 교안의 app.js 가 window.CodingHaruWorkbook 을 열어 준다. */
(function () {
  if (!window.CHRecord) return;
  CHRecord.config().then(function (cfg) {
    if (!cfg.on) return;
    var dev = CHRecord.device(), stu = CHRecord.student();
    var page = decodeURIComponent(location.pathname.split('/v/')[1] || 'index.html');
    var login = CHRecord.base + 'index.html?next=' + encodeURIComponent('v/' + page + location.search);   // ?l= 같은 쿼리도 로그인 뒤 그대로
    // 들어갈 때마다 로그인: 이번에 로그인하지 않았으면 처음 화면으로 보낸다
    if (!CHRecord.sessionOk()) { location.replace(login); return; }

    // 계정 동작은 유지하고 이름·저장 상태 텍스트는 화면에서 숨긴다.
    var tag = document.createElement('div');
    tag.setAttribute('data-ch-app', ''); tag.id = 'ch-student';
    var css = document.createElement('style'); css.setAttribute('data-ch-app', '');
    css.textContent = '#ch-student{position:absolute;right:10px;top:8px;z-index:2147483646;display:flex;align-items:center;gap:6px;padding:4px 6px;' +
      'border-radius:999px;background:rgba(255,255,255,.96);border:1px solid #dae1ed;box-shadow:0 2px 8px rgba(0,0,0,.18);font:600 15px/1.2 sans-serif;color:#0056d2}' +
      '#ch-student button,#ch-student a{border:0;border-radius:999px;background:#0056d2;color:#fff;font:700 13px sans-serif;padding:7px 12px;text-decoration:none;cursor:pointer}' +
      '#ch-student>span{display:none!important}@media print{#ch-student,#ch-pt{display:none!important}}' +
      // 위쪽 머리줄(.chtop·header.top)이 있으면 그 안에 놓는다. 좁은 화면의 header.top 은 자리가 없어 머리줄 바로 아래 오른쪽에 둔다.
      '#ch-student.in-bar{position:static;box-shadow:none;flex:none;margin-left:4px;gap:4px;padding:2px 4px 2px 8px}' +
      '@media (max-width:1050px){.chtop>#ch-student.in-bar{order:1;margin-left:auto}.chtop:has(#ch-student) nav{order:2}}' +   // 좁은 화면: 라벨은 첫 줄 오른쪽, 메뉴는 아랫줄   // 좁으면 메뉴만 아랫줄로 내려가고 라벨은 첫 줄 오른쪽에 남는다
      '@media (max-width:999px){header.top>#ch-student.in-bar{position:absolute;right:10px;top:calc(100% + 6px);box-shadow:0 2px 8px rgba(0,0,0,.18)}}' +
      '#ch-pt{max-width:560px;margin:36px auto 96px;padding:14px 16px;border:2px dashed #b7791f;border-radius:14px;background:#fffaf0;color:#5a3d0a;font:600 15px/1.6 sans-serif;text-align:center}' +
      '#ch-pt input{width:92px;font:700 18px sans-serif;padding:6px 8px;border:1px solid #b7791f;border-radius:8px;text-align:right}' +
      '#ch-pt button{margin-left:6px;border:0;border-radius:999px;background:#0056d2;color:#fff;font:700 14px sans-serif;padding:8px 14px;cursor:pointer}#ch-pt button.sub{background:#6b7a72}#ch-pt small{display:block;font-weight:500;opacity:.85}';
    document.head.appendChild(css);
    var sess = CHRecord.session();
    if (sess && sess.role === 'teacher') {
      tag.innerHTML = '<span></span><span class="st"></span><a>관리자 메뉴</a>';
      tag.firstChild.textContent = '선생님';
      tag.querySelector('a').href = CHRecord.base + 'index.html';
      // 선생님: 이 수업의 완료 점수를 보고 고친다(서버 pointsLesson·pointsSetLesson). 목록 쪽에는 붙이지 않는다.
      (function () {
        var key = page.replace(/index\.html$/, '');
        if (!key || document.querySelector('[data-lessons], a.category, a.row')) return;
        var NAMES = {entry:'엔트리 수업', entryWork:'엔트리 작품', scratch:'스크래치 수업', scratchWork:'스크래치 작품', junior:'스크래치주니어 수업', algorithm:'알고리즘 수업', pythonLesson:'파이썬 수업',
          codingLesson:'코딩 수업', roblox:'로블록스 수업', robot:'로봇 수업', web:'웹 수업', digital:'디지털 수업', adult:'성인 수업', otherLesson:'기타 수업', doubleLesson:'2차시 분량 수업'};
        var box = document.createElement('div'); box.id = 'ch-pt'; box.setAttribute('data-ch-app', '');
        function line(t) { var s = document.createElement('small'); s.textContent = t; return s; }
        function render(out) {
          box.textContent = '';
          if (!out.item) {
            var own = /^python\/(?:basic|cospro2|farm|robot)\//.test(key) || /^coding\/(?:bebras|block-games|detective)\//.test(key);
            box.appendChild(document.createTextNode(own ? '🅿 이 수업은 문제·단계·차시마다 점수가 들어가요.' : '🅿 이 쪽은 완료 점수가 없어요.'));
            box.appendChild(line(own ? '값은 관리자 메뉴의 「자동 지급 점수 설정」에서 고쳐요.' : '차시 안내·도구 쪽이에요. 작품·수업 쪽에서 점수가 들어가요.'));
            return;
          }
          var inp = document.createElement('input'), save = document.createElement('button'), reset = document.createElement('button'), msg = line('');
          inp.type = 'number'; inp.min = '0'; inp.max = '100000'; inp.step = '1'; inp.value = out.points; inp.setAttribute('aria-label', '이 수업 완료 점수');
          save.type = reset.type = 'button'; save.textContent = '저장'; reset.textContent = '묶음 점수로'; reset.className = 'sub'; reset.hidden = out.override === null;
          box.appendChild(document.createTextNode('🅿 이 수업 완료 점수 ')); box.appendChild(inp); box.appendChild(document.createTextNode(' 점')); box.appendChild(save); box.appendChild(reset);
          box.appendChild(line((NAMES[out.item] || out.item) + ' 묶음 점수 ' + out.rate + '점' + (out.override === null ? ' 을 그대로 쓰고 있어요.' : ' 대신 이 수업만 따로 정한 값이에요.') + ' 학생에게는 보이지 않아요.'));
          box.appendChild(msg);
          function send(points) { save.disabled = reset.disabled = true; CHRecord.api('pointsSetLesson', {auth: CHRecord.auth(), key: key, points: points}).then(function (o) { render(o); box.lastChild.textContent = '저장했어요. 지금부터 완료하는 학생에게 적용돼요.'; },
            function (e) { save.disabled = reset.disabled = false; msg.textContent = (e && e.message) || '저장하지 못했어요.'; }); }
          save.onclick = function () { var n = Number(inp.value); if (inp.value === '' || !Number.isInteger(n) || n < 0 || n > 100000) { msg.textContent = '0~100000 사이의 정수로 써 주세요.'; return; } send(n); };
          reset.onclick = function () { send(null); };
        }
        CHRecord.api('pointsLesson', {auth: CHRecord.auth(), key: key}).then(function (out) { render(out); (document.body || document.documentElement).appendChild(box); }, function () {});
      })();
    } else if (stu && sess && sess.role === 'student') {
      tag.innerHTML = '<span></span><span class="st"></span><button type="button">로그아웃</button>';
      tag.firstChild.textContent = stu.name;
      tag.querySelector('button').onclick = function () {
        if (!confirm(stu.name + ' 학생 기록을 마치고 로그아웃할까요?')) return;
        flush(); CHRecord.endSession(); location.href = CHRecord.base + 'index.html';
      };
    } else {
      tag.innerHTML = '<span>기록이 이 기기에만 남아요</span><a>로그인</a>';
      tag.querySelector('a').href = CHRecord.base + 'index.html';
    }
    var bar = document.querySelector('.chtop, header.top');   // 아래 왼쪽에 떠 있으면 실행 단추를 가려서 위로 올렸다
    if (bar) { tag.className = 'in-bar'; bar.appendChild(tag); }   // 머리줄 맨 오른쪽(메뉴·글자 −/+ 뒤)
    else document.documentElement.appendChild(tag);
    var stEl = tag.querySelector('.st');
    function status(m) { if (stEl) stEl.textContent = m; var wb = window.CodingHaruWorkbook; if (wb && m) wb.setStatus(m); }
    if (stu && sess && sess.role === 'student') {
      var points = document.createElement('strong'); points.textContent = '포인트 확인 중'; points.style.cssText = 'color:#23415b;padding:0 6px;font:700 14px sans-serif';
      tag.insertBefore(points, tag.querySelector('button'));
      var lastP = null;   // 라벨이 위로 올라가 아래에서는 안 보이므로, 점수가 오르면 아래 가운데에 잠깐 알려 준다
      function toast(t) { var d = document.createElement('div'); d.setAttribute('data-ch-app', ''); d.textContent = t;
        d.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483647;padding:10px 22px;border-radius:999px;background:#0056d2;color:#fff;font:800 18px sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25);pointer-events:none';
        document.documentElement.appendChild(d); setTimeout(function () { d.remove(); }, 2600); }
      function showPoints(out) { var p = Number(out.points || 0); points.textContent = p.toLocaleString() + ' P'; if (lastP !== null && p > lastP) toast('+' + (p - lastP).toLocaleString() + ' P'); lastP = p; }
      CHRecord.api('pointsBalance', {studentId:stu.id}).then(showPoints, function () { points.textContent = '포인트 연결 대기'; });
      window.addEventListener('codingharu:points-balance', function (e) { showPoints(e.detail || {}); });
    }
    if (!stu || !sess || sess.role !== 'student') return;

    function fail(err) {
      if (err && err.unpaired) { CHRecord.forgetDevice(); status('기기 등록이 풀렸어요'); return; }
      if (err && /로그인이 풀렸/.test(err.message || '')) { status('로그인이 풀렸어요. 다시 로그인해 주세요.'); return; }
      status('인터넷이 끊겨 이 기기에만 저장했어요. 연결되면 다시 보낼게요.');
    }

    // 완료 표시: 교안을 열었다고 기록하지 않는다. 맨 아래 '완료' 단추를 눌렀을 때만 남기고, 목록에서는 완료한 수업을 흐리게 보여 준다.
    (function () {
      var DKEY = 'codingharu-done-s' + stu.id, IDX = 'done-index';
      var key = page.replace(/index\.html$/, '');
      function dget() { try { return JSON.parse(localStorage.getItem(DKEY) || '{}') || {}; } catch (e) { return {}; } }
      function dput(m) { try { localStorage.setItem(DKEY, JSON.stringify(m)); } catch (e) {} }
      function isDone(m, k) { return (m[k] || 0) > 0; }
      function merge(a, b) { var o = {}; [a, b].forEach(function (m) { Object.keys(m || {}).forEach(function (k) { if (!(k in o) || Math.abs(m[k]) > Math.abs(o[k])) o[k] = m[k]; }); }); return o; }
      function count(m) { return Object.keys(m).filter(function (k) { return m[k] > 0; }).length; }
      var cssDone = document.createElement('style'); cssDone.setAttribute('data-ch-app', '');
      cssDone.textContent = '.ch-done-item{opacity:.5;filter:grayscale(.35);position:relative}.ch-done-item::after{content:"✔ 완료";position:absolute;top:8px;right:10px;padding:3px 10px;border-radius:999px;' +
        'background:#0056d2;color:#fff;font:700 13px sans-serif;z-index:2}' +
        '#ch-done-wrap{margin:36px auto 96px;text-align:center}#ch-done-btn{font:800 22px sans-serif;padding:16px 64px;border:0;border-radius:999px;background:#0056d2;color:#fff;cursor:pointer}' +
        '#ch-done-btn.on{background:#6b7a72}#ch-done-undo{display:block;margin:10px auto 0;border:0;background:none;color:#6b7a72;font:600 14px sans-serif;text-decoration:underline;cursor:pointer}@media print{#ch-done-wrap{display:none!important}}';
      document.head.appendChild(cssDone);

      // 서버에 맞추기: 쌓아 둔 변경이 있으면 보내고, 서버 목록과 합친다
      var busy = false, again = false;
      function sync(then) {
        if (busy) { again = true; return; } busy = true;
        CHRecord.api('load', { studentId: stu.id, workbook: IDX }).then(function (out) {
          var local = dget(), remote = (out.state && out.state.pages) || {}, all = merge(local, remote);
          dput(all); paint(all);
          var changed = Object.keys(all).some(function (k) { return remote[k] !== all[k]; });
          if (!changed) return;
          var titles = {}; try { titles = JSON.parse(localStorage.getItem(DKEY + '-t') || '{}') || {}; } catch (e) {}
          var lag = Object.keys(all).filter(function (k) { return remote[k] !== all[k]; });
          return CHRecord.api('save', { studentId: stu.id, workbook: IDX, title: '완료한 수업', page: '', state: { pages: all }, progress: { done: count(all), total: Math.max(1, Object.keys(all).length) } }).then(function () {
            return lag.reduce(function (p, k) { return p.then(function () {   // 선생님 화면에 수업별로 보이도록 수업마다 한 줄씩도 남긴다
              return CHRecord.api('save', { studentId: stu.id, workbook: 'done:' + k, title: titles[k] || '완료 · ' + k, page: k, state: { done: all[k] > 0, at: Math.abs(all[k]) }, progress: { done: all[k] > 0 ? 1 : 0, total: 1 } }); }); }, Promise.resolve());
          });
        }).then(function () { busy = false; if (then) then(); if (again) { again = false; sync(); } }, function (e) { busy = false; again = false; paint(dget()); fail(e); });
      }
      function target(a) {
        var h = a.getAttribute('href'); if (!h || h.charAt(0) === '#' || /^[a-z]+:/i.test(h)) return null;
        var u = new URL(h, location.href), i = u.pathname.indexOf('/v/'); if (i < 0) return null;
        return decodeURIComponent(u.pathname.slice(i + 3)).replace(/index\.html$/, '');
      }
      function paint(m) {
        var main = document.querySelector('main') || document.body;
        [].forEach.call(main.querySelectorAll('a[href]'), function (a) {
          if (a.closest('.breadcrumb, .toc, nav, header')) return;
          var t = target(a); a.classList.toggle('ch-done-item', !!t && isDone(m, t));
        });
        var btn = document.getElementById('ch-done-btn'), un = document.getElementById('ch-done-undo');
        if (btn) { var on = isDone(m, key); btn.className = on ? 'on' : ''; btn.textContent = on ? '✔ 완료했어요' : '완료'; un.hidden = !on; }
      }
      var isList = !!document.querySelector('[data-lessons], a.category, a.row') || key === '';
      if (!isList) {
        var wrap = document.createElement('div'); wrap.id = 'ch-done-wrap'; wrap.setAttribute('data-ch-app', '');
        wrap.innerHTML = '<button type="button" id="ch-done-btn">완료</button><button type="button" id="ch-done-undo" hidden>완료 취소</button>';
        document.body.appendChild(wrap);
        function mark(on) {
          var m = dget(), ts = Date.now(); m[key] = on ? ts : -ts; dput(m); paint(m);
          var title = '완료 · ' + document.title.replace(/\s*·\s*(?:코드마루|코딩하루)\s*$/, '');
          try { var tt = JSON.parse(localStorage.getItem(DKEY + '-t') || '{}') || {}; tt[key] = title; localStorage.setItem(DKEY + '-t', JSON.stringify(tt)); } catch (e) {}
          sync();
        }
        // 서버 pointsRule_ 의 'lesson' 규칙과 같아야 한다. 모든 수업은 점수를 받고, 자체 점수가 있는 곳과 수업이 아닌 폴더만 뺀다.
        function lessonScored_(k) {
          if (!/\/$/.test(k)) return false;
          if (/^(?:admin|assets|docs|downloads|gallery|work)\//.test(k)) return false;
          if (/^python\/(?:basic|cospro2|farm|robot)\//.test(k) || /^coding\/(?:bebras|block-games|detective|vendor|typing)\//.test(k)) return false;
          if (/^robot\/(?:check|arduino\/editor)\//.test(k)) return false;
          if (/^entry\/(?:[a-z0-9]+-lesson\d+|book1-unit\d+)\/$/.test(k)) return false;   // 엔트리 차시 안내 쪽은 작품 쪽이 점수를 받는다
          if (/^entry\//.test(k)) return /^entry\/[^/]+\/$/.test(k);
          return /^[^/]+\/.+\/$/.test(k);
        }
        document.getElementById('ch-done-btn').onclick = function () { if (!isDone(dget(), key)) { mark(true); if (lessonScored_(key)) document.dispatchEvent(new CustomEvent('codingharu:points',{detail:{kind:'lesson',key:key,label:document.title}})); status('완료로 표시했어요'); } };
        document.getElementById('ch-done-undo').onclick = function () { if (confirm('완료 표시를 취소할까요?')) mark(false); };
      }
      paint(dget()); sync();
      addEventListener('online', function () { sync(); });
    })();

    var wb = window.CodingHaruWorkbook;
    if (!wb) return;
    var wbId = wb.id + '-v' + wb.version, metaKey = wb.key + '-meta';
    function meta() { try { return JSON.parse(localStorage.getItem(metaKey) || '{}') || {}; } catch (e) { return {}; } }
    function setMeta(m) { try { localStorage.setItem(metaKey, JSON.stringify(m)); } catch (e) {} }
    // 서버의 한 줄(시트 한 칸)은 45000자까지라서, 길면 값을 줄이지 않고 여러 줄로 나누어 저장한다. 첫 줄에 __parts(몇 줄인지)를 적는다.
    var LIMIT = 38000;
    function split(state) {
      if (JSON.stringify(state).length <= LIMIT) return [state];
      var out = [{}], size = 2;
      Object.keys(state).forEach(function (k) {
        var n = JSON.stringify(k).length + JSON.stringify(state[k]).length + 2;
        if (size + n > LIMIT && Object.keys(out[out.length - 1]).length) { out.push({}); size = 2; }
        out[out.length - 1][k] = state[k]; size += n;
      });
      return out;
    }
    function bodies() {
      var ps = split(wb.getState()), prog = wb.progress(), list = [];
      for (var i = ps.length - 1; i >= 1; i--) list.push({ studentId: stu.id, workbook: wbId + '~' + (i + 1), title: wb.title + ' (이어서 ' + (i + 1) + ')', page: page, state: ps[i], progress: { done: 0, total: 0 } });
      var first = ps[0]; if (ps.length > 1) first.__parts = ps.length;
      list.push({ studentId: stu.id, workbook: wbId, title: wb.title, page: page, state: first, progress: prog });   // 첫 줄은 맨 마지막에 저장
      return list;
    }
    var timer = null, sending = false;
    function push() {
      clearTimeout(timer); timer = null;
      if (sending) { timer = setTimeout(push, 1500); return; }
      sending = true;
      bodies().reduce(function (p, b) { return p.then(function () { return CHRecord.api('save', b); }); }, Promise.resolve()).then(function (out) {
        setMeta({ updatedAt: out.updatedAt, dirty: false });
        status('선생님 기록에도 저장했어요');
      }, fail).then(function () { sending = false; });
    }
    function flush() {
      if (!meta().dirty) return;
      var bs = bodies(); if (bs.length > 1) return;   // 길어서 여러 줄이면 창을 닫을 때는 보내지 않고, 다음에 열 때 보낸다
      CHRecord.config().then(function (c) {
        var data = Object.assign({ action: 'save', token: dev && dev.token, sid: sess && sess.sid }, bs[0]);
        try { navigator.sendBeacon(c.apiUrl, new Blob([JSON.stringify(data)], { type: 'text/plain;charset=utf-8' })); } catch (e) {}
      });
    }
    document.addEventListener('codingharu:save', function () {
      setMeta({ updatedAt: Date.now(), dirty: true });
      status('저장하는 중…');
      clearTimeout(timer); timer = setTimeout(push, 1500);
    });
    addEventListener('online', function () { if (meta().dirty) push(); });
    addEventListener('pagehide', flush);

    // 처음 열 때: 서버 기록이 더 새로우면 화면에 채우고, 이 기기 것이 더 새로우면 서버로 보낸다
    status('기록을 불러오는 중…');
    function loadAll() {
      return CHRecord.api('load', { studentId: stu.id, workbook: wbId }).then(function (out) {
        var n = out.state && out.state.__parts;
        if (!(n > 1)) return out;
        var rest = []; for (var i = 2; i <= n; i++) rest.push(i);
        return rest.reduce(function (p, i) { return p.then(function () { return CHRecord.api('load', { studentId: stu.id, workbook: wbId + '~' + i }).then(function (o2) { Object.assign(out.state, o2.state || {}); }); }); }, Promise.resolve()).then(function () { delete out.state.__parts; return out; });
      });
    }
    loadAll().then(function (out) {
      var m = meta();
      if (out.state && out.updatedAt > (m.updatedAt || 0) && !m.dirty) {
        wb.applyState(out.state, { message: '선생님 기록에 있던 내용을 불러왔어요.' });
        setMeta({ updatedAt: out.updatedAt, dirty: false });
        status('기록을 불러왔어요');
      } else if (m.dirty || (!out.state && Object.keys(wb.getState()).length)) {
        push();
      } else status('기록과 같아요');
    }, fail);
  });
})();
