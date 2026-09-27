// Use the real game overlay, Three's GLSL builder and WebGL draw path.
// Run with camel-camp-test-loader.mjs for Game's browser-only singleton.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as THREE from 'three/src/Three.WebGPU.js'
import GLSLNodeBuilder from 'three/src/renderers/webgl-fallback/nodes/GLSLNodeBuilder.js'
import { Events } from '../sources/Game/Events.js'

// Builders and materials must share the source-level TSL singleton.
const source = fs.readFileSync(new URL('../sources/Game/Overlay.js', import.meta.url), 'utf8')
    .replace("'three/webgpu'", JSON.stringify(import.meta.resolve('three/src/Three.WebGPU.js')))
    .replace("'three/tsl'", JSON.stringify(import.meta.resolve('three/src/nodes/TSL.js')))
    .replace("'./Game.js'", JSON.stringify(new URL('../sources/Game/Game.js', import.meta.url).href))
    .replace("'gsap'", JSON.stringify(import.meta.resolve('gsap')))
const { Overlay } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
const scene = new THREE.Scene()
globalThis.camelTestGame = {
    scene, debug: { active: false },
    audio: { register() { return { play() {} } } },
    viewport: { pixelRatio: 1, events: new Events() },
    resources: { overlayPatternTexture: new THREE.Texture() },
    noises: { hash: new THREE.Texture(), resolution: 256 }
}
const overlay = new Overlay()
const renderer = new THREE.WebGPURenderer({
    canvas: { width: 800, height: 600, style: {} }, forceWebGL: true
})
renderer.backend.extensions = { has() { return false } }
const eyes = [0, 1].map(i => {
    const eye = new THREE.PerspectiveCamera()
    eye.viewport = new THREE.Vector4(i * 400, 0, 400, 600)
    return eye
})
const stereoCamera = new THREE.ArrayCamera(eyes)
const monoCamera = new THREE.PerspectiveCamera()
for(const camera of [monoCamera, stereoCamera, monoCamera, stereoCamera])
{
    const builder = new GLSLNodeBuilder(overlay.mesh, renderer)
    builder.camera = camera
    builder.scene = scene
    builder.build()
    const bindings = builder.getBindings()

    // Exercise the production stereo draw loop, replacing only GPU commands.
    // Before the fix this throws the exact Quest report: undefined.bindings.
    const backend = renderer.backend
    backend.renderer = renderer
    backend.gl = {
        UNIFORM_BUFFER: 35345, STATIC_DRAW: 35044, TRIANGLES: 4,
        createBuffer() { return {} }, bindBuffer() {}, bufferData() {}
    }
    const viewports = []
    let draws = 0
    backend.state = {
        setMaterial() {}, useProgram() {}, setVertexState() {}, bindBufferBase() {},
        viewport(...value) { viewports.push(value) }
    }
    backend.bufferRenderer = { render() { draws++ } }
    backend._bindUniforms = () => {} // GPU uploads require a real graphics context.
    const context = { mrt: null, textures: null, height: 600, camera, activeCubeFace: 0 }
    backend._currentContext = context
    const attributes = []
    backend.get(attributes).vaoGPU = {}
    const pipeline = {}
    backend.get(pipeline).programGPU = {}
    const cameraGroup = bindings.find(group => group.name === 'cameraIndex')
    if(cameraGroup) backend.get(cameraGroup.bindings[0]).index = 0
    backend.draw({
        object: overlay.mesh, material: overlay.mesh.material, camera, context, pipeline,
        getDrawParameters: () => ({ firstVertex: 0, vertexCount: 6, instanceCount: 1 }),
        getBindings: () => bindings,
        getBindingGroup: name => bindings.find(group => group.name === name),
        getAttributes: () => attributes, getIndex: () => null
    })
    if(camera.isArrayCamera)
    {
        assert.ok(cameraGroup, 'Stereo overlay must supply the required cameraIndex binding')
        assert.equal(draws, 2, 'The overlay must draw once for each eye')
        assert.deepEqual(viewports, [[0, 0, 400, 600], [400, 0, 400, 600]])
    }
    else
    {
        assert.equal(cameraGroup, undefined, 'Normal web rendering needs no stereo binding')
        assert.equal(draws, 1)
    }

}
console.log('VR overlay: mono/stereo shader bindings, both eye draws and repeated transitions passed')
