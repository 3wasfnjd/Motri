import * as THREE from 'three/webgpu'

// Ray-cast suspension keeps applying impulses even after the car has stopped.
// Let a settled car rest without changing the original driving/suspension tuning.
export class VehicleRest
{
    constructor(vehicle)
    {
        this.vehicle = vehicle
        this.game = vehicle.game
        this.active = false
        this.elapsed = 0
        this.supports = []
    }

    hasInput()
    {
        const player = this.game.player
        return Math.abs(player.accelerating) > 0.001 ||
            Math.abs(player.steering) > 0.001 || player.boosting > 0 ||
            player.suspensions.some(state => state !== 'low')
    }

    wake()
    {
        this.active = false
        this.elapsed = 0
        this.supports = []
        this.vehicle.chassis.physical.body.wakeUp()
    }

    beforePhysics()
    {
        const body = this.vehicle.chassis.physical.body
        if(!this.active)
        {
            // Retain the original awake controller until our grounded rest
            // conditions have passed, including during jumps and slow driving.
            if(body.isSleeping())
                body.wakeUp()
            return false
        }

        const supported = this.supports.every(({ collider, position, rotation }) => {
            if(!collider.isValid() || !collider.isEnabled() || !collider.parent().isEnabled() ||
                !collider.parent().isFixed() || position.distanceToSquared(collider.translation()) >= 1e-10)
                return false

            const current = collider.rotation()
            return Math.abs(rotation.x * current.x + rotation.y * current.y +
                rotation.z * current.z + rotation.w * current.w) > 1 - 1e-6
        })

        // Contacts and explosion impulses wake Rapier automatically. Never put
        // those effects back to sleep or keep a car parked on a removed support.
        if(this.hasInput() || !body.isSleeping() || !body.isEnabled() || !supported)
        {
            this.wake()
            return false
        }

        // Preserve the settled ray contacts and wheel lengths. Calling the
        // vehicle controller here would apply suspension impulses again.
        return true
    }

    afterPhysics()
    {
        if(this.active)
            return

        const vehicle = this.vehicle
        const body = vehicle.chassis.physical.body
        const angular = body.angvel()
        if(this.hasInput() || !body.isEnabled() || vehicle.wheels.inContactCount !== 4 ||
            vehicle.upward.y < 0.995 || vehicle.speed > 0.06 || vehicle.xzSpeed > 0.025 ||
            Math.hypot(angular.x, angular.y, angular.z) > 0.15)
        {
            this.elapsed = 0
            return
        }

        const supports = []
        for(let i = 0; i < 4; i++)
        {
            const collider = vehicle.controller.wheelGroundObject(i)
            // Dynamic props, moving platforms and melting/slippery ice must
            // retain their live suspension/ground response.
            if(!collider?.parent()?.isFixed() || !collider.isEnabled() ||
                collider.parent() === this.game.world.waterSurface?.ice.physical.body)
            {
                this.elapsed = 0
                return
            }
            supports.push(collider)
        }

        this.elapsed += Math.min(this.game.ticker.delta, 1 / 30)
        if(this.elapsed < 1.25)
            return

        this.supports = supports.map(collider => ({
            collider,
            position: new THREE.Vector3().copy(collider.translation()),
            rotation: new THREE.Quaternion().copy(collider.rotation()).normalize()
        }))
        body.sleep()
        this.active = true
    }
}
