import * as THREE from 'three/webgpu'

export const CAMEL_RETURN_DELAY = 6

// Reuse the game's explosion impulse and six existing simple collider shapes.
// Bodies are fixed at rest and dynamic only while reacting to a nearby blast.
export class CamelCampMotion {
    constructor(game, model) {
        this.game = game
        this.model = model
        this.activeCount = 0
        this.items = model.camels.map(camel => {
            const homePosition = camel.collider.position.clone()
            const homeRotation = camel.collider.quaternion.clone()
            const object = game.objects.add(null, {
                type: 'fixed', position: homePosition, rotation: homeRotation,
                friction: .65, restitution: .05, mass: .3 * camel.size.x ** 3,
                linearDamping: .45, angularDamping: 1.5,
                colliders: [{ shape: 'cuboid', category: 'object', parameters: camel.collider.parameters }]
            })
            object.physical.body.enableCcd(true)
            return { object, homePosition, homeRotation, active: false, remaining: 0 }
        })
        this.zero = new THREE.Vector3()
        game.explosions.events.on('explode', (coordinates, radius, strength, vehicleOnly) =>
            this.onExplosion(coordinates, radius, strength, vehicleOnly))
    }

    onExplosion(coordinates, radius, strength, vehicleOnly) {
        if(vehicleOnly || strength <= 0 || radius <= 1) return
        for(const item of this.items) {
            const physical = item.object.physical, body = physical.body
            if(!body.isEnabled() || item.object.reseting) continue
            const p = body.translation()
            // Match Explosions.js's horizontal distance/falloff, using the current
            // body position so chained blasts can hit an already displaced camel.
            if(Math.hypot(p.x - coordinates.x, p.z - coordinates.z) >= radius) continue
            if(!item.active) {
                body.setBodyType(this.game.RAPIER.RigidBodyType.Dynamic, true)
                body.recomputeMassPropertiesFromColliders()
                physical.type = 'dynamic'
                item.active = true
                this.activeCount++
            }
            item.remaining = CAMEL_RETURN_DELAY
        }
    }

    homeOccupied(item) {
        const p = this.game.physicalVehicle?.chassis.physical.body.translation() ?? this.game.player.position
        return Math.abs(p.y - item.homePosition.y) < 3
            && Math.hypot(p.x - item.homePosition.x, p.z - item.homePosition.z) < 3
    }

    restore(index) {
        const item = this.items[index], physical = item.object.physical, body = physical.body
        body.setLinvel(this.zero, false); body.setAngvel(this.zero, false)
        body.resetForces(false); body.resetTorques(false)
        body.setBodyType(this.game.RAPIER.RigidBodyType.Fixed, false)
        physical.type = 'fixed'
        body.setTranslation(item.homePosition, false); body.setRotation(item.homeRotation, false)
        item.active = false; item.remaining = 0; this.activeCount--
        this.model.setCamelTransform(index, item.homePosition, item.homeRotation)
    }

    update(dt) {
        const changed = this.activeCount > 0
        for(let i = 0; i < this.items.length; i++) {
            const item = this.items[i]
            if(!item.active) continue
            item.remaining = Math.max(0, item.remaining - dt)
            // Wait for the vehicle to leave the spawn instead of materialising
            // a solid collider through it. This also works outside render range.
            if(item.remaining === 0 && !this.homeOccupied(item)) this.restore(i)
            else {
                const body = item.object.physical.body
                this.model.setCamelTransform(i, body.translation(), body.rotation())
            }
        }
        return changed
    }
}
