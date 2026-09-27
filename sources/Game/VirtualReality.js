import * as THREE from 'three/webgpu'
import { Howler } from 'howler'
import { readXRControls } from './Inputs/XRControls.js'

const actionNames = ['interact', 'suspensions', 'honk', 'respawn', 'boost']

export class VirtualReality
{
    constructor(game)
    {
        this.game = game
        this.active = false
        this.pending = false
        this.ready = false
        this.supported = false
        this.viewMode = 'roof'
        this.controls = readXRControls()
        this.origin = new THREE.Vector3()
        this.headDirection = new THREE.Vector3()
        this.forward = new THREE.Vector3(1, 0, 0)
        this.offset = new THREE.Vector3()
        this.button = document.querySelector('.js-vr-button')
        this.status = document.querySelector('.js-vr-status')
        this.button?.addEventListener('click', () => this.enter())
        this.supportPromise = this.checkSupport()
    }

    async checkSupport()
    {
        try
        {
            this.supported = !!(window.isSecureContext && navigator.xr &&
                await navigator.xr.isSessionSupported('immersive-vr'))
        }
        catch { this.supported = false }
        this.updateButton()
        return this.supported
    }

    updateButton(message = '')
    {
        if(!this.button) return
        this.button.disabled = this.pending || (this.supported && !this.ready)
        this.button.setAttribute('aria-busy', String(this.pending))
        this.button.classList.toggle('is-ready', this.supported && this.ready)
        this.button.title = this.supported
            ? (this.ready ? 'ابدأ القيادة بالواقع الافتراضي' : 'يتفعّل بعد اكتمال التحميل')
            : 'افتح اللعبة من متصفح Meta Quest للدخول إلى الواقع الافتراضي'
        this.status.textContent = message
        this.status.hidden = !message
    }

    setReady()
    {
        if(this.ready) return
        this.ready = true
        this.rig = new THREE.Group()
        this.rig.name = 'Motri VR vehicle rig'
        this.game.scene.add(this.rig)
        for(const name of actionNames)
            this.game.inputs.actions.get(name)?.keys.push(`XR.${name}`)

        const xr = this.game.rendering.renderer.xr
        xr.enabled = true
        // 'local' is mandatory in immersive sessions and works seated or standing.
        // The first tracked pose supplies our eye height and forward direction.
        xr.setReferenceSpaceType('local')
        xr.setFramebufferScaleFactor(0.8)
        xr.setFoveation(1)
        xr.addEventListener('sessionend', () => this.restore())

        // HTML forms remain usable in the Quest browser. Never leave an invisible
        // menu trapping the player or a throttle latched behind that menu.
        for(const manager of [this.game.menu, this.game.modals])
            manager.events.on('open', () => { if(this.active) this.exit() })
        this.updateButton()
    }

    async enter()
    {
        if(this.pending || this.active) return
        if(!this.supported)
        {
            this.updateButton('افتح الرابط من متصفح Meta Quest ثم اضغط أيقونة VR.')
            return
        }
        if(!this.ready) return
        // A headset connected after initial page load needs a compatible renderer.
        if(this.game.rendering.renderer.backend.isWebGPUBackend)
        {
            this.updateButton('أعد تحميل الصفحة بعد توصيل النظارة ثم اضغط VR.')
            return
        }

        this.pending = true
        this.updateButton('جارٍ الدخول إلى الواقع الافتراضي…')
        let session
        try
        {
            // Resume audio within the click gesture. Reveal owns initialization;
            // entering VR again must not register another playlist/ambient set.
            Howler.ctx?.resume().catch(() => {})
            // Keep requestSession directly in the click gesture (no awaited work first).
            session = await navigator.xr.requestSession('immersive-vr', {
                optionalFeatures: ['local-floor']
            })
            this.session = session
            await this.game.rendering.renderer.xr.setSession(session)
            if(this.session !== session) return // Session ended during attachment.
            this.begin()
        }
        catch(error)
        {
            if(session) await session.end().catch(() => {})
            this.restore()
            this.updateButton(error?.name === 'NotAllowedError'
                ? 'لم يُسمح بالدخول. اضغط VR للمحاولة مجددًا.'
                : 'تعذّر تشغيل VR. حدّث متصفح Quest ثم أعد المحاولة.')
            console.warn('Motri VR session could not start:', error)
        }
        finally
        {
            this.pending = false
            if(this.button)
            {
                this.button.disabled = false
                this.button.setAttribute('aria-busy', 'false')
            }
        }
    }

    begin()
    {
        const { game } = this
        const camera = game.view.camera
        this.saved = {
            parent: camera.parent, near: camera.near, far: camera.far, fov: camera.fov,
            quality: game.quality.level, inputMode: game.inputs.mode,
            speedLines: game.view.speedLines.mesh.visible
        }
        this.active = true
        this.needsRecenter = true
        this.previous = {}
        this.armed = false
        this.exitHold = 0
        this.helpUntil = performance.now() + 14000
        this.rig.add(camera)
        camera.position.set(0, 0, 0)
        camera.quaternion.identity()
        camera.near = 0.08
        camera.far = 65
        camera.updateProjectionMatrix()
        this.clearInputs()
        game.inputs.updateMode(2)
        game.view.speedLines.mesh.visible = false
        document.documentElement.classList.add('is-vr')
        game.menu.close()
        game.modals.close()
        game.quality.changeLevel(1, 'vr')
        this.updateArea()
        game.viewport.events.trigger('throttleChange')
        this.createHUD()
        if(game.reveal.step === 0) game.reveal.start?.()
        this.session.addEventListener('visibilitychange', () =>
        {
            if(this.session?.visibilityState !== 'visible') this.releaseControls()
        })
        // Browser / system recentering invalidates the saved tracking-space origin.
        game.rendering.renderer.xr.getReferenceSpace()?.addEventListener('reset', () =>
        {
            this.needsRecenter = true
        })
        this.updateButton()
    }

    clearInputs()
    {
        const inputs = this.game.inputs
        for(const action of inputs.actions.values())
            for(const key of [...action.activeKeys]) inputs.end(key)
        inputs.nipple.active = false
        inputs.nipple.progress = 0
        inputs.nipple.group.visible = false
        inputs.mobileBoost?.release()
    }

    releaseControls()
    {
        this.controls = readXRControls()
        this.armed = false
        this.previous = {}
        this.exitHold = 0
        for(const name of actionNames) this.game.inputs.end(`XR.${name}`)
        if(this.game.player)
        {
            this.game.player.accelerating = 0
            this.game.player.steering = 0
            this.game.player.boosting = 0
            this.game.player.braking = 1
        }
    }

    updateInputs()
    {
        if(!this.active) return
        if(this.session.visibilityState !== 'visible')
        {
            this.releaseControls()
            return
        }
        const next = readXRControls(this.session.inputSources)
        if(!next.connected)
        {
            this.releaseControls()
            return
        }
        // Require release after entry/resume; the entry click must not accelerate.
        if(!this.armed)
        {
            this.armed = !next.held
            return
        }
        this.controls = next
        const bindings = { interact: next.interact, suspensions: next.jump,
            honk: next.honk, respawn: next.respawn, boost: next.boost }
        for(const [name, pressed] of Object.entries(bindings))
        {
            if(pressed) this.game.inputs.start(`XR.${name}`)
            else this.game.inputs.end(`XR.${name}`)
            if(!this.active) return
        }
        if(next.view && !this.previous.view)
        {
            this.viewMode = this.viewMode === 'roof' ? 'chase' : 'roof'
            this.helpUntil = performance.now() + 6000
        }
        if(next.recenter)
        {
            this.exitHold += this.game.ticker.delta
            if(this.exitHold >= 1.2) this.exit()
        }
        else if(this.previous.recenter)
        {
            this.needsRecenter = true
            this.helpUntil = performance.now() + 10000
            this.exitHold = 0
        }
        this.previous = next
    }

    applyDriving(player)
    {
        const allowed = this.armed && this.session?.visibilityState === 'visible' &&
            this.game.inputs.checkCategory(this.game.inputs.actions.get('forward'))
        player.braking = allowed ? this.controls.brake : 1
        if(!allowed) return
        player.accelerating = player.braking > 0.1 ? 0 : this.controls.throttle - this.controls.reverse
        player.steering = this.controls.steering
        player.boosting = this.controls.boost ? 1 : 0
    }

    updateArea()
    {
        const view = this.game.view
        const position = this.game.player.position
        const area = view.optimalArea
        area.radius = 45
        area.nearDistance = 12
        area.farDistance = 55
        area.position.set(position.x, 0, position.z)
        const corners = [[-45, -45], [45, -45], [45, 45], [-45, 45]]
        corners.forEach(([x, z], i) => area.quad2[i].offseted.set(position.x + x, position.z + z))
        area.needsUpdate = false
    }

    updateView()
    {
        const { game } = this
        const xr = game.rendering.renderer.xr
        const pose = xr.getFrame()?.getViewerPose(xr.getReferenceSpace())
        if(pose && this.needsRecenter)
        {
            this.origin.copy(pose.transform.position)
            this.headDirection.set(0, 0, -1).applyQuaternion(pose.transform.orientation)
            this.headYaw = Math.atan2(-this.headDirection.x, -this.headDirection.z)
            this.needsRecenter = false
        }
        this.forward.copy(game.physicalVehicle.forward)
        this.forward.y = 0
        if(this.forward.lengthSq() < 0.01) this.forward.set(1, 0, 0)
        this.forward.normalize()
        // Follow vehicle yaw only: bumps, roll and flips never rotate the horizon.
        this.rig.rotation.set(0, Math.atan2(-this.forward.x, -this.forward.z) - (this.headYaw || 0), 0)
        this.offset.copy(this.origin).applyQuaternion(this.rig.quaternion)
        this.rig.position.copy(game.player.position)
            .addScaledVector(this.forward, this.viewMode === 'roof' ? 0.35 : -5)
        this.rig.position.y += this.viewMode === 'roof' ? 1.45 : 2.8
        this.rig.position.sub(this.offset)
        this.rig.updateMatrixWorld(true)
        xr.updateCamera(game.view.camera)
        game.view.camera.getWorldPosition(game.view.position)
        game.view.focusPoint.position.copy(game.player.position)
        game.view.focusPoint.smoothedPosition.copy(game.player.position)
        this.updateArea()
        this.updateHUD()
    }

    createHUD()
    {
        if(this.hud) { this.hud.visible = true; return }
        this.hudCanvas = document.createElement('canvas')
        this.hudCanvas.width = 1024
        this.hudCanvas.height = 384
        this.hudTexture = new THREE.CanvasTexture(this.hudCanvas)
        this.hudTexture.colorSpace = THREE.SRGBColorSpace
        this.hudTexture.generateMipmaps = false
        this.hud = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 0.544),
            new THREE.MeshBasicNodeMaterial({ map: this.hudTexture, transparent: true,
                depthTest: false, depthWrite: false, toneMapped: false }))
        this.hud.position.set(0, -0.62, -2)
        this.hud.renderOrder = 100
        this.hud.frustumCulled = false
        this.game.view.camera.add(this.hud)
    }

    updateHUD()
    {
        const now = performance.now()
        if(now - (this.lastHUD || 0) < 200) return
        this.lastHUD = now
        const ctx = this.hudCanvas.getContext('2d')
        ctx.clearRect(0, 0, 1024, 384)
        ctx.fillStyle = '#142128dd'
        const help = now < this.helpUntil || !this.armed || this.exitHold > 0
        ctx.fillRect(0, help ? 0 : 280, 1024, help ? 384 : 104)
        ctx.fillStyle = '#ffffff'
        ctx.textAlign = 'center'
        ctx.direction = 'rtl'
        ctx.font = 'bold 40px Tahoma, Arial, sans-serif'
        if(help)
        {
            ctx.fillText('موتري • واقع افتراضي', 512, 55)
            ctx.font = '30px Tahoma, Arial, sans-serif'
            ctx.fillText('العصا اليسرى: توجيه • الزناد الأيمن: بنزين', 512, 112)
            ctx.fillText('الزناد الأيسر: فرامل ورجوع • القبضة اليسرى: فرامل يد', 512, 162)
            ctx.fillText('A تفاعل • B تسارع • X تغيير المنظور', 512, 212)
            ctx.fillText('Y توسيط النظر — اضغط مطولًا للخروج', 512, 262)
        }
        ctx.font = 'bold 32px Tahoma, Arial, sans-serif'
        ctx.fillText(this.exitHold > 0 ? 'استمر بالضغط على Y للخروج…'
            : !this.armed ? 'أرخِ الأزرار لبدء القيادة'
            : 'A تفاعل  •  Y توسيط / خروج', 512, 342)
        this.hudTexture.needsUpdate = true
    }

    async exit()
    {
        if(!this.session || this.ending) return
        this.ending = true
        this.releaseControls()
        try { await this.session.end() }
        catch(error) { console.warn('Motri VR exit failed:', error) }
        finally { this.ending = false }
    }

    restore()
    {
        this.session = null
        this.pending = false
        if(this.active)
        {
            this.releaseControls()
            this.active = false
            const { game, saved } = this
            const camera = game.view.camera
            saved.parent.add(camera)
            camera.near = saved.near
            camera.far = saved.far
            camera.fov = saved.fov
            camera.updateProjectionMatrix()
            if(this.hud) this.hud.visible = false
            game.view.speedLines.mesh.visible = saved.speedLines
            game.view.focusPoint.isTracking = true
            game.view.optimalArea.needsUpdate = true
            game.quality.changeLevel(saved.quality, 'vr-exit')
            game.inputs.updateMode(saved.inputMode)
            game.viewport.events.trigger('throttleChange')
            game.view.update()
            game.rendering.resize()
            game.rendering.setAdaptiveResolution?.()
        }
        document.documentElement.classList.remove('is-vr')
        this.updateButton()
    }
}
