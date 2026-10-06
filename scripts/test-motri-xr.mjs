import assert from 'node:assert/strict'
import { Matrix4, Ray, Vector3 } from 'three/webgpu'
import { WORLD_CENTER, WORLD_SPAN, clampWidth, roomToWorld, horizontalPlaneHit, readControllers } from '../sources/xr/math.js'
import { xrHTML } from './vite-xr-page.mjs'

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
console.log('XR checks passed: anchored scaling/rotation, finite surface hits, controller mapping, isolated subpath assets.')
