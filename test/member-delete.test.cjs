// 학생 삭제 서버 시험(studentDelete): 선생님만, 이름 확인, 그 학생 줄만 모든 탭에서 지움, 작품 파일 휴지통, 지운 번호는 새 가입에 다시 안 씀
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync('server/record.gs', 'utf8');
const ctx = vm.createContext({ console, Date, JSON, Number, String, Array, Object, Error, Math });
vm.runInContext(src, ctx);
vm.runInContext(`
var sheets = {
  students: [['번호','이름','PIN(4자리)','반','메모','상태','포트폴리오 주소'], [1,'가나','1234','A','','승인','gn'], [2,'다라','2222','A','','승인','dr'], [3,'마바','3333','','','승인','mb']],
  workbooks: [['학생 번호'], ['1','가나','done:a','t',1,1,1,'',''], ['2','다라','done:b','t',1,1,1,'',''], ['1','가나','python/','t',1,2,9,'',''], ['3','마바','done:c','t',1,1,1,'','']],
  visits: [['날짜','학생 번호'], ['2026-11-01','1'], ['2026-11-01','2'], ['2026-11-02','1']],
  points: [['학생 번호'], ['1','t','lesson','k',100,'',''], ['2','t','lesson','k',50,'','']],
  reports: [['학생 번호'], ['1','2026-10','계획','한마디','','']],
  parents: [['학생 번호'], ['2','다라','p@example.test','Y','']],
  gallery: [['ID'], ['g1','1','가나','A','작품','','web','','me','승인','[]','','','FILE1','a.zip',10], ['g2','3','마바','','작품2','','web','','all','승인','["1"]','','','','',0]]
};
var trashed = [];
function mk(name){ return {
  getLastRow: () => { let n = sheets[name].length; while (n > 1 && sheets[name][n-1].every(v => v === '')) n--; return n; },
  getLastColumn: () => Math.max.apply(null, sheets[name].map(r => r.length)),
  getRange: (r, c, nr, nc) => ({
    getValues: () => sheets[name].slice(r-1, r-1+(nr||1)).map(row => { const o = row.slice(c-1, c-1+(nc||1)); while (o.length < (nc||1)) o.push(''); return o; }),
    setValues: vals => vals.forEach((v, i) => { sheets[name][r-1+i] = sheets[name][r-1+i] || []; v.forEach((x, j) => { sheets[name][r-1+i][c-1+j] = x; }); }),
    clearContent: () => { for (let i = 0; i < (nr||1); i++) for (let j = 0; j < (nc||1); j++) if (sheets[name][r-1+i]) sheets[name][r-1+i][c-1+j] = ''; },
    setValue: v => { sheets[name][r-1][c-1] = v; }, setNumberFormat() { return { setValue: v => { sheets[name][r-1][c-1] = v; } }; },
    getValue: () => (sheets[name][r-1] || [])[c-1] }),
  deleteRow: i => sheets[name].splice(i-1, 1),
  appendRow: row => sheets[name].push(row) }; }
sheet_ = k => mk(k); rows_ = k => sheets[k].slice(1, mk(k).getLastRow()); withLock_ = fn => fn();
teacher_ = a => { if (a !== 'teacher') throw Error('권한'); return { email: 't@example.test' }; };
var props = {};
PropertiesService = { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) };
DriveApp = { getFileById: id => ({ setTrashed: () => trashed.push(id) }) };
Session = { getScriptTimeZone: () => 'Asia/Seoul' };
Utilities = { formatDate: () => '2026111410' };
CacheService = { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) };
`, ctx);
const run = x => vm.runInContext(x, ctx);
const ids = k => run(`rows_('${k}').map(r => String(r[${k === 'visits' || k === 'gallery' ? 1 : 0}]))`);

assert.throws(() => run(`ACTIONS_.studentDelete({auth:'student',id:'1',confirmName:'가나'})`), /권한/);
assert.throws(() => run(`ACTIONS_.studentDelete({auth:'teacher',id:'1',confirmName:'다라'})`), /확인용 이름/);
assert.throws(() => run(`ACTIONS_.studentDelete({auth:'teacher',id:'1'})`), /확인용 이름/);
assert.throws(() => run(`ACTIONS_.studentDelete({auth:'teacher',id:'9',confirmName:'가나'})`), /없는 학생/);

const out = run(`ACTIONS_.studentDelete({auth:'teacher',id:'1',confirmName:' 가나 '})`).deleted;
assert.equal(out.name, '가나');
assert.deepEqual(JSON.parse(JSON.stringify(out.removed)), { workbooks: 2, visits: 2, points: 1, reports: 1, parents: 0, gallery: 1 });
assert.deepEqual(run(`sheets.students.slice(1).map(r => r[0])`), [2, 3]);
assert.deepEqual(ids('workbooks'), ['2', '3']);
assert.deepEqual(ids('visits'), ['2']);
assert.deepEqual(ids('points'), ['2']);
assert.deepEqual(ids('reports'), []);
assert.deepEqual(ids('parents'), ['2']);
assert.deepEqual(ids('gallery'), ['3']);
assert.deepEqual(run(`trashed`), ['FILE1']);
// 다른 학생 기록은 그대로(내용까지)
assert.equal(run(`rows_('workbooks')[0][2]`), 'done:b');

// 가장 큰 번호(3)를 지운 뒤 새로 가입해도 3번을 다시 쓰지 않는다
run(`ACTIONS_.studentDelete({auth:'teacher',id:'3',confirmName:'마바'})`);
run(`ACTIONS_.studentSignup({name:'새학생',pin:'4444'})`);
assert.equal(run(`sheets.students[sheets.students.length-1][0]`), 4);
console.log('학생 삭제 서버 시험 통과(권한·이름 확인·모든 탭 정리·파일 휴지통·번호 다시 안 씀)');
