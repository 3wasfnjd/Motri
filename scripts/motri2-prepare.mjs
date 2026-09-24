// Deployment/identity adaptation only. Never rewrites vehicle, input or world code.
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const read=p=>readFile(p,'utf8');
const origin='https://3wasfnjd.github.io/Motri2/';
let html=await read('sources/index.html');
if(!html.includes('MOTRI2_REFERENCE_BASELINE')) {
  assert.ok(html.includes('<title>Bruno\'s</title>'));
  let [head,...body]=html.split('</head>');
  // Do not send visits to the original author's Google Analytics property.
  head=head.replace(/\s*<!-- Analytics -->[\s\S]*$/,'\n');
  assert.ok(!head.includes('googletagmanager.com'));
  head=head.replace('<title>Bruno\'s</title>','<title>موتري 2 — نسخة مرجعية</title>')
    .replaceAll("Bruno Simon's creative portfolio",'Motri2 — independent reference build based on Bruno Simon Folio 2025')
    .replaceAll('content="Bruno Simon"','content="Motri2"')
    .replace('content="Three.js Journey"','content="Motri2"')
    .replace('content="Bruno\'s"','content="Motri2"')
    .replaceAll('https://bruno-simon.com/',origin)
    .replaceAll('href="/','href="./');
  html=head+'</head>'+body.join('</head>');
  html=html.replace('<body>',`<body>
    <!-- MOTRI2_REFERENCE_BASELINE: the world and driving remain upstream. -->
    <aside id="motri2-reference" dir="rtl" style="position:fixed;bottom:calc(8px + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);z-index:100;pointer-events:none;background:#14212bd9;color:#fff;border-radius:10px;padding:6px 12px;max-width:90vw;width:max-content;font:11px/1.5 Arial,sans-serif;text-align:center">موتري 2 · نسخة مرجعية للتجربة<br>القاعدة الأصلية: Bruno Simon</aside>`);
  await writeFile('sources/index.html',html);
}
let title=await read('sources/Game/Title.js');
title=title.replace("document.title = 'Bruno' + title.join('')","document.title = 'Motri2' + title.join('')");
await writeFile('sources/Game/Title.js',title);
// All values below are public build settings, not credentials.
await writeFile('.env.production',`VITE_SERVER_URL=\nVITE_ANALYTICS_TAG=\nVITE_GAME_PUBLIC=1\nVITE_COMPRESSED=1\nVITE_DAY_CYCLE_PROGRESS=\nVITE_YEAR_CYCLE_PROGRESS=\nVITE_WHISPERS_COUNT=30\nVITE_MUSIC=1\nVITE_LOG=1\nVITE_PLAYER_SPAWN=\n`);
let readme=await read('readme.md');
if(!readme.includes('# موتري 2')) {
  readme=`# موتري 2 — Motri2

نسخة مستقلة مرجعية مبنية على مستودع Bruno Simon \\`brunosimon/folio-2025\\` عند الإصدار \\`41046b57eeed8d156d9c3fd7fa259900baef7816\\`.

**مستودع موتري السابق لم يتغير.** لا تعتمد هذه النسخة عليه ولا تحمل سيارتي GMC منه.

## نطاق هذه المرحلة

نقل المصدر وأصوله وملفات Blender، وتشغيل سيارة سايمون وقيادتها وكاميرتها والعالم الأصلي أولًا. هذه ليست غرفة المغامرة الجديدة أو النسخة النهائية للعبة. أبقينا محتوى العالم الأصلي للمرجعية؛ لا ننسب تصميمه إلى موتري.

تحكم الجوال الأصلي: إصبع واحد حول السيارة لتحديد الاتجاه والدعسة، وإصبعان للكاميرا. لم نُدخل المقود والدعسة المنفصلين بعد. الكيبورد: WASD أو الأسهم، B فرامل، Shift تعزيز، R إعادة، Space تعليق/قفز بحسب كود المصدر.

الفيزياء: Rapier، وأربع عجلات Raycast. لا تغييرات على إعدادات القيادة أو الفيزياء أو موديل السيارة أو توقيت تحديثها. يحتفظ الملف \\`.motri2/upstream.json\\` ببصمات SHA-256 لكل ملفات المصدر المستوردة للتحقق من ذلك.

## تغييرات الاستضافة فقط

تحديد هوية النسخة في عنوان الصفحة وشريط مرجعي صغير، وتصحيح روابط تهيئة الصفحة للعمل داخل مسار Motri2، وإزالة تحليلات الموقع الأصلي. تُترك وصلة السيرفر فارغة؛ اللعب المحلي مستقل عن سيرفر برونو، والخدمات الشبكية المشتركة ليست مفعلة. أصول العالم موجودة محليًا؛ الخطوط الخارجية في المصدر ما زالت تطلب Google Fonts.

البناء والنشر والاختبارات في \\`.github/workflows/pages.yml\\`. يجب الحكم على الأداء وإحساس القيادة بعد التجربة على آيفون فعلي؛ اختبار Chromium الآلي ليس اختبار Safari أو WebGPU على الهاتف.

## التشغيل

\\`npm ci --force --ignore-scripts\\` ثم \\`npm run dev\\`؛ وللبناء \\`npm run build\\`. إعدادات النشر العامة في \\`.env.production\\`. للتطوير بنفس الخيارات يمكن نسخها إلى \\`.env.local\\` دون إضافة مفاتيح خاصة.

## المصدر والحقوق

الترخيص الأصلي \\`license.md\\` محفوظ باسم Bruno Simon، وحقوق الأصول والمكتبات لا تُحذف. هذه قاعدة اختبار وليست تصريحًا بإعادة ترخيص جميع أصول الأطراف الأخرى. لا شراء ولا توليد أصول ضمن هذه الخطوة.

---

## توثيق المصدر الأصلي

` .replaceAll('\\`','`')+readme;
  await writeFile('readme.md',readme);
}
console.log('MOTRI2_PREPARE: public identity, relative paths and no original analytics/server. Vehicle code unchanged.');
