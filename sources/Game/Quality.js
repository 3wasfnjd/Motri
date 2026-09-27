import { Events } from './Events.js'
import { Game } from './Game.js'

export class Quality
{
    constructor()
    {
        this.game = Game.getInstance()

        this.events = new Events()

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

        // Keep the existing two quality levels so all current systems continue
        // to work, but stop treating every desktop-class user agent as high-end.
        this.level = (isMobile || lowHardware) ? 1 : 0 // 0 = high, 1 = low
        this.autoDowngraded = false
        this.deviceProfile = {
            isMobile,
            lowHardware,
            cores,
            memory
        }

        // Debug
        if(this.game.debug.active)
        {
            const debugPanel = this.game.debug.panel.addFolder({
                title: '⚙️ Quality',
                expanded: false,
            })

            this.game.debug.addButtons(
                debugPanel,
                {
                    low: () =>
                    {
                        this.changeLevel(1)
                    },
                    high: () =>
                    {
                        this.changeLevel(0)
                    },
                },
                'change'
            )
        }
    }

    changeLevel(level = 0, reason = 'manual')
    {
        level = level === 0 ? 0 : 1

        // Same
        if(level === this.level)
            return

        this.level = level
        if(reason === 'performance' && level === 1)
            this.autoDowngraded = true

        this.events.trigger('change', [ this.level ])
    }
}