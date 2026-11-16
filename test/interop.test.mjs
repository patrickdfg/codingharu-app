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
assert.equal(files.length, 3);   // index.html, entry/race/index.html, __projects.json(수업 목록)
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

// 8) 선생님 정답 파일(…answers.js·…solutions.js): 원장님 결정(2026-11-14)으로 사이트 비밀번호(SITE_PASS)로 잠근다.
//    대신 일반 교안 이름(학생이 여는 경로)으로는 넣지 않고 teacher/ 이름으로만 넣는다. 앱은 구글 계정으로 선생님 로그인한 기기에서만
//    정답 열쇠를 켜서(index.html autoTeacherKey) 서비스 워커가 teacher/ 파일을 받는다. 학생 기기에는 정답 열쇠가 없어 화면에 나오지 않는다.
fs.mkdirSync(path.join(src, 'python/robot'), { recursive: true });
fs.writeFileSync(path.join(src, 'python/robot/robot-answers.js'), 'window.RobotAnswers=["정답"]');
run(PASS);
const meta2 = JSON.parse(fs.readFileSync(path.join(out, 'crypt.json'), 'utf8'));
const skey = await CHCore.deriveKey(PASS, meta2);
const plainName = await CHCore.nameFor('python/robot/robot-answers.js', meta2);
const teacherName = await CHCore.nameFor('teacher/python/robot/robot-answers.js', meta2);
assert.ok(!fs.existsSync(path.join(out, 'content', plainName)), '학생이 여는 경로 이름으로는 정답 파일이 없어야 한다');
assert.ok(fs.existsSync(path.join(out, 'content', teacherName)), 'teacher/ 이름으로 정답 파일이 있어야 한다');
assert.equal(new TextDecoder().decode(await CHCore.decrypt(skey, buf('content/' + teacherName))), 'window.RobotAnswers=["정답"]');
assert.equal(new TextDecoder().decode(await CHCore.decrypt(skey, buf('teacher-check.enc'))), 'codingharu-teacher');
assert.ok(!buf('content/' + teacherName).includes('정답'), '평문이 드러나면 안 된다');


// 집 연습: HOME_PASS 와 home-paths.json 이 있으면 체크한 수업만 집 연습 열쇠로 한 벌 더 잠근다
{
  fs.mkdirSync(path.join(src, 'python/iot'), { recursive: true }); fs.mkdirSync(path.join(src, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(src, 'python/index.html'), '<title>파이썬 · 코드마루</title>');
  fs.writeFileSync(path.join(src, 'python/iot/index.html'), '<title>IoT · 코드마루</title>집에서');
  fs.writeFileSync(path.join(src, 'python/iot/iot.js'), '// iot');
  fs.writeFileSync(path.join(src, 'assets/style.css'), 'body{}');
  fs.mkdirSync(path.join(src, 'assets/scratch-big'), { recursive: true }); fs.mkdirSync(path.join(src, 'assets/iot-img'), { recursive: true });
  fs.writeFileSync(path.join(src, 'assets/scratch-big/a.png'), 'png'); fs.writeFileSync(path.join(src, 'assets/iot-img/b.png'), 'png');
  fs.writeFileSync(path.join(src, 'python/iot/page.html'), '<img src="../../assets/iot-img/b.png">');
  fs.writeFileSync(path.join(out, 'home-paths.json'), JSON.stringify(['python/iot/', '../bad/', 'x']));
  const HOME = 'home practice key 1';
  execFileSync('node', ['tools/build.mjs', src, out], { env: { ...process.env, SITE_PASS: PASS, HOME_PASS: HOME }, encoding: 'utf8' });
  const m2 = JSON.parse(fs.readFileSync(path.join(out, 'crypt.json'), 'utf8'));
  const hk = await CHCore.deriveKey(HOME, m2), sk = await CHCore.deriveKey(PASS, m2);
  const has = async (p) => fs.existsSync(path.join(out, 'content', await CHCore.nameFor(p, m2)));
  assert.equal(new TextDecoder().decode(await CHCore.decrypt(hk, buf('home-check.enc'))), 'codingharu-home');
  await assert.rejects(CHCore.decrypt(sk, buf('home-check.enc')));
  for (const p of ['python/iot/index.html', 'python/iot/iot.js', 'python/index.html', 'index.html', 'assets/style.css']) assert.ok(await has('home/' + p), p);
  for (const p of ['entry/race/index.html', 'assets/scratch-big/a.png']) assert.ok(!(await has('home/' + p)), p);
  assert.ok(await has('home/assets/iot-img/b.png'));   // 체크한 수업이 부르는 assets 하위 폴더만
  const iot = buf('content/' + await CHCore.nameFor('home/python/iot/iot.js', m2));
  assert.equal(new TextDecoder().decode(await CHCore.decrypt(hk, iot)), '// iot');
  await assert.rejects(CHCore.decrypt(sk, iot));                       // 집 열쇠 파일은 교안 열쇠로 안 풀리고
  const full = buf('content/' + await CHCore.nameFor('entry/race/index.html', m2));
  await assert.rejects(CHCore.decrypt(hk, full));                      // 학원 전용 수업은 집 열쇠로 안 풀린다
  const pj = JSON.parse(new TextDecoder().decode(await CHCore.decrypt(sk, buf('content/' + await CHCore.nameFor('__projects.json', m2)))));
  assert.deepEqual(pj.home, ['python/iot/']); assert.ok(pj.projects.some((x) => x.path === 'python/iot/' && x.title === 'IoT'));
  const hl = JSON.parse(new TextDecoder().decode(await CHCore.decrypt(hk, buf('content/' + await CHCore.nameFor('home/__home.json', m2)))));
  assert.deepEqual(hl.home, ['python/iot/']);
  // HOME_PASS 가 없으면 집 연습은 꺼지고 home-check.enc 도 지운다
  execFileSync('node', ['tools/build.mjs', src, out], { env: { ...process.env, SITE_PASS: PASS, HOME_PASS: '' }, encoding: 'utf8' });
  assert.ok(!fs.existsSync(path.join(out, 'home-check.enc'))); assert.ok(!(await has('home/python/iot/iot.js')));
}
console.log('모든 시험 통과');
fs.rmSync(tmp, { recursive: true, force: true });
