import { Vector2, Vector3 } from 'three/webgpu'
import { uniform, vec2 } from 'three/tsl'

export const contactPosition = uniform(new Vector3())
export const contactDirection = uniform(new Vector2(1, 0))
export const contactStrength = uniform(0)

// One soft, surface-following contact shadow. No extra draw, render target,
// transparent plane or shadow-map pass, including on the miniature AR terrain.
export function vehicleContactShadow(point) {
    const delta = point.xz.sub(contactPosition.xz)
    const along = delta.dot(contactDirection).div(1.7)
    const across = delta.dot(vec2(contactDirection.y.negate(), contactDirection.x)).div(1.05)
    const radial = along.mul(along).add(across.mul(across)).smoothstep(0.12, 1).oneMinus()
    const surface = point.y.sub(contactPosition.y).abs().smoothstep(0.12, 0.55).oneMinus()
    return radial.mul(surface).mul(contactStrength)
}
