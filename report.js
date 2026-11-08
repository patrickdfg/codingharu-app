// 선생님 관리 메뉴의 학부모 월간 리포트: 기록(완료 수업·워크북 진도·포인트)과 선생님 한마디로 한 장짜리 그림을 만들어 카톡 등으로 보낸다
(function (g) {
  var W = 1080, PAD = 72;
  var C = { bg: '#f7f5ff', card: '#ffffff', ink: '#231d38', sub: '#5f586b', violet: '#5b3fa0', lime: '#d6ff83', line: '#e4dff2', night: '#15102c' };
  var FONT = '"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif';

  function el(tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }
  function ym(ms) { var d = new Date(ms); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); }
  function monthLabel(v) { var p = v.split('-'); return p[0] + '년 ' + Number(p[1]) + '월'; }
  function cleanTitle(t) { return String(t || '').replace(/\s*[·|]\s*코드마루\s*$/, '').trim() || '이름 없는 수업'; }

  // 한 학생의 한 달 기록을 모은다
  function collect(d, student, month) {
    var done = [], progress = [], seen = {};
    d.workbooks.forEach(function (w) {
      if (w.studentId !== student.id || !w.updatedAt || ym(w.updatedAt) !== month) return;
      var wb = String(w.workbook);
      if (wb.indexOf('done:') === 0) { if (w.done > 0) done.push({ title: cleanTitle(w.title), at: w.updatedAt }); return; }
      if (wb === 'done-index' || /~\d+$/.test(wb)) return;
      var t = cleanTitle(w.title);
      if (seen[t]) return; seen[t] = 1;
      if (w.total && w.done >= w.total) return;   // 다 끝낸 워크북은 '진행 중'에 넣지 않는다
      progress.push({ title: t, done: w.done || 0, total: w.total || 0, at: w.updatedAt });
    });
    done.sort(function (a, b) { return a.at - b.at; });
    progress.sort(function (a, b) { return b.at - a.at; });
    var earned = 0;
    (d.pointHistory || []).forEach(function (r) { if (r.studentId === student.id && r.at && ym(r.at) === month && r.amount > 0) earned += r.amount; });
    return { done: done, progress: progress, earned: earned, points: student.points || 0 };
  }

  // 글을 폭에 맞춰 어절(띄어쓰기) 단위로 줄을 나눈다. 한 어절이 한 줄보다 길 때만 글자 단위로 끊는다
  function wrap(ctx, text, width) {
    var lines = [];
    String(text || '').split('\n').forEach(function (para) {
      var line = '';
      para.split(/\s+/).filter(Boolean).forEach(function (word) {
        var next = line ? line + ' ' + word : word;
        if (ctx.measureText(next).width <= width) { line = next; return; }
        if (line) lines.push(line);
        line = '';
        Array.from(word).forEach(function (ch) {
          if (ctx.measureText(line + ch).width > width && line) { lines.push(line); line = ch; } else line += ch;
        });
      });
      lines.push(line);
    });
    return lines;
  }

  function draw(info) {
    var c = document.createElement('canvas'), ctx = c.getContext('2d');
    var inner = W - PAD * 2;
    // 먼저 높이를 계산하기 위해 두 번 그린다 (1번: 재기, 2번: 그리기)
    function paint(real) {
      var y = 0;
      function text(t, x, size, color, weight) { if (real) { ctx.font = (weight || 400) + ' ' + size + 'px ' + FONT; ctx.fillStyle = color; ctx.fillText(t, x, y); } }
      function setFont(size, weight) { ctx.font = (weight || 400) + ' ' + size + 'px ' + FONT; }
      // 머리
      if (real) { ctx.fillStyle = C.night; ctx.fillRect(0, 0, W, 250); }
      y = 92; text('코드마루 월간 리포트', PAD, 30, C.lime, 700);
      y = 160; text(info.name + ' 학생', PAD, 54, '#ffffff', 800);
      y = 212; text(monthLabel(info.month) + (info.group ? ' · ' + info.group : ''), PAD, 28, '#c9bfdc', 500);
      y = 250;
      // 요약 숫자 3칸
      y += 44;
      var boxW = (inner - 32) / 3, stats = [['완료한 수업', info.data.done.length + '개'], ['이번 달 포인트', '+' + info.data.earned.toLocaleString()], ['누적 포인트', info.data.points.toLocaleString()]];
      stats.forEach(function (s, i) {
        var x = PAD + i * (boxW + 16);
        if (real) { ctx.fillStyle = C.card; roundRect(ctx, x, y, boxW, 150, 22); ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.stroke(); }
        var yy = y; y = yy + 56; text(s[0], x + 28, 26, C.sub, 500); y = yy + 118; text(s[1], x + 28, 46, C.violet, 800); y = yy;
      });
      y += 150 + 64;
      function section(title, items, empty) {
        text(title, PAD, 34, C.ink, 800); y += 22;
        if (real) { ctx.fillStyle = C.lime; ctx.fillRect(PAD, y, 64, 6); }
        y += 46;
        setFont(30, 400);
        if (!items.length) { text(empty, PAD, 30, C.sub, 400); y += 52; }
        items.forEach(function (it) {
          wrap(ctx, it, inner - 40).forEach(function (ln, i) { if (i === 0) text('•', PAD, 30, C.violet, 800); text(ln, PAD + 34, 30, C.ink, 400); y += 46; });
          y += 8;
        });
        y += 34;
      }
      section('이번 달 완료한 수업', info.data.done.slice(0, 12).map(function (x) { return x.title; }).concat(info.data.done.length > 12 ? ['그 밖에 ' + (info.data.done.length - 12) + '개'] : []), '이번 달에는 완료로 표시한 수업이 없어요.');
      section('진행 중인 워크북', info.data.progress.slice(0, 6).map(function (x) { return x.title + (x.total ? '  (' + x.done + ' / ' + x.total + ')' : ''); }), '이번 달에 저장된 워크북 기록이 없어요.');
      if (info.plan) section('다음 달 계획', [info.plan], '');
      // 선생님 한마디
      text('선생님 한마디', PAD, 34, C.ink, 800); y += 22;
      if (real) { ctx.fillStyle = C.lime; ctx.fillRect(PAD, y, 64, 6); }
      y += 30;
      setFont(30, 400);
      var lines = wrap(ctx, info.comment || '-', inner - 64), boxH = lines.length * 48 + 56;
      if (real) { ctx.fillStyle = '#efeaff'; roundRect(ctx, PAD, y, inner, boxH, 22); ctx.fill(); }
      var y0 = y; y += 62; lines.forEach(function (ln) { text(ln, PAD + 32, 30, C.ink, 400); y += 48; }); y = y0 + boxH + 56;
      // 바닥
      text('코드마루 코딩·AI 탐구학원 · 010-9855-1322', PAD, 24, C.sub, 500); y += 40;
      return y + 20;
    }
    c.width = W; c.height = 400; ctx.textBaseline = 'alphabetic';
    var h = paint(false);
    c.height = Math.ceil(h);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, c.height);
    paint(true);
    return c;
  }
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  // 관리 메뉴 안에 리포트 칸을 붙인다. d = admin 응답, students = 지금 반 필터에 맞는 학생
  function mount(box, d, students, say) {
    var wrapEl = el('div', null, 'report-box');
    wrapEl.appendChild(el('h3', '학부모 월간 리포트', 'sec'));
    var form = el('form'), who = el('select'), month = el('input'), plan = el('input'), comment = el('textarea'), make = el('button', '리포트 만들기');
    who.setAttribute('aria-label', '학생 선택'); who.required = true;
    var blank = el('option', '학생을 선택하세요'); blank.value = ''; who.appendChild(blank);
    students.forEach(function (s) { var o = el('option', s.name + (s.group ? ' · ' + s.group : '')); o.value = s.id; who.appendChild(o); });
    month.type = 'month'; month.value = ym(d.now || Date.now()); month.required = true; month.setAttribute('aria-label', '리포트 달');
    plan.type = 'text'; plan.maxLength = 120; plan.placeholder = '다음 달 계획 (선택)'; plan.setAttribute('aria-label', '다음 달 계획');
    comment.maxLength = 400; comment.rows = 3; comment.placeholder = '선생님 한마디 (학부모님께 전할 말)'; comment.setAttribute('aria-label', '선생님 한마디'); comment.required = true;
    make.type = 'submit';
    form.append(who, month, plan, comment, make);
    var out = el('div', null, 'report-out');
    wrapEl.append(form, out);
    box.appendChild(wrapEl);
    form.onsubmit = function (e) {
      e.preventDefault();
      var s = students.filter(function (x) { return x.id === who.value; })[0]; if (!s) return;
      var info = { name: s.name, group: s.group, month: month.value, plan: plan.value.trim(), comment: comment.value.trim(), data: collect(d, s, month.value) };
      var canvas = draw(info);
      out.textContent = '';
      var img = el('img'); img.alt = s.name + ' 학생 ' + monthLabel(month.value) + ' 리포트'; img.src = canvas.toDataURL('image/png'); out.appendChild(img);
      var bar = el('div', null, 'bar'), share = el('button', '카톡 등으로 보내기'), save = el('a', '그림 저장');
      share.type = 'button';
      var fname = '코드마루_' + s.name + '_' + month.value + '.png';
      save.href = img.src; save.download = fname; save.className = 'ghost-link';
      share.onclick = function () {
        canvas.toBlob(function (blob) {
          var file = new File([blob], fname, { type: 'image/png' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            navigator.share({ files: [file], title: fname }).catch(function () {});
          } else { save.click(); say('이 기기는 바로 보내기를 지원하지 않아 그림을 저장했어요. 카톡에서 사진으로 보내 주세요.', true); }
        }, 'image/png');
      };
      bar.append(share, save); out.appendChild(bar);
      // 2·3번: 기록 서버에 한마디를 저장하고 학부모 링크를 받거나 이메일로 보낸다 (record.gs 새 버전 배포가 필요)
      var bar2 = el('div', null, 'bar'), linkBtn = el('button', '저장하고 학부모 링크 복사'), mailBtn = el('button', '저장하고 학부모 이메일로 보내기');
      linkBtn.type = mailBtn.type = 'button'; linkBtn.className = mailBtn.className = 'ghost';
      function saveReport(email) {
        linkBtn.disabled = mailBtn.disabled = true; say('저장하는 중…', true);
        return CHRecord.api('reportSave', { auth: CHRecord.auth(), studentId: s.id, month: info.month, plan: info.plan, comment: info.comment, email: !!email })
          .catch(function (err) { throw new Error(/알 수 없는 요청/.test(err.message) ? '기록 서버(Apps Script)를 새 버전으로 배포해야 이 기능을 쓸 수 있어요.' : err.message); })
          .finally(function () { linkBtn.disabled = mailBtn.disabled = false; });
      }
      linkBtn.onclick = function () {
        saveReport(false).then(function (r) {
          var text = s.name + ' 학생 ' + monthLabel(info.month) + ' 리포트예요. 이 링크에서 언제든 확인하실 수 있어요.\n' + r.link;
          (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { say('저장했어요. 링크를 복사했으니 카톡에 붙여 넣어 주세요.', true); },
            function () { window.prompt('이 링크를 복사해 보내 주세요', r.link); say('저장했어요.', true); });
        }, function (err) { say(err.message); });
      };
      mailBtn.onclick = function () {
        saveReport(true).then(function (r) { say(r.sent ? '저장하고 학부모 이메일 ' + r.sent + '곳에 보냈어요.' : '저장했어요. 시트 \'학부모\' 탭에 이 학생의 이메일과 수신 동의(Y)가 없어 보내지 않았어요.', !!r.sent); }, function (err) { say(err.message); });
      };
      bar2.append(linkBtn, mailBtn); out.appendChild(bar2);
      if (!info.data.done.length && !info.data.progress.length) say('이 달에는 기록이 없어요. 선생님 한마디 위주로 보내 주세요.');
    };
  }

  g.CHReport = { mount: mount, collect: collect, draw: draw };
})(window);
