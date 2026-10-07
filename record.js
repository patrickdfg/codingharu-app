/* 코딩하루 수업 기록 클라이언트: 기기 등록 열쇠·고른 학생을 보관하고, 기록 서버(Apps Script)와 주고받는다.
 * 로그인 화면(login.html)·처음 화면(index.html)·교안 화면(inject.js)이 같이 쓴다.
 * record-config.json 의 apiUrl 이 비어 있으면 아무것도 하지 않는다(기존처럼 기기 안에만 저장).
 */
(function (g) {
  var BASE = new URL('./', document.currentScript ? document.currentScript.src : location.href).href;
  var K_TOKEN = 'codingharu-device', K_STUDENT = 'codingharu-student', K_QUEUE = 'codingharu-sync-queue';
  var cfgPromise = null;

  function get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
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
    var payload = Object.assign({ action: action, token: dev && dev.token }, body || {});
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

  g.CHRecord = {
    config: config, api: api,
    device: function () { return get(K_TOKEN); },
    setDevice: function (d) { put(K_TOKEN, d); },
    student: function () { return get(K_STUDENT); },
    setStudent: function (s) { put(K_STUDENT, s); },
    forgetDevice: function () { put(K_TOKEN, null); put(K_STUDENT, null); },
    queue: function () { return get(K_QUEUE) || {}; },
    setQueue: function (q) { put(K_QUEUE, q); },
    // 로그인 화면을 거쳐야 하는가: 기록이 켜져 있고, 기기 등록이나 학생 선택이 안 됐을 때
    needsLogin: async function () {
      var c = await config();
      if (!c.on) return false;
      if (get('codingharu-record-skip')) return false;
      return !get(K_TOKEN) || !get(K_STUDENT);
    },
    base: BASE
  };
})(window);
