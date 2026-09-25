import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import { OBB } from 'three/addons/math/OBB.js'
import { buildCamelCampPickup } from '../sources/Game/World/CamelCampPickup.js'
import { CamelCampModel } from '../sources/Game/World/CamelCampModel.js'
import { SHAS_PICKUP, CAMEL_CAMP, shasParkingContains, camelCampFlattenWeight } from '../sources/Game/World/CamelCampSite.js'
import { CAMP_LIGHT_CARTS } from '../sources/Game/World/SiteLightingLayout.js'

const material = new THREE.MeshBasicMaterial({ vertexColors: true })
const pickup = buildCamelCampPickup(material), mesh = pickup.mesh, g = mesh.geometry
assert.equal(mesh.material, material)
assert.equal(mesh.children.length, 0, 'Parked vehicle should use one mesh draw')
assert.equal(mesh.userData.roadWheels, 4); assert.equal(mesh.userData.spareWheels, 1)
assert.equal(pickup.colliders.length, 3)
assert(g.attributes.position.count / 3 < 8000)
for(const a of Object.values(g.attributes)) assert(Array.from(a.array).every(Number.isFinite))
assert(Math.abs(g.boundingBox.min.y) < 1e-5, 'Road tyres meet the ground')
assert(g.boundingBox.max.y > 1.9 && g.boundingBox.max.y < 2.1)
assert(mesh.userData.wheelCenters.every(p => Math.abs(p[1] - .405) < 1e-6))
assert.equal(new Set(mesh.userData.wheelCenters.map(p => p.join(','))).size, 4)

mesh.position.fromArray(SHAS_PICKUP.position); mesh.rotation.y = SHAS_PICKUP.yaw; mesh.updateMatrixWorld(true)
const bounds = new THREE.Box3().setFromObject(mesh)
for(const x of [bounds.min.x, bounds.max.x]) for(const z of [bounds.min.z, bounds.max.z]) {
    assert(shasParkingContains(x, z), 'Car must fit the parking clearing')
    assert.equal(camelCampFlattenWeight(x, z), 1, 'Visible car and collision ground stay flat')
}
const makeBox = (p, q, half) => new OBB(p.clone(), new THREE.Vector3(...half),
    new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q)))
const camp = new CamelCampModel(material)
const boxes = pickup.colliders.map(c => makeBox(c.position.clone().applyMatrix4(mesh.matrixWorld), mesh.quaternion, c.parameters))
for(const box of boxes) {
    for(const c of camp.colliders) assert(!box.intersectsOBB(makeBox(c.position, c.quaternion, c.parameters)), 'Camp obstacle overlap')
    for(const p of CAMP_LIGHT_CARTS) {
        const position = new THREE.Vector3(CAMEL_CAMP.center[0] + p.x, 1.7, CAMEL_CAMP.center[2] + p.z)
        assert(!box.intersectsOBB(makeBox(position, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), p.yaw), [1.0,1.7,1.0])), 'Light cart overlap')
    }
    for(let i = 0; i <= 80; i++) {
        const position = new THREE.Vector3(CAMEL_CAMP.respawn[0], 1.02, CAMEL_CAMP.respawn[2] - i / 20)
        assert(!box.intersectsOBB(makeBox(position, new THREE.Quaternion(), [1.02,1.02,1.5])), 'Car approach blocked')
    }
}
console.log({ triangles: g.attributes.position.count / 3, draws: 1, colliders: 3,
    checks: 'ground, full parking footprint, 4 tyres, budget, camp and cart clearance, open vehicle approach' })
