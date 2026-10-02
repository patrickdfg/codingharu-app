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
    b.setAttribute('role', 'status');
    b.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483647;display:flex;gap:12px;align-items:center;' +
      'justify-content:space-between;padding:12px 16px;border-radius:14px;background:#234c3d;color:#fff;font:600 16px/1.4 sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.3)';
    b.innerHTML = '<span>새 교안이 올라왔어요. 지금 입력 중인 내용은 그대로 두었어요.</span>';
    var go = document.createElement('button');
    go.textContent = '새로고침';
    go.style.cssText = 'flex:none;padding:10px 16px;border:0;border-radius:10px;background:#fff;color:#234c3d;font:700 16px sans-serif';
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

  // ---- 앱 설치 단추 ----
  // 설치할 수 있을 때만 단추를 보인다: 앱으로 실행 중이거나, 설치를 마쳤거나,
  // 설치 창을 띄울 수 없는 상태(이미 설치됨 포함)면 숨긴다.
  var deferred = null, installed = false;
  try { installed = localStorage.getItem('chInstalled') === '1'; } catch (e) {}
  var style = document.createElement('style');
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
