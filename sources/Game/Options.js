import { Game } from './Game.js'
import { VEHICLE_BODY_STYLES, readVehicleBodyStyle } from './World/VehicleBodyStyles.js'

export class Options
{
    constructor()
    {
        this.game = Game.getInstance()
        this.element = this.game.menu.items.get('options').contentElement

        this.setSound()
        this.setQuality()
        this.setVehicleBody()
        this.setRespawn()
        this.setReset()
        this.setRenderer()
        this.setServer()
        this.setBehindTheScene()
    }

    setBehindTheScene()
    {
        this.element.querySelector('.js-behind-the-scene').addEventListener('click', () =>
        {
            this.game.menu.open('behindTheScene')
        })
    }

    setSound()
    {
        const element = this.element.querySelector('.js-audio-toggle')

        element.addEventListener('click', this.game.audio.mute.toggle)
    }

    setQuality()
    {
        const element = this.element.querySelector('.js-quality-toggle')
        const text = element.querySelector('span')
        text.textContent = this.game.quality.level === 0 ? "عالية" : "منخفضة"

        element.addEventListener('click', () =>
        {
            this.game.quality.changeLevel(this.game.quality.level === 0 ? 1 : 0)
        })

        this.game.quality.events.on('change', () =>
        {
            text.textContent = this.game.quality.level === 0 ? "عالية" : "منخفضة"
        })
    }

    setVehicleBody()
    {
        const element = this.element.querySelector('.js-vehicle-body')
        const label = element.querySelector('span')
        const update = () =>
        {
            const id = this.game.world?.visualVehicle?.bodyStyles.current ?? readVehicleBodyStyle()
            const style = VEHICLE_BODY_STYLES.find(style => style.id === id)
            label.textContent = style.label
            element.setAttribute('aria-label', `تغيير شكل السيارة، الحالي: ${style.label}`)
        }
        update()
        element.addEventListener('click', () =>
        {
            const styles = this.game.world?.visualVehicle?.bodyStyles
            if(!styles) return
            const index = VEHICLE_BODY_STYLES.findIndex(style => style.id === styles.current)
            styles.changeTo(VEHICLE_BODY_STYLES[(index + 1) % VEHICLE_BODY_STYLES.length].id)
            update()
        })
        this.game.menu.items.get('options').events.on('opened', update)
    }

    setRespawn()
    {
        const element = this.element.querySelector('.js-respawn')

        element.addEventListener('click', () =>
        {
            this.game.player.respawn()
            this.game.menu.close()
        })
    }

    setReset()
    {
        const element = this.element.querySelector('.js-reset')

        element.addEventListener('click', () =>
        {
            this.game.reset()
            this.game.menu.close()
        })
    }

    setRenderer()
    {        
        if(this.game.rendering.renderer.backend.isWebGLBackend)
        {
            const element = this.element.querySelector('.js-renderer')
            element.classList.remove('is-success')
            element.classList.add('is-danger')

            const text = element.querySelector('span')
            text.textContent = 'WebGL'

            const tooltip = element.querySelector('.js-tooltip')
            tooltip.innerHTML = /* html */`يعمل العرض بوضع WebGL لأن متصفحك <strong>لا يدعم WebGPU</strong>. قد يختلف الأداء.`
        }
    }

    setServer()
    {
        const element = this.element.querySelector('.js-server')
        const text = element.querySelector('span')
        const tooltip = element.querySelector('.js-tooltip')
        
        const update = (connected) =>
        {
            if(connected)
            {
                element.classList.add('is-success')
                element.classList.remove('is-danger')
                
                text.textContent = "متصل"

                tooltip.innerHTML = /* html */`ميزات <strong>اللعب المشترك</strong> متاحة`
            }
            else
            {
                element.classList.remove('is-success')
                element.classList.add('is-danger')
                text.textContent = "غير متصل"

                tooltip.innerHTML = /* html */`الخدمات الشبكية غير مفعّلة في هذه النسخة. القيادة المحلية متاحة.`
            }
        }

        update(this.game.server.connected)

        this.game.server.events.on('connected', () =>
        {
            update(true)
        })
        this.game.server.events.on('disconnected', () =>
        {
            update(false)
        })
    }
}
