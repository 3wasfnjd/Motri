// WebXR xr-standard mapping: read each controller by handedness, never by order.
export function readXRControls(inputSources = [])
{
    const controls = {
        steering: 0, throttle: 0, reverse: 0, brake: 0, boost: false,
        interact: false, jump: false, honk: false, respawn: false,
        view: false, recenter: false, connected: false, held: false
    }

    for(const source of inputSources)
    {
        const pad = source.gamepad
        if(!pad || pad.mapping !== 'xr-standard') continue
        if(source.handedness !== 'left' && source.handedness !== 'right') continue
        controls.connected = true
        const button = index => Math.max(0, Math.min(1, Number(pad.buttons[index]?.value) || 0))
        const pressed = index => button(index) > 0.5
        controls.held ||= pad.buttons.some(button => button.pressed || button.value > 0.1)

        if(source.handedness === 'left')
        {
            const axis = Math.max(-1, Math.min(1, Number(pad.axes[2]) || 0))
            controls.steering = Math.abs(axis) > 0.15 ? -Math.sign(axis) * (Math.abs(axis) - 0.15) / 0.85 : 0
            controls.held ||= Math.abs(axis) > 0.15
            controls.reverse = button(0)
            controls.brake = button(1)
            controls.honk = pressed(3)
            controls.view = pressed(4) // X
            controls.recenter = pressed(5) // Y (hold to exit)
        }
        else
        {
            controls.throttle = button(0)
            controls.jump = pressed(1)
            controls.respawn = pressed(3)
            controls.interact = pressed(4) // A
            controls.boost = pressed(5) // B
        }
    }
    return controls
}
