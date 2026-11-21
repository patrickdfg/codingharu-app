/* 학습 관찰: 입력·화면 활성 상태로 활동 시간을 추정한다. 정답 판정은 교안의 명시적 이벤트만 받는다. */
(function () {
  'use strict';
  function start() {
    var student = CHRecord.student(), session = CHRecord.session(), wb = window.CodingHaruWorkbook;
    if (window.top !== window || !student || !session || session.role !== 'student' || !session.sid) return;
    if (!wb && !document.getElementById('ch-done-btn')) return;
    var page = location.pathname.split('/v/')[1];
    if (!page || /^(assets|admin|gallery|project-lab\/examples)\//.test(page)) return;
    var key = 'codingharu-learning-s' + student.id, queue = read(key, []), busy = false;
    var record = { id: crypto.randomUUID(), page: page, title: document.title, activeSeconds: 0, done: 0, total: 0, attempts: 0, correct: 0, hints: 0 };
    var last = Date.now(), touched = last, ready = false, lastSurveyAt = 0, offered = false;
    function read(k, fallback) { try { return JSON.parse(localStorage.getItem(k) || 'null') || fallback; } catch (e) { return fallback; } }
    function write() { localStorage.setItem(key, JSON.stringify(queue)); }
    function sameStudent() { var s = CHRecord.student(), ss = CHRecord.session(); return s && s.id === student.id && ss && ss.sid === session.sid; }
    function tick() {
      var now = Date.now(), end = Math.min(now, touched + 60000);
      if (ready && sameStudent() && !document.hidden && document.hasFocus() && end > last) record.activeSeconds += Math.min(5, (end - last) / 1000);
      last = now;
    }
    ['pointerdown','keydown','input','wheel','touchstart'].forEach(function (name) {
      document.addEventListener(name, function (e) { if (e.isTrusted) { tick(); touched = Date.now(); } }, { passive: true });
    });
    document.addEventListener('visibilitychange', function () { last = Date.now(); if (document.hidden) save(); });
    window.addEventListener('blur', function () { tick(); last = Date.now(); });
    window.addEventListener('focus', function () { last = touched = Date.now(); });
    function snapshot() {
      tick();
      if (wb && wb.progress) { var p = wb.progress(); record.done = p.done || 0; record.total = p.total || 0; }
      var copy = JSON.parse(JSON.stringify(record)); copy.activeSeconds = Math.floor(copy.activeSeconds); return copy;
    }
    function save() {
      if (!ready || !sameStudent()) return;
      queue = read(key, []);
      var copy = snapshot(), i = queue.findIndex(function (x) { return x.id === copy.id; });
      if (i >= 0) queue[i] = copy; else queue.push(copy);
      write(); flush();
    }
    function flush() {
      if (busy || !ready || !sameStudent()) return;
      queue = read(key, []); if (!queue.length) return;
      var sent = JSON.stringify(queue[0]); busy = true;
      CHRecord.api('learningSave', { studentId: student.id, record: JSON.parse(sent) }).then(function () {
        queue = read(key, []); queue = queue.filter(function (x) { return JSON.stringify(x) !== sent; });
        write(); busy = false; if (queue.length) flush();
      }, function () { busy = false; });
    }
    function survey() {
      if (document.getElementById('ch-learning-survey') || !sameStudent()) return;
      var dlg = document.createElement('dialog'); dlg.id = 'ch-learning-survey'; dlg.setAttribute('data-ch-app', '');
      dlg.style.cssText = 'box-sizing:border-box;border:1px solid #dae1ed;border-radius:16px;padding:22px;width:min(440px,calc(100vw - 24px));max-height:85vh;overflow:auto;color:#14213d;background:white;font:15px/1.6 sans-serif';
      dlg.innerHTML = '<h2 style="margin:0">오늘은 어땠나요?</h2><p>선생님만 보고 다음 수업을 준비해요. 건너뛰어도 괜찮아요.</p><form><label>오늘 수업은? <select name="fun" required><option value="">선택</option><option value="3">재미있었어요</option><option value="2">보통이에요</option><option value="1">다른 것도 해보고 싶어요</option></select></label><br><label>난이도는? <select name="difficulty" required><option value="">선택</option><option value="1">쉬웠어요</option><option value="2">알맞았어요</option><option value="3">어려웠어요</option></select></label><br><label>막히면 주로? <select name="approach" required><option value="">선택</option><option value="try">먼저 바꿔서 실험해요</option><option value="hint">힌트를 찾아봐요</option><option value="ask">선생님과 함께 풀어요</option></select></label><fieldset style="margin:14px 0;border:1px solid #dae1ed"><legend>다음에 만들고 싶은 것 (1~3개)</legend></fieldset><p role="status"></p><button type="submit">답변 저장</button> <button type="button" class="skip">건너뛰기</button></form>';
      var categories = [['school','학교생활'],['learning','공부·진로'],['access','소통·접근성'],['nature','환경·생태'],['science','과학·수학'],['civic','우리 동네'],['media','미디어·AI'],['art','예술·이야기'],['games','게임'],['computing','컴퓨팅·데이터'],['arduino','로봇·아두이노']];
      categories.forEach(function (c) { var label = document.createElement('label'), input = document.createElement('input'); input.type = 'checkbox'; input.name = 'interest'; input.value = c[0]; label.append(input, ' ' + c[1]); label.style.cssText = 'display:inline-block;margin:4px 10px 4px 0'; dlg.querySelector('fieldset').appendChild(label); });
      var focus = document.activeElement;
      function close() { dlg.close(); dlg.remove(); if (focus) focus.focus(); }
      dlg.querySelector('.skip').onclick = close;
      dlg.addEventListener('cancel', function (e) { e.preventDefault(); close(); });
      dlg.querySelector('form').onsubmit = function (e) {
        e.preventDefault(); var form = e.currentTarget, interests = Array.from(form.querySelectorAll('input[name=interest]:checked')).map(function (x) { return x.value; });
        if (!interests.length || interests.length > 3) { form.querySelector('[role=status]').textContent = '관심 분야를 1~3개 골라 주세요.'; return; }
        record.survey = { interests: interests, fun: Number(form.elements.fun.value), difficulty: Number(form.elements.difficulty.value), approach: form.elements.approach.value };
        lastSurveyAt = Date.now(); localStorage.setItem(key + '-survey', lastSurveyAt); save(); close();
      };
      document.body.appendChild(dlg); dlg.showModal();
    }
    function offer() {
      if (!ready || offered || document.hidden || record.activeSeconds < 120 || Date.now() - lastSurveyAt < 7 * 86400000) return;
      offered = true; lastSurveyAt = Date.now(); localStorage.setItem(key + '-survey', lastSurveyAt); survey();
    }
    // attempts/correct는 실제 채점 교안에서만 발생시킨다. 저장·완료 버튼을 정답으로 세지 않는다.
    document.addEventListener('codingharu:attempt', function (e) { if (typeof (e.detail || {}).correct === 'boolean') { record.attempts++; if (e.detail.correct) record.correct++; save(); } });
    document.addEventListener('codingharu:hint', function () { record.hints++; });
    document.addEventListener('codingharu:save', function () { save(); offer(); });
    document.addEventListener('codingharu:points', function () { save(); offer(); });
    window.addEventListener('pagehide', save);
    CHRecord.api('learningStatus', { studentId: student.id }).then(function (out) {
      ready = true; last = touched = Date.now(); lastSurveyAt = Math.max(out.lastSurveyAt || 0, Number(localStorage.getItem(key + '-survey')) || 0);
      var button = document.createElement('button'); button.type = 'button'; button.textContent = '오늘의 관심'; button.onclick = survey; button.setAttribute('data-ch-app','');
      var bar = document.getElementById('ch-student'); if (bar) bar.appendChild(button);
      setInterval(tick, 1000); setInterval(save, 45000); window.addEventListener('online', flush); flush();
    }, function () { /* 서버 배포 전에는 기존 수업만 유지한다. */ });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 0); }); else setTimeout(start, 0);
})();
