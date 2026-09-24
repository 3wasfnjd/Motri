// Focused localization release check. Full driving regression remains in motri2-check.mjs.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import path from 'node:path';
import {hasArabic} from '../sources/localization/ar.js';
import './motri2-ar-check.mjs';
await mkdir('artifacts',{recursive:true});
const baseline=JSON.parse(await readFile('.motri2/upstream.json','utf8'));
const allowed=new Set(['sources/index.html','sources/Game/Title.js','readme.md','sources/Game/Options.js','sources/Game/Achievements.js','sources/data/achievements.js','sources/Game/Map.js','sources/Game/Audio.js','sources/Game/Server.js','sources/Game/World/Whispers.js','sources/Game/utilities/time.js','sources/Game/InputFlag.js','sources/Game/TextCanvas.js','sources/Game/InteractivePoints.js','sources/Game/World/Bubble.js','sources/Game/World/Areas/CircuitArea.js','sources/Game/World/Intro.js']);
const changed=[];
for(const [file,expected] of Object.entries(baseline.files)){
  const actual=createHash('sha256').update(await readFile(file)).digest('hex');
  if(actual!==expected.sha256){assert.ok(allowed.has(file),'Unexpected non-localization change: '+file);changed.push(file);}
}
await writeFile('artifacts/baseline.json',JSON.stringify({files:Object.keys(baseline.files).length,changed,originalDrivingPreserved:true},null,2));
const root=path.resolve('dist'),prefix='/Motri2/';
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.mp3':'audio/mpeg','.woff':'font/woff','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(!url.pathname.startsWith(prefix))throw new Error('Outside project');const file=path.resolve(root,decodeURIComponent(url.pathname.slice(prefix.length))||'index.html');assert.ok(file.startsWith(root+path.sep));assert.ok((await stat(file)).isFile());res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(await readFile(file));}catch{res.writeHead(404);res.end('Not found');}});
await new Promise(r=>server.listen(4173,'127.0.0.1',r));
const {chromium}=await import(process.env.MOTRI2_PLAYWRIGHT_MODULE||'playwright');
let browser;
const errors=[],badResponses=[],sockets=[],reports=[];
try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  // Test-browser raster density only; CSS viewports and production graphics stay unchanged.
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:0.5,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.url().startsWith('http://127.0.0.1')&&r.status()>=400)badResponses.push(r.url());});
  page.on('websocket',s=>sockets.push(s.url()));
  try{
    await page.goto('http://127.0.0.1:4173/Motri2/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.game?.world?.visualVehicle&&window.game?.inputs?.actions.has('introStart'),null,{timeout:180000});
    assert.deepEqual(errors,[]);assert.equal(await page.locator('html').getAttribute('lang'),'ar');
    assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
    await page.keyboard.press('Enter');
    await page.waitForFunction(()=>window.game.reveal.step===2,null,{timeout:60000});
    const close=page.locator('.js-menu .inner > .js-close');
    // Changing tabs starts an animated height adjustment. Check the settled control,
    // without forcing a click, changing game timing, or bypassing hit testing.
    const checkHit=async loc=>{
      const element=await loc.elementHandle();
      assert.ok(element,'Missing close control');
      try{
        await page.waitForFunction(e=>{
          const b=e.getBoundingClientRect();
          const h=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
          return b.width>0&&b.height>0&&b.x>=-0.5&&b.y>=-0.5&&b.right<=innerWidth+0.5&&b.bottom<=innerHeight+0.5&&(e===h||e.contains(h));
        },element,{polling:100,timeout:10000});
        await loc.click({trial:true,timeout:10000});
      }catch(error){
        console.error('CLOSE_HIT_FAILURE',JSON.stringify(await loc.evaluate(e=>{
          const b=e.getBoundingClientRect(),h=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
          return {panel:window.game.menu.current?.name,rect:b.toJSON(),viewport:[innerWidth,innerHeight],hit:h?.outerHTML?.slice(0,300),menuState:window.game.menu.state,modalState:window.game.modals.state};
        })));
        throw error;
      }finally{await element.dispose();}
    };
    const panels=[['home','عالم برونو'],['options','الإعدادات'],['controls','طريقة التحكم'],['achievements','الإنجازات'],['circuit','حلبة السباق'],['whispers','اترك رسالة'],['behindTheScene','خلف الكواليس']];
    for(const viewport of [{width:390,height:844},{width:844,height:390}]){
      await page.setViewportSize(viewport);
      await page.locator('.js-menu-trigger').click();
      await page.waitForFunction(()=>window.game.menu.state===1);
      for(const [name,title] of panels){
        await page.locator(`.js-menu .js-navigation-item[data-name="${name}"]`).click();
        await page.waitForFunction(n=>window.game.menu.current.name===n,name);
        const panel=page.locator(`.js-menu .${name}-content`);
        assert.ok((await panel.innerText()).includes(title),name+' not translated');
        assert.equal(await panel.evaluate(e=>getComputedStyle(e).direction),'rtl');
        await checkHit(close);
      }
      await page.locator('.js-menu .js-navigation-item[data-name="options"]').click();
      await checkHit(close);
      await page.screenshot({scale:'css',path:`artifacts/ar-options-${viewport.width}.png`});
      await close.click();await page.waitForFunction(()=>window.game.menu.state===3);
      await page.locator('.js-map-trigger').click();
      await page.waitForFunction(()=>window.game.map.initiated);
      const pins=await page.locator('.map .location .name').allTextContents();
      assert.equal(pins.length,12);assert.ok(pins.every(hasArabic));
      await checkHit(page.locator('.map .js-close'));
      await page.locator('.map .js-close').click();
      await page.waitForFunction(()=>window.game.modals.state===window.game.modals.constructor.CLOSED,null,{timeout:10000});
      reports.push({viewport,panels:panels.length,mapPins:pins.length,closeButtons:true});
      console.log('MENU_VIEWPORT_OK',JSON.stringify(viewport));
    }
    assert.deepEqual(errors,[]);assert.deepEqual(badResponses,[]);assert.deepEqual(sockets,[]);
    const report={locale:'ar',direction:'rtl',reports,errors,badResponses,serverConnections:sockets.length,originalDrivingPreserved:true,scope:'startup, Arabic menus/map, close buttons, source integrity; not a repeated physics benchmark'};
    await writeFile('artifacts/localization-smoke.json',JSON.stringify(report,null,2));
    console.log('LOCALIZATION_SMOKE_OK',JSON.stringify(report));
  }catch(e){await page.screenshot({scale:'css',path:'artifacts/localization-failure.png'}).catch(()=>{});console.error('LOCALIZATION_FAILURE',JSON.stringify({error:String(e),errors,badResponses}));throw e;}
  await context.close();
}finally{await browser?.close();await new Promise(r=>server.close(r));}
