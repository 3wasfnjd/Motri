import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import RAPIER from '@dimforge/rapier3d'
import { Events } from '../sources/Game/Events.js'
import { Objects } from '../sources/Game/Objects.js'
import { Physics } from '../sources/Game/Physics/Physics.js'
import { Explosions } from '../sources/Game/Explosions.js'
import { CamelCamp } from '../sources/Game/World/CamelCamp.js'
import { CAMEL_RETURN_DELAY } from '../sources/Game/World/CamelCampMotion.js'

// Run with the adjacent test loader and --experimental-wasm-modules.
// Rapier, Objects, Explosions, CamelCamp and instance geometry are production code.
function fixture() {
    const terrain = new THREE.BufferGeometry()
    terrain.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 50,0,0, 50,0,-50, 0,0,-50], 3))
    terrain.setIndex([0,1,2, 0,2,3])
    const waits = [], game = {
        RAPIER, scene: new THREE.Scene(), resources: { terrainModel: { scene: { children: [{ geometry: terrain }] } } },
        debug: { active: false }, terrain: { size: 192 }, respawns: { items: new Map() },
        player: { position: new THREE.Vector3(26, 1, -10) }, water: { surfaceElevation: -1, depthElevation: -20 },
        view: { focusPoint: { position: new THREE.Vector3(26, 1, -10) }, roll: { kick() {} }, optimalArea: { radius: 65 } },
        time: { bulletTime: { activate() {} } }, world: {},
        ticker: { delta: 1/60, deltaScaled: 1/30, events: new Events(), wait(n, fn) { waits.push([n, fn]) } }
    }
    globalThis.camelTestGame = game
    game.physics = new Physics(); game.objects = new Objects(); game.explosions = new Explosions()
    game.objects.add(null, { type: 'fixed', position: new THREE.Vector3(0, -.25, 0),
        colliders: [{ shape: 'cuboid', category: 'floor', parameters: [200, .25, 200] }] })
    const vehicle = game.objects.add(null, { type: 'dynamic', position: new THREE.Vector3(60, 1.02, -10), mass: 1,
        colliders: [{ shape: 'cuboid', category: 'object', parameters: [1.02, 1.02, 1.5] }] })
    game.physicalVehicle = { chassis: vehicle }
    const camp = new CamelCamp()
    const advance = (seconds, hz = 60) => {
        for(let frame = 0; frame < Math.ceil(seconds * hz); frame++) {
            game.ticker.delta = 1 / hz; game.ticker.deltaScaled = 2 / hz
            for(let i = 0; i < waits.length; i++) if(--waits[i][0] === 0) {
                const fn = waits[i][1]; waits.splice(i--, 1); fn()
            }
            game.ticker.events.trigger('tick')
        }
    }
    return { game, camp, advance, close() { game.physics.eventQueue.free(); game.physics.world.free() } }
}

function equalVector(actual, expected, epsilon = 1e-5) {
    assert(Math.hypot(actual.x - expected.x, actual.y - expected.y, actual.z - expected.z) < epsilon)
}
function assertHome(camp) {
    assert.equal(camp.motion.activeCount, 0)
    for(const [index, item] of camp.motion.items.entries()) {
        const body = item.object.physical.body
        assert.equal(body.bodyType(), RAPIER.RigidBodyType.Fixed)
        assert.equal(item.object.physical.type, 'fixed')
        equalVector(body.translation(), item.homePosition)
        assert(Math.abs(new THREE.Quaternion().copy(body.rotation()).dot(item.homeRotation)) > .99999)
        equalVector(body.linvel(), new THREE.Vector3()); equalVector(body.angvel(), new THREE.Vector3())
        const camel = camp.model.camels[index], position = new THREE.Vector3().setFromMatrixPosition(camel.matrix)
        assert(Math.abs(position.y - .018) < 1e-5, 'Feet must return to ground, including kneeling camels')
    }
}
function assertRender(camp) {
    for(const mesh of [...camp.model.bodyBatches, camp.model.heads]) {
        assert(Array.from(mesh.instanceMatrix.array).every(Number.isFinite), 'No invalid instance transforms')
        for(let i = 0; i < mesh.count; i++) {
            const m = new THREE.Matrix4(); mesh.getMatrixAt(i, m)
            const sphere = mesh.geometry.boundingSphere.clone().applyMatrix4(m)
            assert(mesh.boundingSphere.distanceToPoint(sphere.center) + sphere.radius <= .001,
                'Culling bounds must contain displaced animals')
        }
    }
    for(let i = 0; i < camp.model.camels.length; i++) {
        const expected = camp.model.camels[i].matrix.clone().multiply(camp.model.headOffsets[i])
        const actual = camp.model.headBases[i]
        expected.elements.forEach((n, j) => assert(Math.abs(n - actual.elements[j]) < 1e-6, 'Neck must follow its own body'))
    }
}
function blastAt(f, index = 0, radius = 5, strength = 8, vehicleOnly = false) {
    const p = new THREE.Vector3().copy(f.camp.motion.items[index].object.physical.body.translation())
    p.x -= .8
    f.game.explosions.explode(p, radius, strength, vehicleOnly)
}

// Crates use Fireballs.create -> Explosions.explode(position, 5, 8).
// Exercise that real explosion impulse, including its delayed physics tick.
{
    const f = fixture(), { camp, game, advance } = f
    const before = camp.model.bodyBatches.map(b => b.instanceMatrix.array.slice())
    const physicsCount = game.physics.physicals.length, colliderCount = game.physics.world.colliders.len()
    assert.equal(colliderCount, 17) // 12 camp + 3 parked Shas + test ground + test car
    assert.equal(camp.pickup.object.physical.body.bodyType(), RAPIER.RigidBodyType.Fixed)
    assert.equal(camp.physical.colliders.length, 6, 'Only tent/tanker/trough stay in the shared fixed body')
    blastAt(f)
    assert(camp.motion.activeCount > 0 && camp.motion.activeCount < 6, 'Only nearby camels respond')
    const hit = camp.motion.items[0]
    advance(.25)
    assert(hit.object.physical.body.translation().y > hit.homePosition.y + .5, 'Real crate impulse must lift camel')
    assert.notDeepEqual(camp.model.bodyBatches[0].instanceMatrix.array, before[0])
    assertRender(camp)
    assert.equal(camp.physical.type, 'fixed', 'Truck and tent stay fixed')
    advance(CAMEL_RETURN_DELAY)
    assertHome(camp); assertRender(camp)
    assert.equal(game.physics.physicals.length, physicsCount)
    assert.equal(game.physics.world.colliders.len(), colliderCount, 'Reactions must not allocate duplicate colliders')
    f.close()
}

// Standing adults, calf and kneeling adults recover at both 30 and 144 Hz.
for(const hz of [30, 144]) {
    const f = fixture()
    for(let i = 0; i < 6; i++) {
        blastAt(f, i, 1.2)
        assert(f.camp.motion.items[i].active)
        f.advance(.3, hz); assertRender(f.camp)
        f.advance(CAMEL_RETURN_DELAY + .1, hz); assertHome(f.camp)
    }
    f.close()
}

// Distant/vehicle-only/zero-strength explosions do not activate scenery.
{
    const f = fixture()
    f.game.explosions.explode(new THREE.Vector3(-60, 1, 60), 5, 8)
    blastAt(f, 0, 5, 8, true); blastAt(f, 0, 5, 0)
    assertHome(f.camp)
    const time = f.camp.time
    f.game.player.position.set(150, 1, 150); f.advance(1)
    assert.equal(f.camp.time, time, 'Idle camp still sleeps at distance')
    blastAt(f, 0, 30)
    assert.equal(f.camp.motion.activeCount, 6)
    f.advance(.4); assertRender(f.camp)
    f.advance(CAMEL_RETURN_DELAY); assertHome(f.camp)
    const restoredTime = f.camp.time; f.advance(1)
    assert.equal(f.camp.time, restoredTime, 'Offscreen recovery finishes then animation sleeps')
    f.close()
}

// A repeated blast uses the displaced position and restarts the return delay.
{
    const f = fixture()
    blastAt(f, 0, 1.2); f.advance(4)
    const item = f.camp.motion.items[0]
    blastAt(f, 0, 1.2); f.advance(3)
    assert(item.active, 'Latest nearby blast resets the timer')
    f.advance(3.2); assertHome(f.camp)
    f.close()
}

// Never respawn a solid camel through a vehicle parked on its original spot.
{
    const f = fixture()
    blastAt(f, 0, 1.2); f.advance(1)
    const item = f.camp.motion.items[0], car = f.game.physicalVehicle.chassis.physical.body
    car.setTranslation(new THREE.Vector3(item.homePosition.x, 1.02, item.homePosition.z), true)
    f.advance(CAMEL_RETURN_DELAY)
    assert(item.active, 'Occupied home must wait')
    car.setTranslation(new THREE.Vector3(60, 1.02, -10), true)
    f.advance(.1); assertHome(f.camp)
    f.close()
}
console.log('PASS: real Rapier crate impulse; all 6 camels; render/collider alignment; 30/144 Hz; chained/distant/vehicle-only blasts; offscreen return; occupied spawn; no collider growth.')
