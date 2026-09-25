// Idempotent migration: presentation and personal outbound links only.
// It intentionally retains upstream source assets, copyright notices and gameplay code.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const read=p=>readFile(p,'utf8');
const write=(p,s)=>writeFile(p,s.endsWith('\n')?s:s+'\n');
const changed=[];
async function edit(p,fn){const old=await read(p),next=fn(old);if(next!==old){await write(p,next);changed.push(p);}}
function once(text,from,to){if(text.includes(to))return text;assert.ok(text.includes(from),'Missing migration anchor: '+from.slice(0,100));return text.replace(from,to);}
const marker='MOTRI2_IDENTITY_APPLIED';
await mkdir('static/identity',{recursive:true});

await edit('sources/index.html',s=>{
 if(s.includes(marker))return s;
 s=s.replace(/<aside id="motri2-reference"[\s\S]*?<\/aside>/,'<!-- '+marker+': attribution is retained in credits and license.md. -->');
 s=s.replaceAll('موتري 2 — نسخة عربية مرجعية مبنية على مشروع برونو سايمون','موتري 2 — عالم قيادة واستكشاف وتحديات');
 s=s.replace(/(<div class="js-content content home-content">\s*<div class="content-inner">)[\s\S]*?(\s*<\/div>\s*<\/div>\s*<!-- Options -->)/,'$1\n<div class="title">موتري 2</div><p class="text">مرحبًا بك في موتري 2.</p><p class="text">تجوّل بالسيارة، استكشف العالم وجرّب الحلبة والبولينغ والتفاعلات والإنجازات.</p><p class="text">محتوى قاعات العرض والروابط الخارجية غير مهيّأ حاليًا؛ بقية الأنشطة باقية.</p>$2');
 s=s.replace(/(<div class="js-content content behindTheScene-content">\s*<div class="content-inner">)[\s\S]*?(\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>)/,'$1\n<div class="title">خلف الكواليس</div><p class="text">معلومات تقنية عن موتري 2.</p><h2 class="title">العرض والفيزياء</h2><p class="text">Three.js لعرض العالم ثلاثي الأبعاد، وRapier لمحاكاة السيارة والتصادمات، وHowler.js للصوت.</p><h2 class="title">الخدمات</h2><p class="text">إعدادات الشبكة لم تتغير. تعرض الإعدادات حالة الاتصال، وتبقى الأنشطة المحلية متاحة.</p><h2 class="title">المصادر والحقوق</h2><p class="text">تعتمد هذه النسخة على مكونات مفتوحة المصدر. حقوق مؤلفيها وتراخيصها محفوظة في <a href="./credits.html" target="_blank" rel="noreferrer">إشعارات المصدر والترخيص</a>.</p>$2');
 const start=s.indexOf('<!-- Discord -->'),end=s.indexOf('<!-- Map -->',start);
 assert.ok(start>=0&&end>start);
 s=s.slice(0,start)+`<!-- Discord: same modal ID, no unconfigured external buttons. -->
 <div class="js-modal modal discord" data-name="discord"><div class="container"><div class="content">
 <button class="js-close close" aria-label="إغلاق"><img class="icon is-default" src="ui/close.svg" loading="lazy"><span class="icon is-xbox">A</span></button>
 <div class="title">التواصل الخارجي</div><div class="items"><div class="item"><div class="title-container"><div class="title">الخادم العام</div></div><p>لم يتم ربط حسابات أو مجتمع خارجي لهذه النسخة.</p><p>الروابط الشخصية السابقة معطّلة. لا يوجد إجراء إرسال أو انتقال خارجي هنا.</p></div></div>
 </div></div></div>\n`+s.slice(end);
 // The options preview contains large personal lettering. Reuse the neutral car preview.
 s=s.replace('src="ui/previews/options.webp"','src="ui/previews/home.webp"');
 s=s.replaceAll('/social/share-image.png?cb=a','/identity/share.png');
 s=s.replace('href="./favicons/favicon-96x96.png"','href="./identity/icon-96.png"')
    .replace('href="./favicons/favicon.svg"','href="./identity/icon.svg"')
    .replace(/\s*<link rel="shortcut icon"[^>]+>/,'')
    .replace('href="./favicons/apple-touch-icon.png"','href="./identity/icon-180.png"')
    .replace('href="./favicons/site.webmanifest"','href="./identity/site.webmanifest"');
 assert.ok(!/برونو|سايمون|Bruno|bruno-simon|threejs-journey|discord\.com\//i.test(s));
 return s;
});

const projects=(await import('../sources/data/projects.js')).default;
const lab=(await import('../sources/data/lab.js')).default;
const social=(await import('../sources/data/social.js')).default;
const projectSlots=projects.map((p,i)=>({title:`لوحة فارغة ${i+1}`,titleSmall:['لوحة فارغة',String(i+1)],url:'',attributes:{},distinctions:[],images:p.images.map((_,n)=>`motri2-empty-${i+1}-${n+1}.png`)}));
const labSlots=lab.map((p,i)=>({title:`لوحة فارغة ${i+1}`,url:'',image:`motri2-empty-${i+1}.png`,imageMini:`motri2-empty-${i+1}-mini.png`}));
await edit('sources/data/projects.js',()=> '// Empty presentation slots; counts remain compatible with existing navigation and achievements.\nexport default '+JSON.stringify(projectSlots,null,2)+';\n');
await edit('sources/data/lab.js',()=> '// No personal portfolio content or external destination is configured.\nexport default '+JSON.stringify(labSlots,null,2)+';\n');
await edit('sources/data/social.js',()=> '// Keep the eight interaction positions without linking to personal accounts.\nexport default '+JSON.stringify(social.map(p=>({name:p.name.replace(/ — غير مهيّأ$/,'')+' — غير مهيّأ',url:'',modal:'discord',align:p.align})),null,2)+';\n');

for(const file of ['ProjectsArea','LabArea'])await edit(`sources/Game/World/Areas/${file}.js`,s=>{
 if(s.includes('MOTRI2_EMPTY_GALLERY'))return s;
 s="import {placeholderImageLoader} from '../../../identity/Presentation.js' // MOTRI2_EMPTY_GALLERY\n"+s;
 s=s.replaceAll("const loader = this.game.resourcesLoader.getLoader('textureKtx')",'const loader = placeholderImageLoader');
 s=s.replaceAll("this.navigation.current.url.replace(/https?:\\/\\//, '')","(this.navigation.current.url || '').replace(/https?:\\/\\//, '')");
 s=s.replace("this.url.group = this.references.items.get('url')[0]","this.url.group = this.references.items.get('url')[0]\n        this.url.group.visible = false // No misleading link panel for an empty slot");
 s=s.replaceAll('this.url.intersect.active = true','this.url.intersect.active = Boolean(this.navigation.current.url)');
 s=s.replaceAll("['previous', 'next', 'open', 'close']","['previous', 'next', 'close']");
 return s;
});
await edit('sources/Game/World/Areas/TimeMachineArea.js',s=>once(s,"window.open('https://2019.bruno-simon.com')","this.game.notifications.show('<div class=\"top\"><div class=\"title\">الانتقال الخارجي غير مفعّل</div></div>', 'motri2-link-disabled', 3, null, 'motri2-link-disabled')"));
await edit('sources/Game/World/Areas/CareerArea.js',s=>once(s,'        this.setYears()','        this.setYears()\n        // Hide personal timeline dates; keep the panel movement and all area interactions.\n        for(const digit of this.year.digits) digit.mesh.visible = false'));
await edit('sources/Game/World/Areas/SocialArea.js',s=>s.replace('else(link.modal)','else if(link.modal)'));

await edit('sources/Game/ResourcesLoader.js',s=>{
 if(s.includes('identityResourceTexture'))return s;
 s="import {identityResourceTexture,neutralizeIdentityModel} from '../identity/Presentation.js'\n"+s;
 s=once(s,'            const save = (_file, _resource) =>\n            {','            const save = (_file, _resource) =>\n            {\n                if(_file[2] === \'gltf\' && _resource.scene) neutralizeIdentityModel(_resource.scene)');
 s=once(s,'                // In cache','                // Replace presentation textures before fetching any personal content.\n                const identityTexture = identityResourceTexture(_file[1])\n                if(identityTexture) { save(_file, identityTexture); progress(); continue }\n\n                // In cache');
 return s;
});
await edit('sources/index.js',s=>s.replace("import consoleLog from './data/consoleLog.js'",'// Original author notices remain in credits; no personal promotional console banner.')
 .replace(/if\(import\.meta\.env\.VITE_LOG\)[\s\S]*?(?=if\(import\.meta\.env\.VITE_GAME_PUBLIC\))/,"if(import.meta.env.VITE_LOG) console.info('MOTRI 2')\n\n"));
await edit('sources/localization/ar.json',s=>{
 const d=JSON.parse(s);for(const [k,v] of Object.entries(d))if(/bruno|simon|journey|برونو|سايمون|معرض أعمالي/i.test(k+' '+v))delete d[k];
 d.Career='قاعة العرض';d['Time Machine']='آلة الزمن — رابط معطّل';return JSON.stringify(d,null,2)+'\n';
});
await edit('sources/localization/ar.js',s=>s.replace("const additional = Object.freeze({'OnlyFans':'مراوح فقط','10 ans':'10 سنوات','Bonhomme | 10 ans':'Bonhomme | 10 سنوات'});","const additional = Object.freeze({'OnlyFans':'مراوح فقط'});"));
await edit('sources/Game/Map.js',s=>s.replaceAll('المسيرة المهنية','قاعة العرض'));

// Preserve required notices in a separate, locally hosted page and the original license.
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const license=await read('license.md');
await write('static/credits.html',`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>المصادر والحقوق — موتري 2</title><style>body{max-width:850px;margin:40px auto;padding:20px;background:#15252e;color:#e6eee9;font:16px/1.8 Tahoma,Arial,sans-serif}pre{direction:ltr;text-align:left;white-space:pre-wrap;font:14px/1.7 monospace}a{color:#9ce5c5}</style><h1>المصادر والحقوق</h1><p>موتري 2 مبني على Folio 2025 من Bruno Simon. إزالة المحتوى الشخصي من اللعب لا تغيّر حقوق المصدر ولا تنسب تصميمه الأصلي إلى المشروع الجديد.</p><p>المصدر المرجعي: brunosimon/folio-2025 عند 41046b57eeed8d156d9c3fd7fa259900baef7816. ملفات الترخيص والأصول الأصلية محفوظة في المستودع.</p><p>Three.js وRapier وHowler.js ومكتباتها تحتفظ بتراخيصها. الموسيقى: Kounine، وفق إشعار CC0 في المصدر. لا يُعاد ترخيص الأصول التابعة لأطراف أخرى.</p><pre>${escape(license)}</pre><p><a href="./">العودة إلى اللعبة</a></p></html>`);
const icon='<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><title>Motri</title><rect width="512" height="512" rx="110" fill="#172832"/><path d="M90 400L200 100M422 400L312 100" stroke="#80baa1" stroke-width="22"/><path d="M158 340V174h38l60 100 60-100h38v166h-38v-94l-48 78h-24l-48-78v94Z" fill="#edf3e9"/></svg>';
await write('static/identity/icon.svg',icon);
for(const size of [96,180,192,512])await sharp(Buffer.from(icon)).resize(size,size).png().toFile(`static/identity/icon-${size}.png`);
const share='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#172832"/><path d="M100 630L420 0M1100 630L780 0" stroke="#456e60" stroke-width="28"/><text x="600" y="348" text-anchor="middle" fill="#edf3e9" font-family="Arial,sans-serif" font-weight="bold" font-size="130">MOTRI</text></svg>';
await sharp(Buffer.from(share)).png().toFile('static/identity/share.png');
await write('static/identity/site.webmanifest',JSON.stringify({name:'موتري',short_name:'موتري',lang:'ar',dir:'rtl',start_url:'../',scope:'../',display:'standalone',background_color:'#172832',theme_color:'#172832',icons:[192,512].map(size=>({src:`icon-${size}.png?v=motri-20260925`,sizes:`${size}x${size}`,type:'image/png'}))},null,2));

// Extend the explicit presentation allowlist; all driving, colliders and original binary assets remain hash-checked.
const allowed=['sources/index.js','sources/Game/ResourcesLoader.js','sources/data/projects.js','sources/data/lab.js','sources/data/social.js','sources/Game/World/Areas/ProjectsArea.js','sources/Game/World/Areas/LabArea.js','sources/Game/World/Areas/SocialArea.js','sources/Game/World/Areas/CareerArea.js','sources/Game/World/Areas/TimeMachineArea.js'];
for(const p of ['scripts/motri2-check.mjs','scripts/motri2-localization-smoke.mjs'])await edit(p,s=>{
 if(!s.includes('MOTRI2_IDENTITY_ALLOWLIST'))s=once(s,'const changed=',`// MOTRI2_IDENTITY_ALLOWLIST: reviewed presentation and outbound-link changes only.\n${JSON.stringify(allowed)}.forEach(p=>allowed.add(p));\nconst changed=`);
 s=s.replaceAll('عالم برونو','موتري 2');
 if(p.endsWith('localization-smoke.mjs')&&!s.includes('verifyIdentity')){
  s="import {verifyIdentity} from './motri2-identity-check.mjs';\n"+s;
  s=once(s,"    const close=page.locator", "    await verifyIdentity(page);\n    const close=page.locator");
 }
 return s;
});
await edit('scripts/motri2-ar-check.mjs',s=>s.replaceAll('عالم برونو','موتري 2'));
await edit('scripts/motri2-prepare.mjs',s=>{
 if(s.includes('MOTRI2_IDENTITY_APPLIED'))return s;
 return once(s,"let html=await read('sources/index.html');","let html=await read('sources/index.html');\nif(html.includes('MOTRI2_IDENTITY_APPLIED')) process.exit(0); // Do not restore retired identity.");
});
await edit('readme.md',s=>{
 if(s.includes('## الهوية الحالية'))return s;
 return '# موتري 2 — Motri2\n\n## الهوية الحالية\n\nأزيلت الهوية والمحتويات الشخصية والروابط الخارجية السابقة من واجهة اللعب. المناطق الثلاث عشرة والأنشطة والخريطة والإنجازات والخدمات وإعداداتها باقية. قاعات المعارض تعرض أماكن فارغة صريحة، لا مشاريع جديدة مختلقة. انتقال آلة الزمن الخارجي معطّل، وتفاعل التلفاز محفوظ.\n\nتستبدل طبقة عرض مستقلة أحرف الاسم بقطع تفاعلية محايدة، والتمثال الشخصي بمجسم تجريدي، ولافتة الحلبة ومواد المسيرة والتلفاز بصور محايدة. أجسام التصادم والكتل والمواقع والتعليق والقيادة لم تتغير. تبقى ملفات GLB والأصوات الأصلية محفوظة للمرجعية، لكن المحتوى الشخصي المستبدل لا يُعرض.\n\nإشعارات المصدر في static/credits.html وlicense.md. آلية اختبار النشر تتحقق من سلامة القيادة ومكونات العالم وإزالة الوجهات الشخصية. الخدمات الشبكية لم تُفعّل أو تُحذف ضمن هذا التعديل.\n\n---\n\n## سجل التأسيس والمصدر (مرجعي، لا يظهر داخل اللعبة)\n\n'+s;
});
await write('.motri2/identity.json',JSON.stringify({scope:'presentation-and-personal-links-only',baseline:'7e5de4072de80de5e25d6c5cd3d27cd5e5b23fd1',projects:projects.length,lab:lab.length,social:social.length,areas:13,licenseSha256:createHash('sha256').update(license).digest('hex'),originalAssetsPreserved:true,physicsChanged:false,serviceConfigurationChanged:false},null,2));
console.log('IDENTITY_MIGRATION',JSON.stringify({changed,projectSlots:projects.length,labSlots:lab.length,socialPoints:social.length}));
