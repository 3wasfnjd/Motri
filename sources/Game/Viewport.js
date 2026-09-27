import { Events } from './Events.js'

export class Viewport
{
    constructor(domElement)
    {
        this.domElement = domElement

        this.events = new Events()
        
        this.measure()
        this.setResize()
    }

    measure()
    {
        const bounding = this.domElement.getBoundingClientRect()

        this.width = Math.max(1, bounding.width)
        this.height = Math.max(1, bounding.height)
        this.ratio = this.width / this.height

        const userAgent = navigator.userAgent || ''
        const isAppleTouch =
            /Macintosh/i.test(userAgent) &&
            (navigator.maxTouchPoints || 0) > 1
        const isMobile =
            /Mobi|Android|iPhone|iPad|iPod/i.test(userAgent) ||
            isAppleTouch

        const cores = Number(navigator.hardwareConcurrency) || 4
        const memory = Number(navigator.deviceMemory) || 0
        const lowHardware =
            cores <= 4 ||
            (memory > 0 && memory <= 4)

        this.pixelRatioPure = Math.max(0.5, Number(window.devicePixelRatio) || 1)
        this.pixelRatioMin = 0.65
        this.pixelRatioMax = lowHardware
            ? 1
            : isMobile
                ? 1.25
                : 1.5

        // Limit the actual render-buffer area. High-DPI tablets used to render
        // 5M+ pixels every frame even on low quality.
        this.pixelBudget = lowHardware
            ? 1200000
            : isMobile
                ? 1600000
                : 2200000

        const cssPixels = this.width * this.height
        const budgetRatio = Math.sqrt(this.pixelBudget / cssPixels)

        this.pixelRatio = Math.max(
            this.pixelRatioMin,
            Math.min(
                this.pixelRatioPure,
                this.pixelRatioMax,
                budgetRatio
            )
        )

        // Avoid tiny ratio changes causing repeated GPU target reallocations.
        this.pixelRatio = Math.round(this.pixelRatio * 20) / 20
        this.isMobile = isMobile
        this.lowHardware = lowHardware
    }

    setResize()
    {
        const throttleDuration = 400
        let throttleTimeout = null
        addEventListener('resize', () =>
        {
            this.measure()
            this.events.trigger('change')

            if(throttleTimeout)
            {
                clearTimeout(throttleTimeout)
            }

            throttleTimeout = setTimeout(() =>
            {
                throttleTimeout = null
                this.events.trigger('throttleChange')
            }, throttleDuration)
        })
    }
}