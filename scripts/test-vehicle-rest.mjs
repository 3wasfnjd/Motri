// Real Rapier + production vehicle/physics code; no renderer is needed.
// node --experimental-wasm-modules --loader ./scripts/camel-camp-test-loader.mjs scripts/test-vehicle-rest.mjs
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import RAPIER from '@dimforge/rapier3d'
import { Events } from '../sources/Game/Events.js'
import { Physics } from '../sources/Game/Physics/Physics.js'
import { PhysicsVehicle } from '../sources/Game/Physics/PhysicsVehicle.js'

function fixture({ rest = true, groundType = 'fixed', slope = 0, uneven = false, ice = false } = {})
{
    const game = {
        RAPIER, debug: { active: false }, quality: { level: 1 }, world: {},
        water: { surfaceElevation: -1 },
        player: { accelerating: 0, braking: 0, boosting: 0, steering: 0, suspensions: ['low', 'low', 'low', 'low'] },
        ticker: { elapsed: 0, delta: 1/60, deltaScaled: 1/30, deltaAverage: 1/60, events: new Events() },
        audio: { groups: new Map([['hitDefault', { playRandomNext() {} }]]) }
    }
    globalThis.camelTestGame = game
    game.physics = new Physics()
    game.objects = { add(model, description) {
        if(!rest && description.canSleep !== undefined) description = { ...description, canSleep: false }
        return { physical: game.physics.getPhysical(description) }
    } }
    const heights = Float32Array.from({ length: 33 * 33 }, (_, i) =>
        uneven ? .02 * Math.sin((i % 33) * 1.4) * Math.cos(Math.floor(i / 33) * 1.1) : 0)
    const ground = game.objects.add(null, {
        type: groundType, friction: .2, restitution: .15,
        rotation: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), slope),
        colliders: [{ shape: 'heightfield', category: 'floor', parameters: [32, 32, heights, { x: 64, y: 1, z: 64 }] }]
    }).physical
    if(ice) game.world.waterSurface = { ice: { physical: ground }, iceRatio: { value: 1 } }
    const car = new PhysicsVehicle()
    game.physicalVehicle = car
    if(!rest) { car.rest.beforePhysics = () => false; car.rest.afterPhysics = () => {} }
    car.chassis.physical.body.setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(.005, .23, .005)), true)
    const tick = (hz = 60) => {
        game.ticker.delta = 1 / hz; game.ticker.deltaScaled = 2 / hz; game.ticker.deltaAverage = 1 / hz
        game.ticker.elapsed += 1 / hz
        car.updatePrePhysics(); game.physics.update(); car.updatePostPhysics()
    }
    const advance = (seconds, hz = 60) => {
        const end = game.ticker.elapsed + seconds
        while(game.ticker.elapsed < end) tick(typeof hz === 'function' ? hz(game.ticker.elapsed) : hz)
    }
    const close = () => { game.physics.eventQueue.free(); game.physics.world.free() }
    return { game, car, ground, tick, advance, close }
}

function park(f, hz = 60)
{
    f.advance(8, hz)
    assert(f.car.rest.active && f.car.chassis.physical.body.isSleeping(), `Settled car must rest at ${hz} Hz`)
}

// Reproduce the reported standstill problem after a frame-pacing change using
// the original path, then compare the same scenario with settled rest enabled.
const shakeRange = rest => {
    const f = fixture({ rest }); f.advance(10)
    let low = Infinity, high = -Infinity
    while(f.game.ticker.elapsed < 30) {
        f.tick(45 + 15 * Math.sin(f.game.ticker.elapsed * 6))
        low = Math.min(low, f.car.position.y); high = Math.max(high, f.car.position.y)
    }
    f.close(); return high - low
}
const beforeShake = shakeRange(false), afterShake = shakeRange(true)
assert(beforeShake > .05, 'Original path must reproduce a visible parked suspension shake')
assert(afterShake < 1e-7, 'The same parked test must remain still with rest enabled')

// Ten minutes parked, including a late change of frame pacing: no accumulated
// suspension/body motion on flat or mildly uneven ground, at mobile/desktop rates.
for(const [hz, uneven] of [[30, false], [60, false], [120, false], [60, true]])
{
    const f = fixture({ uneven }); park(f, hz)
    const position = f.car.position.clone(), rotation = f.car.quaternion.clone()
    const suspension = f.car.wheels.items.map(w => w.suspensionLength)
    f.advance(600, t => t < 240 ? hz : 45 + 15 * Math.sin(t * 6))
    assert(f.car.rest.active && f.car.chassis.physical.body.isSleeping())
    assert(f.car.position.distanceTo(position) < 1e-7, 'Parked body must not bounce or drift')
    assert.deepEqual(f.car.quaternion, rotation, 'Parked body must not develop a rotational shake')
    assert.deepEqual(f.car.wheels.items.map(w => w.suspensionLength), suspension)
    f.close()
}

// Each active control wakes in its first physics tick, including a horn's
// temporary mid suspension and touch/keyboard jump's high suspension.
for(const input of [
    p => p.accelerating = 1,
    p => p.accelerating = -1,
    p => p.steering = 1,
    p => p.boosting = 1,
    p => p.suspensions[0] = 'mid',
    p => p.suspensions.fill('high')
])
{
    const f = fixture(); park(f); input(f.game.player); f.tick()
    assert(!f.car.rest.active && !f.car.chassis.physical.body.isSleeping(), 'Input must wake immediately')
    f.close()
}

// Respawn, disabled/reactivated car and flip recovery cannot remain asleep.
{
    const f = fixture(); park(f)
    f.car.moveTo(new THREE.Vector3(8, 4, 0)); f.tick()
    assert(!f.car.rest.active && !f.car.chassis.physical.body.isSleeping())
    assert(f.car.position.y < 4 && f.car.position.y > 3)
    park(f); f.car.deactivate(); f.car.activate(); f.tick()
    assert(!f.car.rest.active && !f.car.chassis.physical.body.isSleeping())
    park(f); f.car.flip.jump(); f.tick()
    assert(!f.car.rest.active && !f.car.chassis.physical.body.isSleeping())
    f.close()
}

// Explosion/tornado impulses and real dynamic contacts must still affect it.
{
    const f = fixture(); park(f)
    const before = f.car.position.clone()
    f.car.chassis.physical.body.applyImpulseAtPoint({ x: 2, y: 5, z: 0 }, before, true)
    f.tick()
    assert(!f.car.rest.active && f.car.position.distanceTo(before) > .01)
    f.close()
}
{
    const f = fixture(); park(f)
    const p = f.car.position.clone()
    const obstacle = f.game.objects.add(null, {
        type: 'dynamic', position: new THREE.Vector3(p.x + 4, p.y, p.z),
        colliders: [{ shape: 'ball', category: 'object', parameters: [.8], mass: 5 }]
    }).physical.body
    obstacle.setLinvel({ x: -8, y: 0, z: 0 }, true)
    f.advance(.4)
    assert(!f.car.chassis.physical.body.isSleeping(), 'A collision must wake the car')
    assert(f.car.position.distanceTo(p) > .01, 'A parked car still reacts to a collision')
    f.close()
}

// Removed, disabled or moved support cannot leave a car suspended in mid-air.
for(const change of [
    f => f.ground.colliders[0].setEnabled(false),
    f => f.ground.body.setEnabled(false),
    f => f.ground.body.setTranslation({ x: 0, y: -3, z: 0 }, true),
    f => f.game.physics.world.removeRigidBody(f.ground.body)
])
{
    const f = fixture(); park(f); const y = f.car.position.y
    change(f)
    // Production removes destroyed objects from the physics registry too.
    f.game.physics.physicals = f.game.physics.physicals.filter(p => p.body.isValid())
    f.tick(); f.advance(.2)
    assert(!f.car.rest.active && !f.car.chassis.physical.body.isSleeping())
    assert(f.car.position.y < y - .05, 'Lost support must make the car fall')
    f.close()
}

// Do not artificially park on ice, moving platforms, slopes or in mid-air.
for(const options of [{ ice: true }, { groundType: 'kinematicPositionBased' }, { slope: .2 }])
{
    const f = fixture(options); f.advance(10)
    assert(!f.car.rest.active, 'Unsupported parking conditions must keep live physics')
    f.close()
}
{
    const f = fixture(); f.car.moveTo(new THREE.Vector3(0, 20, 0)); f.advance(.5)
    assert(!f.car.rest.active && f.car.position.y < 20)
    f.close()
}

// During driving, exact transform traces must match the original update path
// with rest disabled: acceleration, steering, boost, brake, reverse and jump.
function driveTrace(rest)
{
    const f = fixture({ rest }), trace = []
    for(let i = 0; i < 600; i++)
    {
        const p = f.game.player
        p.accelerating = i < 180 ? 1 : i < 240 ? 0 : -1
        p.braking = i >= 180 && i < 240 ? 1 : 0
        p.steering = i >= 60 && i < 160 ? .6 : 0
        p.boosting = i >= 90 && i < 150 ? 1 : 0
        p.suspensions.fill(i >= 300 && i < 312 ? 'high' : 'low')
        f.tick(i % 3 === 0 ? 30 : 60)
        trace.push([...f.car.position, ...f.car.quaternion])
    }
    f.close(); return trace
}
assert.deepEqual(driveTrace(true), driveTrace(false), 'Existing driving tuning must stay identical')
console.log(JSON.stringify({ parkedHeightRange: { before: beforeShake, after: afterShake },
    longParking: 'passed (4 x 10 minutes)', controls: 'passed',
    respawnAndFlip: 'passed', impulsesAndContacts: 'passed', lostSupports: 'passed',
    icePlatformsSlopesAir: 'passed', drivingTrace: 'identical' }))
