/* 코딩하루 앱 — 암호 풀기와 기기 열쇠 보관.
 * 로그인 화면(window), 서비스 워커(importScripts), 시험(Node)이 같이 쓴다.
 *
 * 방식: 열쇠 = PBKDF2-SHA256(비밀번호, 소금, 반복수) → AES-GCM 256.
 * 잠긴 파일 = 앞 12바이트 iv + (암호문 + 태그). tools/build.mjs 와 같은 규칙이다.
 * 비밀번호는 저장하지 않는다. 한 번 맞으면 "내보낼 수 없는 열쇠"만 IndexedDB 에 남긴다.
 */
(function (g) {
  var enc = new TextEncoder();

  function b64(s) {
    var bin = atob(s), out = new Uint8Array(bin.length), i;
    for (i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function hex(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  }

  async function deriveKey(pass, meta) {
    var base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: b64(meta.salt), iterations: meta.iter, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  }

  function decrypt(key, buf) {
    var all = new Uint8Array(buf);
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12) }, key, all.slice(12));
  }

  // 교안 경로 → 잠긴 파일 이름 (tools/build.mjs 의 nameFor 와 같아야 한다)
  async function nameFor(path, meta) {
    var d = await crypto.subtle.digest('SHA-256', enc.encode(path + '|' + meta.salt));
    return hex(d).slice(0, 40) + '.enc';
  }

  // ---- 기기에 열쇠 보관 (IndexedDB) ----
  function db() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open('codingharu', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  async function kv(mode, fn) {
    var d = await db();
    return new Promise(function (res, rej) {
      var t = d.transaction('kv', mode), out = fn(t.objectStore('kv'));
      t.oncomplete = function () { d.close(); res(out && out.result); };
      t.onerror = function () { d.close(); rej(t.error); };
    });
  }
  function saveKey(key) { return kv('readwrite', function (s) { return s.put(key, 'key'); }); }
  function loadKey() { return kv('readonly', function (s) { return s.get('key'); }); }
  function forgetKey() { return kv('readwrite', function (s) { return s.delete('key'); }); }

  async function getJSON(base, name) {
    var r = await fetch(base + name, { cache: 'no-store' });
    if (!r.ok) throw new Error(name + ' ' + r.status);
    return r.json();
  }
  async function getBuf(base, name) {
    var r = await fetch(base + name, { cache: 'no-cache' });
    if (!r.ok) { var e = new Error(name + ' ' + r.status); e.status = r.status; throw e; }
    return r.arrayBuffer();
  }

  // 열쇠가 지금 사이트의 것인지 (check.enc 가 풀리는지). 받기 실패(오프라인 등)는 예외로 올린다.
  async function keyWorks(base, key) {
    var buf = await getBuf(base, 'check.enc');
    try { await decrypt(key, buf); return true; } catch (e) { return false; }
  }

  g.CHCore = {
    deriveKey: deriveKey, decrypt: decrypt, nameFor: nameFor,
    saveKey: saveKey, loadKey: loadKey, forgetKey: forgetKey,
    getJSON: getJSON, getBuf: getBuf, keyWorks: keyWorks, hex: hex
  };
})(globalThis);
