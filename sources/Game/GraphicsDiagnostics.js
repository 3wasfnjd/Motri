import { REVISION } from 'three/webgpu'

// Opt-in device diagnostics. Reports stay on the device until the user copies
// them; ordinary game URLs do not create this panel or register these handlers.
export class GraphicsDiagnostics
{
    constructor(game)
    {
        this.game = game
        this.errors = []
        this.frameCount = 0
        this.xrFrames = 0
        this.xrRenders = 0
        this.lastXR = null
        this.fps = null
        this.revision = 'pending'
        this.panel = document.createElement('aside')
        this.panel.setAttribute('aria-label', 'فحص رسوم موتري')
        this.panel.dir = 'rtl'
        Object.assign(this.panel.style, {
            position: 'fixed', left: '12px', top: '12px', zIndex: '10000',
            width: 'min(350px, calc(100vw - 24px))', boxSizing: 'border-box',
            padding: '14px', borderRadius: '12px', background: '#142128f5',
            color: '#fff', font: '14px/1.6 Tahoma, Arial, sans-serif'
        })
        const title = document.createElement('strong')
        title.textContent = 'فحص رسوم موتري على النظارة'
        const instruction = document.createElement('p')
        instruction.textContent = 'إذا اسودّت الشاشة في VR، اخرج إلى المتصفح من قائمة Quest ثم انسخ التقرير وأرسله في المحادثة.'
        this.summary = document.createElement('p')
        this.summary.setAttribute('role', 'status')
        this.report = document.createElement('textarea')
        this.report.readOnly = true
        this.report.dir = 'ltr'
        this.report.setAttribute('aria-label', 'تقرير فحص الرسوم')
        Object.assign(this.report.style, {
            width: '100%', height: '160px', boxSizing: 'border-box',
            background: '#0c151a', color: '#fff', font: '11px/1.4 monospace'
        })
        const copy = document.createElement('button')
        copy.type = 'button'
        copy.textContent = 'نسخ تقرير الفحص'
        Object.assign(copy.style, {
            width: '100%', marginTop: '8px', padding: '10px', border: '0',
            borderRadius: '7px', background: '#d7f5e9', color: '#142128', cursor: 'pointer'
        })
        copy.addEventListener('click', async () => {
            this.update()
            try
            {
                await navigator.clipboard.writeText(this.report.value)
                copy.textContent = 'تم النسخ — أرسل التقرير في المحادثة'
            }
            catch
            {
                this.report.focus()
                this.report.select()
                copy.textContent = 'حدّد النص ثم انسخه'
            }
        })
        this.panel.append(title, instruction, this.summary, this.report, copy)
        document.body.append(this.panel)
        window.addEventListener('error', event => {
            if(event.message) this.capture('JavaScript', event.error || event.message)
        })
        window.addEventListener('unhandledrejection', event => this.capture('Promise', event.reason))
        this.update()
        this.timer = setInterval(() => this.update(), 1000)
        fetch('./motri2-build.json', { cache: 'no-store' })
            .then(response => response.ok ? response.json() : null)
            .then(build => { this.revision = build?.commit || 'local'; this.update() })
            .catch(() => { this.revision = 'unavailable' })
    }

    capture(kind, error)
    {
        const message = String(error?.message || error || 'Unknown error').slice(0, 1800)
        if(!this.errors.some(item => item.kind === kind && item.message === message))
        {
            if(this.errors.length < 8) this.errors.push({ kind, message })
            this.update()
        }
    }

    attachRenderer(renderer)
    {
        renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
            this.capture('WebGL shader', [gl.getProgramInfoLog(program),
                gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment)].filter(Boolean).join('\n'))
        }
        const onDeviceLost = renderer.onDeviceLost.bind(renderer)
        renderer.onDeviceLost = info => {
            this.capture('Graphics device', info?.message || info?.reason || 'Device lost')
            onDeviceLost(info)
        }
        renderer.domElement.addEventListener('webglcontextlost', event =>
            this.capture('WebGL context', event.statusMessage || 'Context lost'))
    }

    frame(time, xrFrame)
    {
        if(xrFrame) this.xrFrames++
        if(!Number.isFinite(time)) return
        // Use the actual animation timestamps, before the physics delta clamp.
        if(this.frameStart === undefined || time < this.frameStart)
        {
            this.frameStart = time
            this.frameCount = 0
        }
        this.frameCount++
        const elapsed = time - this.frameStart
        if(elapsed >= 1000)
        {
            this.fps = Math.round(this.frameCount * 1000 / elapsed)
            this.frameCount = 0
            this.frameStart = time
        }
    }

    rendered()
    {
        const game = this.game
        const renderer = game.rendering.renderer
        if(!renderer.xr.isPresenting) return
        this.xrRenders++
        // Retain the last in-headset state after the player returns to the
        // browser to copy the report. Read tracking data only in the XR frame.
        if(this.xrRenders !== 1 && performance.now() - (this.lastXRSample || 0) < 1000) return
        this.lastXRSample = performance.now()
        const target = renderer.getOutputRenderTarget()
        const camera = renderer.xr.getCamera()
        const gl = renderer.getContext()
        this.lastXR = {
            active: game.vr.active,
            visibility: renderer.xr.getSession()?.visibilityState,
            views: camera.cameras.length,
            eyeViewports: camera.cameras.map(eye => eye.viewport.toArray()),
            camera: camera.matrixWorld.elements.slice(12, 15),
            target: target ? [target.width, target.height, target.depth] : null,
            calls: renderer.info.render.drawCalls,
            triangles: renderer.info.render.triangles,
            contextLost: gl.isContextLost(),
            framebufferStatus: gl.checkFramebufferStatus(gl.FRAMEBUFFER),
            revealStep: game.reveal?.step,
            revealDistance: game.reveal?.distance.value,
            overlay: game.overlay?.mesh.visible
        }
        for(let count = 0; count < 4; count++)
        {
            const error = gl.getError()
            if(error === gl.NO_ERROR) break
            this.capture('WebGL draw', `GL error ${error}; framebuffer ${this.lastXR.framebufferStatus}`)
        }
    }

    update()
    {
        const game = this.game
        const renderer = game.rendering?.renderer
        const position = game.physicalVehicle?.position
        const drawing = renderer?.domElement
        const report = {
            revision: this.revision,
            three: REVISION,
            browser: navigator.userAgent,
            secure: window.isSecureContext,
            backend: renderer?.backend?.isWebGPUBackend ? 'WebGPU' : renderer ? 'WebGL2' : 'initializing',
            xrSupported: game.vr?.supported ?? null,
            xrPresenting: renderer?.xr.isPresenting ?? false,
            xrActive: game.vr?.active ?? false,
            xrFrames: this.xrFrames,
            xrRenders: this.xrRenders,
            lastXR: this.lastXR,
            revealStep: game.reveal?.step ?? null,
            quality: game.quality?.level ?? null,
            fps: this.fps,
            canvas: drawing ? [drawing.width, drawing.height] : null,
            pixelRatio: renderer?.getPixelRatio(),
            calls: renderer?.info.render.drawCalls,
            triangles: renderer?.info.render.triangles,
            textures: renderer?.info.memory.textures,
            vehicle: position ? [position.x, position.y, position.z].map(n => Number(n.toFixed(3))) : null,
            wheelContacts: game.physicalVehicle?.wheels.inContactCount ?? null,
            floorReady: !!game.world?.floor?.physical,
            errors: this.errors
        }
        this.report.value = JSON.stringify(report, null, 2)
        this.summary.textContent = this.errors.length
            ? `رُصد خطأ في الرسوم أو التحميل (${this.errors.length}). انسخ التقرير.`
            : game.reveal?.step >= 0
                ? `لم يُرصد خطأ برمجي. الإطارات: ${this.fps ?? '—'} — انسخ التقرير عند ظهور التشوّه.`
                : 'جارٍ تحميل اللعبة ورصد أخطاء الرسوم…'
    }
}
