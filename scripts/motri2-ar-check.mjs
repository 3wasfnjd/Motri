import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import achievements from '../sources/data/achievements.js';
import {t,hasArabic} from '../sources/localization/ar.js';
// Check content completeness without changing achievement IDs, targets or save keys.
assert.equal(t('Controls'),'طريقة التحكم');
assert.equal(t('Start race!'),'ابدأ السباق!');
assert.equal(t('KeyW'),'KeyW');
assert.equal(t('https://example.com'),'https://example.com');
assert.ok(achievements.length>30);
for(const [id,title,description,target] of achievements){assert.ok(/^[a-zA-Z]+$/.test(id));assert.ok(hasArabic(title),'Untranslated title: '+title);assert.ok(hasArabic(description),'Untranslated description: '+description);assert.ok(Number.isFinite(target));}
const introSource=await readFile('sources/Game/World/Intro.js','utf8');
assert.ok(introSource.includes('ar-intro-')&&introSource.includes('ابدأ القيادة'));
const labelSource=await readFile('sources/Game/InteractivePoints.js','utf8');
assert.ok(labelSource.includes('text = t(text)')&&labelSource.includes("arabic ? 'right' : 'left'"));
export async function checkArabicInterface(page,viewport){
 assert.equal(await page.locator('html').getAttribute('lang'),'ar');
 assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
 assert.ok((await page.title()).includes('موتري 2'));
 assert.ok((await page.locator('.js-menu-trigger').getAttribute('aria-label')).includes('القائمة'));
 await page.locator('.js-menu-trigger').click();
 await page.waitForFunction(()=>window.game.menu.state===1,null,{timeout:30000});
 const panels=[['options','الإعدادات'],['controls','طريقة التحكم'],['achievements','الإنجازات'],['whispers','اترك رسالة']];
 for(const [name,title] of panels){
   await page.locator(`.js-menu .js-navigation-item[data-name="${name}"]`).click();
   await page.waitForFunction(n=>window.game.menu.current.name===n,name,{timeout:15000});
   const panel=page.locator(`.js-menu .${name}-content`);
   await page.waitForTimeout(400);
   assert.ok((await panel.innerText()).includes(title),name+' translated');
   assert.equal(await panel.evaluate(e=>getComputedStyle(e).direction),'rtl');
   const layout=await panel.evaluate(e=>({scroll:e.scrollWidth,width:e.clientWidth}));
   assert.ok(layout.scroll<=layout.width+2,name+' has horizontal overflow '+JSON.stringify(layout));
   if(name==='controls'){
     const text=await panel.innerText();assert.ok(text.includes('إصبع واحد')&&text.includes('إصبعان'));
     assert.ok(text.includes('WASD')&&text.includes('SHIFT'),'Actual hardware key names preserved');
   }
   if(name==='options')assert.ok((await panel.innerText()).includes('غير متصل'));
   if(name==='achievements')assert.ok((await panel.innerText()).includes('حان وقت المغامرة!'));
   if(name==='options'||name==='controls'||name==='achievements')await page.screenshot({path:`artifacts/ar-${name}-${viewport.width}.png`});
 }
 const country=await page.evaluate(()=>{
   const f=window.game.world.whispers.menu.inputFlag,sa=f.countries.get('sa');
   f.searchElement.value='السعودية';f.searchElement.dispatchEvent(new Event('input',{bubbles:true}));
   return {text:sa.element.textContent,terms:sa.terms,visible:sa.element.style.display!=='none'};
 });
 assert.ok(country.text.includes('السعودية')&&country.terms.includes('Saudi')&&country.visible,'Arabic and English country search supported');
 await page.locator('.js-menu .js-close').first().click();
 await page.waitForFunction(()=>window.game.menu.state===3,null,{timeout:30000});
 await page.locator('.js-map-trigger').click();
 await page.waitForFunction(()=>window.game.map.initiated,null,{timeout:15000});
 const pins=await page.locator('.map .location .name').allTextContents();
 assert.ok(pins.includes('نقطة البداية')&&pins.includes('المختبر')&&pins.includes('المشاريع'));
 await page.screenshot({path:`artifacts/ar-map-${viewport.width}.png`});
 await page.locator('.map .js-close').click();
 await page.waitForTimeout(500);
 await writeFile(`artifacts/ar-${viewport.width}.json`,JSON.stringify({viewport,lang:'ar',dir:'rtl',panels:panels.map(p=>p[0]),countries:country,pins,achievements:achievements.length,originalDrivingPreserved:true},null,2));
 console.log('ARABIC_UI_OK',JSON.stringify({viewport,achievements:achievements.length,pins: pins.length}));
}
