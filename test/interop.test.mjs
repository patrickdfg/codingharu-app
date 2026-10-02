// build.mjs 로 잠근 것을 브라우저와 같은 코드(core.js, WebCrypto)로 풀어 본다.
//   node test/interop.test.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import '../core.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-'));
const src = path.join(tmp, 'class'), out = path.join(tmp, 'out');
fs.mkdirSync(path.join(src, 'entry/race'), { recursive: true });
fs.mkdirSync(path.join(src, 'admin'), { recursive: true });
fs.mkdirSync(out);
fs.writeFileSync(path.join(src, 'index.html'), '<html><head></head><body>안녕 교안</body></html>');
fs.writeFileSync(path.join(src, 'entry/race/index.html'), '<p>레이스</p>');
fs.writeFileSync(path.join(src, 'admin/secret.json'), '{"url":"관리자 주소"}');
fs.writeFileSync(path.join(src, 'sw.js'), '// 옛 서비스워커');

const run = (pass) => execFileSync('node', ['tools/build.mjs', src, out], { env: { ...process.env, SITE_PASS: pass }, encoding: 'utf8' });
const PASS = 'correct horse battery';
run(PASS);

const meta = JSON.parse(fs.readFileSync(path.join(out, 'crypt.json'), 'utf8'));
const key = await CHCore.deriveKey(PASS, meta);
const buf = (f) => fs.readFileSync(path.join(out, f));

// 1) 맞는 비밀번호로 check.enc 와 교안이 풀린다
assert.equal(new TextDecoder().decode(await CHCore.decrypt(key, buf('check.enc'))), 'codingharu');
const name = await CHCore.nameFor('entry/race/index.html', meta);
assert.equal(new TextDecoder().decode(await CHCore.decrypt(key, buf('content/' + name))), '<p>레이스</p>');

// 2) 틀린 비밀번호는 풀리지 않는다
const bad = await CHCore.deriveKey('wrong password!!', meta);
await assert.rejects(CHCore.decrypt(bad, buf('check.enc')));

// 3) 관리자·옛 파일은 들어가지 않았고, 평문이 파일에 남지 않았다
const files = fs.readdirSync(path.join(out, 'content'));
assert.equal(files.length, 2);
assert.ok(!files.includes(await CHCore.nameFor('admin/secret.json', meta)));
for (const f of files) assert.ok(!buf('content/' + f).includes('레이스'));

// 4) 같은 입력이면 결과가 같다 → 바뀐 게 없으면 커밋도 없다
const v1 = fs.readFileSync(path.join(out, 'version.json'), 'utf8');
const before = buf('content/' + name);
run(PASS);
assert.equal(fs.readFileSync(path.join(out, 'version.json'), 'utf8'), v1);
assert.ok(buf('content/' + name).equals(before));

// 5) 교안을 고치면 버전이 바뀐다
fs.writeFileSync(path.join(src, 'entry/race/index.html'), '<p>레이스2</p>');
run(PASS);
assert.notEqual(fs.readFileSync(path.join(out, 'version.json'), 'utf8'), v1);

// 6) 비밀번호를 바꾸면 옛 열쇠로는 안 풀린다 (기기 접속 해제)
run('another long passphrase');
await assert.rejects(CHCore.decrypt(key, buf('check.enc')));

// 7) 짧은 비밀번호는 거절한다
assert.throws(() => run('short'), /./, '짧은 비밀번호는 실패해야 한다');

console.log('모든 시험 통과');
fs.rmSync(tmp, { recursive: true, force: true });
