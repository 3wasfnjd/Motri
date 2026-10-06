// Use the existing action bus, including category filters and release events.
// Directly changing acceleration alone cannot trigger Motri's activities.
export class XRActions {
    constructor(game) {
        this.game = game
        this.active = new Set()
        for(const name of ['interact', 'suspensions', 'boost', 'honk']) {
            const action = game.inputs.actions.get(name)
            if(action) action.keys.push(`XR.${name}`)
        }
    }

    set(name, pressed) {
        const key = `XR.${name}`
        if(pressed && !this.active.has(name)) {
            this.active.add(name)
            this.game.inputs.start(key)
        } else if(!pressed && this.active.delete(name)) this.game.inputs.end(key)
    }

    release() {
        for(const name of [...this.active]) this.set(name, false)
    }
}
