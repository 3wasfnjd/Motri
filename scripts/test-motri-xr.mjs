import assert from 'node:assert/strict'
import { Matrix4, Ray, Vector3 } from 'three/webgpu'
import { WORLD_CENTER, WORLD_SPAN, clampWidth, roomToWorld, horizontalPlaneHit, readControllers, vehicleCameraPose } from '../sources/xr/math.js'
import { xrHTML } from './vite-xr-page.mjs'
import WebGLState from 'three/src/renderers/webgl-fallback/utils/WebGLState.js'
import { installXRFramebufferCompatibility, installXRBindingCompatibility } from '../sources/xr/compatibility.js'

// The chosen surface point stays fixed through every scale and rotation; body and
// terrain positions stay in world coordinates, including below-zero terrain.
const anchor = new Vector3(0.6, 0.75, -1.2)
for(const width of [0.5, 1.8, 6]) for(const yaw of [0, Math.PI / 2, -1.2]) {
    const transform = roomToWorld(anchor, yaw, width)
    assert.ok(anchor.clone().applyMatrix4(transform).distanceTo(WORLD_CENTER) < 1e-8)
    const worldToRoom = transform.clone().invert()
    const a = WORLD_CENTER.clone().add(new Vector3(-WORLD_SPAN / 2, 0, 0)).applyMatrix4(worldToRoom)
    const b = WORLD_CENTER.clone().add(new Vector3(WORLD_SPAN / 2, 0, 0)).applyMatrix4(worldToRoom)
    assert.ok(Math.abs(a.distanceTo(b) - width) < 1e-8)
    assert.ok(Math.abs(a.y - anchor.y) < 1e-8)
}
assert.equal(clampWidth(-2), 0.5)
assert.equal(clampWidth(100), 6)

// Accept only a ray inside the actual horizontal surface polygon; the mere plane
// equation (or a wall) must never count as a supported placement surface.
const table = { orientation: 'horizontal', planeSpace: {}, polygon: [{ x: -0.5, z: -0.5 }, { x: 0.5, z: -0.5 }, { x: 0.5, z: 0.5 }, { x: -0.5, z: 0.5 }] }
const frame = { getPose: () => ({ transform: { matrix: new Matrix4().makeTranslation(0, 0.75, -1).elements } }) }
const hit = horizontalPlaneHit(new Ray(new Vector3(0, 1.5, -1), new Vector3(0, -1, 0)), [table], frame, {})
assert.equal(hit.position.y, 0.75)
assert.equal(horizontalPlaneHit(new Ray(new Vector3(1, 1.5, -1), new Vector3(0, -1, 0)), [table], frame, {}), null)
assert.equal(horizontalPlaneHit(new Ray(new Vector3(0, 1.5, -1), new Vector3(0, 1, 0)), [table], frame, {}), null)
assert.equal(horizontalPlaneHit(new Ray(new Vector3(0, 1.5, -1), new Vector3(0, -1, 0)), [{ ...table, orientation: 'vertical' }], frame, {}), null)

const source = (handedness, axes, trigger) => ({ handedness, gamepad: { axes, buttons: [{ value: trigger }] } })
const inputs = readControllers([source('right', [0, 0, 0, 0], 0.8), source('left', [0, 0, -1, 0], 0.2)])
assert.equal(inputs.left.x, -1)
assert.equal(inputs.right.trigger - inputs.left.trigger, 0.8 - 0.2)
assert.equal(readControllers([]).left, null)
assert.equal(readControllers([source('left', [0, 0, 0.1, 0], 0)]).left.x, 0)

const html = xrHTML('<html lang="ar" dir="rtl"><head><title>موتري</title><script type="module" src="./assets/main.js"></script></head><body></body></html>', './assets/xr.js', ['assets/xr.css'])
assert.ok(html.includes('<base href="../">'))
assert.ok(html.includes('./assets/xr.js'))
assert.ok(html.includes('./assets/xr.css'))
assert.ok(!html.includes('main.js'))

// Reproduce Three r183's actual null-framebuffer crash, then exercise the
// compatibility path and verify native Quest FBOs still use the original code.
const calls = []
const state = Object.create(WebGLState.prototype)
state.gl = { FRAMEBUFFER: 36160, BACK: 1029, COLOR_ATTACHMENT0: 36064, drawBuffers: values => calls.push(['draw', ...values]), bindFramebuffer: (target, value) => calls.push(['bind', target, value]) }
state.currentBoundFramebuffers = {}
state.currentDrawbuffers = new WeakMap()
const xrContext = { textures: [{}], renderTarget: { isXRRenderTarget: true } }
assert.throws(() => state.drawBuffers(xrContext, null), TypeError)
installXRFramebufferCompatibility({ backend: { state } })
state.drawBuffers(xrContext, null)
assert.deepEqual(calls.splice(0), [['bind', 36160, null], ['draw', 1029]])
assert.equal(xrContext.textures.length, 1)
const questFramebuffer = {}
state.drawBuffers(xrContext, questFramebuffer)
assert.deepEqual(calls.splice(0), [['draw', 36064]])
assert.deepEqual(state.currentDrawbuffers.get(questFramebuffer), [36064])
state.drawBuffers({ textures: null, renderTarget: null }, null)
assert.deepEqual(calls.splice(0), [['draw', 1029]])

// Shared stereo camera bindings must not steal another material's buffer slot.
const bindingData = new WeakMap(), usedLayouts = []
const cameraBinding = { name: 'cameraIndex', isUniformBuffer: true }
const uniform = name => ({ name, isUniformBuffer: true })
const programA = {}, programB = {}
const backend = {
    isWebGLBackend: true,
    state: { useProgram() {} },
    gl: { INVALID_INDEX: 4294967295, getUniformBlockIndex: () => 0, uniformBlockBinding() {} },
    get(key) { if(!bindingData.has(key)) bindingData.set(key, {}); return bindingData.get(key) },
    draw(object) { usedLayouts.push(object.getBindings().flatMap(g => g.bindings.map(b => this.get(b).index))) }
}
const helperGroups = [{ bindings: [uniform('helper'), cameraBinding] }]
const worldGroups = [{ bindings: [uniform('terrain'), uniform('instances'), cameraBinding] }]
backend.get(programA).programGPU = {}; backend.get(programB).programGPU = {}
const helper = { pipeline: programA, getBindings: () => helperGroups }
const world = { pipeline: programB, getBindings: () => worldGroups }
installXRBindingCompatibility({ backend })
backend.draw(helper); backend.draw(world); backend.draw(helper)
assert.deepEqual(usedLayouts, [[0, 1], [0, 1, 2], [0, 1]])

// Driver eye remains inside the H9 cabin; chase stays behind the vehicle.
// Looking around or snap-turning cannot move either camera's anchor point.
for(const forward of [new Vector3(1, 0, 0), new Vector3(0, 0, -1)]) {
    const position = new Vector3(8, 1, 12)
    const driver = vehicleCameraPose(position, forward, 'driver')
    const chase = vehicleCameraPose(position, forward, 'chase')
    assert.ok(driver.position.distanceTo(position) < 0.6)
    assert.equal(driver.position.y, position.y + 0.43)
    assert.ok(chase.position.clone().sub(position).dot(forward) < -4.9)
    const viewForward = new Vector3(0, 0, -1).applyQuaternion(driver.rotation)
    assert.ok(viewForward.distanceTo(forward) < 1e-8)
    assert.ok(vehicleCameraPose(position, forward, 'driver', Math.PI / 2).position.distanceTo(driver.position) < 1e-8)
}
console.log('XR checks passed: anchored scaling/rotation, finite surface hits, controller mapping, isolated subpath assets.')
console.log('XR framebuffer regression passed: emulator default buffer and native Quest FBO.')
console.log('XR shared bindings and driver/chase camera regressions passed.')

// A filtered vehicle anchor must never filter physical head movement; probe
// scene collision in chase mode and restore the exterior on exit/re-entry.
const { VehicleCamera } = await import('../sources/xr/VehicleCamera.js')
const { Scene, Group, Quaternion } = await import('three/webgpu')
globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }) }
let cameraHit = null
const exterior = { visible: true }
const cameraGame = {
    scene: new Scene(), world: { visualVehicle: { parts: { chassis: exterior } } },
    RAPIER: { Ray: class {}, QueryFilterFlags: { EXCLUDE_SENSORS: 1 } },
    physics: { world: { castRay: () => cameraHit } }
}
const vehicle = { position: new Vector3(0, 1, 0), forward: new Vector3(1, 0, 0), xzSpeed: 5, chassis: { physical: { body: {} } } }
const rig = new Group(), head = new Vector3(0, 1.6, 0)
const cabin = new VehicleCamera(cameraGame)
cabin.update(vehicle, head, rig, 0, 0)
assert.equal(exterior.visible, false)
assert.ok(head.clone().applyQuaternion(rig.quaternion).add(rig.position).distanceTo(cabin.position) < 1e-8)
cabin.mode = 'chase'; cabin.reset(); cameraHit = { timeOfImpact: 2 }
cabin.update(vehicle, head, rig, 0, 0)
assert.equal(exterior.visible, true)
assert.ok(cabin.position.distanceTo(vehicle.position.clone().add(new Vector3(0, .7, 0))) <= 1.751)
cabin.mode = 'driver'; cabin.reset(); cabin.update(vehicle, head, rig, 0, 0)
cabin.setCabinVisible(false)
assert.equal(exterior.visible, true)
console.log('XR camera obstruction, physical head movement and exterior restoration passed.')
