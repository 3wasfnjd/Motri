import { Color, Vector3 } from 'three/webgpu'
import { Fn, If, uniform, vec3 } from 'three/tsl'

// One shared analytic light field, sampled on the existing world surfaces.
// No light objects, shadow maps, overlay planes, textures or render targets.
export const vehicleUnderglow = {
    center: uniform(new Vector3()),
    forward: uniform(new Vector3(1, 0, 0)),
    right: uniform(new Vector3(0, 0, 1)),
    normal: uniform(new Vector3(0, 1, 0)),
    tint: uniform(new Color('#00dfff')),
    strength: uniform(0),
}

export const vehicleUnderglowNode = Fn(([position, normal]) =>
{
    const light = vec3(0).toVar()
    const delta = position.sub(vehicleUnderglow.center).toVar()
    If(vehicleUnderglow.strength.greaterThan(0).and(delta.dot(delta).lessThan(16)), () =>
    {
        const along = delta.dot(vehicleUnderglow.forward).div(2.65)
        const across = delta.dot(vehicleUnderglow.right).div(2.05)
        const radiusSquared = along.mul(along).add(across.mul(across))
        const spread = radiusSquared.smoothstep(0.03, 1).oneMinus().pow(1.5)
        const height = delta.dot(vehicleUnderglow.normal).abs()
        const surface = height.smoothstep(0.12, 0.6).oneMinus()
        const facing = normal.dot(vehicleUnderglow.normal).smoothstep(0.25, 0.85)
        light.assign(vehicleUnderglow.tint.mul(spread.mul(surface).mul(facing).mul(vehicleUnderglow.strength)))
    })
    return light
})
