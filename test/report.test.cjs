// 학부모 월간 리포트 서버(record.gs reportSave·parentReport·이메일) 시험: node test/report.test.cjs
const fs = require('fs'), vm = require('vm'), assert = require('assert'), crypto = require('crypto');
const src = fs.readFileSync(__dirname + '/../server/record.gs', 'utf8');
const sent = [], props = {};
const tabs = { students: [['1', '김하루', '0123', '토요', '', ''], ['2', '이대기', '1111', '', '', '대기']], workbooks: [], points: [], reports: [], parents: [] };
const D = (y, m, d) => new Date(Date.UTC(y, m - 1, d, 3));
tabs.workbooks.push(['1', '김하루', 'done:entry/race/', '달리기 시합', 'entry/race/', 1, 1, D(2026, 11, 2), D(2026, 11, 3), '', '{"secret":"x"}']);
tabs.workbooks.push(['1', '김하루', 'done:entry/old/', '지난달', 'entry/old/', 1, 1, D(2026, 10, 2), D(2026, 10, 3), '', '{}']);
tabs.workbooks.push(['2', '이대기', 'done:entry/race/', '달리기 시합', 'entry/race/', 1, 1, D(2026, 11, 2), D(2026, 11, 3), '', '{}']);
tabs.points.push(['1', D(2026, 11, 3), 'lesson', 'entry/race/', 50, '', '자동'], ['1', D(2026, 10, 3), 'lesson', 'x', 30, '', '자동']);
const ctx = vm.createContext({
  console, Date, JSON, Number, String, Array, Object, Error, Math, encodeURIComponent,
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || '', setProperty: (k, v) => { props[k] = v; } }) },
  Utilities: {
    getUuid: () => crypto.randomUUID(),
    computeHmacSha256Signature: (v, k) => [...crypto.createHmac('sha256', k).update(v).digest()].map(b => (b > 127 ? b - 256 : b)),
    formatDate: (d, tz, f) => d.toISOString().slice(0, 7)
  },
  Session: { getScriptTimeZone: () => 'Asia/Seoul' },
  MailApp: { sendEmail: m => sent.push(m) },
  SpreadsheetApp: {}, ContentService: {}, LockService: {}, ScriptApp: {}
});
vm.runInContext(src + `
  rows_ = k => TABS.tabs[k] || [];
  sheet_ = k => ({ appendRow: r => TABS.tabs[k].push(r.map(v => typeof v === 'string' && v[0] === "'" ? v.slice(1) : v)),
                   getRange: (row, col, n, w) => ({ setValues: vals => { TABS.tabs[k][row - 2] = vals[0].map(v => typeof v === 'string' && v[0] === "'" ? v.slice(1) : v); } }) });
  withLock_ = fn => fn();
  teacher_ = a => { if (a !== 'teacher') throw new Error('권한'); return { email: 't@example.test' }; };
`, Object.assign(ctx, { TABS: { tabs } }));
const run = x => vm.runInContext(x, ctx);

// 1) 선생님만 저장할 수 있고, 같은 달은 덮어쓴다
assert.throws(() => run(`ACTIONS_.reportSave({auth:'student',studentId:'1',month:'2026-11',comment:'x'})`));
const out = run(`ACTIONS_.reportSave({auth:'teacher',studentId:'1',month:'2026-11',plan:'리스트',comment:'잘했어요'})`);
run(`ACTIONS_.reportSave({auth:'teacher',studentId:'1',month:'2026-11',plan:'리스트 마무리',comment:'정말 잘했어요'})`);
assert.equal(tabs.reports.length, 1); assert.equal(tabs.reports[0][3], '정말 잘했어요');
assert.throws(() => run(`ACTIONS_.reportSave({auth:'teacher',studentId:'1',month:'2026-13',comment:'x'})`), /달 형식/);
assert.throws(() => run(`ACTIONS_.reportSave({auth:'teacher',studentId:'2',month:'2026-11',comment:'x'})`), /승인/);

// 2) 링크 열쇠가 맞을 때만 그 학생의 그 달 기록만 받는다 (기록 내용 JSON·PIN 없음)
const q = new URL(out.link).searchParams;
assert.equal(q.get('s'), '1'); assert.equal(q.get('m'), '2026-11');
const rep = run(`ACTIONS_.parentReport({s:'1',t:'${q.get('t')}',m:'2026-11'})`);
assert.equal(rep.student.name, '김하루'); assert.equal(rep.student.points, 80);
assert.equal(rep.workbooks.length, 1); assert.equal(rep.pointHistory.length, 1);
assert.equal(rep.report.comment, '정말 잘했어요');
assert.ok(!JSON.stringify(rep).includes('secret') && !JSON.stringify(rep).includes('0123'));
assert.throws(() => run(`ACTIONS_.parentReport({s:'1',t:'${'0'.repeat(32)}',m:'2026-11'})`), /링크/);
assert.throws(() => run(`ACTIONS_.parentReport({s:'2',t:'${q.get('t')}',m:'2026-11'})`), /링크/);   // 다른 학생 번호로 바꿔도 안 된다

// 3) 이메일은 학부모 탭에 수신 동의(Y)가 있을 때만
assert.equal(run(`ACTIONS_.reportSave({auth:'teacher',studentId:'1',month:'2026-11',comment:'a',email:true})`).sent, 0);
tabs.parents.push(['1', '김하루', 'mom@example.test', 'Y', ''], ['1', '김하루', 'dad@example.test', '', '']);
assert.equal(run(`ACTIONS_.reportSave({auth:'teacher',studentId:'1',month:'2026-11',comment:'<b>칭찬</b>',email:true})`).sent, 1);
assert.equal(sent.length, 1); assert.equal(sent[0].to, 'mom@example.test');
assert.ok(sent[0].htmlBody.includes('&lt;b&gt;칭찬') && sent[0].htmlBody.includes('parent.html?s=1'));

// 4) PARENT_SECRET 을 지우면 예전 링크가 막힌다
delete props.PARENT_SECRET;
assert.throws(() => run(`ACTIONS_.parentReport({s:'1',t:'${q.get('t')}',m:'2026-11'})`), /링크/);
console.log('학부모 월간 리포트 서버 시험 통과');
