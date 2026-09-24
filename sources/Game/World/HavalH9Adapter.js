import * as THREE from 'three/webgpu'

export const HAVAL_H9_SCALE = 1.8 / 2.85
export const HAVAL_H9_WHEEL_RADIUS = 0.42432 * HAVAL_H9_SCALE
export const HAVAL_H9_HALF_TRACK = 0.858 * HAVAL_H9_SCALE
const LOW_SUSPENSION_REST = 0.88
const BODY_GROUND_OFFSET = - (LOW_SUSPENSION_REST + HAVAL_H9_WHEEL_RADIUS)

export function prepareHavalH9(scene)
{
    const root = scene.getObjectByName('H9_Root')
    if(!root)
        throw new Error('Haval H9 root not found')

    const wheelNames = [ 'Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR' ]
    const wheels = wheelNames.map(name => scene.getObjectByName(name))
    if(wheels.some(wheel => !wheel))
        throw new Error('Haval H9 requires four separate wheel meshes')

    const bodyPainted = scene.getObjectByName('H9_BodyPaint')
    if(!bodyPainted)
        throw new Error('Haval H9 body paint mesh not found')

    const taillights = scene.getObjectByName('H9_Taillights')

    for(const wheel of wheels)
        wheel.removeFromParent()

    const chassis = new THREE.Group()
    chassis.name = 'chassisH9'

    const body = new THREE.Group()
    body.name = 'havalH9Body'
    body.rotation.y = Math.PI * 0.5
    body.scale.setScalar(HAVAL_H9_SCALE)
    body.position.y = BODY_GROUND_OFFSET
    body.add(root)
    chassis.add(body)

    bodyPainted.name = 'bodyPaintedH9'
    if(taillights)
        taillights.name = 'stopLightsH9'

    const wheelContainer = new THREE.Group()
    wheelContainer.name = 'wheelContainerH9'

    const wheelCylinder = new THREE.Group()
    wheelCylinder.name = 'wheelCylinderH9'

    const wheelVisual = wheels[0]
    wheelVisual.position.set(0, 0, 0)
    wheelVisual.rotation.set(0, Math.PI * 0.5, 0)
    wheelVisual.scale.setScalar(HAVAL_H9_SCALE)
    wheelCylinder.add(wheelVisual)
    wheelContainer.add(wheelCylinder)

    scene.add(chassis)
    scene.add(wheelContainer)

    scene.userData.vehicleType = 'havalH9'
    scene.userData.havalH9 = {
        scale: HAVAL_H9_SCALE,
        wheelRadius: HAVAL_H9_WHEEL_RADIUS,
        halfTrack: HAVAL_H9_HALF_TRACK,
        wheelbase: 1.8,
        sourceWheelbase: 2.85
    }
}
