import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import { CamelCampModel } from '../sources/Game/World/CamelCampModel.js'
import { CAMEL_CAMP, camelPlacements } from '../sources/Game/World/CamelCampSite.js'

const model = new CamelCampModel(new THREE.MeshBasicMaterial({ vertexColors: true }))
let draws = 0, triangles = 0, sourceTriangles = 0, maxRadius = 0
const materials = new Set()
model.root.traverse(mesh => {
    if(!mesh.isMesh) return
    draws++; materials.add(mesh.material)
    const g = mesh.geometry, count = g.index ? g.index.count : g.attributes.position.count
    const instances = mesh.isInstancedMesh ? mesh.count : 1
    triangles += count / 3 * instances; sourceTriangles += count / 3
    for(const a of Object.values(g.attributes)) assert(Array.from(a.array).every(Number.isFinite))
    if(g.index) assert(Array.from(g.index.array).every(i => i < g.attributes.position.count))
    if(mesh.name === 'CamelCamp_Sand')
        for(let i = 0; i < g.attributes.normal.count; i++) assert(g.attributes.normal.getY(i) > .99)
    for(let i = 0; i < instances; i++) {
        const matrix = new THREE.Matrix4()
        if(mesh.isInstancedMesh) mesh.getMatrixAt(i, matrix)
        matrix.premultiply(mesh.matrixWorld)
        const copy = g.clone().applyMatrix4(matrix), p = copy.attributes.position
        for(let j = 0; j < p.count; j++) {
            assert(p.getY(j) >= -.001, 'Geometry below ground')
            maxRadius = Math.max(maxRadius, Math.hypot(p.getX(j) - CAMEL_CAMP.center[0], p.getZ(j) - CAMEL_CAMP.center[2]))
        }
        copy.dispose()
    }
})
assert.equal(camelPlacements.length, 6)
assert.equal(camelPlacements.filter(c => c.seated).length, 2)
assert.equal(camelPlacements.filter(c => c.size < .8).length, 1)
assert.equal(draws, 5); assert.equal(materials.size, 1)
assert(triangles < 10000); assert(maxRadius < CAMEL_CAMP.radius + CAMEL_CAMP.feather)

// Project the real car envelope and each oriented collider onto all four axes.
function intersectsCar(x, z, collider) {
    const u = new THREE.Vector3(1, 0, 0).applyQuaternion(collider.quaternion)
    const v = new THREE.Vector3(0, 0, 1).applyQuaternion(collider.quaternion)
    const dx = collider.position.x - x, dz = collider.position.z - z
    for(const axis of [[1, 0], [0, 1], [u.x, u.z], [v.x, v.z]]) {
        const separation = Math.abs(dx * axis[0] + dz * axis[1])
        const carRadius = 1.02 * Math.abs(axis[0]) + 1.5 * Math.abs(axis[1])
        const obstacleRadius = collider.parameters[0] * Math.abs(u.x * axis[0] + u.z * axis[1])
            + collider.parameters[2] * Math.abs(v.x * axis[0] + v.z * axis[1])
        if(separation > carRadius + obstacleRadius + .08) return false
    }
    return true
}
for(let i = 0; i <= 80; i++)
    for(const c of model.colliders) assert(!intersectsCar(CAMEL_CAMP.respawn[0], CAMEL_CAMP.respawn[2] - i / 80 * 4, c), 'Blocked vehicle approach')

const bodies = model.root.children.filter(o => /Bodies/.test(o.name))
const feetBefore = bodies.map(o => o.instanceMatrix.array.slice()), headsBefore = model.heads.instanceMatrix.array.slice()
model.pose(2.1)
for(let i = 0; i < 6; i++)
    assert.notDeepEqual(model.heads.instanceMatrix.array.slice(i * 16, i * 16 + 16), headsBefore.slice(i * 16, i * 16 + 16))
bodies.forEach((o, i) => assert.deepEqual(o.instanceMatrix.array, feetBefore[i], 'Idle animation must not slide feet'))
console.log({ camels: 6, triangles, sourceTriangles, draws, materials: materials.size, colliders: model.colliders.length, approachSamples: 81, idleMotion: 'passed' })
