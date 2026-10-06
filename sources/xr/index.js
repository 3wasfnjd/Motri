import '../threejs-override.js'
import './style.css'
import { Game } from '../Game/Game.js'
import { MotriXR } from './MotriXR.js'

document.documentElement.classList.add('motri-xr')
document.title = 'موتري XR — Meta Quest'
// Use Motri's existing intro transition; it completes before XR can be entered.
if(!location.hash.includes('skip')) history.replaceState(null, '', `${location.pathname}${location.search}#skip`)

const ui = document.createElement('main')
ui.id = 'xr-ui'
ui.dir = 'rtl'
ui.innerHTML = `
  <section class="xr-shell" aria-label="موتري للواقع الافتراضي والمعزز">
    <a class="xr-back" href="./">↗ موتري</a>
    <div class="xr-card">
      <span class="xr-brand" lang="en">ABODEN GAMES <span>• META QUEST</span></span>
      <h1>موتري <span lang="en">XR</span></h1>
      <p class="xr-subtitle">عالمك. حولك.</p>
      <div class="xr-modes">
        <button id="xr-vr" type="button" disabled><span class="xr-symbol">◉</span><strong lang="en">VR</strong><span>قد داخل العالم</span></button>
        <button id="xr-ar" type="button" disabled><span class="xr-symbol">▧</span><strong lang="en">AR</strong><span>العالم على طاولتك</span></button>
      </div>
      <fieldset class="xr-camera-options"><legend>كاميرا VR</legend><label><input type="radio" name="xr-camera" value="driver" checked> داخل السيارة</label><label><input type="radio" name="xr-camera" value="chase"> خلف السيارة</label></fieldset>
      <p id="xr-status" role="status" aria-live="polite">جاري تحميل موتري…</p>
      <progress id="xr-progress" max="1" aria-label="تحميل العالم"></progress>
      <details class="xr-help"><summary>التحكم</summary><p>VR: العصا اليسرى للتوجيه، الزناد الأيمن للقيادة والأيسر للرجوع. Y لتبديل الكاميرا، A لإعادة السيارة.</p><p>AR: وجّه المؤشر لسطح واضغط الزناد. العصا اليمنى للحجم والدوران، أو أمسك باليدين ووسّعهما. X لاختيار سطح آخر. B للخروج.</p></details>
    </div>
  </section>
  <div class="xr-toolbar" hidden>
    <button id="xr-replace" type="button">تحديد السطح</button>
    <label>الحجم <input id="xr-scale" type="range" min="0.5" max="6" step="0.05" value="1.8" aria-label="حجم عالم موتري"></label>
    <button id="xr-exit" type="button">خروج</button>
  </div>`
document.body.append(ui)

const status = document.querySelector('#xr-status')
const progress = document.querySelector('#xr-progress')
const buttons = { 'immersive-vr': document.querySelector('#xr-vr'), 'immersive-ar': document.querySelector('#xr-ar') }
let support = {}
let ready = false
let xr

function updateButtons() {
    for(const [mode, button] of Object.entries(buttons)) button.disabled = !ready || !support[mode]
}

async function detectSupport() {
    if(!window.isSecureContext || !navigator.xr) {
        status.textContent = 'افتح هذا الرابط في متصفح Meta Quest للدخول إلى VR أو AR.'
        return
    }
    const results = await Promise.allSettled(Object.keys(buttons).map(mode => navigator.xr.isSessionSupported(mode)))
    Object.keys(buttons).forEach((mode, i) => { support[mode] = results[i].status === 'fulfilled' && results[i].value })
    updateButtons()
    if(ready) status.textContent = Object.values(support).some(Boolean) ? 'اختر تجربتك' : 'المتصفح الحالي لا يتيح جلسات VR أو AR. افتحه في Meta Quest.'
}

detectSupport()
navigator.xr?.addEventListener('devicechange', detectSupport)

try {
    const game = new Game({ xr: true })
    window.game = game
    const loading = setInterval(() => {
        if(game.world?.intro?.circle) progress.value = game.world.intro.circle.progress
    }, 250)
    try {
        await game.ready
        await new Promise((resolve, reject) => {
            const started = performance.now()
            const timer = setInterval(() => {
                // Quest can pause window RAF during XR: complete the intro's
                // GSAP reveal before offering an immersive entry button.
                if(game.reveal.step === 2 && game.reveal.distance.value >= 99999) { clearInterval(timer); resolve() }
                else if(performance.now() - started > 45000) { clearInterval(timer); reject(new Error('Intro did not finish')) }
            }, 100)
        })
    } finally { clearInterval(loading) }
    xr = new MotriXR(game, ui, message => { status.textContent = message })
    game.xr = xr
    xr.setCameraMode(ui.querySelector('[name="xr-camera"]:checked').value)
    for(const input of ui.querySelectorAll('[name="xr-camera"]')) input.addEventListener('change', () => xr.setCameraMode(input.value))
    ready = true
    progress.hidden = true
    await detectSupport()
    for(const [mode, button] of Object.entries(buttons)) button.addEventListener('click', () => xr.enter(mode))
    document.querySelector('#xr-exit').addEventListener('click', () => xr.exit())
    document.querySelector('#xr-replace').addEventListener('click', () => xr.reposition())
    document.querySelector('#xr-scale').addEventListener('input', event => xr.setWidth(Number(event.target.value)))
    ui.addEventListener('beforexrselect', event => { if(event.target.closest('.xr-toolbar')) event.preventDefault() })
} catch(error) {
    console.error('Motri XR load failed:', error)
    progress.hidden = true
    status.textContent = 'تعذّر تحميل العالم. أعد تحميل الصفحة وحاول مرة أخرى.'
    const retry = document.createElement('button')
    retry.textContent = 'إعادة المحاولة'
    retry.className = 'xr-retry'
    retry.onclick = () => location.reload()
    status.after(retry)
}
