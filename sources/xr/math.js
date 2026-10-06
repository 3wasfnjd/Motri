import { Matrix4, Quaternion, Vector3 } from 'three/webgpu'

export const WORLD_SPAN = 256
export const WORLD_CENTER = new Vector3(16, -1.65, 16)
export const MIN_WIDTH = 0.5
export const MAX_WIDTH = 6
export const clampWidth = value => Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, value))
export const deadzone = (value = 0, threshold = 0.12) => !Number.isFinite(value) || Math.abs(value) <= threshold ? 0 : Math.sign(value) * Math.min(1, (Math.abs(value) - threshold) / (1 - threshold))

// Head movement remains 1:1 in metres. Snap turns rotate the view around the
// selected eye position, never orbit the driver out of the seat.
export function vehicleCameraPose(position, forward, mode, lookYaw = 0) {
    const yaw = Math.atan2(-forward.z, forward.x) - Math.PI / 2
    const up = new Vector3(0, 1, 0)
    const heading = new Quaternion().setFromAxisAngle(up, yaw)
    const offset = mode === 'chase' ? new Vector3(0, 2.1, 5) : new Vector3(-0.32, 0.43, -0.02)
    return {
        position: offset.applyQuaternion(heading).add(position),
        rotation: new Quaternion().setFromAxisAngle(up, yaw + lookYaw),
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
