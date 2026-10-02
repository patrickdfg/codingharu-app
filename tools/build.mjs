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
  'README.md', 'assets/editor.js', 'assets/editor.css', 'assets/install.js', 'assets/install.css']);

const [src, outArg] = process.argv.slice(2);
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

function seal(plain, label) {
  const iv = createHmac('sha256', ivKey).update(label + '\0').update(plain).digest().subarray(0, 12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, ct, c.getAuthTag()]);          // WebCrypto 는 암호문 뒤에 태그를 기대한다
}
const nameFor = (p) => createHash('sha256').update(p + '|' + meta.salt).digest('hex').slice(0, 40) + '.enc';

function* walk(dir, rel = '') {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (!rel && SKIP_TOP.has(e.name)) continue;
    if (e.isDirectory()) yield* walk(path.join(dir, e.name), r);
    else if (!SKIP_FILE.has(r)) yield r;
  }
}

const contentDir = path.join(out, 'content');
fs.rmSync(contentDir, { recursive: true, force: true });
fs.mkdirSync(contentDir, { recursive: true });

const sum = createHash('sha256');
let n = 0;
for (const rel of [...walk(src)].sort()) {
  const blob = seal(fs.readFileSync(path.join(src, rel)), rel);
  fs.writeFileSync(path.join(contentDir, nameFor(rel)), blob);
  sum.update(rel).update(blob);
  n++;
}
if (n === 0) { console.error('잠글 파일이 없습니다. class 폴더 경로를 확인하세요.'); process.exit(1); }

fs.writeFileSync(path.join(out, 'check.enc'), seal(Buffer.from('codingharu'), 'check'));
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 1));
fs.writeFileSync(path.join(out, 'version.json'), JSON.stringify({ v: sum.digest('hex').slice(0, 16), n }));
console.log(`${n}개 파일을 잠갔습니다.`);
