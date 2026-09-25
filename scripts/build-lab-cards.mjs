// Deterministic, repo-native vector card art. No external images or runtime fonts.
// Run from the repository root: node scripts/build-lab-cards.mjs
// sharp is already a project dependency. DejaVu Sans supplies Arabic shaping
// while building; all text is baked into the shipped WebP images.
import sharp from 'sharp'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import lab from '../sources/data/lab.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const sources = path.join(root, 'resources/lab-cards')
const output = path.join(root, 'static/lab/images')
await mkdir(sources, { recursive: true })
await mkdir(output, { recursive: true })

const ink = '#263e42', cream = '#f6edda', gold = '#e8bb69'
const shape = (d, fill, extra = '') => `<path d="${d}" fill="${fill}" ${extra}/>`
const circle = (x, y, r, fill, extra = '') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${extra}/>`
const ellipse = (x, y, rx, ry, fill, extra = '') => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`
const rect = (x, y, w, h, r, fill, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`
const stroke = (d, color, width = 5, extra = '') => shape(d, 'none', `stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${extra}`)
const group = (transform, content) => `<g transform="${transform}">${content}</g>`
const arabic = (label, x, y, size, fill = ink, weight = 700) => `<text x="${x}" y="${y}" direction="rtl" unicode-bidi="embed" text-anchor="start" font-family="DejaVu Sans" font-size="${size}" font-weight="${weight}" fill="${fill}">${label}</text>`
const latin = (label, x, y, size, fill = ink, extra = '') => `<text x="${x}" y="${y}" font-family="DejaVu Sans" font-size="${size}" font-weight="700" fill="${fill}" ${extra}>${label}</text>`
const sparkle = (x, y, s, fill) => group(`translate(${x} ${y}) scale(${s})`, shape('M0 -13 4 -4 13 0 4 4 0 13 -4 4 -13 0 -4 -4Z', fill))
const pedestal = (top = '#cfdbbe') => ellipse(211, 308, 170, 34, '#273e4214') + shape('M38 273 207 198 390 276 224 352 38 296Z', '#b4a887') + shape('M38 273 207 198 390 276 224 326Z', top) + shape('M224 326 390 276 390 296 224 352Z', '#a69878')

function car(color, roof) {
    return ellipse(0, 12, 61, 22, '#263e4226') +
        rect(-45, -18, 19, 45, 7, ink) + rect(28, -25, 18, 46, 7, ink) +
        shape('M-60 -6 -27 -27 40 -24 64 -2 59 17 -9 27 -58 15Z', color) +
        shape('M-58 15 -9 27 59 17 59 4 -8 13 -58 2Z', '#a54f3e') +
        shape('M-31 -26 -10 -49 29 -45 45 -25 11 -12Z', roof) +
        shape('M-24 -25 -6 -41 2 -15Z', '#34585f') +
        shape('M-1 -41 25 -39 36 -25 9 -17Z', '#4c7680') +
        circle(-32, 17, 14, ink) + circle(-32, 17, 6, '#aabfbc') +
        circle(38, 10, 14, ink) + circle(38, 10, 6, '#aabfbc') +
        stroke('M-55 -2 -42 1 M42 -1 56 -5', cream, 5)
}

function drift() {
    let art = pedestal('#dec99d')
    art += ellipse(212, 244, 146, 57, '#d87354') + ellipse(212, 241, 137, 53, cream)
    art += ellipse(212, 237, 128, 49, '#556464') + ellipse(212, 237, 76, 23, '#b9c690')
    art += ellipse(212, 237, 101, 36, 'none', 'stroke="#d1caae" stroke-width="3" stroke-dasharray="12 15"')
    art += stroke('M172 276Q233 306 294 279', '#3b4948', 6) + stroke('M169 286Q239 316 294 292', '#3b4948', 4)
    art += group('translate(297 229) scale(.58)', car('#80ac9e', '#a6cfc1'))
    art += group('translate(139 211) scale(.55)', car('#deb755', '#f0d48a'))
    art += [circle(114, 283, 23, '#ecebd7'), circle(84, 276, 17, '#fff6df'), circle(55, 263, 11, '#ecebd7')].join('')
    art += group('translate(206 265) rotate(-12) scale(1.18)', car('#dc7858', '#f3a16d'))
    art += stroke('M335 199V98', ink, 6) + shape('M338 100H389V141H338Z', cream)
    for(let row = 0; row < 3; row++) for(let col = 0; col < 4; col++) if((row + col) % 2 === 0)
        art += rect(339 + col * 12, 102 + row * 12, 12, 12, 0, ink)
    return art + sparkle(78, 139, .9, '#dfa957')
}

function balloon(x, y, scale, color, light) {
    return group(`translate(${x} ${y}) scale(${scale})`,
        ellipse(0, 100, 30, 8, '#263e4219') +
        stroke('M-25 35 -16 70H16L25 35', '#907956', 4) +
        shape('M-48 -27C-56 -91 52 -97 50 -30Q48 7 18 40H-18Q-46 4 -48 -27Z', color) +
        shape('M-14 -75C-45 -53 -28 9 -9 40H8C29 -1 35 -56 13 -77Z', light) +
        ellipse(0, 40, 18, 5, '#835c44') + rect(-18, 70, 36, 25, 5, '#b78455') +
        rect(-19, 68, 38, 7, 2, '#e5ba78') + stroke('M-8 76V90M7 76V90', '#91653f', 3))
}
function balloons() {
    return ellipse(214, 323, 156, 26, '#b5cbb0') +
        stroke('M53 181H110M295 252H367M76 220H114', cream, 12) +
        balloon(308, 171, .73, '#6a9fbc', '#a7d2dc') +
        balloon(135, 225, .66, '#d4a657', '#efd08b') +
        balloon(208, 136, 1.16, '#cf765e', '#f1b781') +
        circle(306, 281, 35, 'none', `stroke="${ink}" stroke-width="4"`) +
        stroke('M306 235V250M306 312V327M260 281H275M337 281H352', ink, 4) +
        sparkle(82, 112, 1, '#e9b654')
}

function horror() {
    let art = ellipse(218, 321, 116, 24, '#8a9f923a')
    art += shape('M125 235 91 210 105 128 144 108 158 124 132 154 147 195Z', '#b2995c')
    art += shape('M295 210 324 186 298 131 266 118 252 134 281 158 279 198Z', '#a78b4d')
    art += shape('M159 220 207 217 200 302 150 305Z', '#ac9856') + shape('M216 218 261 214 284 296 233 306Z', '#8c804b')
    art += rect(140, 293, 65, 26, 9, ink) + rect(231, 297, 64, 25, 9, ink)
    art += shape('M155 126Q210 110 260 126L274 231Q215 253 143 233Z', '#ccba71')
    art += shape('M218 123 260 126 274 231 224 241Z', '#b29c55')
    art += stroke('M216 130 214 226', '#e4d293', 5) + rect(161, 188, 34, 18, 5, '#ad9651')
    art += ellipse(211, 111, 65, 66, '#d7c77e') + ellipse(212, 111, 51, 43, ink)
    art += shape('M171 96Q185 70 222 75Q253 82 252 106L242 132H182Z', '#769a8a')
    art += shape('M179 102 198 108 197 114 180 109Z', '#e6deac') + shape('M222 110 242 98 241 108 224 115Z', '#e6deac')
    art += rect(195, 122, 36, 26, 7, '#435f5b') + circle(190, 131, 12, ink) + circle(234, 131, 12, ink)
    art += circle(101, 128, 14, '#a5b399') + circle(311, 184, 14, '#a5b399')
    art += stroke('M68 154 58 184M346 166 358 193', '#889c8d', 6)
    return art + sparkle(328, 86, 1, '#cba967')
}

function basketball() {
    return pedestal('#c5cfa9') +
        shape('M92 278 226 218 332 264 205 321Z', '#dc9367') +
        stroke('M128 277 226 236 292 265 201 304Z', '#f7e3b9', 4) +
        ellipse(210, 272, 31, 13, 'none', 'stroke="#f7e3b9" stroke-width="4"') +
        rect(281, 95, 15, 172, 5, '#64877b') +
        shape('M252 250 296 239 323 252 282 266Z', '#597367') +
        rect(212, 56, 125, 88, 9, '#618981') + rect(222, 65, 105, 70, 5, cream) +
        rect(251, 88, 45, 34, 1, 'none', 'stroke="#d78055" stroke-width="5"') +
        stroke('M249 139 258 176 292 176 302 137 M259 143 270 176M292 143 281 176M255 161H296', cream, 3) +
        ellipse(276, 136, 31, 9, 'none', 'stroke="#d2774d" stroke-width="7"') +
        stroke('M133 205Q177 80 248 122', '#98aa8c', 4, 'stroke-dasharray="7 13"') +
        circle(141, 223, 47, '#da8a4d') +
        shape('M104 237Q136 199 175 199A47 47 0 0 1 104 252Z', '#e6a85f') +
        stroke('M102 200Q150 218 177 250M114 260Q136 217 177 197M102 237Q149 244 168 186', '#8f5e39', 4) +
        sparkle(106, 105, 1.1, '#dca455')
}

function laser() {
    return ellipse(224, 225, 167, 135, '#466962') + ellipse(224, 217, 153, 123, '#314d4a') +
        shape('M215 302 81 150 170 115 323 120 368 207Z', '#85c8a623') +
        stroke('M215 302 107 156M215 302 175 112M215 302 302 120M215 302 346 205', '#8dd1b0', 2) +
        stroke('M96 192 143 138 190 187 238 112 284 179 337 142', '#a6d79b', 7) +
        stroke('M104 216 152 170 195 219 244 146 289 213 342 176', '#dec37a', 5) +
        stroke('M106 241 153 202 200 245 246 180 291 242 344 212', '#89cbd0', 4) +
        ellipse(215, 331, 68, 15, '#263e4233') +
        shape('M164 303 205 281 265 300 219 321Z', '#8caa9c') +
        shape('M164 303 219 321 219 346 164 326Z', '#3e5a57') +
        shape('M219 321 265 300 265 326 219 346Z', ink) +
        circle(234, 323, 10, '#9ed9b7') + circle(234, 323, 5, '#e3f1c7') +
        stroke('M174 313 202 322M174 319 202 328', '#91a498', 3) +
        sparkle(321, 91, .9, gold)
}

function soldier(x, y, s, coat, helm) {
    return group(`translate(${x} ${y}) scale(${s})`,
        ellipse(0, 127, 44, 10, '#263e4226') +
        rect(-31, 74, 25, 50, 8, '#465e59') + rect(7, 74, 25, 50, 8, '#465e59') +
        rect(-35, 115, 31, 15, 6, ink) + rect(7, 115, 32, 15, 6, ink) +
        rect(-39, 2, 77, 85, 17, coat) +
        rect(-25, 24, 24, 22, 4, helm) + rect(5, 24, 24, 22, 4, helm) +
        rect(-13, 3, 27, 10, 4, '#d4aa80') +
        ellipse(0, -24, 32, 35, '#d4aa80') +
        shape('M-37 -18Q-38 -68 0 -64Q39 -65 38 -20Z', helm) +
        rect(-37, -28, 74, 13, 6, ink) + rect(-29, -26, 57, 8, 3, '#84aaa2') +
        group('rotate(-18)', rect(-54, 30, 39, 20, 8, coat)) +
        rect(28, 24, 25, 38, 10, coat) +
        rect(-45, 40, 89, 15, 6, ink) + rect(-13, 54, 16, 18, 3, ink) +
        circle(39, 47, 7, '#abd5c2'))
}
function rescue() {
    return pedestal('#cbd0ab') +
        soldier(282, 167, .84, '#709384', '#466c60') +
        soldier(162, 169, 1.18, '#d79d66', '#af744a') +
        circle(330, 220, 13, '#83c4b5') + circle(323, 225, 5, '#b7e1c7') +
        circle(93, 107, 10, '#d7886d') + circle(336, 128, 9, '#deb566') +
        stroke('M70 164 104 155M307 284 342 271', '#8aab97', 6) +
        sparkle(217, 72, 1.1, '#d9b36b')
}
function duck(x, y, s) {
    return group(`translate(${x} ${y}) scale(${s})`,
        rect(-5, 21, 10, 24, 3, '#a58554') +
        shape('M-41 -7Q-21 6 -7 -1V-18Q-6 -42 14 -40Q40 -39 34 -12L23 0Q26 30 -5 30Q-37 29 -41 -7Z', '#e2b659') +
        shape('M-25 8Q-10 -3 9 13Q-5 27 -20 19Z', '#c59343') +
        shape('M31 -24 52 -18 32 -11Z', '#cf7751') + circle(23, -26, 3.5, ink))
}
function gallery() {
    let art = pedestal('#d6c494')
    art += rect(77, 212, 267, 27, 6, '#c28d57') + rect(77, 239, 267, 12, 3, '#8f653f')
    art += rect(97, 247, 16, 51, 4, '#8f653f') + rect(309, 247, 16, 51, 4, '#8f653f')
    art += circle(281, 138, 57, '#315c57') + circle(281, 138, 46, cream) + circle(281, 138, 34, '#c97155') + circle(281, 138, 20, cream) + circle(281, 138, 9, '#c97155')
    art += rect(276, 192, 10, 22, 2, '#315c57') + duck(144, 168, 1)
    for(const [x, y] of [[218, 193], [245, 195], [232, 171]]) {
        art += rect(x, y, 21, 25, 3, '#91aba2') + rect(x, y, 21, 5, 2, '#c3d0b9') + rect(x, y + 19, 21, 4, 2, '#577c73')
    }
    return art + sparkle(110, 90, 1, '#cfaa59') + stroke('M353 99 364 87M361 118 378 114', '#b2955e', 5)
}

function photo() {
    return pedestal('#b7cdbc') +
        group('rotate(-12 183 182)', rect(84, 89, 203, 208, 16, '#749f94') + rect(95, 101, 180, 167, 8, '#d2dbc3')) +
        group('rotate(9 244 181)', rect(146, 62, 190, 226, 17, cream) +
        rect(159, 76, 164, 164, 11, '#8cbebc') +
        circle(241, 151, 66, '#c9dec8') +
        shape('M180 174 215 122 246 167 266 140 303 177Q243 239 180 174Z', '#628e74') +
        shape('M196 197 250 153 288 188Q242 221 196 197Z', '#93b495') +
        circle(269, 120, 14, '#edc780') + rect(185, 253, 116, 6, 3, '#d9cfb1')) +
        stroke('M60 125V100H81M341 77H363V103M349 276H370V251M75 301H52V278', '#537f74', 6) +
        sparkle(89, 59, 1, '#dfa769')
}

function sand() {
    return ellipse(212, 314, 164, 27, '#263e421c') +
        shape('M48 178Q119 117 237 145L367 203 374 278Q304 337 186 320L52 265Z', '#ba975b') +
        shape('M48 174Q119 114 238 139L367 198 374 264Q304 322 186 305L52 250Z', '#e1bd7c') +
        shape('M48 174Q83 142 126 138L202 177 161 222 52 241Z', '#73bcb4') +
        shape('M48 174Q83 142 126 138L159 155Q148 184 164 193L136 211 52 218Z', '#9dcfc4') +
        stroke('M125 144Q127 173 176 181Q187 193 164 210Q142 228 139 270', '#f5e8c7', 7) +
        stroke('M218 205C185 175 223 149 241 178C271 151 302 179 278 202L244 232Z', '#ad8750', 10) +
        stroke('M216 200C185 170 223 144 241 173C271 146 302 174 278 197L244 227Z', '#f3d292', 5) +
        stroke('M194 256Q224 238 251 258T306 257', '#b68c50', 7) +
        stroke('M194 252Q224 234 251 254T306 253', '#f3d292', 3) +
        circle(329, 224, 4, '#b59057') + circle(303, 278, 3, '#b59057') +
        sparkle(294, 97, 1.1, '#d5a157')
}

const cards = [
    { lines: ['الحلبة', 'والتفحيط'], accent: '#ba694c', wash: '#ecd6b5', detail: 'ثلاث سيارات • عرض تلقائي', art: drift },
    { lines: ['صيد', 'المناطيد'], accent: '#3f817e', wash: '#d9e6cc', detail: 'صوّب • أطلق • اجمع النقاط', art: balloons },
    { lines: ['الرعب', 'المتجول'], accent: '#637e68', wash: '#dde2c6', detail: 'زومبي يتحرّك أمامك', art: horror },
    { lines: ['رماية', 'السلة'], accent: '#b67643', wash: '#e5dec0', detail: 'اسحب الكرة وسجّل', art: basketball },
    { lines: ['عرض', 'الليزر'], accent: '#497d71', wash: '#d5e2cb', detail: 'أشعة وألوان داخل المكان', art: laser },
    { lines: ['عملية', 'الإنقاذ'], accent: '#aa674e', wash: '#e8d9b7', detail: 'مواجهة بكرات الألوان', art: rescue },
    { lines: ['رماية', 'عبودين'], accent: '#837747', wash: '#e7dfbf', detail: 'بطّات • علب • أهداف', art: gallery },
    { lines: ['تركيب', 'صورة'], accent: '#4c867d', wash: '#d7e3cc', detail: 'صور وفيديو • عادي وثلاثي الأبعاد', art: photo },
    { lines: ['الكتابة', 'على الرمل'], accent: '#9b7a43', wash: '#ecdfbc', detail: 'ارسم وامسح بموجة بحر', art: sand }
]

function svg(card, index, mini = false) {
    const titleSize = mini ? 82 : 74
    const art = card.art()
    return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540" role="img" aria-label="${lab[index].title}">
<title>${lab[index].title}</title>
${rect(0, 0, 960, 540, 0, cream)}
${shape('M0 0H397Q485 125 459 269Q436 430 301 540H0Z', card.wash)}
${rect(24, 24, 912, 492, 24, 'none', 'stroke="#263e4224" stroke-width="2"')}
${group('translate(18 87)', art)}
${mini ? '' : latin('ABODEN GAMES', 51, 69, 19, ink, 'letter-spacing="2"')}
${mini ? '' : arabic(index === 8 ? 'تجربة تفاعلية' : 'تجارب الواقع المعزز', 905, 68, 19, card.accent)}
${rect(842, mini ? 75 : 119, 63, 8, 4, card.accent)}
${arabic(card.lines[0], 905, mini ? 228 : 226, titleSize)}
${arabic(card.lines[1], 905, mini ? 330 : 319, titleSize)}
${mini ? '' : arabic(card.detail, 905, 385, index === 7 ? 21 : 24, '#5d6d62', 400)}
${stroke('M493 442H905', '#cfc8ac', 2)}
${latin(String(index + 1).padStart(2, '0'), 56, 482, 23, card.accent)}
${mini ? '' : latin('/ 09', 94, 482, 16, '#778074')}
${arabic(index === 8 ? 'بدون كاميرا' : 'واقع معزز', 905, 483, mini ? 27 : 22, card.accent)}
</svg>\n`
}

const report = []
const slugs = ['drift', 'balloons', 'horror', 'basketball', 'laser', 'rescue', 'gallery', 'photo', 'sand']
assert.equal(lab.length, cards.length, 'Keep the card art and experience catalog in sync')
for(let i = 0; i < cards.length; i++) {
    assert.equal(lab[i].image, `aboden-${slugs[i]}-v2.webp`, 'Do not bind artwork to a different experience')
    assert.equal(lab[i].imageMini, `aboden-${slugs[i]}-mini-v2.webp`)
    const full = svg(cards[i], i)
    const mini = svg(cards[i], i, true)
    const stem = lab[i].image.replace('.webp', '')
    await writeFile(path.join(sources, `${stem}.svg`), full)
    await writeFile(path.join(sources, `${stem}-mini.svg`), mini)
    const mainInfo = await sharp(Buffer.from(full), { density: 144 })
        .resize(768, 432).webp({ quality: 86, effort: 6, smartSubsample: true })
        .toFile(path.join(output, lab[i].image))
    const miniInfo = await sharp(Buffer.from(mini), { density: 144 })
        .resize(256, 144).webp({ quality: 86, effort: 6, smartSubsample: true })
        .toFile(path.join(output, lab[i].imageMini))
    assert(mainInfo.size < 24000 && miniInfo.size < 5000, 'Keep each main/mini card within its byte budget')
    report.push({ title: lab[i].title, image: lab[i].image, mainBytes: mainInfo.size, miniBytes: miniInfo.size })
}
assert(report.reduce((sum, item) => sum + item.mainBytes + item.miniBytes, 0) < 180000, 'Keep the complete card set under 180 KB')

// Review sheet is documentation only; the game never loads it.
const tileWidth = 480, tileHeight = 270, gap = 20, margin = 30
const tiles = []
for(let i = 0; i < lab.length; i++) {
    tiles.push({ input: await sharp(path.join(output, lab[i].image)).resize(tileWidth, tileHeight).toBuffer(),
        left: margin + (i % 3) * (tileWidth + gap), top: margin + Math.floor(i / 3) * (tileHeight + gap) })
}
await sharp({ create: { width: 3 * tileWidth + 2 * gap + 2 * margin, height: 3 * tileHeight + 2 * gap + 2 * margin, channels: 3, background: '#29463f' } })
    .composite(tiles).webp({ quality: 90, effort: 6 }).toFile(path.join(sources, 'preview.webp'))
await writeFile(path.join(sources, 'sizes.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ cards: report, totalBytes: report.reduce((sum, item) => sum + item.mainBytes + item.miniBytes, 0) }, null, 2))
