// Idempotent Arabic presentation finish. Does not change world or driving code.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const read=p=>readFile(p,'utf8');
const hash=b=>createHash('sha256').update(b).digest('hex');
const protectedFiles=['sources/Game/Player.js','sources/Game/View.js','sources/Game/Ticker.js','sources/Game/Physics/Physics.js','sources/Game/Physics/PhysicsVehicle.js','sources/Game/Inputs/Inputs.js','sources/Game/Inputs/Nipple.js','sources/Game/World/World.js'];
const before=await Promise.all(protectedFiles.map(async p=>[p,hash(await readFile(p))]));
let css=await read('sources/localization/ar.css');
if(!css.includes('MOTRI2_AR_FINAL'))css+=`
/* MOTRI2_AR_FINAL: reserve a separate close-button slot at every aspect ratio.
   The upstream half-width tab row overlapped Close on landscape phones. */
html[lang="ar"] .menu .inner > .navigation{
  left:0;right:52px;bottom:100%;width:auto;max-width:none;
  display:flex;justify-content:flex-end;gap:3px;z-index:3;
}
html[lang="ar"] .menu .inner > .navigation > .item{
  flex:0 1 50px;min-width:30px;width:50px;height:44px;
}
html[lang="ar"] .menu .inner > .close{
  top:auto;right:0;bottom:100%;width:44px;height:44px;
  transform:none;z-index:4;
}
html[lang="ar"] .menu .inner > .close:focus-visible,
html[lang="ar"] .menu .navigation > .item:focus-visible{
  outline:2px solid #fff;outline-offset:2px;
}
html[lang="ar"] .modal .content > .title,
html[lang="ar"] .modal .content > .your-time{padding-inline-start:48px;}
html[lang="ar"] .modal .content > .close{z-index:3;transform:none;}
html[lang="ar"] .modal.circuit-end .content,
html[lang="ar"] .modal.discord .content{
  max-width:calc(100vw - 24px);max-height:calc(100dvh - 24px);overflow-y:auto;
}
html[lang="ar"] .circuit-end .your-time .value,
html[lang="ar"] .circuit-content .leaderboard{
  direction:ltr;unicode-bidi:isolate;
}
html[lang="ar"] .controls-content .key{unicode-bidi:isolate;}
html[lang="ar"] .input-flag .search{font-size:16px;}
@media(max-width:360px){
  html[lang="ar"] .menu .inner > .navigation{right:49px;gap:1px;}
  html[lang="ar"] .menu .inner > .navigation > .item{flex:1 1 0;}
}
`;
await writeFile('sources/localization/ar.css',css);
let vocabulary=await read('sources/localization/ar.js');
if(!vocabulary.includes('const additional =')){
  vocabulary=vocabulary.replace('export const hasArabic',"const additional = Object.freeze({'OnlyFans':'مراوح فقط','10 ans':'10 سنوات','Bonhomme | 10 ans':'Bonhomme | 10 سنوات'});\nexport const hasArabic");
  vocabulary=vocabulary.replace('  if(Object.hasOwn(dictionary,key))','  if(Object.hasOwn(additional,key))return additional[key];\n  if(Object.hasOwn(dictionary,key))');
  await writeFile('sources/localization/ar.js',vocabulary);
}
let check=await read('scripts/motri2-check.mjs');
check=check.replace("await import('playwright')","await import(process.env.MOTRI2_PLAYWRIGHT_MODULE || 'playwright')");
check=check.replace('for(const viewport of [{width:390,height:844},{width:844,height:390}])','for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390}])');
if(!check.includes('window.__arabicDraws=[]'))check=check.replace("      await page.goto('http://127.0.0.1:4173/Motri2/'",`      await page.addInitScript(() => {
        window.__arabicDraws=[];
        const fillText=CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText=function(text,...args) {
          if(/[\\u0600-\\u06ff]/u.test(String(text)) && window.__arabicDraws.length<200)
            window.__arabicDraws.push({text:String(text),direction:this.direction,font:this.font,width:this.canvas.width,height:this.canvas.height});
          return fillText.call(this,text,...args);
        };
      });
      await page.goto('http://127.0.0.1:4173/Motri2/'`);
if(!check.includes('const introMasks='))check=check.replace("      await page.keyboard.press('Enter');",`      await page.waitForFunction(()=>window.__arabicDraws.some(d=>d.text==='ابدأ القيادة'),null,{timeout:20000});
      const introMasks=await page.evaluate(()=>[...window.game.world.intro.text.textures.values()].map(t=>({name:t.name,data:t.image.toDataURL()})));
      for(let i=0;i<introMasks.length;i++)await writeFile(\`artifacts/ar-intro-mask-\${viewport.width}-\${i}.png\`,Buffer.from(introMasks[i].data.split(',')[1],'base64'));
      await page.keyboard.press('Enter');`);
await writeFile('scripts/motri2-check.mjs',check);
for(const [p,expected] of before)assert.equal(hash(await readFile(p)),expected,'Driving/world changed: '+p);
console.log('ARABIC_FINISH_READY: responsive close, full menu/dialog coverage, original driving unchanged.');
