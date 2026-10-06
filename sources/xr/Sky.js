import * as THREE from 'three/webgpu'
import { mix, positionLocal, uniform } from 'three/tsl'

export class XRSky {
    constructor(game) {
        this.game = game
        this.horizon = uniform(new THREE.Color())
        this.zenith = uniform(new THREE.Color())
        const direction = positionLocal.normalize()
        const gradient = mix(this.horizon, this.zenith, direction.y.max(0).pow(0.55))
        const sunAngle = direction.dot(game.lighting.directionUniform)
        const glow = sunAngle.max(0).pow(64).mul(0.08)
        const disk = sunAngle.smoothstep(0.9993, 0.9998).mul(0.65)
        const material = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false })
        material.colorNode = gradient.add(game.lighting.colorUniform.mul(glow.add(disk)))
        this.mesh = new THREE.Mesh(new THREE.SphereGeometry(260, 32, 16), material)
        this.mesh.visible = false
        // Draw sky after opaque scenery: existing depth rejects covered pixels.
        this.mesh.renderOrder = 90
        this.mesh.frustumCulled = false
        game.scene.add(this.mesh)
    }

    update(position) {
        this.mesh.visible = true
        this.mesh.position.copy(position)
        this.horizon.value.copy(this.game.dayCycles.properties.fogColorA.value)
        this.zenith.value.copy(this.horizon.value).multiplyScalar(0.52)
    }
}
