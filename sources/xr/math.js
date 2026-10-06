import { Matrix4, Quaternion, Vector3 } from 'three/webgpu'

export const WORLD_SPAN = 256
// The world point placed on the detected surface: the underside of the tabletop
// tray, 2.4 units below the sea bed (-1.5), so the miniature rests on the table
// instead of sinking into it.
export const WORLD_CENTER = new Vector3(16, -3.92, 16)
export const MIN_WIDTH = 0.5
export const MAX_WIDTH = 6
export const clampWidth = value => Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, value))
export const deadzone = (value = 0, threshold = 0.12) => !Number.isFinite(value) || Math.abs(value) <= threshold ? 0 : Math.sign(value) * Math.min(1, (Math.abs(value) - threshold) / (1 - threshold))

// Driver's eye in the vehicle's own frame (x forward, y up, z right), measured
// against the H9/Shas/Datsun bodies: 1.55 m above the ground at rest, 0.35 m
// left of the centre line (left-hand drive), 0.17 m below the headliner and
// 0.19 m above the beltline, with the windshield from about -20° to +15°.
export const DRIVER_EYE = new Vector3(-0.12, 0.38, -0.35)
export const CHASE_OFFSET = new Vector3(0, 2.1, 5)
const UP = new Vector3(0, 1, 0)

// Head movement remains 1:1 in metres. Snap turns rotate the view around the
// selected eye position, never orbit the driver out of the seat. With the car's
// full orientation the eye stays in its seat on slopes, while the view itself
// keeps a level horizon.
export function vehicleCameraPose(position, forward, mode, lookYaw = 0, orientation = null) {
    const yaw = Math.atan2(-forward.z, forward.x) - Math.PI / 2
    const heading = new Quaternion().setFromAxisAngle(UP, yaw)
    const offset = mode === 'chase' ? CHASE_OFFSET.clone().applyQuaternion(heading)
        : DRIVER_EYE.clone().applyQuaternion(orientation || new Quaternion().setFromAxisAngle(UP, yaw + Math.PI / 2))
    return {
        position: offset.add(position),
        rotation: new Quaternion().setFromAxisAngle(UP, yaw + lookYaw),
        heading
    }
}

// Invert the world-to-room transform on the viewer rig. Motri's shader coordinates,
// terrain masks, animation and Rapier bodies remain in their original world units.
export function roomToWorld(anchor, yaw, width, target = new Matrix4()) {
    const scale = clampWidth(width) / WORLD_SPAN
    const rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw)
    return target.compose(anchor, rotation, new Vector3(scale, scale, scale))
        .multiply(new Matrix4().makeTranslation(-WORLD_CENTER.x, -WORLD_CENTER.y, -WORLD_CENTER.z)).invert()
}

export function pointInPolygon(x, z, polygon) {
    let inside = false
    for(let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[i], b = polygon[j]
        if(((a.z > z) !== (b.z > z)) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside
    }
    return inside
}

export function horizontalPlaneHit(ray, planes, frame, referenceSpace) {
    let best = null
    for(const plane of planes || []) {
        if(plane.orientation !== 'horizontal') continue
        const pose = frame.getPose(plane.planeSpace, referenceSpace)
        if(!pose) continue
        const matrix = new Matrix4().fromArray(pose.transform.matrix)
        const localRay = ray.clone().applyMatrix4(matrix.clone().invert())
        if(localRay.direction.y >= -0.01) continue
        const distance = -localRay.origin.y / localRay.direction.y
        if(distance < 0) continue
        const point = localRay.at(distance, new Vector3())
        if(!pointInPolygon(point.x, point.z, plane.polygon)) continue
        point.applyMatrix4(matrix)
        const distanceToRay = point.distanceTo(ray.origin)
        if(distanceToRay > 6 || (best && best.distance <= distanceToRay)) continue
        best = { position: point, distance: distanceToRay }
    }
    return best
}

export function readControllers(sources) {
    const result = { left: null, right: null }
    for(const source of sources || []) {
        if(!source.gamepad || !(source.handedness in result)) continue
        const pad = source.gamepad
        result[source.handedness] = {
            source,
            x: deadzone(pad.axes[2] ?? pad.axes[0] ?? 0),
            y: deadzone(pad.axes[3] ?? pad.axes[1] ?? 0),
            trigger: pad.buttons[0]?.value ?? 0,
            grip: pad.buttons[1]?.value ?? 0,
            lower: pad.buttons[4]?.pressed ?? false,
            upper: pad.buttons[5]?.pressed ?? false,
            stick: pad.buttons[3]?.pressed ?? false
        }
    }
    return result
}
