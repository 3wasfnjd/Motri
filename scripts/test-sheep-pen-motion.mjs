import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import RAPIER from '@dimforge/rapier3d'
import { Events } from '../sources/Game/Events.js'
import { Objects } from '../sources/Game/Objects.js'
import { Physics } from '../sources/Game/Physics/Physics.js'
import { SheepPen } from '../sources/Game/World/SheepPen.js'
import { buildSheepPenModel } from '../sources/Game/World/SheepPenModel.js'
import { SheepPenMotion } from '../sources/Game/World/SheepPenMotion.js'
import { SHEEP_PEN } from '../sources/Game/World/SheepPenSite.js'

const material = new THREE.MeshBasicMaterial({ vertexColors: true })
const model = buildSheepPenModel(material), motion = new SheepPenMotion(model.colliders)
let triangles = 0, draws = 0
model.root.traverse(o => {
    if(!o.isMesh) return
    draws++; assert.equal(o.material, material)
    triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1)
})
assert.equal(triangles, 7848); assert.equal(draws, 4)
assert.equal(model.colliders.length, 25)
assert.equal(motion.states.length, 10)

function assertPose(flock) {
    const m = new THREE.Matrix4(), vertex = new THREE.Vector3()
    for(const mesh of [flock.bodies, flock.heads, flock.legs]) {
        assert(Array.from(mesh.instanceMatrix.array).every(Number.isFinite))
        for(let i = 0; i < mesh.count; i++) {
            mesh.getMatrixAt(i, m)
            const p = mesh.geometry.attributes.position
            for(let j = 0; j < p.count; j++) {
                vertex.fromBufferAttribute(p, j).applyMatrix4(m)
                assert(vertex.y >= .005, 'Head/hooves must stay above the pad')
                assert(Math.abs(vertex.x) < 7.39 && Math.abs(vertex.z) < 5.19, 'All animal geometry stays inside fence')
                assert(mesh.boundingBox.clone().expandByScalar(.0001).containsPoint(vertex), 'Animated bounds must contain limbs')
            }
        }
    }
}

// Two minutes, including a vehicle entering from the open eastern gate.
const travel = Array(10).fill(0), modes = Array.from({ length: 10 }, () => new Set())
for(let frame = 0; frame < 2400; frame++) {
    const previous = motion.states.map(s => [s.x, s.z])
    const car = frame >= 1000 && frame < 1350 ? { x: 4 - (frame - 1000) * .012, z: 0 } : null
    motion.update(.05, car)
    for(let i = 0; i < motion.states.length; i++) {
        const s = motion.states[i]
        assert(motion.walkable(s.x, s.z, s.size), 'No sheep crosses a wall, post, hay or feeder')
        travel[i] += Math.hypot(s.x - previous[i][0], s.z - previous[i][1]); modes[i].add(s.mode)
        for(let j = i + 1; j < motion.states.length; j++) {
            const other = motion.states[j]
            assert(Math.hypot(s.x - other.x, s.z - other.z) >= .69 * (s.size + other.size), 'Flock must not stack')
        }
    }
    if(frame % 100 === 0) { model.flock.pose(motion.states, frame * .05); assertPose(model.flock) }
}
travel.forEach(d => assert(d > 8, 'Every sheep must walk, including both lambs'))
modes.forEach(m => assert(m.has('walk') && m.has('graze') && m.has('idle'), 'Each sheep alternates activities'))

// Looking/grazing changes heads while idle hooves remain planted.
motion.states.forEach(s => { s.walkAmount = 0; s.graze = 1 })
model.flock.pose(motion.states, 2)
const feet = model.flock.legs.instanceMatrix.array.slice(), heads = model.flock.heads.instanceMatrix.array.slice()
model.flock.pose(motion.states, 3)
assert.deepEqual(model.flock.legs.instanceMatrix.array, feet)
assert.notDeepEqual(model.flock.heads.instanceMatrix.array, heads)

// Real Rapier kinematic colliders follow the same states before each physics step.
for(const hz of [30, 144]) {
    const terrain = new THREE.BufferGeometry()
    terrain.setAttribute('position', new THREE.Float32BufferAttribute([-80,0,0, 0,0,0, 0,0,-50, -80,0,-50], 3))
    terrain.setIndex([0,1,2, 0,2,3])
    const playerPosition = new THREE.Vector3(-45, 1, -13.7)
    const game = {
        RAPIER, debug: { active: false }, scene: new THREE.Scene(), respawns: { items: new Map() }, terrain: { size: 192 },
        resources: { terrainModel: { scene: { children: [{ geometry: terrain }] } }, sceneryModel: { scene: new THREE.Group() }, areasModel: { scene: new THREE.Group() } },
        ticker: { delta: 1 / hz, deltaScaled: 2 / hz, events: new Events(), wait() {} },
        water: { surfaceElevation: -1, depthElevation: -20 }, player: { position: playerPosition },
        view: { focusPoint: { position: playerPosition }, optimalArea: { radius: 65 } }
    }
    globalThis.camelTestGame = game
    game.physics = new Physics(); game.objects = new Objects()
    const pen = new SheepPen(), count = game.physics.world.colliders.len()
    assert.equal(count, 25); assert.equal(pen.physical.colliders.length, 15)
    let version = pen.flock.legs.instanceMatrix.version, framesWithAnimation = 0
    for(let frame = 0; frame < hz * 15; frame++) {
        game.ticker.events.trigger('tick')
        if(pen.flock.legs.instanceMatrix.version !== version) { framesWithAnimation++; version = pen.flock.legs.instanceMatrix.version }
        pen.sheepBodies.forEach((body, i) => {
            assert.equal(body.bodyType(), RAPIER.RigidBodyType.KinematicPositionBased)
            const s = pen.motion.states[i], p = body.translation()
            assert(Math.hypot(p.x - SHEEP_PEN.center[0] - s.x, p.z - SHEEP_PEN.center[2] - s.z) < 1e-5, 'Moving collider follows body')
        })
    }
    assert(framesWithAnimation <= 301, 'Animation stays at or below 20 Hz')
    assertPose(pen.flock)
    const before = pen.flock.bodies.instanceMatrix.array.slice(), time = pen.time
    playerPosition.set(150, 1, 150)
    for(let frame = 0; frame < hz * 2; frame++) game.ticker.events.trigger('tick')
    assert.equal(pen.time, time); assert.deepEqual(pen.flock.bodies.instanceMatrix.array, before)
    playerPosition.set(-45, 1, -13.7)
    for(let frame = 0; frame < hz * 3; frame++) game.ticker.events.trigger('tick')
    assert(pen.time > time); assert.equal(game.physics.world.colliders.len(), count)
    game.physics.eventQueue.free(); game.physics.world.free()
}
console.log({ passed: true, sheep: 10, triangles, draws, colliders: 25, twoMinuteTravel: travel.map(d => +d.toFixed(1)),
    checks: 'independent walking/grazing/idle; moving legs; planted idle feet; fences/feeders/flock; 30/144 Hz Rapier sync; 20 Hz cap; distance sleep/resume' })
