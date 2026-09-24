import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
await mkdir('artifacts',{recursive:true});
const root=path.resolve('dist'),prefix='/Motri2/';
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://localhost');
 if(!u.pathname.startsWith(prefix))throw new Error();
 const f=path.resolve(root,decodeURIComponent(u.pathname.slice(prefix.length))||'index.html');
 assert.ok(f.startsWith(root+path.sep));assert.ok((await stat(f)).isFile());
 res.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream'});res.end(await readFile(f));
}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(4173,'127.0.0.1',r));
const {chromium}=await import(process.env.MOTRI2_PLAYWRIGHT_MODULE||'playwright');
let browser,page;const errors=[],missing=[];
try{
 browser=await chromium.launch({args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 page=await browser.newPage({viewport:{width:844,height:600},deviceScaleFactor:.5});
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.url().startsWith('http://127.0.0.1')&&r.status()>=400)missing.push(r.url());});
 await page.goto('http://127.0.0.1:4173/Motri2/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.game?.world?.dunes?.physical&&window.game?.inputs?.actions.has('introStart'),null,{timeout:120000});
 await page.keyboard.press('Enter');
 await page.waitForFunction(()=>window.game.reveal.step===2,null,{timeout:60000});
 const report=await page.evaluate(()=>{
  const g=window.game,d=g.world.dunes,f=d.field,collider=d.physical.colliders[0];
  let error=0,hits=0,highest=-100,maxSlope=0;
  for(let i=0;i<f.indices.length;i+=3){
   const a=f.indices[i]*3,b=f.indices[i+1]*3,c=f.indices[i+2]*3,p=f.positions;
   highest=Math.max(highest,p[a+1]);
   const ux=p[b]-p[a],uy=p[b+1]-p[a+1],uz=p[b+2]-p[a+2],vx=p[c]-p[a],vy=p[c+1]-p[a+1],vz=p[c+2]-p[a+2];
   maxSlope=Math.max(maxSlope,Math.atan2(Math.hypot(uy*vz-uz*vy,ux*vy-uy*vx),uz*vx-ux*vz)*180/Math.PI);
   if(i%60)continue;
   const x=(p[a]+p[b]+p[c])/3,z=(p[a+2]+p[b+2]+p[c+2])/3,y=(p[a+1]+p[b+1]+p[c+1])/3;
   const hit=collider.castRay(new g.RAPIER.Ray({x,y:30,z},{x:0,y:-1,z:0}),60,true);
   if(hit<0)throw new Error('Dune collider miss');
   error=Math.max(error,Math.abs(30-hit-y));hits++;
  }
  return {triangles:f.indices.length/3,highest,maxSlope,raySamples:hits,maxCollisionError:error,areas:Object.keys(g.world.areas).filter(n=>g.world.areas[n]?.references).length,wheels:g.physicalVehicle.wheels.items.length,clearedVegetation:d.clearedVegetation};
 });
 assert.ok(report.triangles<6000);assert.ok(report.highest>2&&report.highest<5);assert.ok(report.maxSlope<36);
 assert.ok(report.raySamples>50&&report.maxCollisionError<.002);assert.equal(report.areas,13);assert.equal(report.wheels,4);
 console.log('DUNES_SURFACE_OK',JSON.stringify(report));
 await page.evaluate(()=>{window.__ready=false;window.game.player.respawn('dunes',()=>{window.__ready=true;});});
 await page.waitForFunction(()=>window.__ready&&window.game.physicalVehicle.wheels.inContactCount>=2,null,{timeout:30000});
 const start=await page.evaluate(()=>({...window.game.physicalVehicle.position}));
 await page.keyboard.down('KeyW');
 try{await page.waitForFunction(p=>{const v=window.game.physicalVehicle;return Math.hypot(v.position.x-p.x,v.position.z-p.z)>5&&v.position.y>p.y+.35;},start,{timeout:30000});}
 finally{await page.keyboard.up('KeyW');}
 await page.keyboard.down('KeyB');await page.waitForTimeout(1000);await page.keyboard.up('KeyB');
 await page.screenshot({scale:'css',path:'artifacts/dunes-driving.png'});
 await page.evaluate(()=>window.game.modals.open('map'));
 await page.waitForFunction(()=>document.querySelector('.motri2-dunes-map'));
 assert.ok((await page.locator('.map .location .name').allTextContents()).includes('الكثبان الرملية'));
 await page.screenshot({scale:'css',path:'artifacts/dunes-map.png'});
 assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
 report.actualCarClimbed=true;report.mapUpdated=true;report.errors=errors;
 await writeFile('artifacts/dunes-check.json',JSON.stringify(report,null,2));
 console.log('DUNES_CHECK_OK',JSON.stringify(report));
}catch(e){console.error('DUNES_FAILURE',String(e),JSON.stringify({errors,missing}));await page?.screenshot({path:'artifacts/dunes-failure.png'}).catch(()=>{});throw e;}
finally{await browser?.close();await new Promise(r=>server.close(r));}
