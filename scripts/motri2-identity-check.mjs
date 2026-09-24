import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import projects from '../sources/data/projects.js';
import lab from '../sources/data/lab.js';
import social from '../sources/data/social.js';

export async function verifyIdentity(page) {
  const baseline=JSON.parse(await readFile('.motri2/upstream.json','utf8'));
  const protectedFiles=Object.keys(baseline.files).filter(p=>
    p==='license.md'||p==='package.json'||p==='package-lock.json'||
    p.startsWith('static/')||p.startsWith('resources/')||
    p.startsWith('sources/Game/Physics/')||p.startsWith('sources/Game/Inputs/')||
    /^sources\/Game\/(Player|View|Ticker|Time|Weather|Tornado|Water|Objects|Respawns)\.js$/.test(p));
  for(const p of protectedFiles)assert.equal(createHash('sha256').update(await readFile(p)).digest('hex'),baseline.files[p].sha256,'Protected file changed: '+p);
  const env=await readFile('.env.production','utf8');
  assert.match(env,/^VITE_SERVER_URL=$/m);assert.match(env,/^VITE_WHISPERS_COUNT=30$/m);
  assert.equal(projects.length,8);assert.equal(lab.length,13);assert.equal(social.length,8);
  assert.ok([...projects,...lab,...social].every(p=>!p.url));
  assert.ok(projects.every(p=>p.images.length>=3&&p.distinctions.length===0&&Object.keys(p.attributes).length===0));
  assert.ok([...projects,...lab].every(p=>p.title.startsWith('لوحة فارغة')));
  const html=await readFile('sources/index.html','utf8');
  assert.ok(html.includes('MOTRI2_IDENTITY_APPLIED'));
  assert.ok(!/برونو|سايمون|Bruno|bruno-simon|threejs-journey|discord\.com\//i.test(html));
  assert.ok(!(await readFile('sources/Game/World/Areas/TimeMachineArea.js','utf8')).includes('window.open'));
  assert.ok((await readFile('static/credits.html','utf8')).includes('Copyright (c) 2025 Bruno Simon'));

  const areas=['achievements','altar','behindTheScene','bowling','career','circuit','cookie','lab','landing','projects','social','toilet','timeMachine'];
  const state=await page.evaluate(names=>{
    const g=window.game, visual={block:0,monument:0};
    g.scene.traverse(o=>{if(o.userData.motri2Identity)visual[o.userData.motri2Identity]++;});
    return {areas:names.filter(n=>!!g.world.areas[n]),visual,
      stats:g.resources.areasModel.scene.userData.motri2Presentation,
      dateDigits:g.world.areas.career.year.digits.map(d=>d.mesh.visible),
      wheels:g.physicalVehicle.wheels.items.length,
      engine:g.physicalVehicle.engineForceAmplitude,
      race:!!g.world.areas.circuit.timer,
      bowling:!!g.world.areas.bowling.ball,
      cookie:!!g.world.areas.cookie.cookies,
      fans:!!g.world.areas.social.fans,
      achievements:[...g.achievements.groups.values()].reduce((n,v)=>n+v.items.length,0),
      links:[...document.querySelectorAll('.game a[href]')].map(a=>a.getAttribute('href'))};
  },areas);
  assert.equal(state.areas.length,13);assert.equal(state.wheels,4);assert.equal(state.engine,300);
  assert.equal(state.visual.block,10);assert.equal(state.visual.monument,1);assert.ok(state.stats.banners>0);
  assert.ok(state.dateDigits.every(v=>!v));assert.equal(state.achievements,38);
  assert.ok(state.race&&state.bowling&&state.cookie&&state.fans);
  assert.ok(state.links.every(url=>url==='./credits.html'));
  await page.screenshot({path:'artifacts/identity-world.png'});

  await page.waitForFunction(()=>window.game.physicalVehicle.wheels.inContactCount>=2,null,{timeout:20000});
  const origin=await page.evaluate(()=>{const p=window.game.physicalVehicle.position;return{x:p.x,z:p.z};});
  await page.keyboard.down('KeyW');
  try{await page.waitForFunction(p=>{const g=window.game;return g.player.accelerating>.5&&Math.hypot(g.physicalVehicle.position.x-p.x,g.physicalVehicle.position.z-p.z)>.4;},origin,{timeout:20000});}
  finally{await page.keyboard.up('KeyW');}
  await page.keyboard.down('KeyB');
  try{await page.waitForFunction(()=>window.game.physicalVehicle.xzSpeed<.4,null,{timeout:20000});}
  finally{await page.keyboard.up('KeyB');}
  console.log('IDENTITY_DRIVING_OK');

  // Use the real map respawn mechanism before opening a gallery. Opening it at
  // the distant landing point unnecessarily compiles an entire unseen region
  // during the animation, and does not reproduce the visitor interaction.
  const galleryReports=[];
  const snapshot=n=>page.evaluate(name=>{
    const g=window.game,a=g.world.areas[name];
    return {name,state:a.state,openState:a.constructor.STATE_OPEN,closedState:a.constructor.STATE_CLOSED,
      transition:a.stateTransition?{time:a.stateTransition.time(),delay:a.stateTransition.delay(),paused:a.stateTransition.paused(),scale:a.stateTransition.timeScale()}:null,
      timeScale:g.time.scale,filters:[...g.inputs.filters],inArea:a.isIn,frustum:a.frustum?.isIn,
      loaded:a.images.initiated,position:{x:g.player.position.x,y:g.player.position.y,z:g.player.position.z}};
  },n);
  const waitState=async(name,opened)=>{
    try{
      await page.waitForFunction(({name,opened})=>{
        const a=window.game.world.areas[name];
        return a.state===(opened?a.constructor.STATE_OPEN:a.constructor.STATE_CLOSED);
      },{name,opened},{timeout:30000,polling:100});
    }catch(error){
      const details=await snapshot(name);
      console.error('GALLERY_TRANSITION_FAILURE',JSON.stringify(details));
      await writeFile('artifacts/gallery-failure.json',JSON.stringify(details,null,2));
      throw error;
    }
  };
  for(const name of ['projects','lab']){
    await page.evaluate(n=>{window.__identityRespawnReady=false;window.game.player.respawn(n,()=>{window.__identityRespawnReady=true;});},name);
    await page.waitForFunction(()=>window.__identityRespawnReady,null,{timeout:30000});
    await page.waitForTimeout(1500);
    console.log('GALLERY_BEFORE_OPEN',JSON.stringify(await snapshot(name)));
    await page.evaluate(n=>window.game.world.areas[n].open(),name);
    await waitState(name,true);
    await page.evaluate(n=>{const a=window.game.world.areas[n];a.next();a.url.open();},name);
    await page.waitForFunction(n=>window.game.world.areas[n].images.initiated,name,{timeout:20000});
    await page.waitForTimeout(1700);
    const view=await page.evaluate(n=>{const a=window.game.world.areas[n];return{url:a.navigation.current.url,empty:a.navigation.current.title.startsWith('لوحة فارغة'),urlHit:a.url.intersect.active,loaded:a.images.initiated};},name);
    assert.ok(view.empty&&view.loaded);assert.equal(view.url,'');assert.equal(view.urlHit,false);
    await page.screenshot({path:`artifacts/identity-${name}.png`});
    await page.evaluate(n=>window.game.world.areas[n].close(),name);
    await waitState(name,false);
    galleryReports.push({name,opened:true,loaded:true,navigated:true,closed:true,noExternalUrl:true});
    console.log('GALLERY_OK',name);
  }
  await page.evaluate(()=>window.game.modals.open('discord'));
  assert.ok((await page.locator('.js-modal.discord').innerText()).includes('لم يتم ربط'));
  assert.equal(await page.locator('.js-modal.discord a').count(),0);
  await page.locator('.js-modal.discord .js-close').click();
  await page.waitForTimeout(450);
  const report={protectedFiles:protectedFiles.length,areas:state.areas,visualReplacements:state.visual,unchangedWheelCount:state.wheels,achievements:state.achievements,carMoved:true,brakeWorked:true,galleryReports,personalOutboundLinks:0,licenseRetained:true,serviceConfigurationUnchanged:true};
  await writeFile('artifacts/identity-check.json',JSON.stringify(report,null,2));
  console.log('IDENTITY_CHECK_OK',JSON.stringify(report));
}
