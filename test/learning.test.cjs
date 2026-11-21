// 학습 관찰 서버: 학생 분리·권한·재전송·설문·교실 관찰. 실제 Google 서비스 대신 시트 경계를 모의한다.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const ctx = vm.createContext({ Date, JSON, Number, String, Array, Object, Error, Math, Set });
vm.runInContext(fs.readFileSync('server/record.gs','utf8'),ctx);
vm.runInContext(`
var learningRows=[];
teacher_=auth=>{if(auth!=='teacher')throw Error('교사 권한');return {email:'teacher@test'};};
student_=id=>{if(!['1','2'].includes(String(id)))throw Error('없는 학생');return [id,'학생'];};
checkSid_=(sid,id)=>{if(sid!=='sid-'+id)throw Error('로그인');};
withLock_=fn=>fn();
rows_=name=>{if(name!=='learning')throw Error('탭');return learningRows;};
sheet_=name=>({appendRow:r=>learningRows.push(r),getRange:(r,c,n,w)=>({setValues:v=>{learningRows[r-2]=v[0];}})});
Session={getScriptTimeZone:()=> 'Asia/Seoul'};
Utilities={getUuid:()=> 'note-uuid',formatDate:(d,tz,f)=>new Date(d.getTime()+9*3600000).toISOString().slice(0,f==='yyyy-MM'?7:10)};
`,ctx);
function run(code){return vm.runInContext(code,ctx);}
function call(action, body){return run(`ACTIONS_.${action}(${JSON.stringify(body)})`);}
const rec={id:'session-123',page:'python/basic/',title:'연습',activeSeconds:180,done:3,total:8,attempts:4,correct:3,hints:1};
const save=(x=rec)=>call('learningSave',{studentId:'1',sid:'sid-1',record:x});
assert.throws(()=>call('learningSave',{studentId:'2',sid:'sid-1',record:rec}),/로그인/);
assert.throws(()=>call('learningReport',{studentId:'1',auth:'student',month:'2026-11'}),/권한/);
assert.throws(()=>save({...rec,page:'../<script>'}),/형식/);
save({...rec,page:'python/%EA%B8%B0%EC%B4%88/'});save();assert.equal(run('learningRows.length'),1,'재전송은 합산하지 않음');
save({...rec,activeSeconds:60,attempts:1,correct:1});
assert.equal(run('JSON.parse(learningRows[0][6]).activeSeconds'),180,'늦은 재전송이 기록을 줄이지 않음');
const survey={interests:['games','art'],fun:3,difficulty:2,approach:'try'};
save({...rec,survey});
assert(run('JSON.parse(learningRows[0][6]).surveyAt')>0);
assert.throws(()=>save({...rec,survey:{...survey,fun:9}}),/설문/);
const month=run('Utilities.formatDate(learningRows[0][4],"Asia/Seoul","yyyy-MM")');
let out=call('learningReport',{auth:'teacher',studentId:'1',month});
assert.equal(out.sessions.length,1);assert.equal(out.surveys.length,1);
assert.equal(call('learningReport',{auth:'teacher',studentId:'2',month}).sessions.length,0);
assert.throws(()=>call('learningNote',{auth:'student',studentId:'1',day:month+'-02',note:'관찰'}),/권한/);
call('learningNote',{auth:'teacher',studentId:'1',day:month+'-02',robotMinutes:60,note:'센서 값을 바꾸어 실험함'});
out=call('learningReport',{auth:'teacher',studentId:'1',month});
assert.equal(out.sessions.length,1,'로봇 시간은 웹 활동에 합산하지 않음');assert.equal(out.observations.length,1);assert.equal(out.observations[0].robotMinutes,60);
vm.runInContext(fs.readFileSync('learning-admin.js','utf8'),vm.createContext({window:ctx,Date,Set}));
const catalog=JSON.parse(fs.readFileSync('learning-projects.json','utf8'));
const recommendations=ctx.CHLearning.recommendations(out.surveys,catalog);
assert.equal(recommendations.length,2);assert(recommendations.every(x=>['games','art'].includes(x.project.category)));
assert.equal(ctx.CHLearning.recommendations([],catalog).length,0);
console.log('학습 관찰 서버·추천 시험 통과');
