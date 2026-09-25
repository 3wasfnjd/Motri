import * as THREE from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const palette = {
    cream: '#eee4c8', wing: '#d2ad76', tail: '#927345',
    gold: '#d19a45', rust: '#9a5536', green: '#385d55', teal: '#487b70',
    comb: '#be493f', combLight: '#d75a45', beak: '#d8a147', foot: '#b18449', eye: '#292e2c'
}

class Parts {
    constructor() { this.parts = [] }
    add(source, position, scale, tint, rotation = [0, 0, 0]) {
        const g = source.index ? source.toNonIndexed() : source.clone()
        for(const key of Object.keys(g.attributes))
            if(!['position', 'normal'].includes(key)) g.deleteAttribute(key)
        g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale)))
        const color = new THREE.Color(tint), a = new Float32Array(g.attributes.position.count * 3)
        for(let i = 0; i < a.length; i += 3) { a[i] = color.r; a[i + 1] = color.g; a[i + 2] = color.b }
        g.setAttribute('color', new THREE.BufferAttribute(a, 3)); this.parts.push(g)
    }
    finish() {
        const g = mergeGeometries(this.parts, false)
        for(const p of this.parts) p.dispose()
        g.computeBoundingBox(); g.computeBoundingSphere()
        return g
    }
}

// Five shared meshes: hen/rooster torsos and heads, plus all twelve animated legs.
// Geometry uses world metres; placement follows the house without inheriting its scale.
export class RestHousePoultryModel {
    constructor(material, motion) {
        this.root = new THREE.Group(); this.root.name = 'RestHouse_Poultry_4Hens_2Roosters'
        this.motion = motion
        this.batches = new Map()
        const round = new THREE.IcosahedronGeometry(1, 1), faceted = new THREE.IcosahedronGeometry(1, 0)
        const cube = new THREE.BoxGeometry(1, 1, 1)
        const stem = new THREE.CylinderGeometry(1, 1, 1, 5)
        const cone = new THREE.ConeGeometry(1, 1, 4)
        const makeBatch = (name, geometry, count) => {
            const mesh = new THREE.InstancedMesh(geometry, material, count)
            mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true
            mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
            const [x0, x1, z0, z1] = motion.travelBounds
            // Cover every allowed position, including head/leg movement, without
            // recomputing instance bounds on each frame or culling a travelling bird.
            mesh.boundingBox = new THREE.Box3(new THREE.Vector3(x0 - 1, -.1, z0 - 1), new THREE.Vector3(x1 + 1, 1.6, z1 + 1))
            mesh.boundingSphere = mesh.boundingBox.getBoundingSphere(new THREE.Sphere())
            this.root.add(mesh); this.batches.set(name, mesh)
            return mesh
        }
        for(const kind of ['hen', 'rooster']) {
            const rooster = kind === 'rooster', body = new Parts(), head = new Parts()
            const main = rooster ? palette.rust : palette.cream
            body.add(round, [0, .31, -.02], rooster ? [.205, .21, .265] : [.185, .19, .25], main)
            body.add(faceted, [0, .38, .15], [.14, .17, .14], rooster ? palette.gold : palette.cream)
            for(const sign of [-1, 1]) {
                body.add(faceted, [sign * .168, .32, -.03], [.063, .14, .21], rooster ? palette.gold : palette.wing, [.22, 0, sign * .18])
                body.add(faceted, [sign * .178, .30, -.13], [.04, .09, .13], rooster ? palette.green : palette.tail, [.3, 0, 0])
            }
            if(rooster) {
                for(let i = -2; i <= 2; i++) {
                    const x = i * .043, shade = i % 2 ? palette.green : palette.teal
                    body.add(faceted, [x, .48, -.25], [.038, .20, .065], shade, [-.34, 0, -i * .12])
                    body.add(faceted, [x, .66, -.32], [.035, .15, .065], shade, [-.70, 0, -i * .10])
                    body.add(faceted, [x, .70, -.415], [.032, .105, .053], shade, [-1.8, 0, -i * .10])
                }
            } else {
                for(let i = -1; i <= 1; i++) body.add(faceted, [i * .045, .405, -.26], [.055, .16, .08], palette.tail, [-.58, 0, -i * .16])
            }
            // Head coordinates are relative to the neck hinge, allowing real pecking.
            head.add(faceted, [0, .025, 0], [.095, .135, .115], rooster ? palette.gold : palette.cream)
            head.add(round, [0, .145, .085], [.104, .119, .113], rooster ? palette.gold : palette.cream)
            head.add(cone, [0, .125, .222], [.064, .125, .057], palette.beak, [Math.PI / 2, 0, 0])
            for(const sign of [-1, 1]) {
                head.add(faceted, [sign * .089, .18, .133], [.021, .026, .017], palette.eye)
                head.add(faceted, [sign * .026, .025, .165], [.029, rooster ? .09 : .047, .033], palette.comb)
            }
            for(let i = 0; i < 3; i++) head.add(faceted, [0, .27 + (rooster ? .035 : 0), -.005 + i * .058],
                [rooster ? .031 : .022, rooster ? .085 : .046, .043], i === 1 ? palette.combLight : palette.comb)
            const count = motion.birds.filter(b => b.kind === kind).length
            makeBatch(`${kind}_Body`, body.finish(), count)
            makeBatch(`${kind}_Head`, head.finish(), count)
        }
        const leg = new Parts()
        leg.add(stem, [0, -.085, 0], [.017, .17, .017], palette.foot)
        for(const i of [-1, 0, 1]) leg.add(cube, [i * .023, -.178, .036], [.016, .021, .10], palette.foot, [0, -i * .32, 0])
        leg.add(cube, [0, -.174, -.037], [.017, .019, .057], palette.foot)
        makeBatch('Poultry_Legs', leg.finish(), 12)
        for(const g of [round, faceted, cube, stem, cone]) g.dispose()
        this.base = new THREE.Matrix4(); this.body = new THREE.Matrix4(); this.part = new THREE.Matrix4()
        this.offset = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.euler = new THREE.Euler()
        this.position = new THREE.Vector3(); this.size = new THREE.Vector3()
        this.pose()
    }

    pose() {
        const indexes = { hen: 0, rooster: 0 }, legs = this.batches.get('Poultry_Legs')
        const legBox = legs.geometry.boundingBox
        this.motion.birds.forEach((b, birdIndex) => {
            const i = indexes[b.kind]++, rooster = b.kind === 'rooster'
            const walking = Math.min(1, b.speed / .25)
            const peck = b.state === 'peck' && !b.alert ? Math.pow(Math.max(0, Math.sin(b.time * 5.4)), 3) : 0
            const bob = Math.abs(Math.sin(b.phase)) * .018 * walking
            this.position.set(b.x, .018, b.z); this.size.setScalar(b.size)
            this.q.setFromEuler(this.euler.set(0, b.yaw, 0))
            this.base.compose(this.position, this.q, this.size)
            this.offset.makeTranslation(0, bob - peck * .025, 0)
            this.q.setFromEuler(this.euler.set(peck * .16, 0, Math.sin(b.phase) * .028 * walking))
            this.part.makeRotationFromQuaternion(this.q)
            this.body.copy(this.base).multiply(this.offset).multiply(this.part)
            this.batches.get(`${b.kind}_Body`).setMatrixAt(i, this.body)
            this.offset.makeTranslation(0, rooster ? .435 : .365, .145)
            this.q.setFromEuler(this.euler.set(peck * (rooster ? 1.45 : 1.35) + Math.sin(b.phase) * .07 * walking,
                Math.sin(b.time * 1.7) * .13 * (1 - peck), 0))
            this.part.makeRotationFromQuaternion(this.q)
            this.offset.multiply(this.part); this.part.copy(this.body).multiply(this.offset)
            this.batches.get(`${b.kind}_Head`).setMatrixAt(i, this.part)
            for(let side = 0; side < 2; side++) {
                const cycle = Math.sin(b.phase + side * Math.PI), angle = cycle * .48 * walking
                const c = Math.cos(angle), s = Math.sin(angle)
                const lowest = Math.min(legBox.min.y * c - legBox.min.z * s, legBox.min.y * c - legBox.max.z * s)
                const lift = Math.max(0, cycle) * .052 * walking
                this.offset.makeTranslation(side ? .095 : -.095, -lowest + lift, -.012)
                this.part.makeRotationX(angle); this.offset.multiply(this.part)
                this.part.copy(this.base).multiply(this.offset); legs.setMatrixAt(birdIndex * 2 + side, this.part)
            }
        })
        for(const mesh of this.batches.values()) mesh.instanceMatrix.needsUpdate = true
    }
}
