import * as THREE from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { FEED_PICKUP } from './SheepPenSite.js'

const colors = {
    paint: '#eeeadd', glass: '#3c5960', rubber: '#323b39', trim: '#485653',
    chrome: '#b2b8aa', rim: '#c1bfb0', red: '#95493f', stripe: '#b46a4e',
    lamp: '#f0dcab', amber: '#d89449', tail: '#b6493e',
    hay: '#d3b465', haySide: '#bfa052', alfalfa: '#84934f', alfalfaSide: '#6d8147', rope: '#e0c895'
}

// A bevelled rectangular solid with only one bevel segment, reused for bales,
// trim and body panels. The entire parked pickup becomes one vertex-colour mesh.
function bevelBox() {
    const shape = new THREE.Shape()
    shape.moveTo(-.46, -.46); shape.lineTo(.46, -.46); shape.lineTo(.46, .46); shape.lineTo(-.46, .46); shape.closePath()
    const g = new THREE.ExtrudeGeometry(shape, { depth: .92, bevelEnabled: true, bevelThickness: .04,
        bevelSize: .04, bevelSegments: 1, steps: 1, curveSegments: 1 })
    g.translate(0, 0, -.46)
    return g
}

export function buildSheepFeedPickup(material) {
    const parts = [], cube = new THREE.BoxGeometry(1, 1, 1), bevel = bevelBox(), plane = new THREE.PlaneGeometry(1, 1)
    const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), size = new THREE.Vector3()
    const add = (source, pos, dimensions, tint, rotation = [0, 0, 0]) => {
        const g = source.index ? source.toNonIndexed() : source.clone()
        for(const key of Object.keys(g.attributes)) if(!['position', 'normal'].includes(key)) g.deleteAttribute(key)
        q.setFromEuler(new THREE.Euler(...rotation))
        g.applyMatrix4(matrix.compose(p.fromArray(pos), q, size.fromArray(dimensions)))
        const c = new THREE.Color(tint), values = new Float32Array(g.attributes.position.count * 3)
        for(let i = 0; i < values.length; i += 3) { values[i] = c.r; values[i + 1] = c.g; values[i + 2] = c.b }
        g.setAttribute('color', new THREE.BufferAttribute(values, 3)); parts.push(g)
    }
    const box = (pos, dimensions, tint, rounded = false, rotation) => add(rounded ? bevel : cube, pos, dimensions, tint, rotation)
    const surface = (pos, dimensions, tint, rotation) => add(plane, pos, [...dimensions, 1], tint, rotation)
    const line = (a, b, radius, tint) => {
        const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start)
        const rod = new THREE.CylinderGeometry(radius, radius, delta.length(), 5)
        rod.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()))
        add(rod, start.add(end).multiplyScalar(.5).toArray(), [1, 1, 1], tint); rod.dispose()
    }
    const sidePrism = (points, width, bevelSize = 0) => {
        const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)))
        const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: bevelSize > 0,
            bevelSize, bevelThickness: bevelSize, bevelSegments: 1, steps: 1, curveSegments: 1 })
        g.translate(0, 0, -width / 2); g.rotateY(-Math.PI / 2)
        return g
    }

    // Low, long single cab Datsun/Nissan pickup silhouette. +Z is the front.
    box([0, .46, 0], [1.28, .20, 4.43], colors.trim)
    box([0, .68, -.05], [1.38, .27, 4.31], colors.paint)
    const side = new THREE.Shape(), archRadius = .46, wheelY = .381
    const a = Math.asin((.46 - wheelY) / archRadius)
    side.moveTo(-2.28, 1.12); side.lineTo(2.24, 1.085); side.lineTo(2.24, .46)
    for(const z of [1.43, -1.46]) {
        side.lineTo(z + Math.cos(a) * archRadius, .46)
        side.absarc(z, wheelY, archRadius, a, Math.PI - a, false)
    }
    side.lineTo(-2.28, .46); side.closePath()
    const panel = new THREE.ExtrudeGeometry(side, { depth: .065, bevelEnabled: true, bevelSize: .018,
        bevelThickness: .018, bevelSegments: 1, steps: 1, curveSegments: 5 })
    panel.translate(0, 0, -.0325); panel.rotateY(-Math.PI / 2)
    for(const sign of [-1, 1]) add(panel, [sign * .83, 0, 0], [1, 1, 1], colors.paint)
    panel.dispose()

    const cab = sidePrism([[-.43, 1.07], [1.08, 1.07], [.64, 1.80], [-.36, 1.80]], 1.58, .035)
    add(cab, [0, 0, 0], [1, 1, 1], colors.paint); cab.dispose()
    box([0, 1.82, .12], [1.59, .075, 1.09], colors.paint, true)
    box([0, 1.033, 1.62], [1.64, .135, 1.26], colors.paint, true)
    box([0, 1.455, .89], [1.39, .635, .022], colors.glass, true, [-.54, 0, 0])
    box([0, 1.46, -.441], [1.23, .48, .022], colors.glass, true, [.096, 0, 0])
    const window = sidePrism([[-.28, 1.18], [.85, 1.18], [.58, 1.72], [-.27, 1.72]], .012)
    for(const sign of [-1, 1]) {
        add(window, [sign * .837, 0, 0], [1, 1, 1], colors.glass)
        box([sign * .888, 1.105, -.15], [.04, .055, .17], colors.trim, true)
        box([sign * .890, .78, -.36], [.014, .49, .018], colors.trim)
        box([sign * .887, 1.05, .10], [.01, .12, 1.10], colors.red)
        box([sign * .889, .97, -.01], [.014, .025, 1.30], colors.stripe)
        box([sign * .888, 1.035, -1.40], [.011, .11, 1.72], colors.red)
        box([sign * .890, .952, -1.40], [.015, .025, 1.72], colors.stripe)
        line([sign * .81, 1.25, .78], [sign * .98, 1.35, .76], .026, colors.trim)
        box([sign * 1.045, 1.405, .74], [.18, .23, .16], colors.trim, true)
        box([sign * 1.045, 1.414, .650], [.137, .163, .013], colors.glass, true)
    }
    window.dispose()
    for(const x of [-.39, .32]) box([x, 1.178, .992], [.44, .02, .027], colors.trim, false, [0, 0, x < 0 ? .055 : -.06])

    // Rectangular lamps, chrome grille/bumper, and restrained maroon side stripes.
    box([0, .84, 2.245], [1.02, .255, .065], colors.chrome, true)
    box([0, .84, 2.284], [.91, .19, .02], colors.trim)
    for(const y of [.80, .88]) box([0, y, 2.30], [.87, .029, .018], colors.chrome)
    for(const sign of [-1, 1]) {
        box([sign * .66, .856, 2.27], [.34, .25, .05], colors.chrome, true)
        box([sign * .65, .86, 2.305], [.284, .188, .022], colors.lamp, true)
        box([sign * .836, .85, 2.283], [.072, .17, .02], colors.amber, true)
        box([sign * .79, .485, 2.33], [.20, .20, .20], colors.trim, true)
    }
    box([0, .50, 2.325], [1.80, .20, .18], colors.chrome, true)
    box([0, .485, 2.429], [.40, .18, .016], colors.paint, true)
    const emblem = new THREE.TorusGeometry(.061, .013, 4, 12)
    add(emblem, [0, .846, 2.32], [1, 1, 1], colors.chrome); emblem.dispose()
    box([0, .846, 2.335], [.15, .028, .01], colors.chrome)

    // Open load bed and tailgate; no hidden cabin or drivetrain detail.
    box([0, .717, -1.39], [1.55, .085, 1.83], colors.trim)
    for(const sign of [-1, 1]) {
        box([sign * .775, .934, -1.39], [.08, .38, 1.80], colors.paint)
        box([sign * .823, 1.137, -1.39], [.105, .052, 1.87], colors.paint, true)
        box([sign * .78, .89, -2.295], [.15, .32, .042], colors.tail, true)
        box([sign * .78, .878, -2.32], [.12, .078, .012], colors.lamp)
        box([sign * .79, .32, -1.89], [.26, .36, .045], colors.rubber)
    }
    box([0, .925, -2.28], [1.55, .405, .08], colors.paint, true)
    box([0, 1.045, -2.331], [.21, .035, .015], colors.trim)
    box([0, .52, -2.36], [1.83, .15, .19], colors.chrome, true)
    box([0, .605, -2.36], [.77, .02, .22], colors.trim)
    box([0, .496, -2.465], [.40, .17, .012], colors.paint, true)
    // Tiny vector strokes keep the tailgate identity crisp without a font/texture.
    const glyphs = {
        N: [[[0,0],[0,1]], [[0,1],[.65,0]], [[.65,0],[.65,1]]],
        I: [[[0,1],[.65,1]], [[.325,1],[.325,0]], [[0,0],[.65,0]]],
        S: [[[.65,1],[0,1]], [[0,1],[0,.5]], [[0,.5],[.65,.5]], [[.65,.5],[.65,0]], [[.65,0],[0,0]]],
        A: [[[0,0],[.325,1]], [[.325,1],[.65,0]], [[.16,.45],[.50,.45]]]
    }
    const letters = 'NISSAN', height = .15, spacing = .84 * height
    for(let i = 0; i < letters.length; i++) for(const [a, b] of glyphs[letters[i]]) {
        const x = ((a[0] + b[0]) / 2 - .325) * height + (i - 2.5) * spacing
        const y = (a[1] + b[1]) / 2 * height + .797
        const dx = b[0] - a[0], dy = b[1] - a[1]
        box([-x, y, -2.327], [Math.hypot(dx, dy) * height, .018, .01], colors.red, false, [0, 0, -Math.atan2(dy, dx)])
    }

    // Four steel wheels with a softly chamfered rubber profile, all on the pad.
    const profile = [[.18,-.145],[.305,-.145],[.35,-.10],[.367,-.045],[.367,.045],[.35,.10],[.305,.145],[.18,.145],[.18,-.145]]
    const tire = new THREE.LatheGeometry(profile.map(([r,y]) => new THREE.Vector2(r,y)), 20)
    const rim = new THREE.CylinderGeometry(.225, .225, .302, 16)
    const hub = new THREE.CylinderGeometry(.085, .085, .32, 10)
    const vent = new THREE.CircleGeometry(.035, 5)
    for(const sign of [-1, 1]) for(const z of [-1.46, 1.43]) {
        add(tire, [sign * .79, wheelY, z], [1,1,1], colors.rubber, [0,0,Math.PI/2])
        add(rim, [sign * .79, wheelY, z], [1,1,1], colors.rim, [0,0,Math.PI/2])
        add(hub, [sign * .79, wheelY, z], [1,1,1], colors.trim, [0,0,Math.PI/2])
        for(let i = 0; i < 6; i++) {
            const angle = i * Math.PI / 3
            add(vent, [sign * .947, wheelY + Math.sin(angle) * .155, z + Math.cos(angle) * .155], [1,1,1], colors.trim, [0,sign * Math.PI/2,0])
        }
    }
    for(const g of [tire, rim, hub, vent]) g.dispose()

    // Sixteen tied bales: warm straw and olive-green alfalfa in a stable stack.
    let hayBales = 0, alfalfaBales = 0
    for(let level = 0; level < 3; level++) for(let row = 0; row < (level === 2 ? 2 : 3); row++) for(const sign of [-1, 1]) {
        const green = (row + level + (sign > 0 ? 1 : 0)) % 3 !== 0
        if(green) alfalfaBales++; else hayBales++
        const x = sign * .36, y = 1.0 + level * .43, z = -1.98 + row * .60 + (level === 2 ? .29 : 0)
        box([x,y,z], [.695,.44,.568], green ? colors.alfalfa : colors.hay, true)
        // Broad, cheap bands read as compressed stems at gameplay distance.
        for(const dz of [-.16, 0, .16]) {
            surface([x + sign * .349,y,z + dz], [.018,.30], green ? colors.alfalfaSide : colors.haySide, [0,sign * Math.PI/2,0])
            surface([x,y + .222,z + dz], [.60,.022], green ? colors.alfalfaSide : colors.haySide, [-Math.PI/2,0,0])
        }
        for(const dx of [-.20, .20]) {
            surface([x + dx,y + .226,z], [.019,.53], colors.rope, [-Math.PI/2,0,0])
            for(const signZ of [-1,1]) surface([x + dx,y,z + signZ * .288], [.019,.40], colors.rope, [0,signZ < 0 ? Math.PI : 0,0])
        }
    }
    for(const z of [-1.71, -1.10]) {
        line([-.84,1.15,z], [-.69,2.08,z], .012, colors.rope)
        line([-.69,2.08,z], [.69,2.08,z], .012, colors.rope)
        line([.69,2.08,z], [.84,1.15,z], .012, colors.rope)
    }
    const geometry = mergeGeometries(parts, false)
    for(const g of [...parts, cube, bevel, plane]) g.dispose()
    geometry.computeBoundingBox(); geometry.computeBoundingSphere()
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = 'SheepPen_FeedPickup'; mesh.castShadow = mesh.receiveShadow = true
    mesh.userData = { parked: true, hayBales, alfalfaBales, wheels: 4 }
    const colliders = [[0,.70,0,.94,.69,2.40], [0,1.43,.16,.85,.43,.82], [0,1.44,-1.40,.79,.67,.91]].map(([x,y,z,hx,hy,hz]) => ({
        shape: 'cuboid', category: 'object', parameters: [hx,hy,hz], pickup: true,
        position: new THREE.Vector3(x + FEED_PICKUP.center[0],y,z + FEED_PICKUP.center[2]), quaternion: new THREE.Quaternion()
    }))
    return { mesh, colliders }
}
