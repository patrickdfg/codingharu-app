// 관리자 페이지 서버 시험: 회원 정보 고치기(studentUpdate), 휴원 로그인 막기, 월말 통계(monthStats), 관리자 화면 기본값(pointDefaults)
const fs=require('fs'),vm=require('vm'),assert=require('assert');const src=fs.readFileSync('server/record.gs','utf8');
const ctx=vm.createContext({console,Date,JSON,Number,String,Array,Object,Error,Math});vm.runInContext(src,ctx);
vm.runInContext(`
var sheets={students:[['번호','이름','PIN(4자리)','반','메모','상태'],[1,'가나','1234','A반','','승인'],[2,'다라','0121','A반','','승인'],[3,'마바','5555','','','대기']],
  points:[['학생','일시','종류','키','점수','내용','지급']], visits:[['날짜','학생 번호','학생 이름','페이지','제목','처음','마지막','횟수']]};
function mk(name){ return {
  getLastRow:()=>sheets[name].length,
  getRange:(r,c,nr,nc)=>({ getValues:()=>sheets[name].slice(r-1,r-1+nr).map(row=>row.slice(c-1,c-1+nc).concat(Array(Math.max(0,nc-row.slice(c-1).length)).fill(''))),
    setValue:v=>{ sheets[name][r-1][c-1]=v; return this; }, setNumberFormat(){ return { setValue:v=>{ sheets[name][r-1][c-1]=v; } }; }, getValue:()=>sheets[name][r-1][c-1] }),
  appendRow:row=>sheets[name].push(row) }; }
sheet_=k=>mk(k); rows_=k=>sheets[k].slice(1); withLock_=fn=>fn();
teacher_=a=>{ if(a!=='teacher') throw Error('권한'); return {email:'t@example.test'}; };
Session={getScriptTimeZone:()=>'Asia/Seoul'};
Utilities={formatDate:(d,tz,f)=>{ const k=new Date(d.getTime()+9*3600000).toISOString(); return f==='yyyy-MM'?k.slice(0,7):k.slice(0,10); }};
CacheService={getScriptCache:()=>({get:()=>null,put:()=>{},remove:()=>{}})};
hash_=s=>'h'+s; sign_=()=>'sid';
`,ctx);
const run=x=>vm.runInContext(x,ctx);
// 회원 정보 고치기
assert.throws(()=>run(`ACTIONS_.studentUpdate({auth:'student',id:'1',group:'B반'})`));
assert.equal(run(`ACTIONS_.studentUpdate({auth:'teacher',id:'1',group:'B반',memo:'월수 반'}).student.group`),'B반');
assert.equal(run(`sheets.students[1][3]`),'B반'); assert.equal(run(`sheets.students[1][4]`),'월수 반'); assert.equal(run(`sheets.students[1][1]`),'가나');
assert.throws(()=>run(`ACTIONS_.studentUpdate({auth:'teacher',id:'1',pin:'12a4'})`));
assert.throws(()=>run(`ACTIONS_.studentUpdate({auth:'teacher',id:'2',name:'가나',pin:'1234'})`), /같은 이름과 번호/);
assert.equal(run(`ACTIONS_.studentUpdate({auth:'teacher',id:'1',pin:'0042'}).student.id`),'1'); assert.equal(run(`sheets.students[1][2]`),'0042');
assert.throws(()=>run(`ACTIONS_.studentUpdate({auth:'teacher',id:'3',group:'A반'})`), /승인을 먼저/);
assert.throws(()=>run(`ACTIONS_.studentUpdate({auth:'teacher',id:'1',status:'삭제'})`));
assert.throws(()=>run(`ACTIONS_.studentUpdate({auth:'teacher',id:'99',group:'A반'})`));
// 휴원이면 로그인 못 함, 다시 승인하면 됨
run(`ACTIONS_.studentUpdate({auth:'teacher',id:'2',status:'휴원'})`);
assert.throws(()=>run(`ACTIONS_.studentLogin({name:'다라',pin:'0121'})`), /쉬는 중/);
run(`ACTIONS_.studentUpdate({auth:'teacher',id:'2',status:'승인'})`);
assert.equal(run(`ACTIONS_.studentLogin({name:'다라',pin:'0121'}).student.id`),'2');
// 월말 통계: 그 달 온 날 수(같은 날 여러 번은 하루), 받은·쓴 포인트
run(`sheets.visits.push([new Date('2026-11-03T01:00:00Z'),'1','가나','p','t','','',1],[new Date('2026-11-03T05:00:00Z'),'1','가나','q','t','','',1],[new Date('2026-11-10T01:00:00Z'),'1','가나','p','t','','',1],[new Date('2026-10-30T01:00:00Z'),'1','가나','p','t','','',1])`);
run(`sheets.points.push(['1',new Date('2026-11-05T01:00:00Z'),'lesson','a',100,'',''],['1',new Date('2026-11-06T01:00:00Z'),'grant','b',-30,'',''],['1',new Date('2026-10-06T01:00:00Z'),'lesson','c',500,'',''],['2',new Date('2026-11-07T01:00:00Z'),'lesson','d',40,'',''])`);
const m=run(`ACTIONS_.monthStats({auth:'teacher',month:'2026-11'})`);
assert.equal(m.stats['1'].days,2); assert.equal(m.stats['1'].earned,100); assert.equal(m.stats['1'].spent,30); assert.equal(m.stats['2'].earned,40);
assert.throws(()=>run(`ACTIONS_.monthStats({auth:'teacher',month:'2026-13'})`)); assert.throws(()=>run(`ACTIONS_.monthStats({auth:'student',month:'2026-11'})`));
console.log('관리자 페이지 서버 시험 통과(회원 정보 고치기·휴원 로그인·월말 통계)');
