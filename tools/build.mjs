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

// 선생님 전용 정답 파일: 이름이 answers.js·solutions.js 로 끝나는 파일은 학생 비밀번호가 아니라
// 선생님 비밀번호(TEACHER_PASS)로 잠그고 'teacher/' 를 붙인 이름으로 둔다. 학생 열쇠로는 받을 수도 풀 수도 없다.
// TEACHER_PASS 가 없으면 정답 파일은 아예 넣지 않는다(학생에게 새지 않는 쪽이 기본).
const TEACHER_ONLY = /(?:^|[/-])(?:answers|solutions)\.js$/;
// 선생님 비밀번호가 짧거나 학생 비밀번호와 같으면 정답을 학생이 풀 수 있게 되므로, 동기화는 멈추지 않고 정답 파일만 뺀다
let tpass = process.env.TEACHER_PASS || '';
if (tpass && tpass.length < MIN_PASS) { console.warn(`::warning::TEACHER_PASS 가 ${MIN_PASS}자보다 짧아 정답 파일을 넣지 않습니다.`); tpass = ''; }
if (tpass && tpass === pass) { console.warn('::warning::TEACHER_PASS 가 SITE_PASS 와 같아 정답 파일을 넣지 않습니다. 다른 비밀번호로 바꿔 주세요.'); tpass = ''; }
const tkey = tpass ? pbkdf2Sync(tpass, Buffer.from(meta.salt, 'base64'), meta.iter, 32, 'sha256') : null;
const tivKey = tkey ? createHmac('sha256', tkey).update('iv').digest() : null;

function seal(plain, label, k = key, ik = ivKey) {
  const iv = createHmac('sha256', ik).update(label + '\0').update(plain).digest().subarray(0, 12);
  const c = createCipheriv('aes-256-gcm', k, iv);
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, ct, c.getAuthTag()]);          // WebCrypto 는 암호문 뒤에 태그를 기대한다
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
let n = 0, nTeacher = 0, nSkipped = 0;
const all = [];
for (const [prefix, dir] of sources) {
  for (const r of walk(dir)) all.push([prefix ? prefix + '/' + r : r, path.join(dir, r)]);
}
all.sort((a, b) => (a[0] < b[0] ? -1 : 1));
for (const [rel, file] of all) {
  let data = fs.readFileSync(file);
  if (REWRITE[rel]) {
    let t = data.toString('utf8');
    for (const [from, to] of REWRITE[rel]) t = t.split(from).join(to);
    data = Buffer.from(t, 'utf8');
  }
  if (TEACHER_ONLY.test(rel)) {
    if (!tkey) { nSkipped++; continue; }
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
}
if (n === 0) { console.error('잠글 파일이 없습니다. class 폴더 경로를 확인하세요.'); process.exit(1); }

fs.writeFileSync(path.join(out, 'check.enc'), seal(Buffer.from('codingharu'), 'check'));
const tcheck = path.join(out, 'teacher-check.enc');
if (tkey) fs.writeFileSync(tcheck, seal(Buffer.from('codingharu-teacher'), 'teacher-check', tkey, tivKey));
else fs.rmSync(tcheck, { force: true });
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 1));
fs.writeFileSync(path.join(out, 'version.json'), JSON.stringify({ v: sum.digest('hex').slice(0, 16), n }));
console.log(`${n}개 파일을 잠갔습니다. 선생님 정답 ${nTeacher}개` + (nSkipped ? `, TEACHER_PASS 가 없어 정답 ${nSkipped}개는 넣지 않았습니다.` : '.'));
