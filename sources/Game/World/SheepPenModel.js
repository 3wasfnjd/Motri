import * as THREE from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { SHEEP_PEN } from './SheepPenSite.js'

const palette = {
    soil: '#d9b475', timber: '#9d683d', endGrain: '#bf8c56', rails: '#bb8954',
    metal: '#566766', roof: '#719394', roofEdge: '#476a6c',
    straw: '#dac36c', strawBand: '#a98a4b', trough: '#929d8a', water: '#5aaead',
    wool: '#eee8cf', woolShade: '#ddd3b4', face: '#52483e', ear: '#8a7461', hoof: '#443e36'
}

// Geometry and palette are shared. No downloaded models, image maps or per-frame work.
class Batch {
    constructor() { this.parts = [] }
    add(geometry, position, scale, tint, rotation = [0, 0, 0]) {
        const g = geometry.index ? geometry.toNonIndexed() : geometry.clone()
        for(const key of Object.keys(g.attributes))
            if(!['position', 'normal'].includes(key)) g.deleteAttribute(key)
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation))
        g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position), q, new THREE.Vector3(...scale)))
        const color = new THREE.Color(tint), values = new Float32Array(g.attributes.position.count * 3)
        for(let i = 0; i < values.length; i += 3) { values[i] = color.r; values[i + 1] = color.g; values[i + 2] = color.b }
        g.setAttribute('color', new THREE.BufferAttribute(values, 3))
        this.parts.push(g)
    }
    finish() {
        const geometry = mergeGeometries(this.parts, false)
        for(const part of this.parts) part.dispose()
        geometry.computeBoundingBox(); geometry.computeBoundingSphere()
        return geometry
    }
}

export const sheepPlacements = [
    { x: -4.7, z: -2.7, yaw: .4, size: 1, grazing: false },
    { x: -2.7, z: -2.6, yaw: -.4, size: .95, grazing: true },
    { x: -5.1, z: -.5, yaw: 1.7, size: 1.02, grazing: false },
    { x: -2.8, z: .1, yaw: 2.4, size: 1, grazing: true },
    { x: -4.3, z: 2.3, yaw: -.6, size: .95, grazing: false },
    { x: -.9, z: -2.0, yaw: 1.2, size: .9, grazing: true },
    { x: -.3, z: 2.0, yaw: -1.8, size: 1.03, grazing: false },
    { x: -1.8, z: 3.5, yaw: 2.6, size: .68, grazing: true },
    { x: -2.8, z: 2.4, yaw: .4, size: .66, grazing: false },
    { x: .4, z: -.2, yaw: -.7, size: .95, grazing: false }
]

export function buildSheepPenModel(material) {
    const root = new THREE.Group()
    root.name = 'Motri_SheepPen'
    root.position.fromArray(SHEEP_PEN.center)
    const staticBatch = new Batch(), colliders = []
    const cube = new THREE.BoxGeometry(1, 1, 1)
    const round = new THREE.IcosahedronGeometry(1, 1)
    const smallRound = new THREE.IcosahedronGeometry(1, 0)
    const leg = new THREE.CylinderGeometry(.065, .06, 1, 6, 1)
    const addBox = (pos, size, tint, rotation = [0, 0, 0]) => staticBatch.add(cube, pos, size, tint, rotation)
    const collider = (pos, halfSize, rotation = [0, 0, 0]) => colliders.push({
        shape: 'cuboid', category: 'object', parameters: halfSize,
        position: new THREE.Vector3(...pos).add(root.position),
        quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation))
    })
    // A flush pad over the flattened terrain, plus an approach stopping before asphalt.
    addBox([0, -.045, 0], [15.8, .11, 11.4], palette.soil)
    addBox([9.925, -.045, 0], [4.05, .11, 5.2], palette.soil)

    const post = (x, z) => {
        addBox([x, .72, z], [.19, 1.44, .19], palette.timber)
        addBox([x, 1.45, z], [.235, .08, .235], palette.endGrain)
    }
    const fence = (a, b, withCollision = true) => {
        const dx = b[0] - a[0], dz = b[1] - a[1]
        const length = Math.hypot(dx, dz), yaw = -Math.atan2(dz, dx)
        const cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2
        for(const y of [.37, .79, 1.21]) addBox([cx, y, cz], [length, .115, .095], palette.rails, [0, yaw, 0])
        const bays = Math.ceil(length / 1.9)
        for(let i = 0; i <= bays; i++) post(a[0] + dx * i / bays, a[1] + dz * i / bays)
        if(withCollision) collider([cx, .69, cz], [length / 2 + .09, .69, .11], [0, yaw, 0])
    }
    fence([-7.5, -5.3], [-7.5, 5.3])
    fence([-7.5, -5.3], [7.5, -5.3])
    fence([-7.5, 5.3], [7.5, 5.3])
    fence([7.5, -5.3], [7.5, -2.4])
    fence([7.5, 2.4], [7.5, 5.3])
    // Gate leaves swing away from the 4.8 m wide entrance.
    fence([7.5, -2.4], [9.5, -3.05])
    fence([7.5, 2.4], [9.5, 3.05])

    // Compact weathered teal shade, raised high enough to read at driving distance.
    for(const x of [-6.6, -1.6]) for(const z of [-4.5, -1.1]) {
        addBox([x, 1.19, z], [.16, 2.38, .16], palette.timber)
        collider([x, 1.19, z], [.08, 1.19, .08])
    }
    for(const z of [-4.5, -1.1]) addBox([-4.1, 2.31, z], [5.3, .16, .16], palette.roofEdge)
    addBox([-4.1, 2.5, -2.8], [5.65, .12, 3.9], palette.roof, [.06, 0, 0])
    collider([-4.1, 2.5, -2.8], [2.825, .06, 1.95], [.06, 0, 0])
    for(let i = 0; i < 9; i++) addBox([-6.5 + i * .60, 2.577, -2.8], [.045, .035, 3.9], palette.roofEdge, [.06, 0, 0])

    const trough = (x, z, width, depth, fillColor) => {
        addBox([x, .20, z], [width, .25, depth], palette.trough)
        for(const zz of [z - depth / 2, z + depth / 2]) addBox([x, .38, zz], [width + .08, .24, .1], palette.trough)
        for(const xx of [x - width / 2, x + width / 2]) addBox([xx, .38, z], [.1, .24, depth], palette.trough)
        addBox([x, .40, z], [width - .1, .02, depth - .1], fillColor)
        collider([x, .27, z], [width / 2 + .05, .27, depth / 2 + .05])
    }
    trough(-6.4, 2.45, .8, 2.55, palette.straw)
    trough(1.5, -4.5, 2.2, .75, palette.water)
    for(const [x, y, z] of [[-6.0, .34, -3.9], [-5.1, .34, -3.9], [-5.6, .91, -3.9]]) {
        addBox([x, y, z], [.80, .57, .64], palette.straw)
        for(const xx of [x - .23, x + .23]) addBox([xx, y, z], [.055, .585, .652], palette.strawBand)
    }
    collider([-5.55, .64, -3.9], [.90, .64, .35])
    const staticMesh = new THREE.Mesh(staticBatch.finish(), material)
    staticMesh.name = 'SheepPen_Fence_Shade_Feeders'
    root.add(staticMesh)

    const sheepGeometry = grazing => {
        const body = new Batch(), head = new Batch()
        body.add(round, [0, .79, 0], [.43, .44, .66], palette.wool)
        for(const [x, y, z, sx, sy, sz] of [[0, 1.1, -.25, .37, .21, .4], [0, 1.09, .30, .38, .24, .35], [0, .80, -.58, .33, .33, .22]])
            body.add(smallRound, [x, y, z], [sx, sy, sz], palette.wool)
        for(const x of [-.25, .25]) for(const z of [-.38, .38]) {
            body.add(leg, [x, .31, z], [1, .54, 1], palette.ear)
            body.add(cube, [x, .065, z + .015], [.135, .13, .18], palette.hoof)
        }
        body.add(smallRound, [0, .8, -.72], [.10, .17, .12], palette.woolShade, [.4, 0, 0])
        head.add(round, [0, .99, .56], [.25, .31, .26], palette.woolShade)
        head.add(round, [0, 1.05, .74], [.20, .25, .23], palette.face)
        head.add(smallRound, [0, .91, .91], [.165, .13, .15], palette.face)
        head.add(smallRound, [0, 1.25, .67], [.23, .14, .20], palette.wool)
        for(const sign of [-1, 1]) {
            head.add(smallRound, [sign * .29, 1.10, .65], [.18, .075, .11], palette.ear, [0, 0, sign * -.4])
            head.add(smallRound, [sign * .176, 1.12, .85], [.035, .044, .022], '#f2ead2')
            head.add(smallRound, [sign * .181, 1.12, .868], [.018, .026, .010], '#292d2b')
        }
        const h = head.finish()
        if(grazing) {
            h.translate(0, -.82, -.48)
            h.rotateX(1.02)
            h.translate(0, .82, .48)
        }
        const b = body.finish(), geometry = mergeGeometries([b, h], false)
        b.dispose(); h.dispose(); geometry.computeBoundingBox(); geometry.computeBoundingSphere()
        return geometry
    }
    for(const grazing of [false, true]) {
        const placements = sheepPlacements.filter(s => s.grazing === grazing)
        const mesh = new THREE.InstancedMesh(sheepGeometry(grazing), material, placements.length)
        mesh.name = grazing ? 'SheepPen_GrazingSheep' : 'SheepPen_StandingSheep'
        placements.forEach((s, i) => {
            const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw)
            mesh.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(s.x, .014, s.z), q, new THREE.Vector3(s.size, s.size, s.size)))
            collider([s.x, .60 * s.size, s.z + .03], [.40 * s.size, .59 * s.size, .76 * s.size], [0, s.yaw, 0])
        })
        mesh.instanceMatrix.needsUpdate = true
        mesh.computeBoundingBox(); mesh.computeBoundingSphere()
        root.add(mesh)
    }
    for(const g of [cube, round, smallRound, leg]) g.dispose()
    root.traverse(o => { if(o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
    root.updateMatrixWorld(true)
    return { root, colliders }
}
