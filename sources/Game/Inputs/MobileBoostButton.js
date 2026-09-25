// Uses the existing boost action. No speed, force or vehicle-physics changes.
export class MobileBoostButton
{
    constructor(inputs, touchMode, element = document.querySelector('.js-mobile-boost'))
    {
        this.inputs = inputs
        this.touchMode = touchMode
        this.element = element
        this.pointerId = null
        this.enabled = false
        this.abort = new AbortController()
        this.sync = this.sync.bind(this)
        this.release = this.release.bind(this)
        if(!element) return

        const options = { signal: this.abort.signal }
        element.addEventListener('pointerdown', event =>
        {
            // A second finger is expected: do not require event.isPrimary.
            if(!this.enabled || this.pointerId !== null || !['touch', 'pen'].includes(event.pointerType)) return
            event.preventDefault()
            event.stopPropagation()
            this.pointerId = event.pointerId
            try { element.setPointerCapture(event.pointerId) } catch { /* Cancelled browser gesture. */ }
            this.inputs.start('Touch.boost')
            element.classList.add('is-pressed')
            element.setAttribute('aria-pressed', 'true')
        }, options)
        const end = event =>
        {
            if(event.pointerId !== this.pointerId) return
            if(event.cancelable) event.preventDefault()
            this.release()
        }
        for(const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
            element.addEventListener(type, end, options)
        // Also covers an end outside the button if pointer capture was unavailable.
        window.addEventListener('pointerup', end, options)
        window.addEventListener('pointercancel', end, options)
        window.addEventListener('blur', this.release, options)
        window.addEventListener('pagehide', this.release, options)
        document.addEventListener('visibilitychange', this.sync, options)
        element.addEventListener('contextmenu', event => event.preventDefault(), options)
        this.inputs.events.on('modeChange', this.sync)
        this.inputs.events.on('filtersChange', this.sync)
        this.sync()
    }

    sync()
    {
        if(!this.element) return
        const action = this.inputs.actions.get('boost')
        this.enabled = this.inputs.mode === this.touchMode && !!action
            && this.inputs.checkCategory(action) && !document.hidden
        if(!this.enabled) this.release()
        this.element.hidden = !this.enabled
    }

    release()
    {
        const id = this.pointerId
        this.pointerId = null
        this.inputs.end('Touch.boost')
        this.element?.classList.remove('is-pressed')
        this.element?.setAttribute('aria-pressed', 'false')
        if(id !== null)
        {
            try
            {
                if(this.element.hasPointerCapture(id)) this.element.releasePointerCapture(id)
            }
            catch { /* Capture may already have been cancelled by the browser. */ }
        }
    }

    destroy()
    {
        this.release()
        this.abort.abort()
        this.inputs.events.off('modeChange', this.sync)
        this.inputs.events.off('filtersChange', this.sync)
        if(this.element) this.element.hidden = true
    }
}
