const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert'),crypto=require('crypto');
const {chromium}=require('C:/Users/egiby/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
const server=http.createServer((req,res)=>{try{let f=path.join(root,new URL(req.url,'http://local').pathname);if(fs.statSync(f).isDirectory())f=path.join(f,'index.html');res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json'}[path.extname(f)]||'application/octet-stream'));fs.createReadStream(f).pipe(res);}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(8828,r));const browser=await chromium.launch({channel:'chrome',headless:true});
try{const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.route('**/record-config.json',r=>r.fulfill({contentType:'application/json',body:'{}'}));
for(const width of [375,800,1280]){await p.setViewportSize({width,height:950});await p.goto('http://localhost:8828/#/works');await p.waitForFunction(()=>document.documentElement.dataset.page==='works');assert(await p.locator('#pc-applications').isVisible());assert(await p.locator('#publicGalleryTitle').isVisible());assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
const event=p.waitForEvent('download');await p.locator('#pc-applications a[download]').click();const download=await event;assert.equal(download.suggestedFilename(),'EpicPen-Windows-x64.zip');assert.equal(crypto.createHash('sha256').update(fs.readFileSync(await download.path())).digest('hex'),crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'downloads/EpicPen-Windows-x64.zip'))).digest('hex'));
await p.goto('http://localhost:8828/#/courses');assert(await p.locator('#pc-applications').isHidden());assert.deepEqual(errors,[]);console.log('PASS: public works card, existing gallery retained, no login needed, full ZIP download hash, three widths, route hiding, no JS errors.');
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
