import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import achievements from '../sources/data/achievements.js';
import {t,tHtml,hasArabic} from '../sources/localization/ar.js';
// Translation never changes action IDs, URLs, achievements or visitor text.
assert.equal(t('Controls'),'طريقة التحكم');
assert.equal(t('Start race!'),'ابدأ السباق!');
assert.equal(t('OnlyFans'),'مراوح فقط');
assert.equal(t('KeyW'),'KeyW');
assert.equal(t('https://example.com'),'https://example.com');
assert.equal(t('مرحبا بالمستكشف'),'مرحبا بالمستكشف');
assert.ok(tHtml('Reach <strong>15 meters</strong> high.').includes('<strong>15 مترًا</strong>'));
assert.equal(achievements.length,36);
for(const [id,title,description,target] of achievements){
  assert.ok(/^[a-zA-Z]+$/.test(id));assert.ok(hasArabic(title),'Untranslated title: '+title);
  assert.ok(hasArabic(description),'Untranslated description: '+description);assert.ok(Number.isFinite(target));
}
const introSource=await readFile('sources/Game/World/Intro.js','utf8');
assert.ok(introSource.includes('ar-intro-')&&introSource.includes('ابدأ القيادة'));
const labelSource=await readFile('sources/Game/InteractivePoints.js','utf8');
assert.ok(labelSource.includes('text = t(text)')&&labelSource.includes("arabic ? 'right' : 'left'"));

async function reachable(locator,viewport,label){
  const r=await locator.evaluate(e=>{
    const b=e.getBoundingClientRect();
    const hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
    return {x:b.x,y:b.y,width:b.width,height:b.height,hit:e===hit||e.contains(hit)};
  });
  assert.ok(r.x>=-1&&r.y>=-1&&r.x+r.width<=viewport.width+1&&r.y+r.height<=viewport.height+1,label+' outside screen '+JSON.stringify(r));
  assert.ok(r.hit,label+' blocked by another element '+JSON.stringify(r));
  return r;
}
export async function checkArabicInterface(page,viewport){
  assert.equal(await page.locator('html').getAttribute('lang'),'ar');
  assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
  assert.ok((await page.title()).includes('موتري 2'));
  assert.ok((await page.locator('.js-menu-trigger').getAttribute('aria-label')).includes('القائمة'));
  await page.locator('.js-menu-trigger').click();
  await page.waitForFunction(()=>window.game.menu.state===1,null,{timeout:30000});
  const close=page.locator('.js-menu .inner > .js-close');
  const panels=[['home','موتري 2'],['options','الإعدادات'],['controls','طريقة التحكم'],['achievements','الإنجازات'],['circuit','حلبة السباق'],['behindTheScene','خلف الكواليس'],['whispers','اترك رسالة']];
  for(const [name,title] of panels){
    const button=page.locator(`.js-menu .js-navigation-item[data-name="${name}"]`);
    await reachable(button,viewport,name+' tab');await button.click();
    await page.waitForFunction(n=>window.game.menu.current.name===n,name,{timeout:15000});
    const panel=page.locator(`.js-menu .${name}-content`);await page.waitForTimeout(400);
    assert.ok((await panel.innerText()).includes(title),name+' translated');
    assert.equal(await panel.evaluate(e=>getComputedStyle(e).direction),'rtl');
    const layout=await panel.evaluate(e=>({scroll:e.scrollWidth,width:e.clientWidth}));
    assert.ok(layout.scroll<=layout.width+2,name+' horizontal overflow '+JSON.stringify(layout));
    await reachable(close,viewport,'Close on '+name);
    if(name==='controls'){
      for(const tab of ['mouse-keyboard','gamepad','touch']){
        await panel.locator(`.js-tabs-navigation-item[data-tabs-name="${tab}"]`).click();
        const content=panel.locator(`.js-tabs-content-item[data-tabs-name="${tab}"]`);
        await page.waitForFunction(n=>document.querySelector(`.controls-content .js-tabs-content-item[data-tabs-name="${n}"]`).classList.contains('is-active'),tab);
        const text=await content.innerText();
        if(tab==='mouse-keyboard')assert.ok(text.includes('WASD')&&text.includes('SHIFT')&&text.includes('تحريك السيارة'));
        if(tab==='gamepad')assert.ok(text.includes('العصا اليسرى')&&text.includes('التقدم للأمام'));
        if(tab==='touch')assert.ok(text.includes('إصبع واحد')&&text.includes('إصبعان'));
      }
    }
    if(name==='options')assert.ok((await panel.innerText()).includes('غير متصل'));
    if(name==='achievements')assert.ok((await panel.innerText()).includes('حان وقت المغامرة!'));
    if(['options','controls','achievements'].includes(name))await page.screenshot({path:`artifacts/ar-${name}-${viewport.width}.png`});
  }
  // Country names are Arabic, while ISO codes and English search still work.
  const country=await page.evaluate(()=>{
    const f=window.game.world.whispers.menu.inputFlag,sa=f.countries.get('sa');
    const search=value=>{f.searchElement.value=value;f.searchElement.dispatchEvent(new Event('input',{bubbles:true}));return sa.element.style.display!=='none';};
    return {text:sa.element.textContent,terms:sa.terms,arabic:search('السعودية'),english:search('Saudi')};
  });
  assert.ok(country.text.includes('السعودية')&&country.terms.includes('Saudi')&&country.arabic&&country.english);
  const visitor=page.locator('.whispers-content input[name="message"]');
  await visitor.fill('رحلة جميلة');
  assert.equal(await page.locator('.js-preview-message .js-text').innerText(),'رحلة جميلة');
  await visitor.fill('Welcome');
  assert.equal(await page.locator('.js-preview-message .js-text').innerText(),'Welcome','Visitor text must not be translated');
  await close.click();await page.waitForFunction(()=>window.game.menu.state===3,null,{timeout:30000});
  // Reopening and closing must work after the localized panel changes.
  await page.locator('.js-menu-trigger').click();
  await page.waitForFunction(()=>window.game.menu.state===1);
  await reachable(close,viewport,'Reopened close');await close.click();
  await page.waitForFunction(()=>window.game.menu.state===3);
  await page.locator('.js-map-trigger').click();
  await page.waitForFunction(()=>window.game.map.initiated,null,{timeout:15000});
  const pins=(await page.locator('.map .location .name').allTextContents()).map(s=>s.trim());
  assert.equal(pins.length,12);assert.ok(pins.every(hasArabic));
  assert.ok(pins.includes('نقطة البداية')&&pins.includes('المختبر')&&pins.includes('المشاريع'));
  await page.waitForTimeout(450);await page.screenshot({path:`artifacts/ar-map-${viewport.width}.png`});
  await page.locator('.map .js-close').click();await page.waitForTimeout(450);
  // Exercise the existing dialogs as UI checks, without submitting to a server.
  for(const [name,text] of [['circuit-end','زمنك'],['discord','الخادم العام']]){
    await page.evaluate(n=>window.game.modals.open(n),name);
    const modal=page.locator(`.js-modal[data-name="${name}"]`);
    await modal.waitFor({state:'visible'});await page.waitForTimeout(450);
    assert.ok((await modal.innerText()).includes(text));
    const dismiss=modal.locator('.js-close');await reachable(dismiss,viewport,name+' close');
    await dismiss.click();await modal.waitFor({state:'hidden'});
  }
  const draws=await page.evaluate(()=>window.__arabicDraws||[]);
  for(const expected of ['ابدأ القيادة','المختبر','ابدأ السباق!','خذ قطعة بسكويت','مراوح فقط'])
    assert.ok(draws.some(d=>d.text===expected&&d.direction==='rtl'),'Missing Arabic canvas label '+expected);
  const report={viewport,lang:'ar',dir:'rtl',panels:panels.map(p=>p[0]),country,pins,achievements:achievements.length,menuCloseReachable:true,visitorTextPreserved:true,dialogs:true,canvasLabels:[...new Set(draws.map(d=>d.text))],originalDrivingPreserved:true};
  await writeFile(`artifacts/ar-${viewport.width}.json`,JSON.stringify(report,null,2));
  console.log('ARABIC_UI_OK',JSON.stringify({viewport,panels:panels.length,achievements:achievements.length,pins:pins.length}));
}
