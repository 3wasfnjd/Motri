// Run with camel-camp-test-loader.mjs to isolate Game's browser-only imports.
// Use Three's renderer/state helpers and the production Tracks/Rendering code.
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import { Events } from '../sources/Game/Events.js'
import { Tracks } from '../sources/Game/Tracks.js'
import { Rendering } from '../sources/Game/Rendering.js'

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
console.log('VR rendering: ground-map camera/state recovery and web/VR backend selection passed')
