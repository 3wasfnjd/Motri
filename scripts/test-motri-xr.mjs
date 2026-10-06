import assert from 'node:assert/strict'
import { Matrix4, Ray, Vector3 } from 'three/webgpu'
import { DRIVER_EYE, WORLD_CENTER, WORLD_SPAN, clampWidth, roomToWorld, horizontalPlaneHit, readControllers, vehicleCameraPose } from '../sources/xr/math.js'
import { xrHTML } from './vite-xr-page.mjs'
import WebGLState from 'three/src/renderers/webgl-fallback/utils/WebGLState.js'
import { installXRFramebufferCompatibility, installXRBindingCompatibility, setScaledProjectionFromUnion } from '../sources/xr/compatibility.js'

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
// The anchor is the tray's underside: the sea bed and terrain sit above the
// detected surface rather than sinking into the real table.
assert.ok(WORLD_CENTER.y < -1.5 - 2)
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
    assert.equal(driver.position.y, position.y + DRIVER_EYE.y)
    // Left-hand drive: the eye sits left of the centre line, slightly behind it.
    const right = forward.clone().cross(new Vector3(0, 1, 0))
    assert.ok(Math.abs(driver.position.clone().sub(position).dot(right) - DRIVER_EYE.z) < 1e-8)
    assert.ok(Math.abs(driver.position.clone().sub(position).dot(forward) - DRIVER_EYE.x) < 1e-8)
    assert.ok(chase.position.clone().sub(position).dot(forward) < -4.9)
    const viewForward = new Vector3(0, 0, -1).applyQuaternion(driver.rotation)
    assert.ok(viewForward.distanceTo(forward) < 1e-8)
    assert.ok(vehicleCameraPose(position, forward, 'driver', Math.PI / 2).position.distanceTo(driver.position) < 1e-8)
}
// On a slope the eye stays at the same seat point of the tilted body, while the
// view keeps a level horizon.
{
    const { Quaternion } = await import('three/webgpu')
    const position = new Vector3(3, 2, -4)
    const pitch = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 0.35)
    const forward = new Vector3(1, 0, 0).applyQuaternion(pitch)
    const pose = vehicleCameraPose(position, forward, 'driver', 0, pitch)
    assert.ok(pose.position.distanceTo(DRIVER_EYE.clone().applyQuaternion(pitch).add(position)) < 1e-8)
    const up = new Vector3(0, 1, 0).applyQuaternion(pose.rotation)
    assert.ok(up.distanceTo(new Vector3(0, 1, 0)) < 1e-8)
}

// Union frustum under a scaled rig: every point seen by either eye must be inside
// the culling frustum. Three's own union mixes world and eye units and fails.
{
    const { PerspectiveCamera, ArrayCamera, Frustum, Group } = await import('three/webgpu')
    for(const scale of [1, 256 / 1.8, 256 / 0.5]) {
        const rig = new Group()
        rig.position.set(4, 300, -2); rig.rotation.y = 0.7; rig.scale.setScalar(scale); rig.updateMatrixWorld(true)
        const eyes = [-0.032, 0.032].map(x => {
            const eye = new PerspectiveCamera(); eye.position.set(x, 1.4, 0.3); eye.rotation.x = -0.5; eye.updateMatrix()
            // Quest 3-like asymmetric projections.
            const n = 0.025, f = 50
            eye.projectionMatrix.makePerspective(n * (x < 0 ? -1.2 : -0.9), n * (x < 0 ? 0.9 : 1.2), n * 1.0, n * -1.15, n, f)
            eye.matrixWorld.multiplyMatrices(rig.matrixWorld, eye.matrix)
            eye.matrixWorldInverse.copy(eye.matrixWorld).invert()
            return eye
        })
        const union = new ArrayCamera(eyes)
        setScaledProjectionFromUnion(union, eyes[0], eyes[1])
        const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(union.projectionMatrix, union.matrixWorldInverse))
        let checked = 0
        for(const eye of eyes) for(const x of [-0.98, 0, 0.98]) for(const y of [-0.98, 0, 0.98]) for(const z of [-0.98, 0.2, 0.98]) {
            const point = new Vector3(x, y, z).applyMatrix4(new Matrix4().copy(eye.projectionMatrix).invert()).applyMatrix4(eye.matrixWorld)
            assert.ok(frustum.containsPoint(point), `Visible point culled at rig scale ${scale}`)
            checked++
        }
        assert.equal(checked, 54)
    }
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
// The real body stays visible from the seat (windshield frame, headliner, hood).
assert.equal(exterior.visible, true)
assert.equal(cabin.cabin.visible, true)
assert.ok(head.clone().applyQuaternion(rig.quaternion).add(rig.position).distanceTo(cabin.position) < 1e-8)
// Steering wheel: real size, ahead of and below the eye, raked toward the dash,
// and counter-clockwise (seen from the seat) for a left turn.
{
    const { STEERING_WHEEL } = await import('../sources/xr/VehicleCamera.js')
    cabin.cabin.updateMatrixWorld(true)
    const centre = cabin.wheel.getWorldPosition(new Vector3()).sub(cabin.position)
    assert.ok(Math.abs(centre.x - STEERING_WHEEL.ahead) < 1e-6 && Math.abs(centre.y + STEERING_WHEEL.below) < 1e-6 && Math.abs(centre.z) < 1e-6)
    const rim = cabin.wheel.children[0].geometry.parameters
    assert.ok(Math.abs((rim.radius + rim.tube) * 2 - 0.37) < 1e-6)
    const top = () => { cabin.cabin.updateMatrixWorld(true); return cabin.wheel.localToWorld(new Vector3(0, 0.17, 0)).sub(cabin.wheel.getWorldPosition(new Vector3())) }
    const level = top()
    assert.ok(level.x > 0.05 && level.y > 0.15, 'Wheel top leans toward the dashboard')
    cabin.update(vehicle, head, rig, 0, 1)
    assert.ok(top().z < -0.1, 'Left steering turns the wheel top to the left (-z)')
    cabin.update(vehicle, head, rig, 0, -1)
    assert.ok(top().z > 0.1)
}
cabin.mode = 'chase'; cabin.reset(); cameraHit = { timeOfImpact: 2 }
cabin.update(vehicle, head, rig, 0, 0)
assert.equal(exterior.visible, true)
assert.equal(cabin.cabin.visible, false)
assert.ok(cabin.position.distanceTo(vehicle.position.clone().add(new Vector3(0, .7, 0))) <= 1.751)
cabin.mode = 'driver'; cabin.reset(); cabin.update(vehicle, head, rig, 0, 0)
cabin.setCabinVisible(false)
assert.equal(exterior.visible, true)
assert.equal(cabin.cabin.visible, false)
console.log('XR camera obstruction, physical head movement, visible exterior and steering-wheel geometry passed.')
