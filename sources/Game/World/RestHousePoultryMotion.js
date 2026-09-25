import { RestHousePoultryNavigation } from './RestHousePoultryNavigation.js'

// Coordinates in the rest-house asset, converted to world metres once at startup.
// This garden is inside the stone path loop, away from the entrance and driveway.
export const POULTRY_GARDEN = [5.3, 17.8, 32.0, 40.0]
// Fleeing is allowed throughout the compound, including the surrounding paths.
// The exterior walls and the open entrance remain the outer safety boundary.
export const POULTRY_COURTYARD = [-14.54, 24.94, .26, 48.54]
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
        this.travelBounds = POULTRY_COURTYARD.map(n => n * scale)
        this.homeClearFor = 2.4
        this.obstacles = shapes.map(s => ({
            x: s.center[0] * scale, z: s.center[2] * scale,
            hx: s.size[0] * scale / 2, hz: s.size[2] * scale / 2,
            circle: s.shape === 'cylinder', c: Math.cos(s.rotationY || 0), s: Math.sin(s.rotationY || 0)
        }))
        this.navigation = new RestHousePoultryNavigation(this.travelBounds,
            (x, z, radius) => this.staticFree(x, z, radius),
            (...args) => this.clearSegment(...args))
        this.birds = POULTRY.map((s, i) => ({
            ...s, x: s.home[0] * scale, z: s.home[1] * scale,
            radius: (s.kind === 'hen' ? .47 : .57) * s.size,
            yaw: i * 2.399963, phase: random() * Math.PI * 2,
            time: random() * 9, pace: .25 + random() * .13,
            speed: 0, state: 'walk', timer: 0, blocked: 0, alert: false,
            fear: 0, threatX: 0, threatZ: 0, escapeYaw: i * 2.399963,
            route: [], trail: [{ x: s.home[0] * scale, z: s.home[1] * scale }],
            homeX: s.home[0] * scale, homeZ: s.home[1] * scale
        }))
        for(const b of this.birds) this.chooseTarget(b)
    }

    staticFree(x, z, radius) {
        const [x0, x1, z0, z1] = this.travelBounds
        if(x < x0 + radius || x > x1 - radius || z < z0 + radius || z > z1 - radius) return false
        for(const o of this.obstacles) {
            if(o.circle) {
                if(distance(x, z, o.x, o.z) < radius + Math.max(o.hx, o.hz) + .035) return false
            } else {
                const dx = x - o.x, dz = z - o.z
                const px = o.c * dx - o.s * dz, pz = o.s * dx + o.c * dz
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
        return this.clearSegment(bird.x, bird.z, x, z, bird.radius, (px, pz) => this.freeFor(bird, px, pz))
    }

    clearSegment(ax, az, bx, bz, radius, freeFor = null) {
        const steps = Math.ceil(distance(ax, az, bx, bz) / .12)
        for(let i = 1; i <= steps; i++) {
            const t = i / steps
            const x = ax + (bx - ax) * t, z = az + (bz - az) * t
            if(!this.staticFree(x, z, radius) || (freeFor && !freeFor(x, z))) return false
        }
        return true
    }

    inGarden(x, z, radius = 0) {
        const [x0, x1, z0, z1] = this.bounds
        return x >= x0 + radius && x <= x1 - radius && z >= z0 + radius && z <= z1 - radius
    }

    needsReturn() {
        return this.birds.some(b => b.alert || ['flee', 'return', 'wait'].includes(b.state) || !this.inGarden(b.x, b.z, b.radius))
    }

    rememberRoute(bird, x, z) {
        if(this.inGarden(x, z, bird.radius + .05)) {
            bird.trail = [{ x, z }]
            return
        }
        // Keep the actual way out as a fallback for tight gaps smaller than a
        // navigation cell. Collapse visible segments so this stays a short trail.
        const trail = bird.trail, anchor = trail[trail.length - 2]
        if(anchor && this.clearSegment(anchor.x, anchor.z, x, z, bird.radius)) trail[trail.length - 1] = { x, z }
        else trail.push({ x, z })
    }

    beginReturn(bird) {
        const [x0, x1, z0, z1] = this.bounds, r = bird.radius + .15
        const goals = [{ x: bird.homeX, z: bird.homeZ }]
        for(let i = 0; i < 12; i++) goals.push({
            x: x0 + r + this.random() * (x1 - x0 - 2 * r),
            z: z0 + r + this.random() * (z1 - z0 - 2 * r)
        })
        goals.sort((a, b) => distance(a.x, a.z, bird.homeX, bird.homeZ) - distance(b.x, b.z, bird.homeX, bird.homeZ))
        bird.route = []; bird.state = 'return'; bird.blocked = 0
        // Retry a different free home spot if another bird occupies its usual one.
        let attempts = 0
        for(const goal of goals) {
            if(!this.inGarden(goal.x, goal.z, r) || !this.freeFor(bird, goal.x, goal.z)) continue
            bird.route = this.navigation.findPath(bird, goal, bird.radius, (x, z) => this.freeFor(bird, x, z))
            if(!bird.route.length && bird.trail.length > 1)
                bird.route = bird.trail.slice(0, -1).reverse().map(p => ({ ...p }))
            if(bird.route.length || ++attempts >= 3) break
        }
        bird.timer = .8 + this.random() * .7
    }

    returnHome(bird, dt) {
        if(!bird.route.length) {
            bird.speed = 0
            if(bird.timer <= 0) this.beginReturn(bird)
            return
        }
        const target = bird.route[0], dx = target.x - bird.x, dz = target.z - bird.z
        const length = Math.hypot(dx, dz)
        if(length < .001) {
            bird.route.shift()
            if(!bird.route.length) this.chooseTarget(bird)
            return
        }
        const wanted = Math.atan2(dx, dz)
        const angle = Math.atan2(Math.sin(wanted - bird.yaw), Math.cos(wanted - bird.yaw))
        bird.yaw += clamp(angle, -5 * dt, 5 * dt)
        const step = Math.min(length, (.75 + bird.pace * .4) * dt)
        const x = bird.x + dx / length * step, z = bird.z + dz / length * step
        // Turn at route corners before walking; do not round a corner through a wall.
        if(Math.abs(angle) > .2) { bird.speed = 0; return }
        if(this.freeFor(bird, x, z)) {
            this.rememberRoute(bird, x, z)
            bird.x = x; bird.z = z; bird.speed = step / dt
            bird.phase += step * Math.PI * 2 / .27; bird.blocked = 0
        } else {
            bird.speed = 0; bird.blocked += dt
            if(bird.blocked > .7) {
                bird.route = []; bird.timer = .2 + this.random() * .4
                bird.blocked = 0
            }
        }
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
        // All headings are available outside the home garden too. Only actual
        // obstacles, other birds and the compound perimeter limit an escape.
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
            if(travelled > .0001) this.rememberRoute(bird, x, z)
            bird.x = x; bird.z = z; bird.speed = speed
            bird.phase += travelled * Math.PI * 2 / .38
        } else bird.speed = 0
    }

    update(delta, car = null) {
        const dt = clamp(delta, 0, 1 / 30)
        if(!dt) return
        // Do not turn straight back towards a car that is still on the dirt patch.
        // Wait at a safe escaped position until the car clears the area and settles.
        const [x0, x1, z0, z1] = this.bounds
        const homeOccupied = car && Math.hypot(car.x - clamp(car.x, x0, x1), car.z - clamp(car.z, z0, z1)) < 1.8
        this.homeClearFor = homeOccupied ? 0 : Math.min(2.4, this.homeClearFor + dt)
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
                if(b.state !== 'flee' && this.inGarden(b.x, b.z, b.radius + .05)) b.trail = [{ x: b.x, z: b.z }]
                b.state = 'flee'; b.route = []
                this.flee(b, dt)
                continue
            }
            if(b.state === 'return' || !this.inGarden(b.x, b.z, b.radius)) {
                if(this.homeClearFor < 2.4) {
                    b.state = 'wait'; b.speed = 0; b.route = []
                } else {
                    if(b.state !== 'return') this.beginReturn(b)
                    this.returnHome(b, dt)
                }
                continue
            }
            if(b.state === 'flee' || b.state === 'wait') this.chooseTarget(b)
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
            if(this.inGarden(x, z, b.radius) && this.freeFor(b, x, z)) {
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
