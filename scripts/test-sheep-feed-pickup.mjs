import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import { buildSheepFeedPickup } from '../sources/Game/World/SheepFeedPickup.js'
import { buildSheepPenModel } from '../sources/Game/World/SheepPenModel.js'
import { FEED_PICKUP, SHEEP_PEN, sheepPenFlattenWeight } from '../sources/Game/World/SheepPenSite.js'

const material = new THREE.MeshBasicMaterial({ vertexColors: true })
const pickup = buildSheepFeedPickup(material), pen = buildSheepPenModel(material)
const triangles = pickup.mesh.geometry.attributes.position.count / 3
assert(triangles < 5000, 'Parked prop stays below 5k triangles')
assert.equal(pickup.mesh.material, material)
assert.equal(pickup.mesh.userData.wheels, 4)
assert.equal(pickup.mesh.userData.hayBales, 6); assert.equal(pickup.mesh.userData.alfalfaBales, 10)
assert.equal(pickup.colliders.length, 3)
for(const a of Object.values(pickup.mesh.geometry.attributes)) assert(Array.from(a.array).every(Number.isFinite))
const local = pickup.mesh.geometry.boundingBox, dimensions = local.getSize(new THREE.Vector3())
assert(dimensions.z > 4.8 && dimensions.z < 5.1)
assert(Math.abs(local.min.y - .014) < 1e-5, 'Tires sit just above the .01m pad')
const world = local.clone().translate(new THREE.Vector3(...FEED_PICKUP.center))
const [x0,x1,z0,z1] = FEED_PICKUP.parking
assert(world.min.x > x0 && world.max.x < x1 && world.min.z > z0 && world.max.z < z1)
assert(world.max.x < -44.4, 'Pickup remains clear of circuit asphalt')
for(let z = world.min.z; z <= world.max.z; z += .2)
    for(let x = world.min.x; x <= world.max.x; x += .2) assert.equal(sheepPenFlattenWeight(x,z), 1)

// SAT for a 3 x 2.04 m vehicle heading through the east-facing gateway.
function hitsCar(x, z, collider) {
    const u = new THREE.Vector3(1,0,0).applyQuaternion(collider.quaternion)
    const v = new THREE.Vector3(0,0,1).applyQuaternion(collider.quaternion)
    const dx = collider.position.x - x, dz = collider.position.z - z
    for(const [ax,az] of [[1,0],[0,1],[u.x,u.z],[v.x,v.z]]) {
        const separation = Math.abs(dx * ax + dz * az)
        const car = 1.5 * Math.abs(ax) + 1.02 * Math.abs(az)
        const obstacle = collider.parameters[0] * Math.abs(u.x * ax + u.z * az)
            + collider.parameters[2] * Math.abs(v.x * ax + v.z * az)
        if(separation > car + obstacle + .06) return false
    }
    return true
}
for(let i = 0; i <= 200; i++) {
    const x = -42.8 - i / 200 * 7.5
    for(const c of pen.colliders) assert(!hitsCar(x, SHEEP_PEN.center[2], c), 'Gate/approach blocked')
}
const attached = pen.root.getObjectByName('SheepPen_FeedPickup')
assert(attached && attached.castShadow && attached.receiveShadow)
const center = attached.getWorldPosition(new THREE.Vector3())
assert(center.distanceTo(new THREE.Vector3(...FEED_PICKUP.center)) < 1e-6)
console.log({ passed: true, pickupTriangles: triangles, hayBales: 6, alfalfaBales: 10, colliders: 3,
    approachSamples: 201, parking: 'flat; beside open gate; clear of road', textures: 0, materialsAdded: 0 })
