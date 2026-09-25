import * as THREE from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { CAMEL_CAMP, camelPlacements } from './CamelCampSite.js'

const palette = {
    sand: '#deb77c', edge: '#ffa94e', coat: '#c79961', hump: '#bb8951', cream: '#dec198',
    knee: '#9f754f', foot: '#635140', eye: '#2f2c27', cloth: '#423b34', stripe: '#d0b992',
    timber: '#98704e', rope: '#aa9168', rug: '#914c42', rugDark: '#633b36', cushion: '#bd7050',
    white: '#e2ddd0', blue: '#65a5b0', trim: '#576765', rubber: '#363c3b', glass: '#334c53',
    rim: '#9b9e90', lamp: '#e1ca86', water: '#63bcb8'
}

class Batch {
    constructor() { this.parts = [] }
    add(source, position, scale, tint, rotation = [0, 0, 0]) {
        const g = source.index ? source.toNonIndexed() : source.clone()
        for(const key of Object.keys(g.attributes)) if(!['position', 'normal'].includes(key)) g.deleteAttribute(key)
        const q = rotation.isQuaternion ? rotation : new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation))
        g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position), q, new THREE.Vector3(...scale)))
        const c = new THREE.Color(tint), values = new Float32Array(g.attributes.position.count * 3)
        for(let i = 0; i < values.length; i += 3) { values[i] = c.r; values[i + 1] = c.g; values[i + 2] = c.b }
        g.setAttribute('color', new THREE.BufferAttribute(values, 3)); this.parts.push(g)
    }
    finish() {
        const g = mergeGeometries(this.parts, false)
        for(const p of this.parts) p.dispose()
        g.computeBoundingBox(); g.computeBoundingSphere()
        return g
    }
}

// An elliptical, gently curved neck with eight sides. Its outline, single hump,
// long legs and split muzzle carry the dromedary silhouette at game distance.
function neckGeometry() {
    const sections = [[-.02, 0, .28, .25], [-.07, .35, .25, .23], [.08, .59, .21, .19],
        [.48, .77, .18, .16], [.96, .86, .145, .14], [1.4, 1.04, .135, .14]]
    const p = [], indices = [], sides = 8
    for(let j = 0; j < sections.length; j++) {
        const [y, z, rx, rz] = sections[j]
        const a = sections[Math.max(0, j - 1)], b = sections[Math.min(sections.length - 1, j + 1)]
        const dy = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dy, dz)
        for(let i = 0; i < sides; i++) {
            const angle = i * Math.PI * 2 / sides
            p.push(Math.cos(angle) * rx, y - Math.sin(angle) * rz * dz / length, z + Math.sin(angle) * rz * dy / length)
            if(j) {
                const k = j * sides + i, next = j * sides + (i + 1) % sides
                indices.push(k - sides, k, next - sides, next - sides, k, next)
            }
        }
    }
    for(let i = 1; i < sides - 1; i++) {
        indices.push(0, i, i + 1)
        const end = (sections.length - 1) * sides; indices.push(end, end + i + 1, end + i)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setIndex(indices); g.computeVertexNormals()
    return g
}

function groundGeometry() {
    const positions = [0, .012, 0], colors = [], indices = [], n = 64
    const base = new THREE.Color(palette.sand), edge = new THREE.Color(palette.edge)
    colors.push(base.r, base.g, base.b)
    for(const [radius, c] of [[CAMEL_CAMP.radius - .7, base], [CAMEL_CAMP.radius, edge]]) {
        for(let i = 0; i < n; i++) {
            const angle = i * Math.PI * 2 / n
            positions.push(Math.sin(angle) * radius, .012, Math.cos(angle) * radius)
            colors.push(c.r, c.g, c.b)
        }
    }
    for(let i = 0; i < n; i++) {
        const a = i + 1, b = (i + 1) % n + 1
        indices.push(0, a, b, a, a + n, b, b, a + n, b + n)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    g.setIndex(indices); g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere()
    return g
}

export class CamelCampModel {
    constructor(material) {
        this.root = new THREE.Group(); this.root.name = 'Motri_CamelCamp'
        this.root.position.fromArray(CAMEL_CAMP.center)
        this.colliders = []; this.headBases = []; this.headOffsets = []; this.camels = []; this.bodyBatches = []
        const cube = new THREE.BoxGeometry(1, 1, 1), round = new THREE.IcosahedronGeometry(1, 1)
        const small = new THREE.IcosahedronGeometry(1, 0), stem = new THREE.CylinderGeometry(1, 1, 1, 6)
        const rounded = new RoundedBoxGeometry(1, 1, 1, 1, .06)
        const props = new Batch()
        const box = (p, size, color, rotation) => props.add(cube, p, size, color, rotation)
        const rod = (batch, a, b, radius, color) => {
            const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), direction = end.clone().sub(start)
            const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize())
            batch.add(stem, start.add(end).multiplyScalar(.5).toArray(), [radius, direction.length(), radius], color, q)
        }
        const collider = (p, size, yaw = 0) => {
            const description = {
                shape: 'cuboid', category: 'object', parameters: size.map(n => n / 2),
                position: new THREE.Vector3(...p).add(this.root.position),
                quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
            }
            this.colliders.push(description)
            return description
        }

        // Open-front goat-hair tent: dark woven cloth, broad cream stripes,
        // softly sagging roof, restrained rugs and low cushions.
        const [tx, tz] = CAMEL_CAMP.tent
        const tentBox = (p, size, color, rotation) => box([tx + p[0], p[1], tz + p[2]], size, color, rotation)
        tentBox([0, .035, 0], [6.0, .05, 3.9], palette.rugDark)
        tentBox([0, .065, .1], [5.4, .015, 3.35], palette.rug)
        for(const x of [-2.45, 2.45]) tentBox([x, .078, .1], [.09, .008, 3.05], palette.stripe)
        for(const z of [-1.37, 1.57]) tentBox([0, .078, z], [4.98, .008, .09], palette.stripe)
        for(const x of [-1.8, -.6, .6, 1.8]) tentBox([x, .082, .1], [.24, .008, .24], palette.stripe, [0, Math.PI / 4, 0])
        for(const x of [-2.6, 2.6]) tentBox([x, .29, -.2], [.46, .43, 2.5], palette.cushion)
        for(const x of [-1.75, -.58, .58, 1.75]) {
            tentBox([x, .27, -1.52], [1.05, .4, .44], palette.cushion)
            tentBox([x, .48, -1.69], [1.05, .12, .16], palette.rugDark)
        }
        for(const y of [.2, .48, .76, 1.04, 1.32, 1.60, 1.88]) {
            const color = Math.round((y - .2) / .28) % 2 ? palette.stripe : palette.cloth
            tentBox([0, y, -2.02], [6.2, .28, .055], color)
            for(const x of [-3.07, 3.07]) tentBox([x, y, 0], [.055, .28, 4.1], color)
        }
        // Roof strips also provide real two-sided cloth thickness at the eaves.
        const xs = [-3.17, -2.05, -.9, 0, .9, 2.05, 3.17]
        const heights = [2.09, 2.91, 2.76, 3.04, 2.76, 2.91, 2.09]
        for(let i = 0; i < xs.length - 1; i++) {
            const x0 = xs[i], x1 = xs[i + 1], y0 = heights[i], y1 = heights[i + 1]
            const length = Math.hypot(x1 - x0, y1 - y0), tilt = Math.atan2(y1 - y0, x1 - x0)
            tentBox([(x0 + x1) / 2, (y0 + y1) / 2, 0], [length + .012, .055, 4.35], palette.cloth, [0, 0, tilt])
            if(i % 2 === 0) tentBox([(x0 + x1) / 2, (y0 + y1) / 2 + .031, 0], [.17, .012, 4.36], palette.stripe, [0, 0, tilt])
        }
        for(const x of [-3.02, 3.02]) for(const z of [-2, 2]) {
            tentBox([x, 1.045, z], [.095, 2.09, .095], palette.timber)
            const peg = [tx + x * 1.045, .035, tz + z * 1.16]
            rod(props, [tx + x, 2.04, tz + z], peg, .018, palette.rope)
        }
        for(const x of [-2.05, 0, 2.05]) tentBox([x, 1.45, -1.98], [.095, 2.9, .095], palette.timber)
        collider([tx, 1.03, tz - 2.02], [6.2, 2.06, .08])
        for(const x of [-3.07, 3.07]) collider([tx + x, 1.03, tz], [.10, 2.06, 4.1])
        // The front stays entirely open: no invisible box across the tent entrance.

        // Compact six-wheel water tanker, facing the open southern approach.
        const [wx, wz] = CAMEL_CAMP.tanker
        const truckBox = (p, size, color, roundEdges = false) => props.add(roundEdges ? rounded : cube,
            [wx + p[0], p[1], wz + p[2]], size, color)
        truckBox([0, .51, -.2], [1.75, .25, 5.65], palette.trim)
        truckBox([0, 1.54, 2.05], [2.1, 1.53, 1.72], palette.white, true)
        truckBox([0, 1.05, 2.3], [2.13, .43, 1.4], palette.blue)
        truckBox([0, 1.94, 2.918], [1.76, .57, .021], palette.glass)
        truckBox([0, 1.94, 2.934], [.055, .58, .018], palette.white)
        for(const s of [-1, 1]) {
            truckBox([s * 1.057, 1.94, 2.02], [.021, .57, 1.21], palette.glass)
            truckBox([s * 1.072, 1.47, 1.74], [.036, .055, .21], palette.trim)
            truckBox([s * 1.19, 1.86, 2.50], [.18, .3, .15], palette.trim, true)
            truckBox([s * .76, 1.13, 3.018], [.36, .22, .045], palette.lamp, true)
        }
        truckBox([0, .77, 3.06], [2.23, .22, .2], palette.trim, true)
        truckBox([0, 1.16, 3.016], [.75, .22, .046], palette.trim)
        truckBox([0, 1.13, 3.044], [.66, .045, .015], palette.rim)
        const profile = [[0, -2.02], [.69, -1.98], [.91, -1.82], [.95, -1.6], [.95, 1.6], [.91, 1.82], [.69, 1.98], [0, 2.02]]
        const tank = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 20)
        props.add(tank, [wx, 1.71, wz - .9], [1, 1, 1], palette.white, [Math.PI / 2, 0, 0]); tank.dispose()
        for(const s of [-1, 1]) truckBox([s * .945, 1.71, -.9], [.025, .28, 3.12], palette.blue)
        const cap = new THREE.CylinderGeometry(.23, .23, .11, 10)
        props.add(cap, [wx, 2.71, wz - .9], [1, 1, 1], palette.trim); cap.dispose()
        const tire = new THREE.CylinderGeometry(.435, .435, .25, 14), rim = new THREE.CylinderGeometry(.25, .25, .266, 10)
        for(const s of [-1, 1]) for(const z of [2.05, -1.25, -2.35]) {
            props.add(tire, [wx + s * 1.035, .435, wz + z], [1, 1, 1], palette.rubber, [0, 0, Math.PI / 2])
            props.add(rim, [wx + s * 1.035, .435, wz + z], [1, 1, 1], palette.rim, [0, 0, Math.PI / 2])
        }
        tire.dispose(); rim.dispose()
        for(const z of [-1.9, .1]) truckBox([0, .91, z], [1.55, .28, .16], palette.trim)
        collider([wx, 1.16, wz - .75], [2.18, 2.3, 4.42])
        collider([wx, 1.18, wz + 2.03], [2.23, 2.36, 2.10])

        // A visible hose connects the tanker to a low drinking trough.
        const trough = [2.97, -2.2]
        box([trough[0], .17, trough[1]], [.93, .27, 2.2], palette.rim)
        for(const x of [-.51, .51]) box([trough[0] + x, .39, trough[1]], [.12, .35, 2.38], palette.trim)
        for(const z of [-1.13, 1.13]) box([trough[0], .39, trough[1] + z], [.94, .35, .12], palette.trim)
        box([trough[0], .44, trough[1]], [.91, .02, 2.10], palette.water)
        const hose = [[wx - .97, .95, wz - 1.0], [3.91, .22, -3.45], [3.68, .07, -2.4], [3.27, .49, -2.1]]
        for(let i = 1; i < hose.length; i++) rod(props, hose[i - 1], hose[i], .035, palette.trim)
        collider([trough[0], .28, trough[1]], [1.14, .56, 2.4])

        const ground = new THREE.Mesh(groundGeometry(), material); ground.name = 'CamelCamp_Sand'
        ground.receiveShadow = true; this.root.add(ground)
        const staticMesh = new THREE.Mesh(props.finish(), material); staticMesh.name = 'CamelCamp_Tent_Tanker_Trough'
        staticMesh.castShadow = staticMesh.receiveShadow = true; this.root.add(staticMesh)

        const bodyGeometry = seated => {
            const batch = new Batch(), offset = seated ? -.99 : 0
            batch.add(round, [0, 1.55 + offset, 0], [.52, .53, 1.0], palette.coat)
            batch.add(round, [0, 2.035 + offset, -.17], [.41, .62, .58], palette.hump)
            batch.add(small, [0, 1.53 + offset, .72], [.40, .42, .40], palette.coat)
            for(const s of [-1, 1]) for(const front of [false, true]) {
                const z = front ? .68 : -.67
                if(seated) {
                    batch.add(round, [s * .40, .245, z], [.14, .16, .40], palette.knee)
                    batch.add(small, [s * .40, .095, z + (front ? .33 : -.32)], [.15, .095, .25], palette.foot)
                } else {
                    const kneeZ = z + (front ? .025 : -.14)
                    rod(batch, [s * .35, 1.4, z], [s * .37, .73, kneeZ], .095, palette.coat)
                    batch.add(small, [s * .37, .72, kneeZ], [.12, .125, .125], palette.knee)
                    rod(batch, [s * .37, .69, kneeZ], [s * .38, .14, z + .04], .06, palette.coat)
                    batch.add(round, [s * .38, .087, z + .11], [.128, .087, .195], palette.foot)
                }
            }
            const tailY = 1.67 + offset
            rod(batch, [0, tailY, -.91], [.05, tailY - .19, -1.17], .045, palette.knee)
            rod(batch, [.05, tailY - .19, -1.17], [.09, Math.max(.16, tailY - .64), -1.16], .034, palette.knee)
            batch.add(small, [.09, Math.max(.13, tailY - .66), -1.16], [.08, .125, .08], palette.foot)
            return batch.finish()
        }
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), size = new THREE.Vector3()
        for(const seated of [false, true]) {
            const placements = camelPlacements.filter(c => c.seated === seated)
            const batch = new THREE.InstancedMesh(bodyGeometry(seated), material, placements.length)
            batch.name = seated ? 'CamelCamp_KneelingBodies' : 'CamelCamp_StandingBodies'
            batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
            this.bodyBatches.push(batch)
            placements.forEach((c, i) => {
                q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.yaw); size.setScalar(c.size)
                batch.setMatrixAt(i, m.compose(new THREE.Vector3(c.x, .018, c.z), q, size))
                const shape = collider([c.x, c.seated ? .58 * c.size : 1.08 * c.size, c.z],
                    [.91 * c.size, (c.seated ? 1.1 : 2.12) * c.size, 1.85 * c.size], c.yaw)
                shape.camelIndex = camelPlacements.indexOf(c)
                this.camels[shape.camelIndex] = {
                    batch, instance: i, matrix: m.clone(), collider: shape,
                    centerHeight: shape.position.y - this.root.position.y, size: size.clone()
                }
            })
            batch.instanceMatrix.needsUpdate = true; batch.computeBoundingBox(); batch.computeBoundingSphere()
            batch.castShadow = batch.receiveShadow = true; this.root.add(batch)
        }
        const head = new Batch(), neck = neckGeometry()
        head.add(neck, [0, 0, 0], [1, 1, 1], palette.coat); neck.dispose()
        head.add(round, [0, 1.46, 1.105], [.18, .205, .28], palette.coat)
        head.add(round, [0, 1.38, 1.39], [.165, .135, .25], palette.cream)
        head.add(small, [0, 1.303, 1.48], [.16, .044, .16], palette.knee)
        for(const s of [-1, 1]) {
            head.add(small, [s * .225, 1.60, .99], [.14, .077, .105], palette.knee, [0, s * .4, s * -.45])
            head.add(small, [s * .153, 1.51, 1.22], [.035, .04, .026], palette.eye)
            head.add(small, [s * .102, 1.405, 1.606], [.026, .025, .015], palette.eye)
        }
        this.heads = new THREE.InstancedMesh(head.finish(), material, camelPlacements.length)
        this.heads.name = 'CamelCamp_AnimatedNecksHeads'; this.heads.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        this.heads.castShadow = this.heads.receiveShadow = true
        this.heads.boundingBox = new THREE.Box3(new THREE.Vector3(-8.6, 0, -8.6), new THREE.Vector3(8.6, 3.6, 8.6))
        this.heads.boundingSphere = this.heads.boundingBox.getBoundingSphere(new THREE.Sphere())
        this.root.add(this.heads)
        for(const c of camelPlacements) {
            q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.yaw); size.setScalar(c.size)
            const offset = new THREE.Matrix4().makeTranslation(0, c.seated ? .63 : 1.62, .72)
            this.headOffsets.push(offset)
            this.headBases.push(new THREE.Matrix4().compose(new THREE.Vector3(c.x, .018, c.z), q, size)
                .multiply(offset))
        }
        this.matrix = new THREE.Matrix4(); this.rotation = new THREE.Matrix4(); this.euler = new THREE.Euler()
        this.position = new THREE.Vector3(); this.offset = new THREE.Vector3()
        this.quaternion = new THREE.Quaternion()
        this.bodyBoundsDirty = false
        this.pose(0)
        for(const g of [cube, round, small, stem, rounded]) g.dispose()
        this.root.updateMatrixWorld(true)
    }

    setCamelTransform(index, worldCenter, quaternion) {
        const camel = this.camels[index]
        // The collider is centred on the body; the authored mesh starts at the feet.
        this.quaternion.copy(quaternion)
        this.offset.set(0, .018 - camel.centerHeight, 0).applyQuaternion(this.quaternion)
        this.position.copy(worldCenter).sub(this.root.position).add(this.offset)
        camel.matrix.compose(this.position, this.quaternion, camel.size)
        camel.batch.setMatrixAt(camel.instance, camel.matrix)
        camel.batch.instanceMatrix.needsUpdate = true
        this.headBases[index].copy(camel.matrix).multiply(this.headOffsets[index])
        this.bodyBoundsDirty = true
    }

    pose(time) {
        // Head motion stays relative to its own body, including while airborne.
        for(let i = 0; i < this.headBases.length; i++) {
            const phase = i * 2.399963
            this.euler.set(Math.sin(time * .51 + phase) * .035, Math.sin(time * .34 + phase) * .07, 0)
            this.rotation.makeRotationFromEuler(this.euler)
            this.heads.setMatrixAt(i, this.matrix.copy(this.headBases[i]).multiply(this.rotation))
        }
        this.heads.instanceMatrix.needsUpdate = true
        this.heads.computeBoundingBox(); this.heads.computeBoundingSphere()
        if(this.bodyBoundsDirty) {
            for(const batch of this.bodyBatches) { batch.computeBoundingBox(); batch.computeBoundingSphere() }
            this.bodyBoundsDirty = false
        }
    }
}
