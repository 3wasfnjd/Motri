// Run with camel-camp-test-loader.mjs to isolate Game's browser-only imports.
// Use Three's renderer/state helpers and the production Tracks/Rendering code.
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import { Events } from '../sources/Game/Events.js'
import { Tracks } from '../sources/Game/Tracks.js'
import { Rendering } from '../sources/Game/Rendering.js'
import { Ticker } from '../sources/Game/Ticker.js'
import Animation from 'three/src/renderers/common/Animation.js'

const canvas = () => ({ width: 800, height: 600, style: {}, classList: { add() {} } })

for(const presenting of [false, true])
{
    for(const throwDuringRender of [false, true])
    {
        const renderer = new THREE.WebGPURenderer({ canvas: canvas(), forceWebGL: true })
        // There is no GPU context in this test; retain actual renderer state
        // transitions and replace only the final GL scissor command.
        renderer.backend.state = { setScissorTest() {} }
        renderer.xr.enabled = true
        renderer.xr.isPresenting = presenting
        const target = new THREE.RenderTarget(800, 600)
        renderer.setRenderTarget(target)
        const game = { ticker: { events: new Events() }, rendering: { renderer } }
        globalThis.camelTestGame = game
        const tracks = new Tracks()
        const cameraMatrix = tracks.camera.matrix.clone()
        let renders = 0
        renderer.render = (scene, camera) => {
            renders++
            assert.equal(renderer.xr.enabled, false, 'An offscreen ground map must never use the XR eye camera')
            assert.equal(camera, tracks.camera)
            assert.equal(camera.isOrthographicCamera, true)
            assert.equal(renderer.getRenderTarget(), tracks.renderTarget)
            if(throwDuringRender) throw new Error('Offscreen render failed')
        }
        if(throwDuringRender) assert.throws(() => tracks.update(), /Offscreen render failed/)
        else tracks.update()
        assert.equal(renders, 1)
        assert.equal(renderer.getRenderTarget(), target, 'Restore the prior target even on failure')
        assert.equal(renderer.xr.enabled, true, 'The next world render must still draw both eyes')
        assert.equal(renderer.xr.isPresenting, presenting)
        assert.deepEqual(tracks.camera.matrix, cameraMatrix)
    }
}

// Initial backend selection is real; GPU initialization/RAF need a browser.
const init = THREE.WebGPURenderer.prototype.init
const animationLoop = THREE.WebGPURenderer.prototype.setAnimationLoop
THREE.WebGPURenderer.prototype.init = async function() { return this }
THREE.WebGPURenderer.prototype.setAnimationLoop = async function() {}
globalThis.location = { hash: '' }
try
{
    for(const requested of [false, true])
    {
        globalThis.camelTestGame = {
            debug: { active: false },
            vr: { requested, supportPromise: Promise.resolve(true) },
            canvasElement: canvas(), viewport: { width: 800, height: 600, pixelRatio: 1 }
        }
        const rendering = new Rendering()
        await rendering.setRenderer()
        assert.equal(!!rendering.renderer.backend.isWebGPUBackend, !requested,
            'Headset detection must not alter ordinary web rendering; only explicit VR selects WebGL')
    }
}
finally
{
    THREE.WebGPURenderer.prototype.init = init
    THREE.WebGPURenderer.prototype.setAnimationLoop = animationLoop
}
// Three restarts its ordinary animation loop synchronously after sessionend.
// The first callback has no timestamp; it must not advance physics or poison
// the shared time uniforms with NaN before the next real browser frame.
const ticker = new Ticker()
let ticks = 0
ticker.events.on('tick', () => {
    ticks++
    for(const value of [ticker.elapsed, ticker.delta, ticker.deltaScaled,
        ticker.elapsedScaledUniform.value, ticker.deltaUniform.value])
        assert.ok(Number.isFinite(value), 'XR transitions must keep simulation time finite')
    assert.ok(ticker.delta > 0 && ticker.delta <= ticker.maxDelta)
})
ticker.update(1000)
let nextFrame
const animation = new Animation(
    { _inspector: { begin() {}, finish() {} } },
    { nodeFrame: { frameId: 0, update() { this.frameId++ } } },
    { autoReset: false }
)
animation.setContext({
    requestAnimationFrame(callback) { nextFrame = callback; return 1 },
    cancelAnimationFrame() {}
})
animation.setAnimationLoop(time => ticker.update(time))
animation.start()
assert.equal(ticks, 1, 'The untimed start callback must not tick the game')
nextFrame(1014)
assert.equal(ticks, 2, 'The next real frame must resume the game')
for(const timestamp of [undefined, NaN, Infinity, 1014, 1000]) ticker.update(timestamp)
assert.equal(ticks, 2, 'Invalid, duplicate and stale callbacks must not tick the game')
animation.stop()
animation.start()
nextFrame(1030)
assert.equal(ticks, 3, 'Repeated VR exits must still resume correctly')
animation.stop()
console.log('VR rendering: ground-map state, backend selection and real animation restart passed')
