// 집 연습 서버 시험(record.gs homePaths·homePathsSet·homeKey): 선생님만 목록 저장, 로그인한 승인 학생만 열쇠 받기 — node test/home.test.cjs
const fs = require('fs'), vm = require('vm'), assert = require('assert'), crypto = require('crypto');
const src = fs.readFileSync(__dirname + '/../server/record.gs', 'utf8');
const props = {};
const ctx = vm.createContext({
  console, Date, JSON, Number, String, Array, Object, Error, Math,
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
  Utilities: { getUuid: () => crypto.randomUUID(), computeHmacSha256Signature: (v, k) => [...crypto.createHmac('sha256', String(k)).update(String(v)).digest()].map(b => (b > 127 ? b - 256 : b)),
    base64EncodeWebSafe: b => Buffer.from(b.map(x => x & 255)).toString('base64url') }
});
vm.runInContext(src, ctx);
vm.runInContext(`
rows_ = k => k === 'students' ? [['1','김하루','1234','','','',''],['2','이대기','1111','','','대기',''],['3','박쉼','2222','','','휴원','']] : [];
teacher_ = a => { if (a !== 'teacher') throw new Error('권한'); return { email: 't@x' }; };
`, ctx);
const run = x => vm.runInContext(x, ctx);
const sid = id => run(`sign_('${id}', String(Date.now() + 86400000))`);

// 1) 목록: 선생님만 저장, 올바른 폴더만, 겹침 정리
assert.throws(() => run(`ACTIONS_.homePathsSet({auth:'student',paths:['koi/']})`), /권한/);
assert.throws(() => run(`ACTIONS_.homePathsSet({auth:'teacher',paths:['../x/']})`), /올바르지/);
assert.throws(() => run(`ACTIONS_.homePathsSet({auth:'teacher',paths:['koi']})`), /올바르지/);
assert.deepEqual([...run(`ACTIONS_.homePathsSet({auth:'teacher',paths:['python/iot/','koi/','koi/']}).paths`)], ['koi/', 'python/iot/']);
assert.deepEqual([...run(`ACTIONS_.homePaths({}).paths`)], ['koi/', 'python/iot/']);

// 2) 열쇠: HOME_PASS 가 없으면 꺼짐, 로그인한 승인 학생만
assert.throws(() => run(`ACTIONS_.homeKey({studentId:'1',sid:'${sid(1)}'})`), /켜지지/);
props.HOME_PASS = 'home practice pass';
assert.equal(run(`ACTIONS_.homeKey({studentId:'1',sid:'${sid(1)}'}).pass`), 'home practice pass');
assert.throws(() => run(`ACTIONS_.homeKey({studentId:'1',sid:'1.123.abc'})`), /로그인/);
assert.throws(() => run(`ACTIONS_.homeKey({studentId:'1',sid:'${sid(2)}'})`), /로그인/);       // 다른 학생 세션
assert.throws(() => run(`ACTIONS_.homeKey({studentId:'2',sid:'${sid(2)}'})`));                // 승인 대기
assert.throws(() => run(`ACTIONS_.homeKey({studentId:'3',sid:'${sid(3)}'})`), /열 수 없는/);   // 휴원
run(`ACTIONS_.homePathsSet({auth:'teacher',paths:[]})`);
assert.throws(() => run(`ACTIONS_.homeKey({studentId:'1',sid:'${sid(1)}'})`), /켜지지/);     // 체크한 수업이 없으면 꺼짐
console.log('집 연습 서버 시험 통과');
