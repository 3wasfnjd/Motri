import { buildShasVehicleBody } from './ShasVehicleBody.js'

export const VEHICLE_BODY_STYLES = [
    { id: 'h9', label: 'هافال H9' },
    { id: 'shas', label: 'شاص 2026' }
]
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
        this.shas = null
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
        if(!VEHICLE_BODY_STYLES.some(style => style.id === id)) return false
        if(id === 'shas' && !this.shas)
        {
            const { paint, details } = this.createMaterials()
            this.shas = buildShasVehicleBody(paint, details)
            this.chassis.add(this.shas)
        }
        for(const { object, visible } of this.h9) object.visible = id === 'h9' && visible
        if(this.shas) this.shas.visible = id === 'shas'
        this.current = id
        if(remember)
        {
            try { localStorage.setItem(storageKey, id) }
            catch { /* Selection still applies to this session. */ }
        }
        return true
    }

    destroy()
    {
        for(const { object, visible } of this.h9) object.visible = visible
        if(!this.shas) return
        this.shas.traverse(child =>
        {
            if(child.isMesh) { child.geometry.dispose(); child.material.dispose() }
        })
        this.shas.removeFromParent()
        this.shas = null
    }
}
