import * as THREE from 'three/webgpu'
import { Events } from './Events.js'
import { Game } from './Game.js'
import { remapClamp } from './utilities/maths.js'

export class Explosions
{
    constructor()
    {
        this.game = new Game()

        this.events = new Events()
    }

    explode(coordinates, radius = 7, strength = 4, vehicleOnly = false, bulletTimeStrengthThreshold = 3)
    {
        // View roll
        const distance = this.game.view.focusPoint.position.distanceTo(coordinates)
        const rollKickStrength = remapClamp(distance, 2, 15, 1, 0)
        this.game.view.roll.kick(rollKickStrength)

        // Leaves
        this.game.world.leaves?.explode(coordinates, radius)

        // Let normally fixed scenery opt into this blast before collecting bodies.
        this.events.trigger('explode', [coordinates, radius, strength, vehicleOnly])

        // Objects physics
        const applyPhysicsExplosion = (physicalObject) =>
        {
            const position = new THREE.Vector3()
            position.copy(physicalObject.body.translation())
            const direction = position.clone().sub(coordinates)
            // AR only scales the viewer rig; blast radii stay in world metres.
            // Height must count, otherwise ground crates keep launching a car
            // that is already far above the explosion.
            const distance = this.game.xrEnabled ? direction.length() : Math.hypot(direction.x, direction.z)
            direction.y = 0

            const fadedStrength = remapClamp(distance, 1, radius, 1, 0)
            const impulse = direction.clone().setLength(0.5)
            impulse.y = 1
            // impulse.x = 0.25
            // impulse.z = 0.25
            impulse.normalize()

            const finalStrength = fadedStrength * strength
            
            impulse.setLength(finalStrength * physicalObject.body.mass())

            if(fadedStrength > 0)
            {
                // const point = direction.negate().setLength(0).add(position)
                const point = position
                this.game.ticker.wait(1, () =>
                {
                    if(!physicalObject.body.isValid() || !physicalObject.body.isEnabled()) return
                    if(this.game.xrEnabled && physicalObject === this.game.physicalVehicle.chassis.physical)
                        this.applyXRVehicleImpulse(physicalObject.body, direction, finalStrength)
                    else
                        physicalObject.body.applyImpulseAtPoint(impulse, point, true)
                })

                // Is vehicle
                if(physicalObject === this.game.physicalVehicle.chassis.physical)
                {
                    if(finalStrength > bulletTimeStrengthThreshold)
                    {
                        this.game.time.bulletTime.activate()

                        return true
                    }
                }
            }

            return false
        }

        let vehicleHit = false
        if(vehicleOnly)
            vehicleHit = applyPhysicsExplosion(this.game.physicalVehicle.chassis.physical)
        else
            this.game.objects.list.forEach((object) =>
            {
                if(object.physical && object.physical.type === 'dynamic' && object.physical.body.isEnabled())
                    vehicleHit = vehicleHit | applyPhysicsExplosion(object.physical)
            })
        // console.log('vehicleHit', vehicleHit)

        return vehicleHit
    }

    applyXRVehicleImpulse(body, direction, strength)
    {
        // Read velocity when the queued impulse runs so simultaneous crates
        // share the same limit. Do not clamp ordinary driving or jump velocity.
        const velocity = body.linvel()
        const outward = direction.clone().normalize()
        const outwardSpeed = velocity.x * outward.x + velocity.z * outward.z
        const kick = Math.min(3, strength * 0.4)
        const lateral = Math.min(kick, Math.max(0, 3 - outwardSpeed))
        const grounded = this.game.physicalVehicle.wheels.inContactCount > 0
        const lift = grounded ? Math.min(kick, Math.max(0, 3 - velocity.y)) : 0
        // At g=9.81, 3 m/s gives a short ~0.46 m ballistic hop. Airborne
        // blasts cannot add lift, and a centre-of-mass impulse avoids flipping.
        body.applyImpulse(outward.multiplyScalar(lateral).setY(lift).multiplyScalar(body.mass()), true)
    }
}
