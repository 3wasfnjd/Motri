// Format the supplied/generated photographic posters for the existing Lab boards.
// Creative artwork comes from the posters; this script only lays out readable
// board labels and exports budgeted WebP derivatives. No runtime dependency added.
import sharp from 'sharp'
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import lab from '../sources/data/lab.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const sourceDir = path.join(root, 'resources/lab-cards/neon')
const outputDir = path.join(root, 'static/lab/images')
await mkdir(outputDir, { recursive: true })
const cards = [
    { slug: 'drift', lines: ['حلبة', 'الدرفت'], detail: 'عرض سيارات في عالمك', hero: [.045, .07, .91, .50] },
    { slug: 'balloons', lines: ['صيد', 'المناطيد'], detail: 'صوّب وأطلق', hero: [.04, .115, .92, .49] },
    { slug: 'horror', lines: ['الرعب', 'المتجول'], detail: 'تجربة واقع معزز مرعبة', hero: [.035, .015, .93, .55] },
    { slug: 'basketball', lines: ['رماية', 'السلة'], detail: 'سدّد الكرة وسجّل', hero: [.025, .035, .95, .555] },
    { slug: 'laser', lines: ['عرض', 'الليزر'], detail: 'أشعة وألوان في عالمك', hero: [.025, .02, .95, .57] },
    { slug: 'color-war', lines: ['حرب', 'الألوان'], detail: 'تحدّي كرات الألوان', hero: [.025, .035, .95, .555] },
    { slug: 'gallery', lines: ['رماية', 'عبودين'], detail: 'صوّب نحو الأهداف', hero: [.045, .05, .91, .53] },
    { slug: 'photo', lines: ['تركيب', 'الصور'], detail: 'صور وفيديو في عالمك', hero: [.025, .035, .95, .555] },
    { slug: 'sand', lines: ['الكتابة', 'على الرمل'], detail: 'ارسم وامسح بموجة', hero: [.025, .035, .95, .555], cameraFree: true }
]

const text = (label, y, size, fill, weight = 700) => `<text x="728" y="${y}" direction="rtl" unicode-bidi="embed" font-family="DejaVu Sans" font-size="${size}" font-weight="${weight}" fill="${fill}">${label}</text>`
function overlay(card, mini) {
    return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="768" height="432">
<defs>
<linearGradient id="fade"><stop offset="0" stop-color="#00100f" stop-opacity="0"/><stop offset="1" stop-color="#03120f"/></linearGradient>
<linearGradient id="panel" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#03120f"/><stop offset="1" stop-color="#061d19"/></linearGradient>
</defs>
<rect x="383" y="0" width="137" height="432" fill="url(#fade)"/>
<rect x="520" y="0" width="248" height="432" fill="url(#panel)"/>
<path d="M452 363 578 131 704 363 637 319 578 210 516 319Z" fill="#51dab1" opacity=".025"/>
<rect x="12" y="12" width="744" height="408" rx="19" fill="none" stroke="#75d7b4" stroke-opacity=".8" stroke-width="1.5"/>
${mini ? '' : '<text x="728" y="64" text-anchor="end" font-family="DejaVu Sans" font-size="20" font-weight="700" fill="#62e3b4">AR ABODEN</text>'}
<path d="M700 106H729" stroke="#62e3b4" stroke-width="4" stroke-linecap="round"/>
${text(card.lines[0], mini ? 200 : 203, mini ? 58 : 52, '#f1fff9')}
${text(card.lines[1], mini ? 273 : 270, mini ? 58 : 52, '#66edbd')}
${mini ? '' : text(card.detail, 319, 18, '#b7cec4', 400)}
<path d="M489 350H728" stroke="#467b66" stroke-opacity=".6"/>
${text(card.cameraFree ? 'بدون كاميرا' : 'واقع معزز', 387, mini ? 22 : 17, '#76cdb0', 400)}
</svg>`)
}

async function encodeWithinBudget(input, width, height, limit, initialQuality) {
    for(let quality = initialQuality; quality >= 56; quality -= 4) {
        const bytes = await sharp(input).resize(width, height).webp({ quality, effort: 6, smartSubsample: true }).toBuffer()
        if(bytes.length <= limit) return { bytes, quality }
    }
    throw new Error(`Cannot meet ${limit}-byte budget without over-compressing the card`)
}

const sizes = []
assert.equal(cards.length, lab.length)
for(let i = 0; i < cards.length; i++) {
    const card = cards[i]
    assert.equal(lab[i].image, `aboden-${card.slug}-neon-v3.webp`, 'Card art must match its destination')
    assert.equal(lab[i].imageMini, `aboden-${card.slug}-mini-neon-v3.webp`)
    const posterPath = path.join(sourceDir, `${card.slug}-poster.webp`)
    const meta = await sharp(posterPath).metadata()
    const [x, y, w, h] = card.hero
    const hero = await sharp(posterPath).extract({
        left: Math.round(x * meta.width), top: Math.round(y * meta.height),
        width: Math.floor(w * meta.width), height: Math.floor(h * meta.height)
    }).resize(520, 432, { fit: 'cover', position: 'centre' }).toBuffer()
    const canvas = { create: { width: 768, height: 432, channels: 3, background: '#03120f' } }
    const mainRaw = await sharp(canvas).composite([{ input: hero, left: 0, top: 0 }, { input: overlay(card, false) }]).png().toBuffer()
    const miniRaw = await sharp(canvas).composite([{ input: hero, left: 0, top: 0 }, { input: overlay(card, true) }]).png().toBuffer()
    const main = await encodeWithinBudget(mainRaw, 640, 360, 34000, 78)
    const mini = await encodeWithinBudget(miniRaw, 256, 144, 8500, 74)
    await writeFile(path.join(outputDir, lab[i].image), main.bytes)
    await writeFile(path.join(outputDir, lab[i].imageMini), mini.bytes)
    sizes.push({ title: lab[i].title, image: lab[i].image, mainBytes: main.bytes.length, miniBytes: mini.bytes.length, mainQuality: main.quality, miniQuality: mini.quality, posterBytes: (await readFile(posterPath)).length })
}

const summary = {
    cards: sizes,
    runtimeBytes: sizes.reduce((s, card) => s + card.mainBytes + card.miniBytes, 0),
    posterBytes: sizes.reduce((s, card) => s + card.posterBytes, 0)
}
assert(summary.runtimeBytes < 350000)
await writeFile(path.join(sourceDir, 'sizes.json'), JSON.stringify(summary, null, 2) + '\n')

const panels = []
for(let i = 0; i < lab.length; i++) {
    panels.push({ input: await sharp(path.join(outputDir, lab[i].image)).resize(480, 270).toBuffer(),
        left: 24 + (2 - i % 3) * 496, top: 24 + Math.floor(i / 3) * 286 })
}
await sharp({ create: { width: 1520, height: 890, channels: 3, background: '#071b17' } }).composite(panels)
    .webp({ quality: 84, effort: 6 }).toFile(path.join(sourceDir, 'boards-preview.webp'))
console.log(JSON.stringify(summary, null, 2))
