// Production Rapier WASM, clock, suspension and explosion paths; no renderer.
// node --experimental-wasm-modules --loader ./scripts/camel-camp-test-loader.mjs scripts/test-motri-xr-physics.mjs
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import RAPIER from '@dimforge/rapier3d'
import gsap from 'gsap'
import { Ticker } from '../sources/Game/Ticker.js'
import { Time } from '../sources/Game/Time.js'
import { Physics } from '../sources/Game/Physics/Physics.js'
import { PhysicsVehicle } from '../sources/Game/Physics/PhysicsVehicle.js'
import { Explosions } from '../sources/Game/Explosions.js'
import { MotriXR, XR_BOOST_TOP_SPEED, XR_BOOST_MULTIPLIER } from '../sources/xr/MotriXR.js'
import { XRWorldBounds } from '../sources/xr/WorldBounds.js'
import { roomToWorld, WORLD_SPAN } from '../sources/xr/math.js'

const realNow = Date.now
function fixture({ xr = true, hz = 90 } = {}) {
    let clock = 0
    Date.now = () => 100000 + clock
    const game = {
        xrEnabled: xr, RAPIER, debug: { active: false }, quality: { level: 1 }, world: {},
        scene: new THREE.Scene(), water: { surfaceElevation: -1, depthElevation: -1.5 },
        view: { focusPoint: { position: new THREE.Vector3() }, roll: { kick() {} } },
        player: { accelerating: 0, braking: 0, boosting: 0, steering: 0, suspensions: ['low', 'low', 'low', 'low'] },
        audio: { groups: new Map([['hitDefault', { playRandomNext() {} }]]) }
    }
    globalThis.camelTestGame = game
    game.ticker = new Ticker(); game.time = new Time(); game.physics = new Physics()
    game.objects = { list: [], add(model, description) {
        const object = { physical: game.physics.getPhysical(description) }
        object.physical.body.userData = { object }
        this.list.push(object)
        return object
    } }
    game.objects.add(null, { type: 'fixed', position: new THREE.Vector3(0, -.25, 0),
        colliders: [{ shape: 'cuboid', category: 'floor', parameters: [200, .25, 200] }] })
    const car = game.physicalVehicle = new PhysicsVehicle()
    game.explosions = new Explosions()
    const tick = (rate = hz) => { clock += 1000 / rate; game.ticker.update(clock) }
    const advance = seconds => { for(let i = 0; i < Math.ceil(seconds * hz); i++) tick() }
    const close = () => { game.physics.eventQueue.free(); game.physics.world.free(); Date.now = realNow }
    return { game, car, hz, tick, advance, close }
}

function arScene(f, width, yaw = 0) {
    const { game } = f
    game.world.floor = { mesh: new THREE.Object3D() }
    game.world.waterSurface = { mesh: new THREE.Object3D(), ice: { physical: { body: null } }, iceRatio: { value: 0 } }
    game.overlay = game.view.speedLines = { mesh: new THREE.Object3D() }
    game.interactivePoints = { items: [], activeItem: null }
    game.fog = { near: {}, far: {} }
    const xr = Object.assign(Object.create(MotriXR.prototype), {
        game, session: {}, saved: {}, mode: 'immersive-ar', width, yaw,
        worldBounds: new XRWorldBounds(game), menu: { opened: false },
        placed: true, anchorTracked: true, anchorPosition: new THREE.Vector3(.6, .75, -1.2),
        sky: { mesh: new THREE.Object3D() }, vehicleCamera: { setCabinVisible() {} },
        rig: new THREE.Group(), arParticles: [], savedVisibility: new Map(), fullFloor: {}
    })
    game.ticker.events.on('tick', () => xr.updateWorld(), 990)
    return xr
}

function flight({ count = 1, stagger = 0, hz = 90, xr = true, width, yaw = 0, offset = 0 } = {}) {
    const f = fixture({ hz, xr }), { game, car } = f
    const ar = width === undefined ? null : arScene(f, width, yaw)
    f.advance(8)
    const base = car.position.clone(), origin = base.clone().setY(.5)
    origin.x += offset
    let peak = 0, landed = null, lifted = false
    const trace = []
    for(let i = 0; i < hz * 15; i++) {
        for(let n = 0; n < count; n++) if(i === Math.round(n * stagger * hz))
            game.explosions.explode(origin, 5, 8)
        f.tick()
        trace.push([...car.position, ...car.quaternion])
        if(ar) {
            const expected = roomToWorld(ar.anchorPosition, yaw, width)
            assert.deepEqual(ar.rig.matrix.elements, expected.elements)
            const room = ar.rig.matrix.clone().invert(), point = car.position.clone()
            const half = car.chassis.physical.colliders[0].halfExtents()
            const renderedLength = point.clone().add(new THREE.Vector3(half.x * 2, 0, 0)).applyMatrix4(room)
                .distanceTo(point.applyMatrix4(room))
            assert(Math.abs(renderedLength - 2.6 * width / WORLD_SPAN) < 1e-8, 'Car and collider share the AR metre scale')
        }
        const rise = car.position.y - base.y
        peak = Math.max(peak, rise)
        if(rise > .05) lifted = true
        if(lifted && landed === null && rise < .08 && car.chassis.physical.body.linvel().y < 0)
            landed = (i + 1) / hz
    }
    const result = { hz, count, stagger, offset, peak, landed, finalY: car.position.y, baseY: base.y }
    f.close()
    return { ...result, trace }
}

try {
    const flights = []
    for(const hz of [30, 72, 90, 120]) for(const count of [1, 6]) for(const offset of [0, -.8]) {
        const { trace, ...result } = flight({ hz, count, offset })
        assert(result.peak > .15 && result.peak < .6, 'Crates must cause a modest physical hop')
        assert(result.landed > 0 && result.landed < 1, 'Car must return within one real second')
        assert(Math.abs(result.finalY - result.baseY) < .08, 'Car must settle back on the surface')
        flights.push(result)
    }
    const { trace: vrTrace, ...chain } = flight({ count: 6, stagger: .2 })
    assert(chain.peak < .6 && chain.landed < 1, 'Staggered blasts cannot keep adding airborne lift')
    for(const width of [.5, 1.8, 6]) for(const yaw of [0, 1.2]) {
        const ar = flight({ count: 6, stagger: .2, width, yaw })
        assert.deepEqual(ar.trace, vrTrace, 'AR size/rotation must not change physics, gravity or landing time')
    }

    // Out-of-radius ground blasts cannot hit an airborne car. Nearby airborne
    // hits still register, but never add lift or slow down an ordinary jump.
    {
        const f = fixture(), body = f.car.chassis.physical.body
        f.car.moveTo(new THREE.Vector3(0, 10, 0)); f.tick()
        const velocity = body.linvel()
        assert.equal(f.game.explosions.explode(new THREE.Vector3(), 5, 8, true), false)
        assert.deepEqual(body.linvel(), velocity)
        f.car.wheels.inContactCount = 0
        body.setLinvel({ x: 8, y: 5, z: 0 }, true)
        assert.equal(f.game.explosions.explode(f.car.position.clone(), 5, 8, true), true)
        f.tick()
        assert(body.linvel().y < 5 && body.linvel().y > 4.7, 'Jump follows normal gravity without a blast clamp')
        assert(body.linvel().x > 7.9, 'Normal driving velocity is retained')
        assert.equal(f.game.time.scale, 1)
        assert.equal(f.game.time.bulletTime.active, false)
        f.close()
    }

    // Observe the real controller and world at several refresh/quality levels.
    // Suspension must use exactly the same step as gravity on every frame.
    const driving = []
    for(const hz of [30, 72, 90, 120]) {
        const f = fixture({ hz }), { car, game } = f
        f.advance(8)
        let controllerDt, integratedTime = 0
        const updateVehicle = car.controller.updateVehicle.bind(car.controller)
        car.controller.updateVehicle = dt => { controllerDt = dt; integratedTime += dt; updateVehicle(dt) }
        game.player.accelerating = 1
        for(let i = 0; i < hz * 3; i++) {
            game.quality.level = i % 2 ? 1 : 3
            integratedTime = 0
            f.tick()
            assert(Math.abs(controllerDt - game.physics.world.timestep) < 1e-8)
            assert(controllerDt <= 1 / 120 + 1e-8, 'Low frame rates must use short substeps')
            assert(Math.abs(integratedTime - game.ticker.deltaScaled) < 1e-8, 'Suspension must run once per world substep')
            assert.equal(game.ticker.scale, 1)
        }
        const speed = car.xzSpeed
        game.player.accelerating = 0; game.player.braking = 1
        f.advance(2)
        assert(car.xzSpeed < .1, `Brake must stop the car: ${JSON.stringify({ hz, speed: car.xzSpeed, position: car.position, up: car.upward, contacts: car.wheels.inContactCount, angular: car.chassis.physical.body.angvel() })}`)
        const brakedSpeed = car.xzSpeed
        game.player.braking = 0; game.player.accelerating = -1
        const beforeReverse = car.position.x
        f.advance(2)
        assert(car.position.x < beforeReverse - 2, 'Reverse must move the car back')
        game.player.accelerating = 1; game.player.boosting = 1
        f.advance(5)
        assert(car.xzSpeed > speed * 1.4, 'Boost must still accelerate beyond ordinary driving')
        const heading = car.forward.clone()
        game.player.steering = .5
        f.advance(1)
        assert(car.forward.distanceTo(heading) > .1, `Steering must turn: ${JSON.stringify({ hz, turn: car.forward.distanceTo(heading), up: car.upward, speed: car.xzSpeed, contacts: car.wheels.inContactCount })}`)
        driving.push({ hz, speed, brakedSpeed })
        f.close()
    }
    // Headset comfort: the desktop boost from rest pitches the car 60–80° onto
    // its rear wheels and reaches 159 km/h in real time. XR keeps four wheels
    // down and settles well above ordinary driving but near 70 km/h.
    {
        const f = fixture({ hz: 72 }), { car, game } = f
        car.topSpeedBoost = XR_BOOST_TOP_SPEED; car.boostMultiplier = XR_BOOST_MULTIPLIER
        f.advance(4)
        game.player.accelerating = 1; game.player.boosting = 1
        let pitch = 0
        for(let i = 0; i < 72 * 10; i++) { f.tick(); pitch = Math.max(pitch, Math.asin(Math.min(1, Math.abs(car.forward.y)))) }
        const kmh = car.xzSpeed * 3.6
        assert(kmh > 60 && kmh < 85, `XR boost speed ${kmh}`)
        assert(pitch < 10 * Math.PI / 180, `XR boost must not lift the nose: ${pitch}`)
        assert.equal(car.wheels.inContactCount, 4)
        f.close()
    }
    const speeds = driving.map(d => d.speed)
    assert(Math.max(...speeds) / Math.min(...speeds) < 1.01, 'Refresh rates must retain the same acceleration')

    // Every physical edge stops a high-speed car without relying on a respawn.
    for(const [axis, sign] of [['x', -1], ['x', 1], ['z', -1], ['z', 1]]) {
        const f = fixture(), xr = arScene(f, 1.8), bounds = xr.worldBounds
        let recovered = 0
        f.game.respawns = { getClosest() { recovered++; return { position: new THREE.Vector3(16, 4, 16), rotation: 0 } } }
        const edge = axis === 'x' ? sign < 0 ? bounds.minX : bounds.maxX : sign < 0 ? bounds.minZ : bounds.maxZ
        const position = new THREE.Vector3(16, 1.2, 16); position[axis] = edge - sign * 5
        f.car.moveTo(position)
        const velocity = new THREE.Vector3(); velocity[axis] = sign * 40
        f.car.chassis.physical.body.setLinvel(velocity, true)
        f.advance(.5)
        assert(sign * (f.car.position[axis] - edge) < -1, 'Car must remain inside the fixed wall')
        assert.equal(recovered, 0, 'A real collision, not a teleport, must stop the car')
        assert(f.car.position.y > 0, 'The surface must still support the car after impact')
        f.close()
    }

    // Ordinary desktop bullet time and original impulse remain unchanged.
    {
        const f = fixture({ xr: false })
        f.advance(8)
        assert.equal(f.game.time.defaultScale, 2)
        f.game.explosions.explode(f.car.position.clone(), 5, 8, true)
        assert(f.game.time.bulletTime.active)
        f.tick()
        assert(f.car.chassis.physical.body.linvel().y > 7)
        assert(f.game.time.scale < 2)
        f.close()
    }
    console.log(JSON.stringify({
        blastHeightMetres: [Math.min(...flights.map(f => f.peak)), Math.max(...flights.map(f => f.peak))],
        landingSeconds: [Math.min(...flights.map(f => f.landed)), Math.max(...flights.map(f => f.landed))],
        staggeredChain: chain, driving,
        arScale: 'identical trajectories at 0.5 / 1.8 / 6 metres, two rotations',
        worldEdges: 'all four contain a 40 m/s car', desktop: 'original clock and blast retained'
    }))
} finally {
    Date.now = realNow
    gsap.ticker.sleep()
}
