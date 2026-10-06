// Optional full XR regression. Install Playwright and Meta IWER outside the app:
// MOTRI2_PLAYWRIGHT_MODULE=/.../playwright/index.mjs
// MOTRI_XR_IWER_PATH=/.../iwer/build/iwer.min.js
// Build first. No framebuffer adapter is injected: this exercises IWER as shipped.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { preview } from 'vite'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { chromium } = await import(process.env.MOTRI2_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.MOTRI2_PLAYWRIGHT_MODULE).href : 'playwright')
const iwer = fs.readFileSync(process.env.MOTRI_XR_IWER_PATH, 'utf8')
const artifacts = process.env.MOTRI_XR_ARTIFACT_DIR || path.join(root, 'artifacts/xr')
fs.mkdirSync(artifacts, { recursive: true })
const server = await preview({ configFile: path.join(root, 'vite.config.js'), root: path.join(root, 'sources'), preview: { host: '127.0.0.1', port: 4174, strictPort: true }, build: { outDir: path.join(root, 'dist') } })
const browser = await chromium.launch({
    headless: true,
    ...(process.env.MOTRI_XR_CHROMIUM ? { executablePath: process.env.MOTRI_XR_CHROMIUM } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox']
})
const page = await browser.newPage({ viewport: { width: 1000, height: 640 } })
page.setDefaultTimeout(180000)
const errors = []
page.on('pageerror', error => { errors.push(error.message); console.error(error.message) })
await page.addInitScript({ content: iwer + `
window.testRoomMode = 'hit';
window.xrDevice = new IWER.XRDevice(IWER.metaQuest3, { stereoEnabled: true });
xrDevice.installRuntime({ forceInstall: true });
xrDevice.position.set(0, 1.6, 0);
xrDevice.quaternion.set(Math.sin(-0.35 / 2), 0, 0, Math.cos(-0.35 / 2));
for (const side of ['left', 'right']) {
    const c = xrDevice.controllers[side];
    c.position.set(side === 'right' ? .22 : -.22, 1.1, 0);
    c.quaternion.set(Math.sin(-.25 / 2), 0, 0, Math.cos(-.25 / 2));
}
class TestRoom {
    constructor() {
        this.environmentCanvas = document.createElement('canvas');
        this.trackedMeshes = new Set();
        this.planes = new Set([new IWER.NativePlane(new IWER.XRRigidTransform({ x: 0, y: .75, z: -1.5 }), [new DOMPointReadOnly(-1.5, 0, -1.5), new DOMPointReadOnly(1.5, 0, -1.5), new DOMPointReadOnly(1.5, 0, 1.5), new DOMPointReadOnly(-1.5, 0, 1.5)], 'table')]);
    }
    get trackedPlanes() { return testRoomMode === 'empty' ? new Set() : this.planes; }
    render() {}
    computeHitTestResults(m) {
        if (testRoomMode !== 'hit' || -m[9] >= 0) return [];
        const t = (.75 - m[13]) / -m[9], x = m[12] - m[8] * t, z = m[14] - m[10] * t;
        return t < 0 || Math.abs(x) > 1.5 || Math.abs(z + 1.5) > 1.5 ? [] : [new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,x,.75,z,1])];
    }
}
xrDevice.installSEM(TestRoom);
const requestSession = navigator.xr.requestSession.bind(navigator.xr);
navigator.xr.requestSession = async (...args) => {
    const session = await requestSession(...args);
    if (testRoomMode === 'planes') session.requestHitTestSource = async () => { throw new DOMException('Optional hit-test unavailable', 'NotSupportedError'); };
    return session;
};
` })

const button = async (side, id) => {
    await page.evaluate(([side, id]) => xrDevice.controllers[side].updateButtonValue(id, 1), [side, id])
    await page.waitForTimeout(350)
    await page.evaluate(([side, id]) => xrDevice.controllers[side].updateButtonValue(id, 0), [side, id])
}
// Observe a completed production draw. Counting lit terrain pixels catches the
// prior failure where placement state succeeded but only the dark base rendered.
async function visibleWorld() {
    const result = await page.evaluate(() => new Promise(resolve => {
        const xr = game.xr, render = xr.render
        xr.render = function(...args) {
            render.apply(this, args)
            xr.render = render
            const canvas = document.createElement('canvas'); canvas.width = 200; canvas.height = 128
            const ctx = canvas.getContext('2d', { willReadFrequently: true })
            ctx.drawImage(this.renderer.domElement, 0, 0, 200, 128)
            const pixels = ctx.getImageData(0, 0, 200, 128).data
            let terrain = 0
            for(let i = 0; i < pixels.length; i += 4) if(pixels[i] > 140 && pixels[i] > pixels[i + 1] * 1.25 && pixels[i + 1] > pixels[i + 2] * 1.3) terrain++
            resolve({ terrain, glError: this.renderer.getContext().getError() })
        }
    }))
    assert.ok(result.terrain > 300, `Terrain missing from stereo output: ${JSON.stringify(result)}`)
    assert.equal(result.glError, 0)
    console.log('Visible terrain', result)
}

try {
    await page.goto('http://127.0.0.1:4174/xr/', { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => window.game?.xr)
    console.log('XR ready')
    await page.click('#xr-ar')
    await page.waitForFunction(() => game.xr.reticle.visible)
    await page.waitForTimeout(700)
    await button('right', 'trigger')
    await page.waitForFunction(() => game.xr.placed)
    await visibleWorld()
    await page.screenshot({ path: path.join(artifacts, 'ar-world.png') })
    const startWidth = await page.evaluate(() => game.xr.width)
    await page.evaluate(() => xrDevice.controllers.right.updateAxes('thumbstick', .7, -.8))
    await page.waitForFunction(width => game.xr.width > width * 1.1 && Math.abs(game.xr.yaw) > .05, startWidth)
    await page.evaluate(() => xrDevice.controllers.right.updateAxes('thumbstick', 0, 0))
    const stickWidth = await page.evaluate(() => game.xr.width)
    await page.evaluate(() => { for(const c of Object.values(xrDevice.controllers)) c.updateButtonValue('squeeze', 1) })
    await page.waitForFunction(() => game.xr.gesture)
    await page.evaluate(() => { xrDevice.controllers.left.position.x = -.4; xrDevice.controllers.right.position.x = .4 })
    await page.waitForFunction(width => game.xr.width > width * 1.5, stickWidth)
    await page.evaluate(() => { for(const c of Object.values(xrDevice.controllers)) c.updateButtonValue('squeeze', 0) })
    console.log('AR stick rotation/scale and two-controller resizing passed')
    await page.evaluate(() => { testRoomMode = 'empty' })
    await button('left', 'x-button')
    await page.waitForFunction(() => !game.xr.placed && !game.xr.reticle.visible)
    await button('right', 'trigger')
    assert.equal(await page.evaluate(() => game.xr.placed), false)
    console.log('AR rejects placement without a real detected surface')
    await button('right', 'b-button')
    await page.waitForFunction(() => !game.xr.session)
    await page.evaluate(() => xrDevice.quaternion.set(0, 0, 0, 1))
    await page.check('[name="xr-camera"][value="chase"]')
    await page.click('#xr-vr')
    await page.waitForFunction(() => game.xr.tracking && game.xr.vehicleCamera.mode === 'chase')
    const initial = await page.evaluate(() => game.physicalVehicle.position.toArray())
    await page.evaluate(() => xrDevice.controllers.right.updateButtonValue('trigger', .8))
    await page.waitForFunction(initial => game.physicalVehicle.position.clone().sub({ x: initial[0], y: initial[1], z: initial[2] }).length() > .5, initial)
    await button('left', 'y-button')
    await page.waitForFunction(() => game.xr.vehicleCamera.mode === 'driver' && game.xr.vehicleCamera.cabin.visible)
    assert.ok(await page.evaluate(() => game.player.accelerating > .7))
    await page.evaluate(() => xrDevice.controllers.right.updateButtonValue('trigger', 0))
    await page.screenshot({ path: path.join(artifacts, 'vr-driver.png') })
    await button('left', 'y-button')
    await page.waitForFunction(() => game.xr.vehicleCamera.mode === 'chase' && !game.xr.vehicleCamera.cabin.visible)
    await page.screenshot({ path: path.join(artifacts, 'vr-chase.png') })
    console.log('VR camera selector, driving, Y switching, and cabin visibility passed')
    await button('right', 'b-button')
    await page.waitForFunction(() => !game.xr.session)
    await page.evaluate(() => { testRoomMode = 'planes'; xrDevice.quaternion.set(Math.sin(-.35 / 2), 0, 0, Math.cos(-.35 / 2)) })
    await page.click('#xr-ar')
    await page.waitForFunction(() => game.xr.reticle.visible)
    await page.waitForTimeout(700)
    await button('right', 'trigger')
    await page.waitForFunction(() => game.xr.placed)
    assert.equal(await page.evaluate(() => !!game.xr.surfaceHit.result), false)
    await visibleWorld()
    await button('right', 'b-button')
    await page.waitForFunction(() => !game.xr.session)
    assert.equal(await page.evaluate(() => game.xr.vehicleCamera.cabin.visible), false)
    assert.deepEqual(errors, [])
    console.log('XR browser regression passed: direct AR, resizing, no surface, VR cameras/drive, plane fallback, repeated sessions, no page errors.')
} finally {
    await browser.close()
    server.httpServer.close()
}
