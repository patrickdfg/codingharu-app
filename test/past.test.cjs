// 지난 수업 완료 체크(record.gs pastDone) 시험: 선생님만, 포인트 없음(past 표시는 점수 요청 거절), 학생이 직접 완료한 수업은 그대로, 달 지정 — node test/past.test.cjs
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/../server/record.gs', 'utf8');
const rows = [];   // 워크북 시트(머리줄 제외)
const ctx = vm.createContext({ console, Date, JSON, Number, String, Array, Object, Error, Math, Session: { getScriptTimeZone: () => 'Asia/Seoul' }, Utilities: { formatDate: d => d.toISOString().slice(0, 7) } });
vm.runInContext(src, ctx);
ctx.ROWS = rows;
vm.runInContext(`
rows_ = k => k === 'students' ? [['1','김하루','1234','','','',''],['2','이대기','1111','','','대기','']] : k === 'workbooks' ? ROWS : [];
teacher_ = a => { if (a !== 'teacher') throw new Error('권한'); return { email: 't@x' }; };
withLock_ = fn => fn();
sheet_ = k => ({ getLastRow: () => ROWS.length + 1,
  getRange: (r, c, n, w) => ({ getValues: () => ROWS.slice(r - 2, r - 2 + n).map(x => x.slice()), setValues: v => v.forEach((line, i) => { ROWS[r - 2 + i] = line; }) }),
  appendRow: line => ROWS.push(line) });
findWorkbook_ = (id, wb) => { const i = ROWS.findIndex(r => String(r[0]) === String(id) && r[2] === wb); return i < 0 ? null : { row: ROWS[i], index: i + 2 }; };
`, ctx);
const run = x => vm.runInContext(x, ctx);
const row = wb => rows.find(r => r[0] === '1' && r[2] === wb);

assert.throws(() => run(`ACTIONS_.pastDone({auth:'student',studentId:'1',items:[{key:'entry/race/'}]})`), /권한/);
assert.throws(() => run(`ACTIONS_.pastDone({auth:'teacher',studentId:'1',items:[{key:'../x/'}]})`), /올바르지/);
assert.throws(() => run(`ACTIONS_.pastDone({auth:'teacher',studentId:'1',items:[]})`), /1~400/);
assert.throws(() => run(`ACTIONS_.pastDone({auth:'teacher',studentId:'2',items:[{key:'entry/race/'}]})`), /승인/);
assert.throws(() => run(`ACTIONS_.pastDone({auth:'teacher',studentId:'1',month:'2999-01',items:[{key:'entry/race/'}]})`), /앞으로/);

// 학생이 직접 완료한 수업 하나를 먼저 넣어 둔다
rows.push(['1', '김하루', 'done:entry/self/', '완료 · 직접', 'entry/self/', 1, 1, new Date(), new Date(), '학생 로그인', JSON.stringify({ done: true })]);
const out = run(`ACTIONS_.pastDone({auth:'teacher',studentId:'1',month:'2024-03',items:[{key:'entry/race/',title:'달리기 시합'},{key:'scratch/basic1/a/',title:'기초'},{key:'entry/self/',title:'직접'}]})`);
assert.equal(out.saved, 2); assert.equal(out.skipped, 1);
const r = row('done:entry/race/'); assert.equal(r[5], 1); assert.equal(r[3], '완료 · 달리기 시합');
assert.equal(r[8].getFullYear(), 2024); assert.equal(r[8].getMonth(), 2);
assert.deepEqual(JSON.parse(r[10]).past, true);
assert.equal(JSON.parse(row('done:entry/self/')[10]).past, undefined);          // 직접 완료한 것은 그대로
const idx = JSON.parse(row('done-index')[10]).pages; assert.ok(idx['entry/race/'] > 0 && idx['scratch/basic1/a/'] > 0); assert.equal(row('done-index')[5], 2);
// 포인트: 지난 수업은 점수 증명이 안 되고, 직접 완료한 수업은 된다
assert.equal(run(`pointsProof_('1','lesson','entry/race/')`), false);
assert.equal(run(`pointsProof_('1','lesson','entry/self/')`), true);
// 달을 비우면 리포트 시작 전날(2026-10-31)로 적는다
run(`ACTIONS_.pastDone({auth:'teacher',studentId:'1',items:[{key:'entry/nomonth/'}]})`);
assert.equal(row('done:entry/nomonth/')[8].getFullYear(), 2026); assert.equal(row('done:entry/nomonth/')[8].getMonth(), 9); assert.equal(row('done:entry/nomonth/')[8].getDate(), 31);
// 취소
assert.equal(run(`ACTIONS_.pastDone({auth:'teacher',studentId:'1',items:[{key:'entry/race/',done:false}]}).saved`), 1);
assert.equal(row('done:entry/race/')[5], 0); assert.ok(JSON.parse(row('done-index')[10]).pages['entry/race/'] < 0);
assert.equal(rows.filter(x => x[2] === 'done:entry/race/').length, 1);            // 줄이 겹쳐 생기지 않는다
console.log('지난 수업 완료 체크 시험 통과');
