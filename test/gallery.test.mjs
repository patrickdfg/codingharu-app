// 작품 게시판 서버(server/record.gs) 시험: Apps Script 환경을 흉내 내어 실제 서버 코드를 그대로 돌린다.
// 실행: node test/gallery.test.mjs
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

// 올리기
const pAll = ok(call({ action: 'galleryPost', ...A, title: '달리기 게임', url: 'https://playentry.org/project/0123456789abcdef01234567', desc: '스페이스로 점프', vis: 'all' }));
const pClass = ok(call({ action: 'galleryPost', ...A, title: '반 친구용', url: 'https://scratch.mit.edu/projects/123456', vis: 'class' }));
const pMe = ok(call({ action: 'galleryPost', ...A, title: '연습 중', url: 'https://my-app.vercel.app/', vis: 'me' }));
assert.equal(pAll.status, '대기'); assert.equal(pMe.status, '개인');
bad(call({ action: 'galleryPost', ...A, title: '', url: 'https://x.kr', vis: 'all' }), /제목/);
bad(call({ action: 'galleryPost', ...A, title: '나쁜 주소', url: 'javascript:alert(1)', vis: 'all' }), /https/);
bad(call({ action: 'galleryPost', ...A, title: '범위', url: 'https://x.kr', vis: 'public' }), /공개 범위/);
bad(call({ action: 'galleryPost', studentId: A.studentId, sid: B.sid, title: '남의 이름', url: 'https://x.kr', vis: 'all' }), /로그인/);

// 승인 전: B 는 아무것도 못 본다, A 는 자기 것 3개, 선생님은 3개
const ids = l => l.items.map(i => i.id).sort();
assert.deepEqual(ids(ok(call({ action: 'galleryList', ...B }))), []);
assert.equal(ok(call({ action: 'galleryList', ...A })).items.length, 3);
const tl = ok(call({ action: 'galleryList', ...T }));
assert.equal(tl.teacher, true); assert.equal(tl.items.length, 3);
assert.equal(tl.items.find(i => i.id === pAll.id).kind, 'entry');
assert.equal(tl.items.find(i => i.id === pClass.id).kind, 'scratch');
assert.equal(tl.items.find(i => i.id === pMe.id).kind, 'web');

// 승인: 나만 보기는 승인 불가
ok(call({ action: 'galleryReview', ...T, id: pAll.id, decision: 'approve' }));
ok(call({ action: 'galleryReview', ...T, id: pClass.id, decision: 'approve' }));
bad(call({ action: 'galleryReview', ...T, id: pMe.id, decision: 'approve' }), /나만 보기/);
bad(call({ action: 'galleryReview', auth: 'nope', id: pAll.id, decision: 'approve' }), /구글/);
bad(call({ action: 'galleryReview', ...A, id: pAll.id, decision: 'approve' }));   // 학생은 승인 못 함

// 같은 반 B 는 all+class, 다른 반 C 는 all 만. 남의 '나만 보기'는 안 보인다.
assert.deepEqual(ids(ok(call({ action: 'galleryList', ...B }))), [pAll.id, pClass.id].sort());
assert.deepEqual(ids(ok(call({ action: 'galleryList', ...C }))), [pAll.id]);
assert.equal(ok(call({ action: 'galleryList', ...C })).items[0].mine, false);

// 좋아요: 남의 승인 작품만, 다시 누르면 꺼짐
let lk = ok(call({ action: 'galleryLike', ...B, id: pAll.id })); assert.deepEqual([lk.likes, lk.liked], [1, true]);
lk = ok(call({ action: 'galleryLike', ...C, id: pAll.id })); assert.equal(lk.likes, 2);
lk = ok(call({ action: 'galleryLike', ...B, id: pAll.id })); assert.deepEqual([lk.likes, lk.liked], [1, false]);
bad(call({ action: 'galleryLike', ...A, id: pAll.id }), /좋아요/);            // 내 작품
bad(call({ action: 'galleryLike', ...C, id: pClass.id }), /좋아요/);          // 다른 반 작품
bad(call({ action: 'galleryLike', ...B, id: pMe.id }), /좋아요/);             // 남의 나만 보기

// 고치기: 승인된 작품의 제목을 바꾸면 다시 대기 → 남에게서 사라짐
assert.equal(ok(call({ action: 'galleryEdit', ...A, id: pAll.id, title: '달리기 게임 2' })).status, '대기');
assert.deepEqual(ids(ok(call({ action: 'galleryList', ...C }))), []);
// 범위만 class→… : 승인된 class 를 all 로 넓히면 대기, all 을 class 로 좁히면 그대로
ok(call({ action: 'galleryReview', ...T, id: pAll.id, decision: 'approve' }));
assert.equal(ok(call({ action: 'galleryEdit', ...A, id: pAll.id, vis: 'class' })).status, '승인');
assert.equal(ok(call({ action: 'galleryEdit', ...A, id: pClass.id, vis: 'all' })).status, '대기');
// 나만 보기로 바꾸면 개인, 다시 넓히면 대기
assert.equal(ok(call({ action: 'galleryEdit', ...A, id: pAll.id, vis: 'me' })).status, '개인');
assert.equal(ok(call({ action: 'galleryEdit', ...A, id: pAll.id, vis: 'all' })).status, '대기');
// 남의 작품은 못 고친다, 숨김은 유지된다
bad(call({ action: 'galleryEdit', ...B, id: pAll.id, title: '해킹' }), /내 작품/);
ok(call({ action: 'galleryReview', ...T, id: pAll.id, decision: 'hide' }));
assert.equal(ok(call({ action: 'galleryEdit', ...A, id: pAll.id, desc: '고쳤어요' })).status, '숨김');
// 지우기
ok(call({ action: 'galleryEdit', ...A, id: pMe.id, remove: true }));
assert.equal(ok(call({ action: 'galleryList', ...A })).items.length, 2);
ok(call({ action: 'galleryReview', ...T, id: pClass.id, decision: 'delete' }));
assert.equal(ok(call({ action: 'galleryList', ...T })).items.length, 1);
// 선생님 글: 승인 없이 바로 보이고, '우리 반만'은 고른 반에만, '나만 보기'는 학생에게 안 보인다
const tAll = ok(call({ action: 'galleryPost', ...T, title: '선생님 예시', url: 'https://playentry.org/project/aaaaaaaaaaaaaaaaaaaaaaaa', vis: 'all' }));
const tCls = ok(call({ action: 'galleryPost', ...T, title: '2반 과제 예시', url: 'https://scratch.mit.edu/projects/42', vis: 'class', group: '2반' }));
const tMe = ok(call({ action: 'galleryPost', ...T, title: '준비 중', url: 'https://t.example.kr/', vis: 'me' }));
assert.deepEqual([tAll.status, tCls.status, tMe.status], ['승인', '승인', '개인']);
bad(call({ action: 'galleryPost', ...T, title: '반 없음', url: 'https://x.kr', vis: 'class' }), /반을 골라/);
bad(call({ action: 'galleryPost', auth: 'nope', title: '가짜', url: 'https://x.kr', vis: 'all' }), /구글/);
assert.deepEqual(ids(ok(call({ action: 'galleryList', ...B }))), [tAll.id].sort());
assert.deepEqual(ids(ok(call({ action: 'galleryList', ...C }))), [tAll.id, tCls.id].sort());
assert.equal(ok(call({ action: 'galleryList', ...C })).items.find(i => i.id === tCls.id).name, '선생님');
const tl2 = ok(call({ action: 'galleryList', ...T }));
assert.deepEqual(tl2.groups, ['1반', '2반']);
assert.deepEqual(tl2.items.filter(i => i.mine).map(i => i.id).sort(), [tAll.id, tCls.id, tMe.id].sort());
// 선생님이 반을 1반으로 바꾸면 C 에게서 사라지고 B 에게 보인다. 나만 보기에서 넓혀도 바로 승인.
assert.equal(ok(call({ action: 'galleryEdit', ...T, id: tCls.id, group: '1반' })).status, '승인');
assert.ok(ids(ok(call({ action: 'galleryList', ...B }))).includes(tCls.id));
assert.ok(!ids(ok(call({ action: 'galleryList', ...C }))).includes(tCls.id));
assert.equal(ok(call({ action: 'galleryEdit', ...T, id: tMe.id, vis: 'all' })).status, '승인');
bad(call({ action: 'galleryEdit', ...T, id: pAll.id, title: '남의 것' }), /내 작품/);   // 학생 작품은 승인·숨김·지우기로만
bad(call({ action: 'galleryEdit', ...A, id: tAll.id, remove: true }), /내 작품/);
ok(call({ action: 'galleryLike', ...B, id: tAll.id }));
ok(call({ action: 'galleryEdit', ...T, id: tAll.id, remove: true }));
// 파일 작품: zip·html·ent·sb3 만, 앞머리 확인, 볼 수 있는 사람만 받기, 지우면 휴지통
const b64 = buf => Buffer.from(buf).toString('base64');
const sb3 = Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.alloc(100, 7)]);
const fSb3 = ok(call({ action: 'galleryPost', ...B, title: '스크래치 파일', vis: 'class', file: { name: '../../고양이.sb3', data: b64(sb3) } }));
const fHtml = ok(call({ action: 'galleryPost', ...B, title: '내 웹앱', vis: 'me', file: { name: 'app.html', data: b64('<h1>hi</h1>') } }));
ok(call({ action: 'galleryPost', ...C, title: '엔트리 파일', vis: 'all', file: { name: 'game.ent', data: b64(Buffer.from([0x1f, 0x8b, 8, 0, 1, 2])) } }));
bad(call({ action: 'galleryPost', ...B, title: '가짜 ent', vis: 'all', file: { name: 'x.ent', data: b64('not gzip') } }), /맞지 않는/);
bad(call({ action: 'galleryPost', ...B, title: 'exe', vis: 'all', file: { name: 'x.exe', data: b64('MZ') } }), /zip · html/);
bad(call({ action: 'galleryPost', ...B, title: '큰 파일', vis: 'all', file: { name: 'big.html', data: b64(Buffer.alloc(10 * 1048576 + 1, 65)) } }), /10MB/);
bad(call({ action: 'galleryPost', ...B, title: '빈 것', vis: 'all' }), /파일을 골라/);
const bl = ok(call({ action: 'galleryList', ...B })).items;
const sItem = bl.find(i => i.id === fSb3.id);
assert.deepEqual([sItem.kind, sItem.url, sItem.file.name, sItem.file.ext, sItem.file.size], ['scratch', '', '.._.._고양이.sb3', 'sb3', sb3.length]);
assert.equal(sItem.file.id, undefined);                                  // Drive ID 는 보내지 않는다
assert.equal(bl.find(i => i.id === fHtml.id).kind, 'html');
const got = ok(call({ action: 'galleryFile', ...B, id: fHtml.id }));
assert.deepEqual([got.name, got.mime, Buffer.from(got.data, 'base64').toString()], ['app.html', 'text/html', '<h1>hi</h1>']);
bad(call({ action: 'galleryFile', ...A, id: fHtml.id }), /열 수 없/);    // 남의 나만 보기
bad(call({ action: 'galleryFile', ...A, id: fSb3.id }), /열 수 없/);     // 승인 전
ok(call({ action: 'galleryReview', ...T, id: fSb3.id, decision: 'approve' }));
assert.equal(Buffer.from(ok(call({ action: 'galleryFile', ...A, id: fSb3.id })).data, 'base64').length, sb3.length);   // 같은 반 1반
bad(call({ action: 'galleryFile', ...C, id: fSb3.id }), /열 수 없/);     // 2반
ok(call({ action: 'galleryFile', ...T, id: fHtml.id }));                 // 선생님은 모두
const tFile = ok(call({ action: 'galleryPost', ...T, title: '예시 zip', vis: 'all', file: { name: 'site.zip', data: b64(sb3) } }));
assert.equal(tFile.status, '승인');
ok(call({ action: 'galleryEdit', ...B, id: fHtml.id, remove: true }));
ok(call({ action: 'galleryReview', ...T, id: fSb3.id, decision: 'delete' }));
assert.deepEqual([...drive.values()].map(f => f.trashed), [true, true, false, false]);
// 한 사람 50MB: 9.9MB 다섯 개는 되고 여섯 번째는 막힌다
const big = b64(Buffer.alloc(9.9 * 1048576, 65));
for (let i = 0; i < 5; i++) ok(call({ action: 'galleryPost', ...A, title: '큰 ' + i, vis: 'me', file: { name: i + '.html', data: big } }));
bad(call({ action: 'galleryPost', ...A, title: '넘침', vis: 'me', file: { name: 'z.html', data: big } }), /50MB/);
// 기존 기능은 그대로
ok(call({ action: 'save', ...A, workbook: 'w1', title: '시험', state: { a: 1 }, progress: { done: 1, total: 2 } }));
assert.deepEqual(ok(call({ action: 'load', ...A, workbook: 'w1' })).state, { a: 1 });
console.log('작품 게시판 서버 시험 통과');
