/* 코딩하루 앱 서비스 워커.
 *  - /v/ 아래 주소는 잠긴 교안을 받아 그 자리에서 풀어 돌려준다(풀린 내용은 어디에도 저장하지 않는다).
 *  - 앱 껍데기(로그인 화면·아이콘)만 저장해 설치 가능하게 한다.
 *  - 교안은 오프라인 저장을 하지 않는다. 열 때마다 최신 잠긴 파일을 새로 받는다.
 */
importScripts('core.js');

var BASE = new URL('./', self.location.href);
var SHELL_CACHE = 'codingharu-shell-4';
var SHELL = ['./', 'index.html', 'core.js', 'inject.js', 'record.js', 'login.html', 'record-config.json', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/icon-180.png'];

var TYPES = {
  html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8', json: 'application/json; charset=utf-8',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', ico: 'image/x-icon', mp3: 'audio/mpeg',
  mp4: 'video/mp4', pdf: 'application/pdf', woff2: 'font/woff2', woff: 'font/woff',
  txt: 'text/plain; charset=utf-8', webmanifest: 'application/manifest+json'
};

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SHELL_CACHE).then(function (c) {
    return c.addAll(SHELL.map(function (p) { return new Request(p, { cache: 'reload' }); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf('codingharu-shell-') === 0 && k !== SHELL_CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== BASE.origin || url.pathname.indexOf(BASE.pathname) !== 0) return;
  var rel = decodeURIComponent(url.pathname.slice(BASE.pathname.length));
  if (rel.indexOf('v/') === 0 || rel === 'v') { e.respondWith(lesson(req, rel.slice(2))); return; }
  var shell = rel === '' || SHELL.indexOf(rel) >= 0;
  if (shell) e.respondWith(shellFetch(req));
  // content/·version.json·crypt.json·check.enc 은 가로채지 않는다 → 항상 네트워크
});

// 껍데기: 네트워크 먼저(고치면 바로 반영), 안 되면 저장본
async function shellFetch(req) {
  var cache = await caches.open(SHELL_CACHE);
  try {
    var r = await fetch(req, { cache: 'no-cache' });
    if (r.ok) cache.put(req, r.clone()).catch(function () {});
    return r;
  } catch (err) {
    return (await cache.match(req, { ignoreSearch: true })) || Response.error();
  }
}

function redirect(to) { return Response.redirect(new URL(to, BASE).href, 302); }
function page(status, title, body) {
  return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="robots" content="noindex,nofollow"><title>' + title + '</title>' +
    '<body style="font:18px/1.6 sans-serif;padding:40px 24px;text-align:center;color:#0056d2">' +
    '<h1>' + title + '</h1><p>' + body + '</p><p><a href="' + BASE.pathname + '">처음 화면으로</a></p></body>',
    { status: status, headers: { 'Content-Type': TYPES.html, 'Cache-Control': 'no-store' } });
}

var metaCache = null, metaAt = 0;
async function meta() {
  if (metaCache && Date.now() - metaAt < 30000) return metaCache;
  metaCache = await CHCore.getJSON(BASE.href, 'crypt.json');
  metaAt = Date.now();
  return metaCache;
}

async function lesson(req, path) {
  var nav = req.mode === 'navigate';
  if (path === '' || path.slice(-1) === '/') path += 'index.html';

  // 교안이 스스로 하려는 일 가운데 이 앱에서는 필요 없는 것
  if (path === 'sw.js') return new Response('', { status: 404 });
  if (path === 'manifest.webmanifest') return shellFetch(new Request(new URL('manifest.webmanifest', BASE).href));
  if (path === 'assets/install.js')
    return new Response('/* 앱 안에서는 쓰지 않음 */', { headers: { 'Content-Type': TYPES.js } });

  var key;
  try { key = await CHCore.loadKey(); } catch (err) { key = null; }
  if (!key) return nav ? redirect('./') : new Response('', { status: 401 });

  var buf;
  try {
    var m = await meta();
    buf = await CHCore.getBuf(BASE.href, 'content/' + await CHCore.nameFor(path, m));
  } catch (err) {
    if (err && err.status === 404) return nav ? page(404, '없는 페이지예요', '교안에 이 주소가 없어요.') : new Response('', { status: 404 });
    return nav ? page(503, '교안을 불러오지 못했어요', '인터넷 연결을 확인하고 다시 열어 주세요. 교안은 오프라인에서는 열 수 없어요.') : Response.error();
  }

  var plain;
  try { plain = await CHCore.decrypt(key, buf); }
  catch (err) {                      // 비밀번호가 바뀌었다 → 이 기기의 열쇠를 버리고 처음으로
    await CHCore.forgetKey().catch(function () {});
    metaCache = null;
    return nav ? redirect('./?expired=1') : new Response('', { status: 401 });
  }

  var ext = (path.split('.').pop() || '').toLowerCase();
  var type = TYPES[ext] || 'application/octet-stream';
  var headers = { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };
  if (ext === 'ent' || ext === 'rbxl') headers['Content-Disposition'] = 'attachment';

  if (ext === 'html') {
    var html = new TextDecoder().decode(plain);
    html = html.replace(/<link[^>]+rel=["']manifest["'][^>]*>/ig, '');
    var tag = '<meta name="robots" content="noindex,nofollow">' +
      '<link rel="manifest" href="' + BASE.pathname + 'manifest.webmanifest">' +
      '<script src="' + BASE.pathname + 'record.js" defer></script>' +
      '<script src="' + BASE.pathname + 'inject.js" defer></script>';
    html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, tag + '</head>') : tag + html;
    return new Response(html, { headers: headers });
  }
  return new Response(plain, { headers: headers });
}
