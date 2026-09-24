import * as THREE from 'three/webgpu'
import { color } from 'three/tsl'
import { Game } from '../Game.js'
import { MeshDefaultMaterial } from '../Materials/MeshDefaultMaterial.js'

export class Dunes
{
    constructor()
    {
        this.game = Game.getInstance()

        // South-east empty corner selected from the current world map.
        this.center = { x: 55, z: 27 }
        this.size = { x: 48, z: 42 }
        this.segments = 48
        this.setTerrain()
    }

    heightAt(x, z)
    {
        const nx = x / (this.size.x * 0.5)
        const nz = z / (this.size.z * 0.5)
        const edge = Math.max(0, 1 - Math.pow(Math.max(Math.abs(nx), Math.abs(nz)), 5))

        const dune = (cx, cz, sx, sz, h) =>
            h * Math.exp(-(
                Math.pow((x - cx) / sx, 2) +
                Math.pow((z - cz) / sz, 2)
            ))

        // Broad overlapping ridges: driveable, with different climb lines.
        let y = 0
        y += dune(-11, -8, 11, 5.2, 3.8)
        y += dune(  5, -7, 13, 5.8, 4.6)
        y += dune( 13,  5, 10, 5.0, 5.3)
        y += dune( -5,  8, 14, 6.5, 4.2)
        y += dune(-15, 10,  8, 4.5, 2.8)

        // Gentle wind ripples affect silhouette only slightly.
        y += (Math.sin(x * 0.42 + z * 0.16) * 0.12 + 0.12) * edge
        return y * edge
    }

    setTerrain()
    {
        const rows = this.segments + 1
        const positions = new Float32Array(rows * rows * 3)
        const heights = new Float32Array(rows * rows)
        const indices = []
        let p = 0

        for(let ix = 0; ix < rows; ix++)
        {
            const x = -this.size.x * 0.5 + this.size.x * ix / this.segments
            for(let iz = 0; iz < rows; iz++)
            {
                const z = -this.size.z * 0.5 + this.size.z * iz / this.segments
                const y = this.heightAt(x, z)
                positions[p * 3 + 0] = x
                positions[p * 3 + 1] = y + 0.035
                positions[p * 3 + 2] = z
                heights[iz + ix * rows] = y
                p++
            }
        }

        for(let ix = 0; ix < this.segments; ix++)
        {
            for(let iz = 0; iz < this.segments; iz++)
            {
                const a = ix * rows + iz
                const b = (ix + 1) * rows + iz
                const c = (ix + 1) * rows + iz + 1
                const d = ix * rows + iz + 1
                indices.push(a, d, b, b, d, c)
            }
        }

        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        geometry.setIndex(indices)
        geometry.computeVertexNormals()

        const material = new MeshDefaultMaterial({
            colorNode: color('#d9a354'),
            hasWater: false,
            hasLightBounce: true,
            wireframe: false
        })

        this.mesh = new THREE.Mesh(geometry, material)
        this.mesh.name = 'Motri2DunesTrial'
        this.mesh.position.set(this.center.x, 0, this.center.z)
        this.mesh.receiveShadow = true
        this.mesh.castShadow = true
        this.game.scene.add(this.mesh)

        // Use the exact same sampled heights for Rapier collision.
        this.object = this.game.objects.add(null, {
            type: 'fixed',
            position: { x: this.center.x, y: 0, z: this.center.z },
            friction: 0.34,
            restitution: 0.03,
            colliders: [{
                shape: 'heightfield',
                parameters: [
                    this.segments,
                    this.segments,
                    heights,
                    { x: this.size.x, y: 1, z: this.size.z }
                ],
                category: 'floor'
            }]
        })
    }
}
