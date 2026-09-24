import {checkArabicInterface} from './motri2-ar-check.mjs';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import path from 'node:path';
await mkdir('artifacts',{recursive:true});
const baseline=JSON.parse(await readFile('.motri2/upstream.json','utf8'));
const allowed=new Set(["sources/index.html","sources/Game/Title.js","readme.md","sources/Game/Options.js","sources/Game/Achievements.js","sources/data/achievements.js","sources/Game/Map.js","sources/Game/Audio.js","sources/Game/Server.js","sources/Game/World/Whispers.js","sources/Game/utilities/time.js","sources/Game/InputFlag.js","sources/Game/TextCanvas.js","sources/Game/InteractivePoints.js","sources/Game/World/Bubble.js","sources/Game/World/Areas/CircuitArea.js","sources/Game/World/Intro.js"]);
const changed=[],missing=[];
for(const [file,expected] of Object.entries(baseline.files)) {
  let data;try{data=await readFile(file);}catch{missing.push(file);continue;}
  if(createHash('sha256').update(data).digest('hex')!==expected.sha256)changed.push(file);
}
assert.deepEqual(missing,[],'All imported source and asset files must remain present');
assert.deepEqual(changed.filter(p=>!allowed.has(p)),[],'Vehicle, physics, inputs, camera, assets and dependencies must match upstream');
const html=await readFile('dist/index.html','utf8');
assert.ok(html.includes('MOTRI2_REFERENCE_BASELINE'));
assert.ok(!/googletagmanager|google-analytics|G-JMSN30BQ5J/.test(html),'Do not send analytics to the source site');
const integrity={upstream:baseline.revision,files:Object.keys(baseline.files).length,changed,originalDrivingPreserved:true};
await writeFile('artifacts/baseline.json',JSON.stringify(integrity,null,2));
console.log('BASELINE_INTEGRITY',JSON.stringify(integrity));
const {chromium}=await import(process.env.MOTRI2_PLAYWRIGHT_MODULE || 'playwright');
const root=path.resolve('dist'),prefix='/Motri2/';
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.wasm':'application/wasm','.glb':'model/gltf-binary','.json':'application/json','.webmanifest':'application/manifest+json','.ktx':'image/ktx2','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.mp3':'audio/mpeg','.wav':'audio/wav','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf'};
const server=createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(!pathname.startsWith(prefix)){res.writeHead(404);res.end('Outside project path');return;}
    const file=path.resolve(root,pathname.slice(prefix.length)||'index.html');
    if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    if(!(await stat(file)).isFile())throw new Error('not file');
    res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});
    res.end(await readFile(file));
  }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(resolve=>server.listen(4173,'127.0.0.1',resolve));
let browser;
const results=[];
try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390}]) {
    const context=await browser.newContext({viewport,deviceScaleFactor:1,isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'});
    const page=await context.newPage(),errors=[],badResponses=[],sockets=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{if(r.url().startsWith('http://127.0.0.1:4173')&&r.status()>=400)badResponses.push({url:r.url(),status:r.status()});});
    page.on('websocket',ws=>sockets.push(ws.url()));
    try{
      await page.addInitScript(() => {
        window.__arabicDraws=[];
        const fillText=CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText=function(text,...args) {
          if(/[\u0600-\u06ff]/u.test(String(text)) && window.__arabicDraws.length<200)
            window.__arabicDraws.push({text:String(text),direction:this.direction,font:this.font,width:this.canvas.width,height:this.canvas.height});
          return fillText.call(this,text,...args);
        };
      });
      await page.goto('http://127.0.0.1:4173/Motri2/',{waitUntil:'domcontentloaded',timeout:60000});
      await page.waitForFunction(()=>window.game?.physicalVehicle?.controller&&window.game?.world?.visualVehicle&&window.game.inputs.actions.has('introStart'),null,{timeout:180000});
      assert.deepEqual(errors,[]);
      await page.waitForFunction(()=>window.__arabicDraws.some(d=>d.text==='ابدأ القيادة'),null,{timeout:20000});
      const introMasks=await page.evaluate(()=>[...window.game.world.intro.text.textures.values()].map(t=>({name:t.name,data:t.image.toDataURL()})));
      for(let i=0;i<introMasks.length;i++)await writeFile(`artifacts/ar-intro-mask-${viewport.width}-${i}.png`,Buffer.from(introMasks[i].data.split(',')[1],'base64'));
      await page.keyboard.press('Enter');
      await page.waitForFunction(()=>window.game.reveal.step===2,null,{timeout:60000});
      await page.waitForFunction(()=>window.game.physicalVehicle.wheels.inContactCount>=2,null,{timeout:30000});
      const getPosition=()=>page.evaluate(()=>{const p=window.game.physicalVehicle.chassis.physical.body.translation();return {x:p.x,y:p.y,z:p.z};});
      const start=await getPosition();
      await page.keyboard.down('KeyW');
      await page.waitForFunction(p=>{const v=window.game.physicalVehicle.position;return window.game.player.accelerating>.5&&Math.hypot(v.x-p.x,v.z-p.z)>.3;},start,{timeout:25000});
      await page.keyboard.up('KeyW');
      const forward=await getPosition();
      await page.keyboard.down('KeyB');
      await page.waitForFunction(()=>window.game.player.braking===1&&window.game.physicalVehicle.xzSpeed<.4,null,{timeout:25000});
      await page.keyboard.up('KeyB');
      await page.keyboard.down('KeyS');
      await page.waitForFunction(()=>window.game.player.accelerating<-.5&&window.game.physicalVehicle.forwardSpeed<-.1,null,{timeout:25000});
      await page.keyboard.up('KeyS');
      await page.keyboard.down('KeyB');
      await page.waitForFunction(()=>window.game.physicalVehicle.xzSpeed<.4,null,{timeout:25000});
      await page.keyboard.up('KeyB');
      const touchPoint=await page.evaluate(()=>{
        const g=window.game,v=g.physicalVehicle,n=g.inputs.nipple;
        const p=n.position.clone().addScaledVector(v.forward,5.5);p.y=n.position.y;p.project(g.view.defaultCamera);
        return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};
      });
      assert.ok(touchPoint.x>5&&touchPoint.x<viewport.width-5&&touchPoint.y>5&&touchPoint.y<viewport.height-5,'Projected driving target lies on screen');
      const client=await context.newCDPSession(page);
      await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,...touchPoint}]});
      await page.waitForFunction(()=>window.game.inputs.nipple.active&&Math.abs(window.game.player.accelerating)>.05,null,{timeout:15000});
      const touchStart=await getPosition();
      await page.waitForFunction(p=>{const v=window.game.physicalVehicle.position;return Math.hypot(v.x-p.x,v.z-p.z)>.2;},touchStart,{timeout:25000});
      await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await page.waitForFunction(()=>!window.game.inputs.nipple.active&&window.game.player.accelerating===0,null,{timeout:15000});
      await page.keyboard.down('KeyW');
      await page.waitForFunction(()=>window.game.player.accelerating>.5,null,{timeout:10000});
      await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
      await page.waitForFunction(()=>window.game.player.accelerating===0,null,{timeout:10000});
      await page.keyboard.up('KeyW');
      const measured=await page.evaluate(()=>{
        const g=window.game,v=g.physicalVehicle,r=g.rendering.renderer;
        return {position:{x:v.position.x,y:v.position.y,z:v.position.z},wheelCount:v.wheels.items.length,contacts:v.wheels.inContactCount,quality:g.quality.level,webgpu:!!r.backend.isWebGPUBackend,render:r.info.render,serverConnected:g.server.connected,title:document.title};
      });
      assert.equal(measured.wheelCount,4);assert.equal(measured.serverConnected,false);assert.deepEqual(sockets,[]);
      assert.ok(Object.values(measured.position).every(Number.isFinite));
      assert.deepEqual(errors,[]);assert.deepEqual(badResponses,[],'All production assets resolve under /Motri2/');
      await checkArabicInterface(page,viewport);
      assert.deepEqual(errors,[],'No runtime errors after Arabic UI interactions');
      await page.screenshot({path:`artifacts/motri2-${viewport.width}.png`});
      results.push({viewport,start,forward,keyboardForward:true,reverse:true,brake:true,touchDrive:true,touchRelease:true,blurRelease:true,...measured});
      await client.detach();
    }catch(error){
      console.log('BROWSER_DIAGNOSTIC',JSON.stringify({viewport,errors,badResponses,sockets,error:String(error)}));
      await page.screenshot({path:`artifacts/failure-${viewport.width}.png`}).catch(()=>{});
      throw error;
    }finally{await context.close();}
  }
  await writeFile('artifacts/browser.json',JSON.stringify(results,null,2));
  console.log('MOTRI2_BROWSER_RESULTS',JSON.stringify(results));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
