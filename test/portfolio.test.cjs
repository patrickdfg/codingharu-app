// 학생 포트폴리오 서버 시험: 주소 만들기(이니셜·겹치면 숫자), 주소 고치기, 주소+번호 확인·막기, 보여 줄 기록 고르기
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync('server/record.gs', 'utf8');
const ctx = vm.createContext({ console, Date, JSON, Number, String, Array, Object, Error, Math });
vm.runInContext(src, ctx);
vm.runInContext(`
var sheets = {
  students: [['번호','이름','PIN(4자리)','반','메모','상태','포트폴리오 주소'],
    [1,'이하루','1234','A반','','승인',''], [2,'임해리','0121','A반','','승인',''], [3,'오은서','5555','','','대기',''], [4,'박서연','7777','B반','','휴원','']],
  points: [['학생','일시','종류','키','점수','내용','지급'], ['1',new Date('2026-11-05T01:00:00Z'),'lesson','a',100,'',''], ['1',new Date('2026-11-06T01:00:00Z'),'lesson','b',50,'',''], ['2',new Date('2026-11-06T01:00:00Z'),'lesson','c',70,'','']],
  visits: [['날짜','학생 번호'], [new Date('2026-11-03T01:00:00Z'),'1'], [new Date('2026-11-03T05:00:00Z'),'1'], [new Date('2026-11-10T01:00:00Z'),'1'], [new Date('2026-11-10T01:00:00Z'),'2']],
  workbooks: [['학생 번호'],
    ['1','이하루','done:entry/a/','완료 · 엔트리 1',1,1,1,'',new Date('2026-11-03T02:00:00Z')],
    ['1','이하루','python/basic/','파이썬 기초',3,12,40,'',new Date('2026-11-10T02:00:00Z')],
    ['1','이하루','done-index','',0,0,0,'',new Date('2026-11-10T02:00:00Z')],
    ['1','이하루','python/basic/~2','파이썬 기초',3,1,4,'',new Date('2026-11-10T02:00:00Z')],
    ['2','임해리','done:scratch/b/','완료 · 스크래치',1,1,1,'',new Date('2026-11-10T02:00:00Z')],
    ['1','이하루','coding-typing-v1','타자연습',1,2,9,'',new Date('2026-11-10T02:00:00Z'),'', JSON.stringify({best:{}, top:{'자리-ko':210,'나쁜-키':5,'단어-ko':'x'}, runs:[{d:'2026-11-03',m:'자리',l:'ko',s:180,a:92},{d:'2026-11-01',m:'자리',l:'ko',s:150,a:85},{d:'bad',m:'자리',l:'ko',s:1,a:1},{d:'2026-11-04',m:'자리',l:'ko',s:99999,a:90}]})]],
  gallery: [['ID'],
    ['g1','1','이하루','A반','우주 게임','https://playentry.org/project/0123456789abcdef01234567','entry','설명','all','승인','[]',new Date('2026-11-04T01:00:00Z'),'', '', '', 0],
    ['g2','1','이하루','A반','숨긴 작품','https://scratch.mit.edu/projects/1','scratch','','me','숨김','[]',new Date('2026-11-05T01:00:00Z'),'', '', '', 0],
    ['g3','1','이하루','A반','나만 보기','','web','','me','개인','[]',new Date('2026-11-06T01:00:00Z'),'', 'F1', 'quiz.html', 2048],
    ['g4','2','임해리','A반','친구 작품','https://example.com/x','web','','all','승인','[]',new Date('2026-11-06T01:00:00Z'),'', '', '', 0]]
};
function mk(name){ return {
  getLastRow: () => sheets[name].length,
  getRange: (r, c, nr, nc) => ({
    getValues: () => sheets[name].slice(r-1, r-1+(nr||1)).map(row => { const out = row.slice(c-1, c-1+(nc||1)); while (out.length < (nc||1)) out.push(''); return out; }),
    setValues: vals => { vals.forEach((v, i) => v.forEach((x, j) => { sheets[name][r-1+i][c-1+j] = x; })); },
    setValue: v => { sheets[name][r-1][c-1] = v; }, setNumberFormat() { return { setValue: v => { sheets[name][r-1][c-1] = v; } }; },
    getValue: () => sheets[name][r-1][c-1] }),
  appendRow: row => sheets[name].push(row) }; }
sheet_ = k => mk(k); rows_ = k => sheets[k].slice(1); withLock_ = fn => fn();
gallerySheet_ = () => mk('gallery');
teacher_ = a => { if (a !== 'teacher') throw Error('권한'); return { email: 't@example.test' }; };
Session = { getScriptTimeZone: () => 'Asia/Seoul' };
Utilities = { formatDate: (d, tz, f) => { const k = new Date(d.getTime() + 9*3600000).toISOString(); return f === 'yyyy-MM' ? k.slice(0,7) : f === 'yyyy-MM-dd' ? k.slice(0,10) : k.slice(0,13); } };
var store = {};
CacheService = { getScriptCache: () => ({ get: k => store[k] || null, put: (k, v) => { store[k] = v; }, remove: k => { delete store[k]; } }) };
hash_ = s => 'h' + s; sign_ = () => 'sid';
`, ctx);
const run = x => vm.runInContext(x, ctx);

// 이니셜: 성 이·임은 l, ㅇ으로 시작하는 글자는 모음 첫 글자
assert.equal(run(`pfInitials_('이하루')`), 'lhr');
assert.equal(run(`pfInitials_('김하늘')`), 'ghn');
assert.equal(run(`pfInitials_('오은서')`), 'oes');
assert.equal(run(`pfInitials_('유재석')`), 'yjs');
assert.equal(run(`pfInitials_('박서연')`), 'bsy');
assert.equal(run(`pfInitials_('Kim')`), 'kim');

// 관리자 화면을 열면 승인된 학생(휴원 포함)에게 주소가 붙는다. 겹치면 숫자, 대기 학생은 아직 없음
const d = run(`ACTIONS_.admin({auth:'teacher'})`);
const slug = id => d.students.find(s => s.id === id).slug;
assert.equal(slug('1'), 'lhr'); assert.equal(slug('2'), 'lhr2'); assert.equal(slug('3'), ''); assert.equal(slug('4'), 'bsy');
// 승인하면 바로 주소가 생긴다
run(`ACTIONS_.approve({auth:'teacher',id:'3',ok:true})`);
assert.equal(run(`sheets.students[3][6]`), 'oes');
// 로그인하면 내 주소를 알려 준다
assert.equal(run(`ACTIONS_.studentLogin({name:'이하루',pin:'1234'}).student.slug`), 'lhr');

// 주소 고치기: 형식·사이트 이름·겹침 검사
assert.throws(() => run(`ACTIONS_.studentUpdate({auth:'teacher',id:'2',slug:'admin'})`), /포트폴리오 주소/);
assert.throws(() => run(`ACTIONS_.studentUpdate({auth:'teacher',id:'2',slug:'하루'})`), /포트폴리오 주소/);
assert.throws(() => run(`ACTIONS_.studentUpdate({auth:'teacher',id:'2',slug:'lhr'})`), /이미 쓰는/);
assert.equal(run(`ACTIONS_.studentUpdate({auth:'teacher',id:'2',slug:'IHR'}).student.slug`), 'ihr');
assert.equal(run(`sheets.students[2][6]`), 'ihr');

// 포트폴리오: 주소+번호가 맞아야 하고, 본인 기록만, 숨긴 작품은 빼고
assert.throws(() => run(`ACTIONS_.portfolio({slug:'lhr',pin:'0000'})`), /맞지 않아요/);
const p = run(`ACTIONS_.portfolio({slug:'LHR',pin:'1234'})`);
assert.equal(p.student.name, '이하루'); assert.equal(p.points, 150);
assert.deepEqual(p.lessons.map(x => x.title), ['완료 · 엔트리 1']);
assert.deepEqual(p.progress.map(x => [x.done, x.total]), [[12, 40], [2, 9]]);   // 타자연습도 진행 중 과정
assert.deepEqual(p.works.map(x => x.title), ['나만 보기', '우주 게임']);
assert.equal(p.works[0].file.ext, 'html'); assert.equal(p.works[0].url, '');
assert.deepEqual(p.days, ['2026-11-03', '2026-11-10']);
// 타자: 최고 타수와 최근 연습(날짜순, 이상한 값은 버림)
assert.deepEqual(JSON.parse(JSON.stringify(p.typing.top)), {'자리-ko':210});
assert.deepEqual(p.typing.runs.map(r => r.s), [150, 180]);
assert.equal(run(`ACTIONS_.admin({auth:'teacher'})`).typing['1'].top['자리-ko'], 210);
// 휴원 학생도 자기 포트폴리오는 볼 수 있다
assert.equal(run(`ACTIONS_.portfolio({slug:'bsy',pin:'7777'}).student.name`), '박서연');
// 숨긴 작품·남의 작품 파일은 못 받는다
assert.throws(() => run(`ACTIONS_.portfolioFile({slug:'lhr',pin:'1234',id:'g4'})`), /열 수 없어요/);
// 틀리면 한 시간에 5번까지
run(`store={}`);
for (let i = 0; i < 5; i++) assert.throws(() => run(`ACTIONS_.portfolio({slug:'ihr',pin:'9999'})`), /맞지 않아요/);
assert.throws(() => run(`ACTIONS_.portfolio({slug:'ihr',pin:'0121'})`), /한 시간 뒤/);
assert.throws(() => run(`ACTIONS_.portfolio({slug:'../x',pin:'1234'})`), /없는 포트폴리오/);
console.log('포트폴리오 서버 시험 통과(주소 만들기·고치기·번호 확인·막기·기록 고르기)');
