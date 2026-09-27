import { buildShasVehicleBody } from './ShasVehicleBody.js'
import { buildDatsunVehicleBody } from './DatsunVehicleBody.js'

export const VEHICLE_BODY_STYLES = [
    { id: 'h9', label: 'هافال H9' },
    { id: 'shas', label: 'شاص 2026', color: '#c9b58d' },
    { id: 'datsun', label: 'ددسن', color: '#eeeadd' }
]
const builders = { shas: buildShasVehicleBody, datsun: buildDatsunVehicleBody }
const storageKey = 'motri.vehicleBodyStyle'

export function readVehicleBodyStyle()
{
    try
    {
        const value = localStorage.getItem(storageKey)
        if(VEHICLE_BODY_STYLES.some(style => style.id === value)) return value
    }
    catch { /* Driving also works with browser storage disabled. */ }
    return 'h9'
}

// A visual-only swap. Never rebuilds the vehicle or touches a physics body,
// wheel, light, plate, effect, input binding or the chassis transform.
export class VehicleBodyStyles
{
    constructor(chassis, paintedBody, createMaterials)
    {
        this.chassis = chassis
        this.createMaterials = createMaterials
        this.current = 'h9'
        this.bodies = new Map()
        this.paintedBody = paintedBody
        this.paintOverride = null
        this.ownedMaterials = new Set()
        const bodyNames = new Set(['H9_Body_trim', 'H9_Body_glass', 'H9_Body_metal',
            'H9_HavalBadge', 'H9_GWMBadge'])
        this.h9 = [{ object: paintedBody, visible: paintedBody.visible }]
        chassis.traverse(child =>
        {
            if(bodyNames.has(child.name)) this.h9.push({ object: child, visible: child.visible })
        })
    }

    changeTo(id, remember = true)
    {
        const style = VEHICLE_BODY_STYLES.find(style => style.id === id)
        if(!style) return false
        if(builders[id] && !this.bodies.has(id))
        {
            const { paint, details } = this.createMaterials(style)
            this.ownedMaterials.add(paint)
            this.ownedMaterials.add(details)
            const body = builders[id](paint, details)

            if(this.paintOverride)
                this.applyPaintToBody(body, this.paintOverride)

            this.bodies.set(id, body)
            this.chassis.add(body)
        }
        for(const { object, visible } of this.h9) object.visible = id === 'h9' && visible
        for(const [bodyId, body] of this.bodies) body.visible = id === bodyId
        this.current = id
        if(remember)
        {
            try { localStorage.setItem(storageKey, id) }
            catch { /* Selection still applies to this session. */ }
        }
        return true
    }

    applyPaintToBody(body, material)
    {
        body.traverse(child =>
        {
            if(!child.isMesh || !/_BodyPaint$/i.test(child.name))
                return

            const previous = child.material
            child.material = material

            if(this.ownedMaterials.has(previous))
            {
                previous.dispose()
                this.ownedMaterials.delete(previous)
            }
        })
    }

    setPaintMaterial(material)
    {
        if(!material)
            return false

        this.paintOverride = material
        if(this.paintedBody && !this.paintedBody.userData.fixedPaint)
            this.paintedBody.material = material

        for(const body of this.bodies.values())
            this.applyPaintToBody(body, material)

        return true
    }

    destroy()
    {
        for(const { object, visible } of this.h9) object.visible = visible
        for(const body of this.bodies.values())
        {
            body.traverse(child =>
            {
                if(child.isMesh)
                    child.geometry.dispose()
            })
            body.removeFromParent()
        }

        for(const material of this.ownedMaterials)
            material.dispose()

        this.ownedMaterials.clear()
        this.bodies.clear()
    }
}
