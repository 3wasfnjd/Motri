// Idempotent follow-up for Arabic readability and authored markup only.
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const read=p=>readFile(p,'utf8');
let migration=await read('scripts/motri2-localize.mjs');
const old=`s=s.replace('contenteditable=""','contenteditable="" dir="auto" aria-label="رسالتك"');`;
const fixed=`s=s.replace(/contenteditable=""(?: dir="auto" aria-label="رسالتك")*/g,'contenteditable="" dir="auto" aria-label="رسالتك"');`;
assert.ok(migration.includes(old)||migration.includes(fixed));
await writeFile('scripts/motri2-localize.mjs',migration.replace(old,fixed));
let html=await read('sources/index.html');
html=html.replace(/contenteditable=""(?: dir="auto" aria-label="رسالتك")*/g,'contenteditable="" dir="auto" aria-label="رسالتك"');
if(!html.includes('id="motri2-controls-title"')){
 const anchor='<div class="js-content content controls-content">\n                            <div class="content-inner">';
 assert.ok(html.includes(anchor));
 html=html.replace(anchor,anchor+'\n                                <div class="title" id="motri2-controls-title">طريقة التحكم</div>');
}
await writeFile('sources/index.html',html);
let css=await read('sources/localization/ar.css');
if(!css.includes('MOTRI2_AR_READABILITY'))css+=`
/* MOTRI2_AR_READABILITY: preserve physical tabs/pins while improving Arabic text. */
html[lang="ar"] #motri2-controls-title{margin:0 0 14px;}
html[lang="ar"] .menu .contents .controls-content .list{white-space:normal;width:100%;}
html[lang="ar"] .menu .contents .controls-content .list table{width:100%;border-spacing:0 8px;}
html[lang="ar"] .menu .contents .controls-content td{padding:8px 6px;vertical-align:middle;line-height:1.7;}
html[lang="ar"] .menu .contents .controls-content td:first-child{width:54%;text-align:right;padding-right:0;}
html[lang="ar"] .controls-content .tabs-navigation .tab{height:auto;min-height:78px;padding:8px 3px;}
html[lang="ar"] .controls-content .tabs-navigation .label{font-size:12px;line-height:1.65;white-space:normal;}
html[lang="ar"] .menu .contents .achievements-content .achievement .title{font-size:1.08rem;text-align:right;line-height:1.75;}
html[lang="ar"] .achievements-content .global-progress.is-achieved .time::before{content:'خلال ';}
html[lang="ar"] .map .location .name{font-size:18px;letter-spacing:0;line-height:1.5;}
html[lang="ar"].input-filter-menu #motri2-reference,html[lang="ar"].input-filter-modal #motri2-reference{display:none;}
@media(max-width:440px){html[lang="ar"] .menu .contents .controls-content .list{font-size:12px;}html[lang="ar"] .controls-content .tabs-navigation .label{font-size:11px;}}
`;
await writeFile('sources/localization/ar.css',css);
let test=await read('scripts/motri2-check.mjs');
if(!test.includes('No runtime errors after Arabic UI interactions'))test=test.replace('await checkArabicInterface(page,viewport);','await checkArabicInterface(page,viewport);\n      assert.deepEqual(errors,[],\'No runtime errors after Arabic UI interactions\');');
await writeFile('scripts/motri2-check.mjs',test);
console.log('ARABIC_READABILITY_READY');
