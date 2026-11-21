// 공개 승인 작품만 실행해 갤러리 썸네일을 만든다. 학생 계정이나 교안 열쇠는 사용하지 않는다.
const fs = require('node:fs/promises'), path = require('node:path'), http = require('node:http'), crypto = require('node:crypto');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'gallery-thumbnails');
const sourceOf = item => [item.url || '', item.file?.ext || '', item.at || 0].join('|');
const publicURL = value => {
  try {
    const u = new URL(value), host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password &&
      !/^(localhost|.*\.localhost|.*\.local|0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) &&
      !(host.includes(':') && /^(::|fc|fd|fe80:)/.test(host));
  } catch { return false; }
};
const mime = { html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', webp: 'image/webp', woff: 'font/woff', woff2: 'font/woff2', mp3: 'audio/mpeg' };
async function main() {
  const config = JSON.parse(await fs.readFile(path.join(root, 'record-config.json'), 'utf8'));
  const api = async (action, body = {}) => {
    const response = await fetch(config.apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, ...body }), signal: AbortSignal.timeout(45000) });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error('Public gallery API unavailable');
    return data;
  };
  const items = (await api('galleryPublicList')).items;
  if (!Array.isArray(items)) throw new Error('Invalid gallery list');
  await fs.mkdir(output, { recursive: true });
  let previous = { items: {} };
  try { previous = JSON.parse(await fs.readFile(path.join(output, 'index.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const manifest = { items: {} }, now = Date.now();
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'], ...(process.env.GALLERY_CHROME ? { channel: 'chrome' } : {}) });
  let attempts = 0;
  try {
    for (const item of items) {
      if (!/^[a-f0-9]{12}$/.test(item.id)) continue;
      const source = sourceOf(item), old = previous.items[item.id];
      const same = old?.source === source;
      if (same) manifest.items[item.id] = old;
      const fresh = same && (old.file ? now - old.capturedAt < 86400000 : now - old.attemptedAt < 21600000);
      if (fresh || attempts >= 12) continue;
      if (item.file && !['html', 'htm', 'zip'].includes(item.file.ext)) continue;
      if (!item.file && !publicURL(item.url)) continue;
      attempts++;
      const context = await browser.newContext({ viewport: { width: 1200, height: 750 }, deviceScaleFactor: 1, acceptDownloads: false, serviceWorkers: 'block', reducedMotion: 'reduce' });
      let server, localOrigin;
      try {
        let target = item.url;
        if (item.file) {
          const file = await api('galleryPublicFile', { id: item.id });
          const bytes = Buffer.from(file.data, 'base64');
          let files, entry;
          if (item.file.ext === 'zip') {
            const { unzipSync } = require('fflate');
            let total = 0;
            files = unzipSync(bytes, { filter: file => { total += file.originalSize; if (total > 50 * 1048576) throw new Error('Web ZIP too large'); return !file.name.endsWith('/'); } });
            entry = Object.keys(files).filter(name => /(^|\/)index\.html?$/i.test(name)).sort((a, b) => a.split('/').length - b.split('/').length)[0];
            if (!entry) throw new Error('No web page in ZIP');
          } else { entry = 'index.html'; files = { [entry]: bytes }; }
          server = http.createServer((req, res) => {
            try {
              const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname.slice(1));
              const content = Object.hasOwn(files, name) && files[name];
              if (!content) { res.statusCode = 404; return res.end(); }
              res.setHeader('Content-Type', mime[name.split('.').pop().toLowerCase()] || 'application/octet-stream'); res.end(content);
            } catch { res.statusCode = 400; res.end(); }
          });
          await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
          localOrigin = 'http://127.0.0.1:' + server.address().port;
          target = localOrigin + '/' + entry;
        } else {
          const scratch = String(target).match(/^https:\/\/scratch\.mit\.edu\/projects\/(\d+)/i);
          const entry = String(target).match(/^https:\/\/playentry\.org\/(?:project|iframe|ws)\/([a-f0-9]{24})/i);
          if (scratch) target = 'https://scratch.mit.edu/projects/' + scratch[1] + '/embed/?autostart=true';
          if (entry) target = 'https://playentry.org/iframe/' + entry[1];
        }
        await context.route('**/*', route => {
          const url = route.request().url();
          if ((localOrigin && new URL(url).origin === localOrigin) || publicURL(url) || /^(data:|blob:)/.test(url)) return route.continue();
          return route.abort();
        });
        const page = await context.newPage(); page.on('dialog', dialog => dialog.dismiss());
        const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(4000);
        // codemaru.kr/<작품>은 Pages의 404 화면에서 실제 작품 iframe을 여는 구조다.
        if (response && response.status() >= 400 && page.frames().length === 1) throw new Error('Project page unavailable');
        for (const frame of page.frames()) {
          const start = frame.getByRole('button', { name: /^(?:(?:게임\s*)?(?:시작(?:하기)?|플레이|start|play|start game|play game|▶\s*시작)|.*천하통일 출정)$/i }).first();
          if (await start.isVisible().catch(() => false)) { await start.click({ timeout: 2000 }).catch(() => {}); break; }
        }
        await page.waitForTimeout(1500);
        const image = await page.screenshot({ type: 'jpeg', quality: 80, animations: 'disabled', timeout: 15000 });
        const hash = crypto.createHash('sha256').update(image).digest('hex').slice(0, 12), name = item.id + '-' + hash + '.jpg';
        await fs.writeFile(path.join(output, name), image);
        manifest.items[item.id] = { source, file: name, capturedAt: now, attemptedAt: now };
        console.log('Captured', item.id);
      } catch (error) {
        manifest.items[item.id] = { ...(same ? old : {}), source, attemptedAt: now };
        console.log('Capture deferred', item.id, error.message);
      } finally { await context.close(); if (server) await new Promise(resolve => server.close(resolve)); }
    }
  } finally { await browser.close(); }
  // 캡처하는 동안 공개 승인이 바뀐 작품은 게시하지 않는다.
  const current = new Map((await api('galleryPublicList')).items.map(item => [item.id, sourceOf(item)]));
  for (const [id, entry] of Object.entries(manifest.items)) if (current.get(id) !== entry.source) delete manifest.items[id];
  const keep = new Set(Object.values(manifest.items).map(entry => entry.file).filter(Boolean));
  for (const name of await fs.readdir(output)) if (/^[a-f0-9]{12}-[a-f0-9]{12}\.jpg$/.test(name) && !keep.has(name)) await fs.unlink(path.join(output, name));
  await fs.writeFile(path.join(output, 'index.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log('Public thumbnails:', keep.size);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
