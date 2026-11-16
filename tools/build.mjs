// 비공개 class 저장소의 교안을 비밀번호로 잠가 content/ 에 만든다.
//   SITE_PASS=비밀번호 node tools/build.mjs <class 폴더> [내보낼 폴더=.]
// 같은 내용·같은 비밀번호면 결과가 한 바이트도 안 변한다(iv 를 내용에서 뽑는다) → 바뀐 것만 커밋된다.
import { createCipheriv, createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ITER = 600000;
const MIN_PASS = 10;
// 학생에게 줄 필요 없는 것 (관리자 편집기, 작업 파일, 옛 PWA 파일, 문서)
const SKIP_TOP = new Set(['.git', '.github', 'admin', 'work', 'node_modules']);
const SKIP_FILE = new Set(['sw.js', 'manifest.webmanifest', 'offline.html', '.nojekyll', '.gitignore',
  'README.md', 'assets/install.js', 'assets/install.css']);
// 관리자 폴더에서 학생 화면의 '소스 편집' 단추가 읽는 주소 파일 하나만 넣는다 (편집 권한은 Apps Script 가 구글 계정으로 따로 검사한다)
const ALLOW = new Set(['admin/apps-script-url.json']);

// 사용법: build.mjs <class> [내보낼 폴더] [접두어=폴더 ...]   예) roblox/treasure=roblox-src
const [src, outArg, ...mounts] = process.argv.slice(2);
const out = path.resolve(outArg || '.');
const pass = process.env.SITE_PASS || '';
if (!src) { console.error('사용법: SITE_PASS=... node tools/build.mjs <class 폴더> [내보낼 폴더]'); process.exit(2); }
if (pass.length < MIN_PASS) { console.error(`SITE_PASS 가 없거나 ${MIN_PASS}자보다 짧습니다.`); process.exit(2); }

// 소금은 한 번 만들면 계속 쓴다 (바뀌면 모든 파일 이름과 내용이 바뀐다)
const metaPath = path.join(out, 'crypt.json');
let meta;
if (fs.existsSync(metaPath)) meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
if (!meta || meta.iter !== ITER) meta = { v: 1, salt: randomBytes(16).toString('base64'), iter: ITER };
const key = pbkdf2Sync(pass, Buffer.from(meta.salt, 'base64'), meta.iter, 32, 'sha256');
const ivKey = createHmac('sha256', key).update('iv').digest();

// 선생님 정답 파일은 일반 교안과 별도 teacher/ 경로에 두되, 사이트 비밀번호(SITE_PASS)로 잠근다.
// 같은 비밀번호를 쓰므로 파일 암호 자체는 학생과 구분되지 않는다. 화면 표시 권한은 선생님 모드가 검사한다.
const TEACHER_ONLY = /(?:^|[/-])(?:answers|solutions)\.js$/;
const tkey = key;
const tivKey = ivKey;

function seal(plain, label, k = key, ik = ivKey) {
  const iv = createHmac('sha256', ik).update(label + '\0').update(plain).digest().subarray(0, 12);
  const c = createCipheriv('aes-256-gcm', k, iv);
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, ct, c.getAuthTag()]);          // WebCrypto 는 암호문 뒤에 태그를 기대한다
}
// 집 연습(선택): HOME_PASS 와 집에서 열 수업 목록(home-paths.json, 예: ["koi/","python/iot/"])이 있으면
// 그 수업 파일을 집 연습 열쇠로 한 벌 더 잠근다(home/ 경로). 학생은 로그인하면 기록 서버에서 이 열쇠를 받아, 체크한 수업만 연다.
// 공통 파일(assets/, 맨 위 파일)과 그 수업으로 가는 길의 목록 쪽(index.html)도 함께 넣는다. 교안 비밀번호 열쇠로는 지금처럼 모두 열린다.
const homePass = process.env.HOME_PASS || '';
let homePaths = [];
try { homePaths = JSON.parse(fs.readFileSync(path.join(out, 'home-paths.json'), 'utf8')); } catch (e) { homePaths = []; }
homePaths = Array.isArray(homePaths) ? homePaths.filter((x) => typeof x === 'string' && /^[a-z0-9][a-z0-9._/-]*\/$/i.test(x) && !x.includes('..')) : [];
if (homePass && homePass.length < MIN_PASS) { console.error(`HOME_PASS 가 ${MIN_PASS}자보다 짧습니다.`); process.exit(2); }
const homeOn = !!homePass && homePaths.length > 0;
const hkey = homeOn ? pbkdf2Sync(homePass, Buffer.from(meta.salt, 'base64'), meta.iter, 32, 'sha256') : null;
const hivKey = homeOn ? createHmac('sha256', hkey).update('iv').digest() : null;
// assets/ 는 바로 아래 파일과 vendor·icons 만 늘 넣고, 과목별 하위 폴더(assets/scratch-blocks/ 등)는 체크한 수업이 실제로 쓰는 것만 넣는다
const ASSET_ALWAYS = /^assets\/(?:[^/]+|(?:vendor|icons)\/.+)$/;
const homeAssets = new Set();
function forHome(rel) {
  if (!homeOn) return false;
  if (!rel.includes('/') || ASSET_ALWAYS.test(rel)) return true;
  if (rel.startsWith('assets/')) return homeAssets.has(rel.split('/').slice(0, 2).join('/') + '/');
  if (homePaths.some((p) => rel.startsWith(p))) return true;
  if (/(?:^|\/)index\.html$/.test(rel)) { const dir = rel.slice(0, -'index.html'.length); return homePaths.some((p) => p.startsWith(dir)); }
  return false;
}
const nameFor = (p) => createHash('sha256').update(p + '|' + meta.salt).digest('hex').slice(0, 40) + '.enc';

function* walk(dir, rel = '') {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (!rel && SKIP_TOP.has(e.name) && !(e.isDirectory() && [...ALLOW].some((a) => a.startsWith(e.name + '/')))) continue;
    if (e.isDirectory()) yield* walk(path.join(dir, e.name), r);
    else if (!SKIP_FILE.has(r) && !/\.md$/i.test(r) && (!r.startsWith('admin/') || ALLOW.has(r))) yield r;   // AGENTS·README 같은 작업 문서(.md)는 앱에 넣지 않는다
  }
}

// 다른 저장소의 교안도 앱 안에 넣는다 (접두어 아래로). 그 저장소의 README·.git 은 뺀다.
const sources = [['', src]];
for (const m of mounts) { const i = m.indexOf('='); sources.push([m.slice(0, i), m.slice(i + 1)]); }
// 공개 저장소로 연결되던 링크를 앱 안 주소로 바꾼다
const REWRITE = { 'roblox/index.html': [['https://patrickdfg.github.io/roblox/', 'treasure/']] };

const contentDir = path.join(out, 'content');
fs.rmSync(contentDir, { recursive: true, force: true });
fs.mkdirSync(contentDir, { recursive: true });

const sum = createHash('sha256');
let n = 0, nTeacher = 0, nHome = 0, homeBytes = 0;
const folders = new Map();   // 선생님 관리 화면의 '집에서 연습' 체크 목록: index.html 이 있는 1·2단계 폴더
const all = [];
for (const [prefix, dir] of sources) {
  for (const r of walk(dir)) all.push([prefix ? prefix + '/' + r : r, path.join(dir, r)]);
}
all.sort((a, b) => (a[0] < b[0] ? -1 : 1));
if (homeOn) {   // 체크한 수업의 html·js·css 가 부르는 assets 하위 폴더를 찾는다
  for (const [rel, file] of all) {
    if (!homePaths.some((p) => rel.startsWith(p)) || !/\.(?:html?|js|css|json)$/i.test(rel)) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/assets\/([A-Za-z0-9_.-]+)\//g)) homeAssets.add('assets/' + m[1] + '/');
  }
}
for (const [rel, file] of all) {
  let data = fs.readFileSync(file);
  if (REWRITE[rel]) {
    let t = data.toString('utf8');
    for (const [from, to] of REWRITE[rel]) t = t.split(from).join(to);
    data = Buffer.from(t, 'utf8');
  }
  if (TEACHER_ONLY.test(rel)) {
    const tblob = seal(data, 'teacher/' + rel, tkey, tivKey);
    fs.writeFileSync(path.join(contentDir, nameFor('teacher/' + rel)), tblob);
    sum.update('teacher/' + rel).update(tblob);
    nTeacher++;
    continue;
  }
  const blob = seal(data, rel);
  fs.writeFileSync(path.join(contentDir, nameFor(rel)), blob);
  sum.update(rel).update(blob);
  n++;
  const parts = rel.split('/');
  for (let d = 1; d <= 2 && d < parts.length; d++) {
    const dir = parts.slice(0, d).join('/') + '/';
    const f = folders.get(dir) || { path: dir, files: 0, bytes: 0, title: '' };
    f.files++; f.bytes += data.length;
    if (rel === dir + 'index.html') { const m = /<title>([^<]*)<\/title>/i.exec(data.toString('utf8')); if (m) f.title = m[1].replace(/\s*·\s*코드마루\s*$/, '').trim(); f.page = true; }
    folders.set(dir, f);
  }
  if (forHome(rel)) {
    const hblob = seal(data, 'home/' + rel, hkey, hivKey);
    fs.writeFileSync(path.join(contentDir, nameFor('home/' + rel)), hblob);
    sum.update('home/' + rel).update(hblob);
    nHome++; homeBytes += hblob.length;
  }
}
if (n === 0) { console.error('잠글 파일이 없습니다. class 폴더 경로를 확인하세요.'); process.exit(1); }

// 목록(교안 비밀번호 열쇠로 잠금): 앱 주소 v/__projects.json
const list = [...folders.values()].filter((f) => f.page).sort((a, b) => (a.path < b.path ? -1 : 1));
const projects = Buffer.from(JSON.stringify({ projects: list, home: homeOn ? homePaths : [], homeOn }), 'utf8');
const pblob = seal(projects, '__projects.json');
fs.writeFileSync(path.join(contentDir, nameFor('__projects.json')), pblob); sum.update('__projects.json').update(pblob);
const homeCheck = path.join(out, 'home-check.enc');
if (homeOn) {
  fs.writeFileSync(homeCheck, seal(Buffer.from('codingharu-home'), 'home-check', hkey, hivKey));
  const hl = seal(Buffer.from(JSON.stringify({ home: homePaths, items: homePaths.map((p) => ({ path: p, title: (folders.get(p) || {}).title || p })) }), 'utf8'), 'home/__home.json', hkey, hivKey);
  fs.writeFileSync(path.join(contentDir, nameFor('home/__home.json')), hl); sum.update('home/__home.json').update(hl);
} else fs.rmSync(homeCheck, { force: true });

fs.writeFileSync(path.join(out, 'check.enc'), seal(Buffer.from('codingharu'), 'check'));
const tcheck = path.join(out, 'teacher-check.enc');
fs.writeFileSync(tcheck, seal(Buffer.from('codingharu-teacher'), 'teacher-check', tkey, tivKey));
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 1));
fs.writeFileSync(path.join(out, 'version.json'), JSON.stringify({ v: sum.digest('hex').slice(0, 16), n }));
console.log(`${n}개 파일을 잠갔습니다. 선생님 정답 ${nTeacher}개. 집 연습 ${homeOn ? nHome + '개(' + Math.round(homeBytes / 1048576) + 'MB, ' + homePaths.length + '개 수업)' : '꺼짐'}.`);
