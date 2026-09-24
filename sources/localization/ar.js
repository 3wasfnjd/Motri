// Arabic presentation only. Never translate action IDs, storage keys or user input.
import dictionary from './ar.json' with {type:'json'};
export const hasArabic = text => /[\u0600-\u06ff]/u.test(String(text));
export function t(value) {
  if(typeof value !== 'string')return value;
  const key=value.replace(/\s+/gu,' ').trim();
  if(Object.hasOwn(dictionary,key))return dictionary[key];
  if(/^\d+h\s+\d+min\s+\d+s$/.test(key))return key.replace('h',' ساعة').replace('min',' دقيقة').replace('s',' ثانية');
  return value;
}
export function tHtml(value) {
  const direct=t(value);
  if(direct!==value)return direct;
  // Used exclusively for authored descriptions, not visitor messages.
  return value.replace(/(^|>)([^<>]+)(?=<|$)/g,(all,prefix,text)=>{
    const translated=t(text);
    return translated===text?all:prefix+text.replace(text.trim(),translated);
  });
}
export function canvasFont(font, factor=.68) {
  const match=String(font).match(/([\d.]+)px/);
  const size=match?Number(match[1])*factor:40;
  return `700 ${size}px Tahoma, Arial, sans-serif`;
}
export const locale='ar';
