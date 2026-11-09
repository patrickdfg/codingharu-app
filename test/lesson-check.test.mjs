// 로봇 수업 참여 기록 서버(server/record.gs lessonStatus·lessonCheck) 시험: gallery 시험과 같은 Apps Script 흉내 환경.
// 실행: node test/lesson-check.test.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const CLIENT_ID = 'test-client.apps.googleusercontent.com';

function makeSheet(name) {
  const rows = [];
  const sh = {
    name, rows,
    appendRow: r => { rows.push(r.slice()); },
    getLastRow: () => rows.length,
    deleteRow: i => { rows.splice(i - 1, 1); },
    setFrozenRows() {},
    getRange(r, c, nr = 1, nc = 1) {
      if (typeof r === 'string') return { setNumberFormat() {} };
      return {
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (rows[r - 1 + i] || [])[c - 1 + j] ?? '')),
        getValue: () => (rows[r - 1] || [])[c - 1] ?? '',
        setValues: v => v.forEach((row, i) => row.forEach((x, j) => { rows[r - 1 + i] = rows[r - 1 + i] || []; rows[r - 1 + i][c - 1 + j] = x; })),
        setValue: x => { rows[r - 1] = rows[r - 1] || []; rows[r - 1][c - 1] = x; },
        setFontWeight() { return this; }, setBackground() { return this; }, setNumberFormat() { return this; },
      };
    },
  };
  return sh;
}

function env() {
  const sheets = new Map();
  const ss = { getSheetByName: n => sheets.get(n) || null, insertSheet: n => { const s = makeSheet(n); sheets.set(n, s); return s; } };
  const cache = new Map(), props = new Map([['CLIENT_ID', CLIENT_ID]]);
  const drive = new Map(); let fid = 0;
  const folder = { getId: () => 'F1', createFile: b => { const id = 'D' + ++fid; drive.set(id, { ...b, trashed: false }); return { getId: () => id }; } };
  const ctx = {
    SpreadsheetApp: { getActive: () => ss },
    Session: { getScriptTimeZone: () => 'Asia/Seoul', getEffectiveUser: () => ({ getEmail: () => 'admin@test.kr' }) },
    Utilities: {
      formatDate: (d, tz, f) => { const iso = new Date(d.getTime() + 9 * 3600000).toISOString(); return f === 'yyyy-MM-dd' ? iso.slice(0, 10) : iso.slice(0, 13).replace(/\D/g, ''); },
      getUuid: () => crypto.randomUUID(),
      computeHmacSha256Signature: (msg, key) => [...crypto.createHmac('sha256', key).update(msg).digest()].map(b => (b > 127 ? b - 256 : b)),
      computeDigest: (_, s) => [...crypto.createHash('sha256').update(s).digest()].map(b => (b > 127 ? b - 256 : b)),
      DigestAlgorithm: { SHA_256: 'sha256' },
      // Apps Script 처럼 바이트는 -128~127 배열
      base64Decode: s => { if (!/^[A-Za-z0-9+/=]*$/.test(s)) throw new Error('bad base64'); return [...Buffer.from(s, 'base64')].map(b => (b > 127 ? b - 256 : b)); },
      base64Encode: bytes => Buffer.from(bytes.map(b => b & 255)).toString('base64'),
      newBlob: (bytes, mime, name) => ({ bytes, mime, name }),
    },
    DriveApp: {   // 가짜 Drive: 폴더 하나, 파일은 drive 맵에
      createFolder: () => folder, getFolderById: id => { if (id !== 'F1') throw new Error('no folder'); return folder; },
      getFileById: id => { const f = drive.get(id); if (!f) throw new Error('no file'); return { getBlob: () => ({ getBytes: () => f.bytes }), setTrashed: t => { f.trashed = t; } }; },
    },
    CacheService: { getScriptCache: () => ({ get: k => cache.get(k) ?? null, put: (k, v) => cache.set(k, v), remove: k => cache.delete(k) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props.get(k) ?? null, setProperty: (k, v) => props.set(k, v) }) },
    UrlFetchApp: {
      fetch: url => {   // 가짜 구글 확인: id_token 이 'ok:<email>' 이면 유효
        const tok = decodeURIComponent(url.split('id_token=')[1]);
        const good = tok.startsWith('ok:');
        return { getResponseCode: () => (good ? 200 : 400),
          getContentText: () => JSON.stringify({ aud: CLIENT_ID, iss: 'accounts.google.com', email_verified: 'true', exp: String(Math.floor(Date.now() / 1000) + 3600), email: tok.slice(3), name: '선생님' }) };
      },
    },
    ContentService: { createTextOutput: s => ({ s, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
  };
  vm.createContext(ctx);
  const src = fs.readFileSync(new URL('../server/record.gs', import.meta.url), 'utf8');
  vm.runInContext(src + '\nthis.__call = (o) => doPost({ postData: { contents: JSON.stringify(o) } }).s;\nthis.__setup = setup;', ctx);
  ctx.__setup();
  return { call: o => JSON.parse(ctx.__call(o)), ss, sheets, drive };
}

const { call, sheets, drive } = env();
const T = { auth: 'ok:admin@test.kr' };
const ok = r => { assert.equal(r.ok, true, r.error); return r; };
const bad = (r, re) => { assert.equal(r.ok, false, '실패해야 함: ' + JSON.stringify(r)); if (re) assert.match(r.error, re); };

// 학생 셋: A·B 는 1반, C 는 2반
sheets.get('학생').rows.splice(1);          // 예시 학생 지우기
const students = {};
for (const [name, pin] of [['가온', '1111'], ['나래', '2222'], ['다솜', '3333']]) {
  const s = ok(call({ action: 'studentSignup', name, pin })).student;
  ok(call({ action: 'approve', ...T, id: s.id, ok: true }));
  const lg = ok(call({ action: 'studentLogin', name, pin }));
  students[name] = { studentId: lg.student.id, sid: lg.sid };
}
const st = sheets.get('학생').rows;
st[1][3] = '1반'; st[2][3] = '1반'; st[3][3] = '2반';
const A = students['가온'], B = students['나래'], C = students['다솜'];

const KEY = 'robot/cubroid/steam/03/';
const wb = (who, w) => sheets.get('워크북 기록').rows.find(r => String(r[0]) === who.studentId && r[2] === w);
const state = r => JSON.parse(r[10]);

// 학생 A 는 다른 수업을 이미 완료해 두었다(학생 자신의 저장)
ok(call({ action: 'save', ...A, workbook: 'done-index', title: '완료한 수업', page: '', state: { pages: { 'entry/a/': 111 } }, progress: { done: 1, total: 1 } }));

// 주소 검사·선생님만
bad(call({ action: 'lessonStatus', ...T, page: '../etc/' }), /수업 주소/);
bad(call({ action: 'lessonStatus', ...T, page: 'entry/x/' }), /수업 주소/);
bad(call({ action: 'lessonStatus', ...A, page: KEY }), /구글/);
bad(call({ action: 'lessonCheck', ...A, page: KEY, checks: [{ studentId: B.studentId, done: true }] }), /구글/);
bad(call({ action: 'lessonCheck', ...T, page: KEY, checks: [] }), /1~80/);

// 처음 상태: 셋 다 미완료, 반 목록
let s0 = ok(call({ action: 'lessonStatus', ...T, page: KEY }));
assert.deepEqual(s0.groups, ['1반', '2반']);
assert.deepEqual(s0.students.map(s => [s.name, s.group, s.done, s.check]), [['가온', '1반', false, null], ['나래', '1반', false, null], ['다솜', '2반', false, null]]);

// 일괄 체크: A·B 완료(같은 학생이 두 번 와도 한 번), C 는 안 함
assert.equal(ok(call({ action: 'lessonCheck', ...T, page: KEY, title: '3차시 · 반복', checks: [{ studentId: A.studentId, done: true }, { studentId: B.studentId, done: false }, { studentId: B.studentId, done: true }] })).saved, 2);
const ai = state(wb(A, 'done-index')).pages;
assert.ok(ai['entry/a/'] === 111 && ai[KEY] > 0);                 // 기존 완료 기록은 그대로
assert.equal(wb(A, 'done-index')[5], 2);
const ad = wb(A, 'done:' + KEY);
assert.deepEqual([ad[3], ad[4], ad[5], ad[9], state(ad).done, state(ad).by], ['완료 · 3차시 · 반복', KEY, 1, 'admin@test.kr', true, 'teacher']);
assert.ok(state(wb(B, 'done-index')).pages[KEY] > 0);
assert.equal(wb(C, 'done-index'), undefined);
// 학생 화면의 불러오기(load)로도 같은 지도가 보인다
assert.ok(ok(call({ action: 'load', ...B, workbook: 'done-index' })).state.pages[KEY] > 0);

// 학생 C 가 QR 확인 미션을 내고 직접 완료(학생 저장)
ok(call({ action: 'save', ...C, workbook: 'check:' + KEY, title: '수업 확인 · 3차시', page: KEY, state: { rating: '도움 받아 했어요', note: '반복으로 춤추는 로봇', answers: [1, 0] }, progress: { done: 1, total: 2 } }));
ok(call({ action: 'save', ...C, workbook: 'done:' + KEY, title: '완료 · 3차시', page: KEY, state: { done: true, at: 5 }, progress: { done: 1, total: 1 } }));
const s1 = ok(call({ action: 'lessonStatus', ...T, page: KEY })).students;
assert.deepEqual(s1.map(s => [s.done, s.by]), [[true, 'teacher'], [true, 'teacher'], [true, 'student']]);
assert.deepEqual([s1[2].check.score, s1[2].check.total, s1[2].check.rating, s1[2].check.note], [1, 2, '도움 받아 했어요', '반복으로 춤추는 로봇']);

// 취소: A 를 다시 미완료로 — 줄이 늘지 않고 바뀐다
const rows = sheets.get('워크북 기록').rows.length;
ok(call({ action: 'lessonCheck', ...T, page: KEY, title: '3차시', checks: [{ studentId: A.studentId, done: false }] }));
assert.equal(sheets.get('워크북 기록').rows.length, rows);
assert.ok(state(wb(A, 'done-index')).pages[KEY] < 0);
assert.equal(wb(A, 'done-index')[5], 1);
assert.equal(ok(call({ action: 'lessonStatus', ...T, page: KEY })).students[0].done, false);
// 없는 학생·승인 안 된 학생은 막는다
bad(call({ action: 'lessonCheck', ...T, page: KEY, checks: [{ studentId: '999', done: true }] }), /학생 목록/);
const pend = ok(call({ action: 'studentSignup', name: '라온', pin: '4444' })).student;
bad(call({ action: 'lessonCheck', ...T, page: KEY, checks: [{ studentId: pend.id, done: true }] }), /승인/);
assert.equal(ok(call({ action: 'lessonStatus', ...T, page: KEY })).students.length, 3);   // 대기 학생은 목록에 없음
console.log('로봇 수업 참여 기록 서버 시험 통과');
