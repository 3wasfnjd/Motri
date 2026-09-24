// One-time, idempotent Arabic presentation migration; physics and inputs are protected.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {t,tHtml} from '../sources/localization/ar.js';
const read=p=>readFile(p,'utf8');
const hash=b=>createHash('sha256').update(b).digest('hex');
const guarded=['sources/Game/Player.js','sources/Game/View.js','sources/Game/Ticker.js','sources/Game/Physics/Physics.js','sources/Game/Physics/PhysicsVehicle.js','sources/Game/Inputs/Inputs.js','sources/Game/Inputs/Nipple.js'];
const before=await Promise.all(guarded.map(async p=>[p,hash(await readFile(p))]));
const changed=[];
async function change(path,fn){const old=await read(path),next=fn(old);if(next!==old){await writeFile(path,next);changed.push(path);}}
function once(s,from,to){if(s.includes(to))return s;assert.ok(s.includes(from),'Missing source anchor: '+from.slice(0,90));return s.replace(from,to);}
function addImport(s,line){return s.includes(line)?s:line+'\n'+s;}
function literals(s,strings){for(const value of strings){const valueEsc=value.replaceAll("'","\\'");s=s.replaceAll("'"+valueEsc+"'",JSON.stringify(t(value)));}return s;}

await change('sources/index.html',s=>{
 s=s.replace(/<html\b[^>]*>/,'<html lang="ar" dir="rtl">');
 s=s.replace(/<title>[^<]*<\/title>/,'<title>موتري 2 — النسخة العربية</title>');
 // Translate text nodes only. Never translate attributes used as identifiers.
 s=s.replace(/(<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>)/gi,m=>'\u0000'+Buffer.from(m).toString('base64')+'\u0000');
 s=s.split(/(<[^>]+>)/g).map(part=>{
   if(part.startsWith('<')||part.includes('\u0000'))return part;
   const translated=t(part);return translated===part?part:part.replace(part.trim(),translated);
 }).join('');
 s=s.replace(/\u0000([^\u0000]+)\u0000/g,(_,value)=>Buffer.from(value,'base64').toString());
 s=s.replace(/\b(placeholder|title|aria-label|alt)="([^"]*)"/g,(all,attr,value)=>`${attr}="${t(value)}"`);
 if(!s.includes('./localization/ar.css'))s=s.replace('</head>','    <link rel="stylesheet" href="./localization/ar.css">\n</head>');
 const names={home:'الرئيسية',options:'الإعدادات',controls:'طريقة التحكم',achievements:'الإنجازات',circuit:'حلبة السباق',whispers:'رسائل الزوّار',behindTheScene:'خلف الكواليس'};
 s=s.replace(/<button\b[^>]*\bclass="[^"]*js-navigation-item[^>]*>/g,tag=>{const name=tag.match(/data-name="([^"]+)"/)?.[1];return names[name]&&!tag.includes('aria-label=')?tag.slice(0,-1)+` aria-label="${names[name]}" title="${names[name]}">`:tag;});
 for(const [cls,label] of [['js-menu-trigger','فتح القائمة'],['js-map-trigger','فتح الخريطة'],['js-close','إغلاق'],['js-flag-button','اختيار علم الدولة'],['js-flag-close','إغلاق قائمة الدول'],['js-flag-remove','إزالة العلم']]){
   const expression=new RegExp('<button\\b[^>]*class="[^"\\n]*\\b'+cls+'\\b[^"\\n]*"[^>]*>','g');
   s=s.replace(expression,tag=>tag.includes('aria-label=')?tag:tag.slice(0,-1)+` aria-label="${label}">`);
 }
 s=s.replace(/contenteditable=""(?: dir="auto" aria-label="رسالتك")*/g,'contenteditable="" dir="auto" aria-label="رسالتك"');
 s=s.replaceAll('Motri2 — independent reference build based on Bruno Simon Folio 2025','موتري 2 — نسخة عربية مرجعية مبنية على مشروع برونو سايمون');
 return s;
});
await change('sources/Game/Title.js',s=>s.replace("document.title = 'Motri2' + title.join('')","document.title = 'موتري 2' + title.join('')"));
await change('sources/Game/Options.js',s=>{
 s=literals(s,['High','Low','Online','Offline']);
 for(const text of ['Your browser is <strong>not compatible</strong> with WebGPU resulting in performance loss','Enjoy the <strong>multiplayer</strong> features','Should be back soon'])s=s.replaceAll(text,t(text));
 return s;
});
await change('sources/Game/Achievements.js',s=>literals(s,['Are you sure?','Definitely?','Done!','Reset achievements']));
await change('sources/data/achievements.js',s=>{
 if(s.includes('MOTRI2_AR_ACHIEVEMENTS'))return s;
 s=addImport(s,"import {t,tHtml} from '../localization/ar.js'");
 return s.trimEnd()+'.map(([id,title,description,...rest]) => [id,t(title),tHtml(description),...rest]) // MOTRI2_AR_ACHIEVEMENTS\n';
});
await change('sources/Game/Map.js',s=>{
 s=addImport(s,"import {tHtml} from '../localization/ar.js'");
 return s.replace('${item.name}</div>','${tHtml(item.name)}</div>');
});
await change('sources/Game/Audio.js',s=>s.replace('Now playing<br />','يُشغَّل الآن<br />'));
await change('sources/Game/Server.js',s=>s.replace('>Server connected<','>تم الاتصال بالخادم<').replace('>Server disconnected<','>انقطع الاتصال بالخادم<'));
await change('sources/Game/World/Whispers.js',s=>literals(s,['Your message here']));
await change('sources/Game/utilities/time.js',s=>s.replace('`${hours}h`','`${hours} ساعة`').replace('`${minutes}m`','`${minutes} دقيقة`').replace('`${seconds}s`','`${seconds} ثانية`'));
await change('sources/Game/InputFlag.js',s=>{
 s=once(s,'        for(const _country of countriesData)','        // Arabic labels and search terms; ISO codes and stored selections stay unchanged.\n        const regions = typeof Intl.DisplayNames === \'function\' ? new Intl.DisplayNames([\'ar\'], {type:\'region\'}) : null\n        for(const _country of countriesData)');
 s=once(s,"            const imageUrl = `ui/flags/${_country[2]}.webp`","            let arabicName = _country[0]\n            try { arabicName = regions?.of(_country[2].toUpperCase()) || arabicName } catch {}\n            const imageUrl = `ui/flags/${_country[2]}.webp`");
 s=s.replace('${_country[0]} (${_country[2]})','${arabicName} (${_country[2]})');
 s=s.replace('`${_country[0]} ${_country[1]} ${_country[2]}`','`${arabicName} ${_country[0]} ${_country[1]} ${_country[2]}`');
 s=s.replace("country.terms.match(new RegExp(sanatizedValue, 'i'))","country.terms.toLocaleLowerCase().includes(sanatizedValue.toLocaleLowerCase())");
 return s;
});
await change('sources/Game/TextCanvas.js',s=>{
 s=addImport(s,"import {t,hasArabic,canvasFont} from '../localization/ar.js'");
 s=once(s,"    updateText(text)\n    {\n        this.lines = []","    updateText(text)\n    {\n        text = Array.isArray(text) ? text.map(t) : t(text)\n        this.lines = []");
 s=once(s,'        this.draw()','        this._motri2SourceFont ??= this.font\n        this.font = this.lines.some(hasArabic) ? canvasFont(this._motri2SourceFont) : this._motri2SourceFont\n        this.context.font = this.font\n        this.draw()');
 s=once(s,"            this.context.fillText(line, x, y)","            this.context.direction = hasArabic(line) ? 'rtl' : 'ltr'\n            this.context.fillText(line, x, y, Math.max(1, this.width - 4))");
 return s;
});
await change('sources/Game/InteractivePoints.js',s=>{
 s=addImport(s,"import {t,hasArabic} from '../localization/ar.js'");
 s=once(s,'        const newPosition = position.clone()','        text = t(text)\n        const arabic = hasArabic(text)\n        const newPosition = position.clone()');
 s=once(s,'        const font = `700 ${height}px "Amatic SC"`','        const font = arabic ? `700 ${height * .68}px Tahoma, Arial, sans-serif` : `700 ${height}px "Amatic SC"`');
 s=once(s,"        context.textAlign = 'start'","        context.direction = arabic ? 'rtl' : 'ltr'\n        context.textAlign = arabic ? 'right' : 'left'");
 s=once(s,'        context.fillText(text, textPaddingLeft + 1, height * 0.5 + textOffsetVertical)','        context.fillText(text, arabic ? width - textPaddingRight - 1 : textPaddingLeft + 1, height * 0.5 + textOffsetVertical)');
 return s;
});
await change('sources/Game/World/Bubble.js',s=>{
 s=addImport(s,"import {hasArabic,canvasFont} from '../../localization/ar.js'");
 s=once(s,'        const textSize = this.context.measureText(text)','        // Visitor text is not translated; support its original direction and shaping.\n        this._motri2SourceFont ??= this.font\n        this.font = hasArabic(text) ? canvasFont(this._motri2SourceFont) : this._motri2SourceFont\n        this.context.font = this.font\n        const textSize = this.context.measureText(text)');
 s=once(s,"        this.context.textAlign = 'start'","        this.context.direction = hasArabic(text) ? 'rtl' : 'ltr'\n        this.context.textAlign = hasArabic(text) ? 'right' : 'left'");
 s=once(s,'        this.context.fillText(text, this.textPaddingHorizontal + 1, this.height * 0.5 + this.textOffsetVertical)','        this.context.fillText(text, hasArabic(text) ? this.textWidth - this.textPaddingHorizontal - 1 : this.textPaddingHorizontal + 1, this.height * 0.5 + this.textOffsetVertical, this.width - this.textPaddingHorizontal * 2)');
 return s;
});
await change('sources/Game/World/Areas/CircuitArea.js',s=>{
 for(const [english,arabic] of [['OFFLINE','غير متصل'],['NO SCORE YET TODAY','لا توجد نتائج اليوم']])s=s.replace(`context.fillText('${english}', resolution * 0.5, resolution * 0.5)`,`context.direction = 'rtl'\n                    context.font = \`700 \${resolution / 17}px Tahoma, Arial, sans-serif\`\n                    context.fillText('${arabic}', resolution * 0.5, resolution * 0.5, resolution * .94)`);
 return s;
});
await change('sources/Game/World/Intro.js',s=>{
 if(s.includes('MOTRI2_AR_INTRO'))return s;
 const start=s.indexOf('            // Load, set and save texture');
 const end=s.indexOf('        this.text.updateTexture()',start);
 assert.ok(start>0&&end>start);
 const replacement=`            // MOTRI2_AR_INTRO: authored Arabic mask, not a translated screenshot.
            // Let material/mesh initialize before the first async update resolves.
            await Promise.resolve()
            let cachedTexture = this.text.textures.get(name)
            if(!cachedTexture)
            {
                const canvas = document.createElement('canvas')
                canvas.width = 1024
                canvas.height = 512
                const context = canvas.getContext('2d')
                context.fillStyle = '#000000'
                context.fillRect(0, 0, 1024, 512)
                context.fillStyle = '#ffffff'
                context.textAlign = 'center'
                context.textBaseline = 'middle'
                context.direction = 'rtl'
                context.font = '700 76px Tahoma, Arial, sans-serif'
                context.fillText('ابدأ القيادة', 512, 178, 960)
                context.font = '500 48px Tahoma, Arial, sans-serif'
                const hint = name === 'touch' ? 'المس للبدء' : name === 'mouseKeyboard' ? 'اضغط Enter أو انقر للبدء' : 'اضغط زر التأكيد للبدء'
                context.fillText(hint, 512, 285, 960)
                cachedTexture = new THREE.CanvasTexture(canvas)
                cachedTexture.flipY = false
                cachedTexture.minFilter = THREE.LinearFilter
                cachedTexture.magFilter = THREE.LinearFilter
                cachedTexture.generateMipmaps = false
                cachedTexture.name = 'ar-intro-' + name
                this.text.textures.set(name, cachedTexture)
            }
            material.outputNode = Fn(() =>
            {
                texture(cachedTexture, vec2(uv().x, uv().y.oneMinus())).r.lessThan(0.5).discard()
                return vec4(1)
            })()
            material.needsUpdate = true
            mesh.visible = true
        }

`;
 return s.slice(0,start)+replacement+s.slice(end);
});
const displayFiles=['sources/index.html','sources/Game/Title.js','readme.md','sources/Game/Options.js','sources/Game/Achievements.js','sources/data/achievements.js','sources/Game/Map.js','sources/Game/Audio.js','sources/Game/Server.js','sources/Game/World/Whispers.js','sources/Game/utilities/time.js','sources/Game/InputFlag.js','sources/Game/TextCanvas.js','sources/Game/InteractivePoints.js','sources/Game/World/Bubble.js','sources/Game/World/Areas/CircuitArea.js','sources/Game/World/Intro.js'];
await change('scripts/motri2-check.mjs',s=>{
 s=s.replace(/const allowed=new Set\(\[[^\n]*\]\);/,'const allowed=new Set('+JSON.stringify(displayFiles)+');');
 s=addImport(s,"import {checkArabicInterface} from './motri2-ar-check.mjs';");
 if(!s.includes('await checkArabicInterface(page,viewport)'))s=s.replace('      await page.screenshot({path:`artifacts/motri2-${viewport.width}.png`});','      await checkArabicInterface(page,viewport);\n      await page.screenshot({path:`artifacts/motri2-${viewport.width}.png`});');
 return s;
});
await change('readme.md',s=>s.includes('## التعريب')?s:s.replace('## نطاق المرحلة الحالية',`## التعريب

النسخة العربية تعرّب القوائم والتعليمات والإنجازات والإشعارات والخريطة وعناوين التفاعل داخل المشهد وشاشة البدء ولوحة نتائج السباق. تدعم أسماء الدول والبحث عنها بالعربية، مع الاحتفاظ بمفاتيح التحكم ورموز الدول والحفظ كما هي. الخط العربي من خطوط النظام؛ لا أصول مدفوعة أو خدمات ترجمة وقت التشغيل.

النصوص المزخرفة المدمجة هندسيًا داخل بعض المجسمات، وأسماء المشاريع والعلامات والشعارات الأصلية، تبقى جزءًا من أصول برونو المرجعية؛ لم نغيّر ملفات GLB أو الصور لإخفاء نسبتها. ليست هذه ترجمة لأصوات أو محتوى المواقع الخارجية.

التغييرات في العرض والنصوص فقط: تظل ملفات السيارة والفيزياء وPlayer والمدخلات والكاميرا والتوقيت والأصول مطابقة للقاعدة. اختبارات المصدر والقيادة باقية، وتضاف إليها اختبارات القوائم العربية واتجاه النص وعناوين التفاعل. لا يزال اختبار آيفون الفعلي مطلوبًا.

## نطاق المرحلة الحالية`));
for(const [path,expected] of before)assert.equal(hash(await readFile(path)),expected,'Protected driving file changed: '+path);
console.log('ARABIC_MIGRATION',JSON.stringify({changed,protectedDriving:guarded.length}));
