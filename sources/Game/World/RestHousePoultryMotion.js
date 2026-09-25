// Coordinates in the rest-house asset, converted to world metres once at startup.
// This garden is inside the stone path loop, away from the entrance and driveway.
export const POULTRY_GARDEN = [5.3, 17.8, 32.0, 40.0]
export const POULTRY = [
    { name: 'Hen_1', kind: 'hen', home: [7, 34], size: 1 },
    { name: 'Hen_2', kind: 'hen', home: [10, 33.8], size: .94 },
    { name: 'Hen_3', kind: 'hen', home: [14, 34.2], size: 1.02 },
    { name: 'Hen_4', kind: 'hen', home: [14.5, 37], size: .97 },
    { name: 'Rooster_1', kind: 'rooster', home: [10, 36.5], size: 1 },
    { name: 'Rooster_2', kind: 'rooster', home: [6.9, 37], size: .96 }
]

const clamp = (n, a, b) => Math.max(a, Math.min(b, n))
const distance = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz)

export class RestHousePoultryMotion {
    constructor(shapes, scale, random = Math.random) {
        this.random = random
        this.bounds = POULTRY_GARDEN.map(n => n * scale)
        const [x0, x1, z0, z1] = this.bounds
        this.obstacles = shapes.map(s => ({
            x: s.center[0] * scale, z: s.center[2] * scale,
            hx: s.size[0] * scale / 2, hz: s.size[2] * scale / 2,
            circle: s.shape === 'cylinder', yaw: s.rotationY || 0
        })).filter(o => o.x + o.hx + 1 > x0 && o.x - o.hx - 1 < x1 && o.z + o.hz + 1 > z0 && o.z - o.hz - 1 < z1)
        this.birds = POULTRY.map((s, i) => ({
            ...s, x: s.home[0] * scale, z: s.home[1] * scale,
            radius: (s.kind === 'hen' ? .47 : .57) * s.size,
            yaw: i * 2.399963, phase: random() * Math.PI * 2,
            time: random() * 9, pace: .25 + random() * .13,
            speed: 0, state: 'walk', timer: 0, blocked: 0, alert: false,
            fear: 0, threatX: 0, threatZ: 0, escapeYaw: i * 2.399963
        }))
        for(const b of this.birds) this.chooseTarget(b)
    }

    staticFree(x, z, radius) {
        const [x0, x1, z0, z1] = this.bounds
        if(x < x0 + radius || x > x1 - radius || z < z0 + radius || z > z1 - radius) return false
        for(const o of this.obstacles) {
            if(o.circle) {
                if(distance(x, z, o.x, o.z) < radius + Math.max(o.hx, o.hz) + .035) return false
            } else {
                const c = Math.cos(o.yaw), s = Math.sin(o.yaw), dx = x - o.x, dz = z - o.z
                const px = c * dx - s * dz, pz = s * dx + c * dz
                if(Math.hypot(Math.max(0, Math.abs(px) - o.hx), Math.max(0, Math.abs(pz) - o.hz)) < radius + .035) return false
            }
        }
        return true
    }

    freeFor(bird, x, z) {
        if(!this.staticFree(x, z, bird.radius)) return false
        for(const other of this.birds)
            if(other !== bird && distance(x, z, other.x, other.z) < bird.radius + other.radius + .025) return false
        return true
    }

    segmentFree(bird, x, z) {
        const steps = Math.ceil(distance(bird.x, bird.z, x, z) / .12)
        for(let i = 1; i <= steps; i++) {
            const t = i / steps
            if(!this.freeFor(bird, bird.x + (x - bird.x) * t, bird.z + (z - bird.z) * t)) return false
        }
        return true
    }

    chooseTarget(bird) {
        const [x0, x1, z0, z1] = this.bounds, r = bird.radius + .05
        let target = null, best = -Infinity
        for(let i = 0; i < 32; i++) {
            const x = x0 + r + this.random() * (x1 - x0 - r * 2)
            const z = z0 + r + this.random() * (z1 - z0 - r * 2)
            const length = distance(bird.x, bird.z, x, z)
            if(length < .6 || length > 3.0 || !this.segmentFree(bird, x, z)) continue
            const score = this.random()
            if(score > best) { best = score; target = { x, z } }
        }
        if(target) {
            bird.target = target; bird.state = 'walk'
            bird.timer = distance(bird.x, bird.z, target.x, target.z) / bird.pace + 3
        } else {
            bird.state = 'peck'; bird.timer = .55 + this.random() * .65
        }
        bird.blocked = 0
    }

    threatPoint(bird, car) {
        // Include the next fraction of a second of travel, so the flock reacts
        // before the bumper reaches it. Clamp prediction for teleports/boosting.
        let dx = (car.vx || 0) * .35, dz = (car.vz || 0) * .35
        const length = Math.hypot(dx, dz)
        if(length > 3) { dx *= 3 / length; dz *= 3 / length }
        const lengthSquared = dx * dx + dz * dz
        const t = lengthSquared > .0001 ? clamp(((bird.x - car.x) * dx + (bird.z - car.z) * dz) / lengthSquared, 0, 1) : 0
        return { x: car.x + dx * t, z: car.z + dz * t }
    }

    flee(bird, dt) {
        const away = Math.atan2(bird.x - bird.threatX, bird.z - bird.threatZ)
        const pace = 2.1 + (bird.pace - .25) * 2
        const step = pace * dt, lookAhead = .48
        const oldDistance = distance(bird.x, bird.z, bird.threatX, bird.threatZ)
        let best = -Infinity, heading = bird.escapeYaw
        // Local steering can go around a neighbour or along a garden edge. The
        // former random, full-route search could fail and resume pecking at a car.
        for(let i = 0; i < 24; i++) {
            const angle = away + i * Math.PI / 12
            const dx = Math.sin(angle), dz = Math.cos(angle)
            if(!this.freeFor(bird, bird.x + dx * step, bird.z + dz * step)) continue
            const clearAhead = this.freeFor(bird, bird.x + dx * lookAhead, bird.z + dz * lookAhead)
            const reach = clearAhead ? lookAhead : step
            const gain = distance(bird.x + dx * reach, bird.z + dz * reach, bird.threatX, bird.threatZ) - oldDistance
            const score = gain * 3 + (clearAhead ? .65 : 0) + Math.cos(angle - away) * .2 + Math.cos(angle - bird.escapeYaw) * .15
            if(score > best) { best = score; heading = angle }
        }
        bird.escapeYaw = heading
        const angle = Math.atan2(Math.sin(heading - bird.yaw), Math.cos(heading - bird.yaw))
        bird.yaw += clamp(angle, -10 * dt, 10 * dt)
        const remaining = Math.atan2(Math.sin(heading - bird.yaw), Math.cos(heading - bird.yaw))
        const speed = pace * Math.max(0, Math.cos(remaining))
        const x = bird.x + Math.sin(bird.yaw) * speed * dt, z = bird.z + Math.cos(bird.yaw) * speed * dt
        if(best > -Infinity && this.freeFor(bird, x, z)) {
            const travelled = distance(bird.x, bird.z, x, z)
            bird.x = x; bird.z = z; bird.speed = speed
            bird.phase += travelled * Math.PI * 2 / .38
        } else bird.speed = 0
    }

    update(delta, car = null) {
        const dt = clamp(delta, 0, 1 / 30)
        for(const b of this.birds) {
            b.time += dt; b.timer -= dt
            const threat = car ? this.threatPoint(b, car) : null
            const alarm = threat && distance(b.x, b.z, threat.x, threat.z) < 4.3
            if(alarm) {
                b.fear = 2.4
                b.threatX = threat.x; b.threatZ = threat.z
            } else b.fear = Math.max(0, b.fear - dt)
            b.alert = b.fear > 0
            if(b.alert) {
                b.state = 'flee'
                this.flee(b, dt)
                continue
            }
            if(b.state === 'flee') this.chooseTarget(b)
            if(b.state === 'peck') {
                b.speed = 0
                if(b.timer <= 0) this.chooseTarget(b)
                continue
            }
            const dx = b.target.x - b.x, dz = b.target.z - b.z
            if(Math.hypot(dx, dz) < .16 || b.timer <= 0) {
                b.state = 'peck'; b.speed = 0
                b.timer = 1.0 + this.random() * 1.8
                continue
            }
            const wanted = Math.atan2(dx, dz)
            const angle = Math.atan2(Math.sin(wanted - b.yaw), Math.cos(wanted - b.yaw))
            b.yaw += clamp(angle, -2.8 * dt, 2.8 * dt)
            const speed = b.pace * Math.max(0, Math.cos(angle))
            const x = b.x + Math.sin(b.yaw) * speed * dt, z = b.z + Math.cos(b.yaw) * speed * dt
            if(this.freeFor(b, x, z)) {
                const travelled = distance(b.x, b.z, x, z)
                b.x = x; b.z = z; b.speed = speed
                b.phase += travelled * Math.PI * 2 / .27
                b.blocked = 0
            } else {
                b.speed = 0; b.blocked += dt
                if(b.blocked > .25) this.chooseTarget(b)
            }
        }
    }
}
