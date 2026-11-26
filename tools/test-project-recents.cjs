const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert');
const {chromium}=require('C:/Users/egiby/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),source='C:/Users/egiby/Documents/Codex/2026-10-03/new-chat/work/class';
const catalog=JSON.parse(fs.readFileSync(path.join(source,'coding/recent-project-catalog.json'),'utf8'));
(async()=>{
 const server=http.createServer((req,res)=>{try{const url=new URL(req.url,'http://local'),course=url.pathname.startsWith('/v/');let f=path.join(course?source:root,course?url.pathname.slice(3):url.pathname);if(fs.statSync(f).isDirectory())f=path.join(f,'index.html');let body=fs.readFileSync(f);if(course&&f.endsWith('.html'))body=Buffer.from(body.toString().replace('</body>','<script defer src="/inject.js"></script></body>'));res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'}[path.extname(f)]||'application/octet-stream'));res.end(body);}catch{res.statusCode=404;res.end();}});
 await new Promise(r=>server.listen(8813,r));const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1280,height:950}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>{const id=localStorage.getItem('test-student')||'a';sessionStorage.setItem('codingharu-session',JSON.stringify({role:'student'}));localStorage.setItem('codingharu-student',JSON.stringify({id,name:'테스트'}));window.CHRecord={base:'/',config:()=>Promise.resolve({on:true}),device:()=>({}),student:()=>({id,name:'테스트'}),session:()=>({role:'student'}),sessionOk:()=>true,auth:()=>Promise.resolve(null),api:()=>Promise.resolve({state:{},updatedAt:0}),endSession:()=>{}};});
  const base='http://localhost:8813/v/';await p.goto(base);await p.waitForTimeout(100);
  await p.evaluate(()=>{localStorage.setItem('codingGames_v1-sa',JSON.stringify({done:['g1-1','g2-1'],work:{},last:1}));localStorage.setItem('codingPlayground_v1-sa',JSON.stringify({done:['1-1','2-1'],work:{},last:11}));localStorage.setItem('codingharu-recent-sa',JSON.stringify([{k:'coding/block-games/',t:'전체 게임',at:1},{k:'entry/fish-growth/',t:'물고기 성장 게임',at:2}]));});
  await p.reload();await p.waitForFunction(()=>document.querySelectorAll('.ch-rcard').length===5);
  assert.equal(await p.locator('.ch-rcard[href$="/coding/block-games/"]').count(),0);
  for(const course of catalog.courses)for(const project of course.projects.slice(0,2))assert((await p.locator('.ch-recent').textContent()).includes(project.title));
  assert.equal(await p.locator('.ch-rcard').filter({hasText:'물고기 성장 게임'}).count(),1);
  const game=catalog.courses[1],first=game.projects[0],second=game.projects[1];
  const card=p.locator('.ch-rcard').filter({hasText:first.title});assert((await card.getAttribute('href')).endsWith('#lesson=2'));assert((await card.textContent()).includes('1 / '+first.ids.length));
  await card.click();await p.waitForFunction(()=>window.CodingHaruWorkbook?.recentProjects);
  await p.evaluate(()=>location.hash='lesson=3');await p.waitForFunction(()=>JSON.parse(localStorage.getItem('codingharu-recent-sa')).some(x=>x.k==='coding/block-games/#lesson=1'&&x.href.endsWith('#lesson=3')));
  await p.evaluate(n=>location.hash='lesson='+n,second.indices[0]+1);await p.waitForTimeout(250);
  assert.equal(await p.evaluate(()=>CodingHaruWorkbook.recentProjects().length),2);
  await p.evaluate(ids=>{const s=CodingHaruWorkbook.getState();s.done=[...ids,'g2-1'];CodingHaruWorkbook.applyState(s);},first.ids);
  await p.goto(base);await p.waitForFunction(()=>document.querySelectorAll('.ch-rcard').length>=5);assert((await p.locator('.ch-rcard').filter({hasText:first.title}).textContent()).includes('✔ 완료'));assert((await p.locator('.ch-rcard').filter({hasText:second.title}).textContent()).includes('1 / '+second.ids.length));
  await p.goto(base+'coding/blocks.html#lesson=12');await p.waitForFunction(()=>window.CodingHaruWorkbook?.recentProjects);const projects=await p.evaluate(()=>CodingHaruWorkbook.recentProjects());assert.equal(projects.length,2);assert.equal(projects.find(x=>x.title.includes(catalog.courses[0].projects[1].title)).total,10);
  await p.goto(base);await p.waitForFunction(()=>document.querySelector('.ch-recent'));await p.setViewportSize({width:390,height:900});assert(await p.locator('.ch-recent').isVisible());
  await p.evaluate(()=>localStorage.setItem('test-student','b'));await p.goto(base);await p.waitForTimeout(400);assert.equal(await p.locator('.ch-rcard').count(),0);assert(await p.evaluate(()=>!!localStorage.getItem('codingGames_v1-sa')));
  assert.deepEqual(errors,[]);console.log('PASS: legacy home migration, project titles/counts, stage resume, per-game dedup, completion separated, coding projects, Entry retained, mobile cards, student isolation.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
