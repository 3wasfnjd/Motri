import * as THREE from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// Loading-only drawing of Motri's H9 body on the original off-road chassis.
// +X forward, +Y up. Shared vertex-colour mesh; no textures, physics or downloads.
export function createLoadingHaval() {
    const parts = []
    const paint = '#626467', trim = '#24282a', glass = '#142830'
    const chassis = '#625e45', rubber = '#35362c', amber = '#ff850c', rim = '#e64d10'
    const add = (geometry, x, y, z, tint) => {
        geometry.translate(x, y, z)
        const c = new THREE.Color(tint), normals = geometry.attributes.normal
        const colors = new Float32Array(geometry.attributes.position.count * 3)
        for(let i = 0; i < normals.count; i++) {
            const light = .73 + .27 * Math.max(0, normals.getY(i)) + .10 * Math.max(0, normals.getZ(i))
            colors.set([c.r * light, c.g * light, c.b * light], i * 3)
        }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
        if(geometry.index) { const original = geometry; geometry = geometry.toNonIndexed(); original.dispose() }
        geometry.deleteAttribute('uv')
        parts.push(geometry)
    }
    const box = (x, y, z, w, h, d, tint) => add(new THREE.BoxGeometry(w, h, d), x, y, z, tint)
    const profile = (points, depth, tint, z = 0) => {
        const shape = new THREE.Shape()
        shape.moveTo(...points[0]); points.slice(1).forEach(p => shape.lineTo(...p)); shape.closePath()
        const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1, curveSegments: 1 })
        add(g, 0, 0, z - depth / 2, tint)
    }
    // Match the existing tall grey cabin, sloping windscreen and long flat hood.
    box(.015, .322, 0, .70, .19, .34, paint)
    box(.26, .43, 0, .23, .035, .33, paint)
    profile([[-.31, .405], [.15, .405], [.085, .55], [-.30, .55]], .325, paint)
    box(-.108, .558, 0, .39, .018, .322, paint)
    // Windscreen follows the actual slanted front pillar.
    const windscreen = new THREE.BoxGeometry(.008, .135, .285)
    windscreen.rotateZ(.42)
    add(windscreen, .122, .48, 0, glass)
    box(-.31, .485, 0, .01, .108, .285, glass)
    for(const side of [-1, 1]) {
        profile([[.12, .425], [.071, .536], [-.020, .536], [-.020, .425]], .008, glass, side * .166)
        box(-.104, .48, side * .166, .137, .112, .008, glass)
        box(-.244, .48, side * .166, .113, .112, .008, glass)
        for(const x of [-.012, -.17]) box(x, .397, side * .18, .036, .013, .009, trim)
        box(-.09, .265, side * .199, .38, .034, .06, chassis)
        box(.15, .39, side * .217, .076, .032, .058, chassis)
        box(-.12, .582, side * .145, .42, .015, .016, trim)
        // Original chassis guards and upright corner posts are part of our car's silhouette.
        for(const x of [-.245, .245]) {
            profile([[x-.14,.24],[x-.12,.31],[x-.075,.35],[x+.075,.35],[x+.12,.31],[x+.14,.24],
                [x+.105,.24],[x+.073,.29],[x-.073,.29],[x-.105,.24]], .07, chassis, side * .194)
            box(x, .30, side * .19, .027, .22, .028, '#858570')
            const tire = new THREE.CylinderGeometry(.125, .125, .10, 12, 1)
            tire.rotateX(Math.PI / 2)
            add(tire, x, .126, side * .208, rubber)
            const wheelRim = new THREE.CylinderGeometry(.077, .077, .105, 12)
            wheelRim.rotateX(Math.PI / 2)
            add(wheelRim, x, .126, side * .211, rim)
            const hub = new THREE.CylinderGeometry(.028, .028, .11, 10)
            hub.rotateX(Math.PI / 2)
            add(hub, x, .126, side * .214, '#73786e')
        }
        box(-.305, .47, side * .204, .052, .24, .055, chassis)
        box(.366, .333, side * .147, .026, .075, .045, amber)
        box(-.362, .30, side * .15, .014, .034, .039, '#cc3631')
    }
    box(.36, .267, 0, .068, .043, .44, chassis)
    box(-.353, .29, 0, .070, .045, .43, chassis)
    // Preserve the game's orange central light bar and roof lamps (not round white lamps).
    box(.373, .373, 0, .012, .045, .23, trim)
    box(.382, .374, 0, .008, .008, .20, '#b6babd')
    box(.379, .326, 0, .016, .054, .225, amber)
    box(.083, .578, 0, .056, .043, .29, chassis)
    for(const z of [-.11, -.037, .037, .11]) box(.114, .579, z, .008, .022, .031, amber)
    // Square spare-wheel cover offset to the same side as the game's H9.
    box(-.375, .37, .061, .054, .152, .155, trim)
    box(-.406, .37, .061, .023, .14, .145, paint)
    box(-.42, .389, .061, .005, .022, .085, trim)
    box(.404, .235, 0, .008, .050, .18, '#e4e2d8')
    box(-.395, .239, 0, .008, .050, .18, '#e4e2d8')
    const geometry = mergeGeometries(parts)
    parts.forEach(part => part.dispose())
    const material = new THREE.MeshBasicNodeMaterial({ vertexColors: true })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = 'Intro_HavalH9_ProgressMarker'
    return mesh
}

export function updateLoadingHaval(marker, center, progress, radius, scale = 1) {
    const angle = Math.max(0, Math.min(1, progress)) * Math.PI * 2
    marker.position.set(center.x - Math.sin(angle) * radius * scale,
        .025 * scale, center.z + Math.cos(angle) * radius * scale)
    marker.rotation.y = Math.PI - angle
    marker.scale.setScalar(scale)
}
