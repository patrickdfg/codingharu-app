/* Public homepage, real crypto/SW with temporary lessons, mock student/Google server.
 * Run with Playwright on NODE_PATH and Chrome installed. No real accounts are used.
 */
const fs=require('fs'),path=require('path'),os=require('os'),http=require('http'),assert=require('assert');
const {execFileSync}=require('child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'codingharu-home-'));
const source=path.join(tmp,'source'),out=path.join(tmp,'out');
fs.mkdirSync(source);fs.mkdirSync(out);
for(const [rel,title] of [['index.html','수업 모음 테스트'],['python/projects/index.html','프로젝트 테스트'],['entry/index.html','엔트리 테스트'],['python/index.html','파이썬 테스트']]){
 const f=path.join(source,rel);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,`<!doctype html><html lang="ko"><head><meta charset="utf-8"></head><body><h1>${title}</h1></body></html>`);
}
const pass=require('crypto').randomBytes(24).toString('hex');
execFileSync(process.execPath,['tools/build.mjs',source,out],{cwd:root,env:{...process.env,SITE_PASS:pass},stdio:'pipe'});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.webmanifest':'application/manifest+json'};
const apiUrl='https://script.google.com/macros/s/TEST_HOME/exec';
let server,browser;
async function main(){
 server=http.createServer((req,res)=>{
  try{
   const url=new URL(req.url,'http://localhost');let rel=decodeURIComponent(url.pathname).replace(/^\/(app|legacy)\//,'');
   if(url.pathname==='/'){res.writeHead(302,{Location:'/app/'});return res.end();}
   if(rel==='record-config.json'){
    res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(url.pathname.startsWith('/legacy/')?{}:{apiUrl,clientId:'fixture-client'}));
   }
   const fixture=rel==='crypt.json'||rel==='check.enc'||rel.startsWith('content/');
   const base=fixture?out:root;
   let file=path.resolve(base,rel||'index.html');
   if(!file.startsWith(base+path.sep))throw Error('outside root');
   if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
   res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
  }catch{res.statusCode=404;res.end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({headless:true,channel:'chrome',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const shots=path.join(root,'tools/screenshots');fs.mkdirSync(shots,{recursive:true});
 const errors=[],calls=[];
 async function context(options={}){
  const c=await browser.newContext(options);
  await c.route('https://accounts.google.com/gsi/client',route=>route.fulfill({contentType:'text/javascript',body:`window.google={accounts:{id:{initialize(o){window.fixtureGoogle=o.callback},renderButton(el){el.innerHTML='<button type="button" id="mockGoogle">선생님 Google 로그인(시험)</button>';el.firstChild.onclick=()=>window.fixtureGoogle({credential:'temporary-fixture'})}}}};`}));
  await c.route(apiUrl,async route=>{
   const data=JSON.parse(route.request().postData());calls.push(data.action);let body;
   if(data.action==='studentSignup')body={ok:true};
   else if(data.action==='studentLogin')body=data.name==='거부테스트'?{ok:false,error:'이름과 번호가 맞지 않아요.'}:{ok:true,student:{id:'fixture-student',name:'시험 학생'},sid:'fixture-session'};
   else if(data.action==='pair')body={ok:true,teacher:'fixture@example.test',token:'fixture-device'};
   else if(data.action==='teacher')body={ok:true,teacher:'fixture@example.test',deviceOk:true};
   else if(data.action==='admin')body={ok:true,now:Date.now(),students:[],workbooks:[]};
   else body={ok:false,error:'fixture action not supported'};
   await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  });
  c.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));return c;
 }
 const c=await context();const p=await c.newPage();await p.setViewportSize({width:1440,height:1050});
 await p.goto(origin+'/app/');await p.waitForFunction(()=>window.CHHomeAuth&&document.querySelector('#heroScene').dataset.scene);
 assert.strictEqual(await p.locator('#authDialog').evaluate(n=>n.open),false,'home is public');
 assert.strictEqual(await p.locator('#heroScene').getAttribute('data-scene'),'webgl','real Three.js should render in this test browser');
 assert.strictEqual(await p.locator('script[src*="accounts.google"]').count(),0,'no Google request before opening auth');
 await p.screenshot({path:path.join(shots,'home-desktop.png'),fullPage:false});
 console.log('PASS: public homepage and actual WebGL first frame');
 for(const width of [320,390,768,1280,1440]){
  await p.setViewportSize({width,height:1050});await p.waitForTimeout(160);
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'overflow '+width);
  const login=await p.locator('.nav-login').boundingBox(),join=await p.locator('.nav-join').boundingBox();assert(login.width>0&&join.x>login.x&&join.x+join.width<=width);
  if(width===390)await p.screenshot({path:path.join(shots,'home-mobile.png'),fullPage:true});
 }
 await p.setViewportSize({width:1440,height:1050});await p.screenshot({path:path.join(shots,'home-full.png'),fullPage:true});
 await p.locator('.nav-join').click();await p.waitForSelector('#paneJoin:visible');
 assert.strictEqual(await p.locator('#authDialog').evaluate(n=>n.open),true);
 await p.locator('#jName').fill('새학생');await p.locator('#jPin').fill('0123');await p.locator('#jPin2').fill('9999');await p.locator('#jGo').click();
 await p.waitForFunction(()=>document.querySelector('#msg').textContent.includes('서로 달라'));
 assert(!calls.includes('studentSignup'));
 await p.locator('#jPin2').fill('0123');await p.locator('#jGo').click();await p.waitForFunction(()=>document.querySelector('#msg').textContent.includes('가입 신청'));
 assert(calls.includes('studentSignup'));assert.strictEqual(await p.locator('#lName').inputValue(),'새학생');
 await p.locator('#tabLogin').focus();await p.keyboard.press('ArrowRight');assert(await p.locator('#tabJoin').evaluate(n=>n.getAttribute('aria-selected')==='true'));
 await p.keyboard.press('Escape');assert.strictEqual(await p.locator('#authDialog').evaluate(n=>n.open),false);
 await p.locator('.nav-login').click();await p.locator('#lName').fill('거부테스트');await p.locator('#lPin').fill('0123');await p.locator('#lGo').click();
 await p.waitForFunction(()=>document.querySelector('#msg').textContent.includes('맞지 않아요'));assert.strictEqual(await p.locator('#lPin').inputValue(),'');
 await p.screenshot({path:path.join(shots,'home-login.png'),fullPage:false});
 await p.keyboard.press('Escape');await p.locator('.ai-course [data-auth]').click();await p.locator('#lName').fill('시험 학생');await p.locator('#lPin').fill('0123');await p.locator('#lGo').click();
 await p.waitForSelector('#form:visible');await p.locator('#pass').fill('wrong-fixture');await p.locator('#go').click();
 await p.waitForFunction(()=>document.querySelector('#msg').textContent.includes('맞지 않아요'));
 await p.locator('#pass').fill(pass);await p.locator('#go').click();await p.waitForURL('**/app/v/python/projects/');assert((await p.locator('h1').innerText()).includes('프로젝트 테스트'));
 await p.goto(origin+'/app/');await p.waitForFunction(()=>window.CHHomeAuth);await p.waitForTimeout(350);assert(p.url().endsWith('/app/'),'existing session must not skip public home');
 await p.locator('.block-course [data-auth]').click();await p.waitForURL('**/app/v/entry/');assert((await p.locator('h1').innerText()).includes('엔트리 테스트'));
 console.log('PASS: modal join/mismatch/approval message, keyboard/Escape, rejected login, real class-key password and protected course target, existing session public home');
 const dc=await context();const dp=await dc.newPage();await dp.goto(origin+'/app/?next=v/python/projects/');await dp.waitForSelector('#authDialog[open]');assert(await dp.locator('#paneLogin').isVisible());await dc.close();
 const tc=await context();const tp=await tc.newPage();await tp.goto(origin+'/app/');await tp.locator('.nav-login').click();await tp.waitForSelector('#mockGoogle');await tp.locator('#mockGoogle').click();await tp.waitForSelector('#form:visible');await tp.locator('#pass').fill(pass);await tp.locator('#go').click();await tp.waitForSelector('#admin:visible');
 assert((await tp.locator('#adminWho').innerText()).includes('fixture@example.test'));await tp.waitForFunction(()=>document.querySelector('#status').textContent.includes('학생별 요약'));
 assert(await tp.locator('#authDialog').evaluate(n=>n.classList.contains('admin-mode')));
 await tp.locator('#aLessons').click();await tp.waitForURL('**/app/v/index.html');await tp.goto(origin+'/app/');await tp.locator('.nav-login').click();await tp.waitForSelector('#admin:visible');await tp.locator('#aLogout').click();await tp.waitForSelector('#auth:visible');await tc.close();
 console.log('PASS: teacher Google callback/pair/class-key/admin/course/logout with mock account server');
 const lc=await context();const lp=await lc.newPage();await lp.goto(origin+'/legacy/');await lp.locator('.nav-join').click();await lp.waitForSelector('#form:visible');assert((await lp.locator('#lead').innerText()).includes('회원가입은'));await lp.locator('#pass').fill(pass);await lp.locator('#go').click();await lp.waitForURL('**/legacy/v/index.html');await lp.goto(origin+'/legacy/');await lp.waitForTimeout(250);assert(lp.url().endsWith('/legacy/'));await lp.locator('.nav-login').click();await lp.waitForURL('**/legacy/v/index.html');await lc.close();
 const rc=await context({reducedMotion:'reduce'});const rp=await rc.newPage();await rp.goto(origin+'/app/');await rp.waitForFunction(()=>document.querySelector('#heroScene').dataset.scene==='webgl');
 assert.strictEqual(await rp.locator('.scene-motion').getAttribute('aria-pressed'),'true');const frame=await rp.locator('#heroCanvas').getAttribute('data-frames');await rp.waitForTimeout(200);assert.strictEqual(await rp.locator('#heroCanvas').getAttribute('data-frames'),frame);
 assert.strictEqual(await rp.locator('.home-ribbon>div').evaluate(n=>getComputedStyle(n).animationName),'none');await rp.locator('.scene-motion').click();assert.strictEqual(await rp.locator('.scene-motion').getAttribute('aria-pressed'),'false');await rc.close();
 const fc=await context();await fc.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:get.call(this,type,...args);};});const fp=await fc.newPage();await fp.goto(origin+'/app/');await fp.waitForFunction(()=>document.querySelector('#heroScene').dataset.scene==='fallback');assert(!await fp.locator('.scene-fallback').evaluate(n=>getComputedStyle(n).opacity==='0'));await fp.locator('.nav-login').click();await fp.waitForSelector('#authDialog[open]');await fc.close();
 await p.goto(origin+'/app/');await p.waitForFunction(()=>navigator.serviceWorker.controller!==null);await p.evaluate(()=>{sessionStorage.clear();localStorage.removeItem('codingharu-student');});await c.setOffline(true);await p.reload();assert(await p.locator('#heroTitle').isVisible());await p.locator('.nav-login').click();await p.waitForSelector('#authDialog[open]');await c.setOffline(false);
 const jc=await browser.newContext({javaScriptEnabled:false});const jp=await jc.newPage();await jp.goto(origin+'/app/');assert(await jp.locator('#heroTitle').isVisible());assert(await jp.locator('.home-noscript').isVisible());await jc.close();
 assert.deepStrictEqual(errors,[]);await c.close();
 console.log('PASS: next redirect, records-off legacy access, reduced motion toggle, no-WebGL fallback + auth, cached offline homepage, no-JS copy; no page errors. Real student/Google server and physical devices not tested.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}fs.rmSync(tmp,{recursive:true,force:true});});
