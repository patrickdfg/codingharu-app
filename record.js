/* 코딩하루 수업 기록 클라이언트: 기기 등록 열쇠·고른 학생을 보관하고, 기록 서버(Apps Script)와 주고받는다.
 * 로그인 화면(login.html)·처음 화면(index.html)·교안 화면(inject.js)이 같이 쓴다.
 * record-config.json 의 apiUrl 이 비어 있으면 아무것도 하지 않는다(기존처럼 기기 안에만 저장).
 */
(function (g) {
  var BASE = new URL('./', document.currentScript ? document.currentScript.src : location.href).href;
  var K_TOKEN = 'codingharu-device', K_STUDENT = 'codingharu-student', K_QUEUE = 'codingharu-sync-queue', K_SESSION = 'codingharu-session', K_AUTH = 'codingharu-auth';
  var cfgPromise = null;

  function get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  // 로그인 상태는 탭·앱을 닫으면 사라진다(들어갈 때마다 로그인). 기기 등록 열쇠만 오래 남는다.
  function sget(k) { try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function sput(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function put(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function config() {
    if (!cfgPromise) cfgPromise = fetch(BASE + 'record-config.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .catch(function () { return {}; })
      .then(function (c) { c = c || {}; c.on = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(c.apiUrl || '') && !!c.clientId; return c; });
    return cfgPromise;
  }

  async function api(action, body) {
    var c = await config();
    if (!c.on) throw new Error('수업 기록이 아직 설정되지 않았어요.');
    var dev = get(K_TOKEN);
    var ss = sget(K_SESSION);
    var payload = Object.assign({ action: action, token: dev && dev.token, sid: ss && ss.sid }, body || {});
    var r = await fetch(c.apiUrl, { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow' });
    if (!r.ok) throw new Error('기록 서버에 연결하지 못했어요 (' + r.status + ').');
    var out = await r.json();
    if (!out.ok) {
      var e = new Error(out.error || '기록 서버 오류');
      if (/등록/.test(out.error || '')) e.unpaired = true;
      throw e;
    }
    return out;
  }

  // 각 학생의 미전송 지급 요청을 기기에 보관하고, 서버에서 활동별 중복을 제거한다.
  function pointQueueKey(id) { return 'codingharu-points-queue-s' + id; }
  var pointBusy = false;
  function flushPoints() {
    var session = sget(K_SESSION), student = get(K_STUDENT);
    if (pointBusy || !student || !session || session.role !== 'student' || !session.sid) return;
    var qkey = pointQueueKey(student.id), queue = get(qkey) || [];
    if (!queue.length) return;
    pointBusy = true;
    api('pointsAward', Object.assign({ studentId: student.id }, queue[0])).then(function (out) {
      var current = get(qkey) || [];
      current = current.filter(function (x) { return !(x.kind === queue[0].kind && x.key === queue[0].key); });
      put(qkey, current); g.dispatchEvent(new CustomEvent('codingharu:points-balance', {detail:out}));
      pointBusy = false; flushPoints();
    }, function () {
      var current = get(qkey) || [], i = current.findIndex(function(x) { return x.kind === queue[0].kind && x.key === queue[0].key; });
      if (i >= 0 && current.length > 1) current.push(current.splice(i,1)[0]);
      put(qkey, current); pointBusy = false; g.setTimeout(flushPoints, 8000);
    });
  }
  document.addEventListener('codingharu:points', function (e) {
    var session = sget(K_SESSION), student = get(K_STUDENT), d = e.detail || {};
    if (!student || !session || session.role !== 'student' || !d.kind || !d.key) return;
    var qkey = pointQueueKey(student.id), queue = get(qkey) || [];
    if (!queue.some(function (x) { return x.kind === d.kind && x.key === d.key; })) queue.push({kind:d.kind,key:d.key,label:String(d.label || '').slice(0,120)});
    put(qkey, queue); g.setTimeout(flushPoints, 3000);
  });
  g.addEventListener('online', flushPoints);
  g.setTimeout(flushPoints, 1000);

  g.CHRecord = {
    config: config, api: api,
    device: function () { return get(K_TOKEN); },
    setDevice: function (d) { put(K_TOKEN, d); },
    student: function () { return get(K_STUDENT); },
    setStudent: function (s) { put(K_STUDENT, s); },
    forgetDevice: function () { put(K_TOKEN, null); put(K_STUDENT, null); sput(K_SESSION, null); sput(K_AUTH, null); },
    // 로그인 상태: role 은 student(이름+번호) · teacher(구글/마이크로소프트) · offline(기록 서버에 못 닿을 때 기록 없이)
    session: function () { return sget(K_SESSION); },
    setSession: function (role, extra) { sput(K_SESSION, Object.assign({ role: role, at: Date.now() }, extra || {})); },
    endSession: function () { sput(K_SESSION, null); sput(K_AUTH, null); put(K_STUDENT, null); },
    sessionOk: function () {
      var s = sget(K_SESSION); if (!s) return false;
      if (s.role === 'teacher' || s.role === 'offline') return true;
      return s.role === 'student' && !!get(K_STUDENT);
    },
    // 선생님이 방금 한 로그인(구글/마이크로소프트) 정보: 관리자 화면 요청에 쓴다. 탭을 닫으면 사라진다.
    auth: function () { return sget(K_AUTH); },
    setAuth: function (a) { sput(K_AUTH, a); },
    queue: function () { return get(K_QUEUE) || {}; },
    setQueue: function (q) { put(K_QUEUE, q); },
    // 로그인 화면을 거쳐야 하는가: 기록이 켜져 있고, 이번에 로그인하지 않았을 때
    needsLogin: async function () {
      var c = await config();
      if (!c.on) return false;
      return !CHRecord.sessionOk();
    },
    base: BASE
  };
})(window);
