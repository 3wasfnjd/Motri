import * as THREE from 'three/webgpu'
import { SHEEP_PEN } from './SheepPenSite.js'
import { sheepPlacements } from './SheepPenModel.js'

const angleDifference = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b))

// Short independent walks, grazing pauses and gentle looking. All navigation is
// local to the flat pen; shared render geometry and ten colliders are reused.
export class SheepPenMotion {
    constructor(colliders) {
        this.seed = 9347
        this.states = sheepPlacements.map((s, i) => ({ ...s, mode: s.grazing ? 'graze' : 'idle',
            timer: .7 + i * .29, targetX: s.x, targetZ: s.z, speed: 0,
            walkAmount: 0, stride: i * 2.399963, graze: s.grazing ? 1 : 0, alert: 0 }))
        this.obstacles = colliders.filter(c => c.sheepIndex === undefined && c.position.y - c.parameters[1] < 1.5).map(c => {
            const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(c.quaternion)
            return { x: c.position.x - SHEEP_PEN.center[0], z: c.position.z - SHEEP_PEN.center[2],
                hx: c.parameters[0], hz: c.parameters[2], cos: axis.x, sin: -axis.z }
        })
    }

    random() {
        this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0
        return this.seed / 4294967296
    }

    walkable(x, z, size) {
        const radius = .78 * size + .025
        // Leave the eastern gate approach clear, even though its leaves are open.
        const fenceMargin = 1.12 * size + .12
        if(x < -7.5 + fenceMargin || x > 4.8 || Math.abs(z) > 5.3 - fenceMargin) return false
        for(const o of this.obstacles) {
            const dx = x - o.x, dz = z - o.z
            const a = Math.max(0, Math.abs(dx * o.cos - dz * o.sin) - o.hx)
            const b = Math.max(0, Math.abs(dx * o.sin + dz * o.cos) - o.hz)
            if(a * a + b * b < radius * radius) return false
        }
        return true
    }

    freeFromFlock(s, x, z) {
        for(const other of this.states) {
            if(other === s) continue
            const gap = .70 * (s.size + other.size)
            const distance = Math.hypot(x - other.x, z - other.z)
            if(distance < gap && distance < Math.hypot(s.x - other.x, s.z - other.z) - 1e-6) return false
        }
        return true
    }

    clearSegment(s, x, z) {
        const steps = Math.ceil(Math.hypot(x - s.x, z - s.z) / .18)
        for(let i = 1; i <= steps; i++)
            if(!this.walkable(s.x + (x - s.x) * i / steps, s.z + (z - s.z) * i / steps, s.size)) return false
        return true
    }

    chooseTarget(s, car = null) {
        let best = -Infinity, targetX = s.x, targetZ = s.z
        const start = this.random() * Math.PI * 2
        for(let i = 0; i < 16; i++) {
            const angle = start + i * Math.PI * 2 / 16, distance = 1.25 + this.random() * 1.6
            const x = s.x + Math.sin(angle) * distance, z = s.z + Math.cos(angle) * distance
            if(!this.clearSegment(s, x, z) || !this.freeFromFlock(s, x, z)) continue
            const score = car ? Math.hypot(x - car.x, z - car.z) : this.random()
            if(score > best) { best = score; targetX = x; targetZ = z }
        }
        if(best === -Infinity) { s.mode = 'idle'; s.timer = .5 + this.random(); return }
        s.targetX = targetX; s.targetZ = targetZ; s.mode = 'walk'; s.timer = 12
    }

    update(dt, car = null) {
        dt = Math.max(0, Math.min(dt, .1))
        for(const s of this.states) {
            s.timer -= dt; s.alert -= dt
            const carDistance = car ? Math.hypot(s.x - car.x, s.z - car.z) : Infinity
            if(carDistance < 3.5 && s.alert <= 0) {
                this.chooseTarget(s, car); s.alert = .8
            } else if(s.timer <= 0) {
                if(s.mode !== 'walk') this.chooseTarget(s)
                else { s.mode = this.random() < .7 ? 'graze' : 'idle'; s.timer = 2.5 + this.random() * 4 }
            }
            let moved = 0
            if(s.mode === 'walk') {
                const dx = s.targetX - s.x, dz = s.targetZ - s.z, distance = Math.hypot(dx, dz)
                if(distance < .10) {
                    s.mode = this.random() < .7 ? 'graze' : 'idle'; s.timer = 2.5 + this.random() * 4
                } else {
                    const turn = angleDifference(Math.atan2(dx, dz), s.yaw)
                    s.yaw += Math.max(-dt * 1.6, Math.min(dt * 1.6, turn))
                    const step = Math.min(distance, dt * (carDistance < 3.5 ? .7 : .37) * s.size)
                        * Math.max(0, Math.cos(turn))
                    const x = s.x + dx / distance * step, z = s.z + dz / distance * step
                    const awayFromCar = !car || Math.hypot(x - car.x, z - car.z) > Math.min(2.4, carDistance) - 1e-5
                    if(this.walkable(x, z, s.size) && this.freeFromFlock(s, x, z) && awayFromCar) {
                        moved = step; s.x = x; s.z = z
                    } else { s.mode = 'idle'; s.timer = .3 + this.random() * .4 }
                }
            }
            s.speed = dt ? moved / dt : 0
            s.walkAmount += (Math.min(1, s.speed / (.37 * s.size)) - s.walkAmount) * Math.min(1, dt * 8)
            s.stride += moved / s.size * 9
            s.graze += ((s.mode === 'graze' ? 1 : 0) - s.graze) * Math.min(1, dt * 2.8)
        }
    }
}
