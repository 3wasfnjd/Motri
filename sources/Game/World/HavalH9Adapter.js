import * as THREE from 'three/webgpu'
import { createH9Adapter } from '../../../resources/models/haval-h9/motri2_h9.js'

export const HAVAL_H9_SCALE = 1.8 / 2.85
export const HAVAL_H9_WHEEL_RADIUS = 0.42432 * HAVAL_H9_SCALE
export const HAVAL_H9_HALF_TRACK = 0.858 * HAVAL_H9_SCALE
export const HAVAL_H9_FRONT_X = 1.440 * HAVAL_H9_SCALE
export const HAVAL_H9_REAR_X = -1.410 * HAVAL_H9_SCALE
export const HAVAL_H9_LOW_SUSPENSION_REST = 0.88
export const HAVAL_H9_MID_SUSPENSION_REST = HAVAL_H9_LOW_SUSPENSION_REST + 0.03 * HAVAL_H9_SCALE
export const HAVAL_H9_HIGH_SUSPENSION_REST = HAVAL_H9_LOW_SUSPENSION_REST + 0.06 * HAVAL_H9_SCALE
export const HAVAL_H9_MAX_SUSPENSION_TRAVEL = 0.06 * HAVAL_H9_SCALE
export const HAVAL_H9_MAX_VISUAL_WHEEL_OFFSET = 0.06

const BODY_GROUND_OFFSET = - (HAVAL_H9_LOW_SUSPENSION_REST + HAVAL_H9_WHEEL_RADIUS)

export function prepareHavalH9(scene)
{
    const adapter = createH9Adapter(scene)

    const chassis = new THREE.Group()
    chassis.name = 'chassisH9'

    const visualRoot = new THREE.Group()
    visualRoot.name = 'havalH9VisualRoot'
    visualRoot.rotation.y = Math.PI * 0.5
    visualRoot.scale.setScalar(HAVAL_H9_SCALE)
    visualRoot.position.y = BODY_GROUND_OFFSET

    // Keep the complete authored hierarchy intact: four original wheels,
    // front steering pivots and body stay together exactly as validated.
    visualRoot.add(adapter.root)
    chassis.add(visualRoot)
    scene.add(chassis)

    scene.userData.vehicleType = 'havalH9'
    scene.userData.havalH9 = {
        adapter,
        chassis,
        visualRoot,
        scale: HAVAL_H9_SCALE,
        wheelRadius: HAVAL_H9_WHEEL_RADIUS,
        halfTrack: HAVAL_H9_HALF_TRACK,
        frontX: HAVAL_H9_FRONT_X,
        rearX: HAVAL_H9_REAR_X,
        restSuspension: HAVAL_H9_LOW_SUSPENSION_REST,
        wheelbase: HAVAL_H9_FRONT_X - HAVAL_H9_REAR_X,
        sourceWheelbase: 2.85
    }
}
