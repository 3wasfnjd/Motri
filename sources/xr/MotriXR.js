import * as THREE from 'three/webgpu'
import { installXRFramebufferCompatibility, installXRBindingCompatibility } from './compatibility.js'
import { VehicleCamera } from './VehicleCamera.js'
import { AnimationClock } from './AnimationClock.js'
import { XRActions } from './Actions.js'
import { contactPosition, contactDirection, contactStrength } from './ContactShadow.js'
import { XRSky } from './Sky.js'
import { clampWidth, WORLD_SPAN, WORLD_CENTER, roomToWorld, horizontalPlaneHit, readControllers } from './math.js'

const FORWARD = new THREE.Vector3(0, 0, -1)

export class MotriXR {
    constructor(game, ui, status) {
        this.game = game
        this.renderer = game.rendering.renderer
        installXRFramebufferCompatibility(this.renderer)
        installXRBindingCompatibility(this.renderer)
        this.ui = ui
        this.status = status
        this.session = null
        this.starting = false
        this.width = 1.8
        this.yaw = 0
        this.anchorPosition = new THREE.Vector3()
        this.headOrigin = new THREE.Vector3()
        this.viewerPosition = new THREE.Vector3()
        this.lookYaw = 0
        this.placementToken = 0
        this.hitSources = new Map()
        this.buttons = new Map()
        this.handles = []
        this.helperScene = new THREE.Scene()
        this.rig = new THREE.Group()
        this.helperScene.add(this.rig)
        this.camera = new THREE.PerspectiveCamera(70, 1, 0.025, 300)
        this.rig.add(this.camera)
        this.ray = new THREE.Ray()
        this.savedVisibility = new Map()
        this.arParticles = new Set()
        this.savedCulling = new Map()
        this.savedPointRotations = new Map()
        this.animationClock = new AnimationClock()
        this.actions = new XRActions(game)
        this.steering = 0
        this.anchorTracked = true
        this.setHelpers()
        this.setWorldGeometry()
        this.vehicleCamera = new VehicleCamera(game)
        this.sky = new XRSky(game)
        this.setModalHandling()
        const physical = game.physicalVehicle.chassis.physical
        const onCollision = physical.onCollision
        physical.onCollision = (...args) => {
            onCollision?.(...args)
            if(this.session && args[0] > 4) this.pulse(Math.min(0.55, args[0] / 100))
        }
        for(const object of [game.world.grass.mesh, game.world.windLines.mesh, game.world.rain.mesh, game.world.snow.mesh, game.world.leaves.mesh])
            if(object) object.visible = false
        // After Player's order-1 reset, before PhysicsVehicle's order-2 forces.
        game.ticker.events.on('tick', () => this.applyInput(), 1)
        game.ticker.events.on('tick', () => this.updateWorld(), 990)
    }

    setHelpers() {
        const material = new THREE.MeshBasicNodeMaterial({ color: 0xc6ee88, side: THREE.DoubleSide, depthTest: false, depthWrite: false, toneMapped: false })
        this.reticle = new THREE.Mesh(new THREE.RingGeometry(0.075, 0.095, 48).rotateX(-Math.PI / 2), material)
        this.reticle.visible = false
        this.reticle.renderOrder = 100
        this.rig.add(this.reticle)
        this.hudCanvas = document.createElement('canvas')
        this.hudCanvas.width = 1536
        this.hudCanvas.height = 256
        this.hudTexture = new THREE.CanvasTexture(this.hudCanvas)
        this.hudTexture.colorSpace = THREE.SRGBColorSpace
        this.hud = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.104), new THREE.MeshBasicNodeMaterial({ map: this.hudTexture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }))
        this.hud.position.set(0, -0.26, -0.75)
        this.hud.renderOrder = 101
        this.camera.add(this.hud)
        for(let i = 0; i < 2; i++) {
            const controller = this.renderer.xr.getController(i)
            const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicNodeMaterial({ color: 0xc6ee88, transparent: true, opacity: 0.7 }))
            ray.scale.z = 3
            controller.add(ray)
            this.rig.add(controller)
            this.handles.push({ controller, ray })
        }
    }

    setWorldGeometry() {
        // Full terrain patch in AR instead of the original camera-following tile.
        this.fullFloor = new THREE.PlaneGeometry(WORLD_SPAN, WORLD_SPAN, 128, 128).rotateX(-Math.PI / 2)
        this.fullFloor.deleteAttribute('normal')
        this.vrFloor = new THREE.PlaneGeometry(320, 320, 160, 160).rotateX(-Math.PI / 2)
        this.vrFloor.deleteAttribute('normal')
        this.base = new THREE.Mesh(new THREE.BoxGeometry(WORLD_SPAN, 2.4, WORLD_SPAN), new THREE.MeshBasicNodeMaterial({ color: 0x584c39 }))
        this.base.position.set(WORLD_CENTER.x, WORLD_CENTER.y - 1.2, WORLD_CENTER.z)
        this.base.visible = false
        this.game.scene.add(this.base)
    }

    hint(text, seconds = 7) {
        this.hintUntil = performance.now() + seconds * 1000
        this.hud.visible = true
        if(text === this.hintText) return
        this.hintText = text
        const ctx = this.hudCanvas.getContext('2d')
        ctx.clearRect(0, 0, 1536, 256)
        ctx.fillStyle = 'rgba(13,30,29,.90)'
        ctx.beginPath(); ctx.roundRect(0, 0, 1536, 256, 46); ctx.fill()
        ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.font = '600 48px system-ui, sans-serif'; ctx.fillStyle = '#e9f5dd'
        ctx.fillText(text, 768, 128, 1460)
        this.hudTexture.needsUpdate = true
    }

    setCameraMode(mode) {
        this.vehicleCamera.mode = mode === 'chase' ? 'chase' : 'driver'
        this.vehicleCamera.reset()
        this.lookYaw = 0
        if(this.headCalibrated) this.headOrigin.copy(this.viewerPosition)
        for(const input of this.ui.querySelectorAll('[name="xr-camera"]')) input.checked = input.value === this.vehicleCamera.mode
        if(this.session && this.mode === 'immersive-vr') this.hint(this.vehicleCamera.mode === 'driver' ? 'منظور السائق • Y: الكاميرا الخلفية' : 'خلف السيارة • Y: منظور السائق', 4)
    }

    async enter(mode) {
        if(this.session || this.starting) return
        this.starting = true
        this.status('جاري فتح النظارة…')
        let session
        try {
            // requestSession remains directly in the click gesture, before any await.
            session = await navigator.xr.requestSession(mode, {
                optionalFeatures: mode === 'immersive-ar'
                    ? ['local-floor', 'hit-test', 'plane-detection', 'anchors', 'hand-tracking', 'dom-overlay']
                    : ['local-floor'],
                ...(mode === 'immersive-ar' ? { domOverlay: { root: this.ui } } : {})
            })
            this.mode = mode
            this.session = session
            session.addEventListener('end', () => this.onEnd(session), { once: true })
            session.addEventListener('select', event => this.onSelect(event))
            session.addEventListener('inputsourceschange', () => this.syncHitSources())
            session.addEventListener('visibilitychange', () => {
                this.controls = null
                this.gesture = null
                this.actions.release()
                this.primarySince = null
            })
            try {
                this.referenceSpace = await session.requestReferenceSpace('local-floor')
                this.renderer.xr.setReferenceSpaceType('local-floor')
            } catch {
                this.referenceSpace = await session.requestReferenceSpace('local')
                this.renderer.xr.setReferenceSpaceType('local')
            }
            if(this.session !== session) return
            this.referenceSpace.addEventListener('reset', () => {
                if(this.mode === 'immersive-ar' && !this.anchor) this.reposition()
                this.headCalibrated = false
            })
            this.saved = {
                background: this.game.scene.background,
                backgroundNode: this.game.scene.backgroundNode,
                shadows: this.renderer.shadowMap.enabled,
                tickerScale: this.game.ticker.scale,
                floorGeometry: this.game.world.floor.mesh.geometry,
                waterScale: this.game.world.waterSurface.mesh.scale.clone(),
                clearAlpha: this.renderer.getClearAlpha(),
                clearColor: this.renderer.getClearColor(new THREE.Color())
            }
            this.game.scene.backgroundNode = null
            this.game.scene.background = mode === 'immersive-ar' ? null : new THREE.Color('#b9cfcd')
            this.renderer.setClearColor(0x000000, mode === 'immersive-ar' ? 0 : 1)
            this.renderer.shadowMap.enabled = false
            this.game.ticker.scale = 1
            this.game.world.floor.mesh.geometry = mode === 'immersive-ar' ? this.fullFloor : this.vrFloor
            for(const object of [this.game.overlay.mesh, this.game.view.speedLines.mesh, this.game.world.grass.mesh, this.game.world.windLines.mesh, this.game.world.rain.mesh, this.game.world.snow.mesh]) {
                if(object) { this.savedVisibility.set(object, object.visible); object.visible = false }
            }
            // A scaled viewer rig has a larger stereo eye separation in world units.
            // Disable the aggregate stereo frustum shortcut for tabletop rendering.
            if(mode === 'immersive-ar') this.game.scene.traverse(object => {
                if(object.isMesh) { this.savedCulling.set(object, object.frustumCulled); object.frustumCulled = false }
                // Screen-facing particles ignore the inverse viewer scale and can
                // cover the miniature world. Simplify these decorations in AR.
                const materials = Array.isArray(object.material) ? object.material : [object.material]
                if(materials.some(material => material?.isSpriteNodeMaterial)) {
                    this.savedVisibility.set(object, object.visible)
                    this.arParticles.add(object)
                    object.visible = false
                }
            })
            this.rig.position.set(0, 0, 0)
            this.rig.quaternion.identity()
            this.rig.scale.setScalar(1)
            this.placed = false
            this.headCalibrated = false
            this.anchorTracked = true
            this.anchorHeading = null
            this.primarySince = null
            this.snapHeld = false
            this.steering = 0
            this.vehicleCamera.reset()
            this.lookYaw = 0
            this.controls = null
            this.buttons.clear()
            this.lastTime = performance.now()
            this.startedAt = this.lastTime
            this.roomCaptureRequested = false
            this.base.visible = false
            this.camera.far = mode === 'immersive-ar' ? 50 : 300
            await this.renderer.xr.setSession(session)
            if(this.session !== session) return
            this.renderer.xr.setReferenceSpace(this.referenceSpace)
            this.ui.classList.add('xr-entered')
            this.ui.querySelector('.xr-toolbar').hidden = mode !== 'immersive-ar' || !session.domOverlayState
            this.hint(mode === 'immersive-ar' ? 'وجّه يدك إلى سطح مستوٍ ثم اضغط الزناد' : 'الزناد: قيادة • A: تفاعل / قفز • Y: الكاميرا', 8)
            if(mode === 'immersive-ar') this.syncHitSources()
            if(session.supportedFrameRates?.includes(72)) session.updateTargetFrameRate(72).catch(() => {})
        } catch(error) {
            console.error('Motri XR session:', error)
            if(session) { try { await session.end() } catch {} }
            if(this.session === session) this.onEnd(session)
            this.status(error.name === 'NotAllowedError' ? 'لم يُسمح بفتح التجربة. اسمح بالأذونات ثم حاول مجددًا.' : 'تعذّر فتح التجربة على هذا المتصفح. جرّب متصفح Meta Quest وحدّثه.')
        } finally { this.starting = false }
    }

    async syncHitSources() {
        const session = this.session
        if(!session || this.mode !== 'immersive-ar' || !session.requestHitTestSource) return
        const targets = [...session.inputSources].filter(source => source.targetRayMode === 'tracked-pointer')
        for(const [key, value] of this.hitSources) {
            if(key !== 'viewer' && !targets.includes(key)) { value?.cancel(); this.hitSources.delete(key) }
        }
        const request = async (key, space) => {
            if(this.session !== session || this.hitSources.has(key)) return
            this.hitSources.set(key, null)
            try {
                const source = await session.requestHitTestSource({ space })
                if(this.session === session && this.hitSources.has(key)) this.hitSources.set(key, source)
                else source.cancel()
            } catch { /* Optional capability: detected plane polygons remain available. */ }
        }
        for(const source of targets) request(source, source.targetRaySpace)
        if(!this.hitSources.has('viewer')) {
            try { await request('viewer', await session.requestReferenceSpace('viewer')) } catch {}
        }
    }

    beforeTick(frame, timestamp) {
        this.animationClock.update(timestamp)
        if(!this.session || !frame || !this.saved) return
        this.frame = frame
        const now = performance.now()
        this.dt = Math.min(0.05, Math.max(0, (now - this.lastTime) / 1000))
        this.lastTime = now
        const pose = frame.getViewerPose(this.referenceSpace)
        this.tracking = !!pose && !pose.emulatedPosition && this.session.visibilityState === 'visible'
        if(!this.tracking) {
            this.controls = null; this.gesture = null; this.reticle.visible = false
            this.actions.release(); this.primarySince = null; this.steering = 0
            return
        }
        this.viewerPosition.copy(pose.transform.position)
        if(!this.headCalibrated) {
            this.headOrigin.copy(pose.transform.position)
            this.headCalibrated = true
        }
        this.controls = readControllers(this.session.inputSources)
        if(this.edge('exit', this.controls.right?.upper)) { this.exit(); return }
        if(this.mode === 'immersive-ar') {
            if(this.edge('replace', this.controls.left?.lower)) this.reposition()
            if(this.edge('scan', this.controls.left?.upper)) this.captureRoom()
            if(!this.placed) this.findSurface(frame)
            else {
                this.updateAnchor(frame)
                this.updateScale(frame)
            }
        } else {
            if(this.edge('camera', this.controls.left?.upper)) this.setCameraMode(this.vehicleCamera.mode === 'driver' ? 'chase' : 'driver')
            const turn = this.controls.right?.x || 0
            if(Math.abs(turn) > 0.65 && !this.snapHeld) this.lookYaw -= Math.sign(turn) * Math.PI / 6
            this.snapHeld = Math.abs(turn) > 0.3
            if(this.edge('recenter', this.controls.left?.lower)) { this.lookYaw = 0; this.headOrigin.copy(this.viewerPosition) }
        }
        this.updateActions(now)
        if(this.hintUntil < now && (this.mode !== 'immersive-ar' || this.placed)) this.hud.visible = false
        for(const handle of this.handles) handle.ray.visible = this.mode === 'immersive-ar' && !this.placed
    }

    edge(name, pressed) {
        const previous = this.buttons.get(name)
        this.buttons.set(name, !!pressed)
        return !!pressed && !previous
    }

    pulse(strength = 0.25) {
        const now = performance.now()
        if(now - (this.lastPulse || 0) < 120) return
        this.lastPulse = now
        const actuator = this.controls?.right?.source.gamepad?.hapticActuators?.[0]
        try { actuator?.pulse(strength, 45)?.catch?.(() => {}) } catch {}
    }

    updateActions(now) {
        const { left, right } = this.controls
        const active = this.mode === 'immersive-vr' || (this.placed && this.anchorTracked && !this.gesture)
        if(!active) { this.actions.release(); this.primarySince = null; return }
        const pressed = !!right?.lower
        if(pressed && this.primarySince == null) {
            this.primarySince = now
            this.primaryHandled = false
            if(this.game.modals.current?.isOpen) {
                this.game.modals.close()
                this.primaryHandled = true
            } else {
                const item = this.game.interactivePoints.activeItem
                this.primaryHandled = item?.state === 4
                this.actions.set(item?.state === 4 ? 'interact' : 'suspensions', true)
                this.pulse()
            }
        }
        if(pressed && !this.primaryHandled && this.game.player.state === 1 && now - this.primarySince > 900) {
            this.actions.release()
            this.game.player.respawn()
            this.vehicleCamera.reset()
            this.primaryHandled = true
            this.pulse(0.5)
        }
        if(!pressed) {
            this.primarySince = null
            this.actions.set('interact', false)
            this.actions.set('suspensions', false)
        }
        this.actions.set('boost', this.mode === 'immersive-vr' && left?.grip > 0.65 && !(right?.grip > 0.5))
        this.actions.set('honk', !!left?.stick)
    }

    setModalHandling() {
        // CSS transitions are hidden in-headset, so complete their state changes.
        // A dismisses the summary; B returns to the full panel in the browser.
        this.game.modals.events.on('open', () => {
            if(!this.session) return
            queueMicrotask(() => { if(this.session) this.game.modals.onTransitionEnded() })
            const item = this.game.modals.current
            const title = item.element.querySelector('h1,h2,h3,.title')?.textContent?.trim() || 'تفاصيل النشاط'
            this.hint(`${title.slice(0, 48)} • A: إغلاق • B: التفاصيل`, 3600)
            this.actions.release()
        })
        this.game.modals.events.on('close', () => {
            if(this.session) this.game.modals.onTransitionEnded()
            this.ui.classList.remove('xr-modal-open')
            document.documentElement.classList.remove('xr-modal-open')
            this.hintUntil = 0
        })
    }

    isAreaVisible(position, radius) {
        if(this.mode === 'immersive-ar') return true
        return Math.hypot(position.x - this.game.player.position.x, position.y - this.game.player.position.z) < 150 + radius
    }

    findSurface(frame, selectedSource = null) {
        this.surfaceHit = null
        const sources = [...this.session.inputSources]
        const controller = selectedSource || sources.find(source => source.handedness === 'right' && source.targetRayMode === 'tracked-pointer') || sources.find(source => source.targetRayMode === 'tracked-pointer')
        const controllerHitSource = this.hitSources.get(controller)
        const hitSource = controllerHitSource || this.hitSources.get('viewer')
        if(hitSource) for(const result of frame.getHitTestResults(hitSource)) {
            const pose = result.getPose(this.referenceSpace)
            if(!pose || pose.transform.matrix[5] < 0.85) continue
            const position = new THREE.Vector3().copy(pose.transform.position)
            if(position.distanceTo(this.viewerPosition) > 6) continue
            this.surfaceHit = { position, result }
            break
        }
        if(!this.surfaceHit) {
            const pose = controller ? frame.getPose(controller.targetRaySpace, this.referenceSpace) : frame.getViewerPose(this.referenceSpace)
            if(pose) {
                const matrix = new THREE.Matrix4().fromArray(pose.transform.matrix)
                this.ray.origin.setFromMatrixPosition(matrix)
                this.ray.direction.copy(FORWARD).transformDirection(matrix)
                this.surfaceHit = horizontalPlaneHit(this.ray, frame.detectedPlanes, frame, this.referenceSpace)
            }
        }
        this.reticle.visible = !!this.surfaceHit
        if(this.surfaceHit) {
            this.reticle.position.copy(this.surfaceHit.position)
            this.reticle.position.y += 0.002
            this.hint(controller && !controllerHitSource && this.surfaceHit.result ? 'انظر إلى السطح ثم اضغط الزناد لوضع موتري' : 'اضغط الزناد لوضع موتري هنا', 1)
        } else if(performance.now() - this.startedAt > 7000) {
            this.hint('لم يظهر سطح؟ حرّك المؤشر أو اضغط Y لمسح الغرفة', 1)
        }
    }

    onSelect(event) {
        if(this.mode !== 'immersive-ar' || this.placed || !this.tracking || performance.now() - this.startedAt < 500) return
        // Resolve at the selection frame; never reuse a stale reticle after tracking loss.
        this.findSurface(event.frame, event.inputSource)
        if(!this.surfaceHit) return
        this.anchorPosition.copy(this.surfaceHit.position)
        this.placed = true
        this.reticle.visible = false
        this.base.visible = true
        this.yaw = 0
        this.anchorHeading = null
        this.anchorTracked = true
        this.createAnchor(event.frame, this.surfaceHit)
        this.hint('العصا اليمنى: الحجم والدوران • X: سطح آخر • B: خروج', 10)
    }

    async createAnchor(frame, hit) {
        const token = ++this.placementToken
        let anchor
        try {
            if(hit.result?.createAnchor) anchor = await hit.result.createAnchor()
            else if(frame.createAnchor) anchor = await frame.createAnchor(new XRRigidTransform(hit.position), this.referenceSpace)
            if(!anchor) return
            if(token !== this.placementToken || !this.session || !this.placed) { anchor.delete(); return }
            this.anchor?.delete()
            this.anchor = anchor
        } catch { /* Local reference space remains the placement fallback. */ }
    }

    updateAnchor(frame) {
        this.anchorTracked = true
        if(!this.anchor) return
        const pose = frame.getPose(this.anchor.anchorSpace, this.referenceSpace)
        this.anchorTracked = !!pose
        if(!pose) { this.actions.release(); this.hint('جاري استعادة تثبيت السطح…', 1); return }
        const target = new THREE.Vector3().copy(pose.transform.position)
        this.anchorPosition.lerp(target, this.anchorPosition.distanceTo(target) > 0.15 ? 1 : 1 - Math.exp(-this.dt * 18))
        const matrix = pose.transform.matrix
        const heading = Math.atan2(matrix[8], matrix[10])
        if(this.anchorHeading !== null) this.yaw += Math.atan2(Math.sin(heading - this.anchorHeading), Math.cos(heading - this.anchorHeading))
        this.anchorHeading = heading
    }

    async captureRoom() {
        if(this.roomCaptureRequested) return
        if(!this.session?.initiateRoomCapture) { this.hint('أكمل إعداد المساحة في إعدادات الكويست ثم أعد فتح AR', 8); return }
        this.roomCaptureRequested = true
        try { await this.session.initiateRoomCapture() }
        catch { this.hint('تعذّر مسح الغرفة. أكمل إعداد المساحة من إعدادات الكويست', 8) }
    }

    setWidth(width) {
        this.width = clampWidth(width)
        this.ui.querySelector('#xr-scale').value = this.width
    }

    updateScale(frame) {
        const { left, right } = this.controls
        const hands = [...this.session.inputSources].filter(source => source.hand)
        const grips = []
        for(const control of [left, right]) {
            if(control?.grip > 0.65 && control.source.gripSpace) {
                const pose = frame.getPose(control.source.gripSpace, this.referenceSpace)
                if(pose) grips.push(new THREE.Vector3().copy(pose.transform.position))
            }
        }
        if(grips.length < 2 && hands.length === 2) {
            grips.length = 0
            for(const source of hands) {
                const thumbSpace = source.hand.get('thumb-tip'), indexSpace = source.hand.get('index-finger-tip')
                if(!thumbSpace || !indexSpace) continue
                const thumb = frame.getJointPose(thumbSpace, this.referenceSpace), index = frame.getJointPose(indexSpace, this.referenceSpace)
                if(!thumb || !index) continue
                const a = new THREE.Vector3().copy(thumb.transform.position), b = new THREE.Vector3().copy(index.transform.position)
                if(a.distanceTo(b) < 0.035) grips.push(a.lerp(b, 0.5))
            }
        }
        if(grips.length === 2) {
            const distance = grips[0].distanceTo(grips[1])
            if(distance > 0.08) {
                if(!this.gesture) this.gesture = { distance, width: this.width }
                const target = clampWidth(this.gesture.width * distance / this.gesture.distance)
                this.setWidth(this.width + (target - this.width) * (1 - Math.exp(-this.dt * 16)))
            }
        } else {
            this.gesture = null
            if(right?.y) this.setWidth(this.width * Math.exp(-right.y * this.dt * 1.1))
            if(right?.x) this.yaw -= right.x * this.dt * 1.1
        }
        if(right?.x || right?.y || this.gesture) this.hint(`عرض العالم ${this.width.toFixed(1)} م`, 2)
    }

    applyInput() {
        if(!this.session || !this.game.player) return
        const player = this.game.player
        player.accelerating = 0; player.steering = 0; player.boosting = 0; player.braking = 1
        if(!this.tracking || !this.controls || player.state !== 1 || this.game.inputs.filters.has('modal')) return
        const { left, right } = this.controls
        const targetSteering = -(left?.x || 0)
        const speedLimit = 1 / (1 + Math.max(0, this.game.physicalVehicle.xzSpeed - 8) * 0.025)
        this.steering += (targetSteering * speedLimit - this.steering) * (1 - Math.exp(-this.dt * 14))
        if(this.mode === 'immersive-vr') {
            player.accelerating = (right?.trigger || 0) - (left?.trigger || 0)
            player.steering = this.steering
            player.braking = right?.grip > 0.5 ? 1 : 0
            player.boosting = this.game.inputs.actions.get('boost').active ? 1 : 0
            if(player.braking) player.accelerating = 0
        } else if(this.placed && this.anchorTracked && !this.gesture) {
            player.accelerating = -(left?.y || 0)
            player.steering = this.steering
            player.braking = 0
        }
    }

    updateWorld() {
        if(!this.session || !this.saved) return
        const world = this.game.world
        const vehicle = this.game.physicalVehicle
        const contacts = vehicle.wheels.items.filter(wheel => wheel.inContact && wheel.contactPoint)
        contactStrength.value = contacts.length ? 0.5 : 0
        if(contacts.length) {
            contactPosition.value.copy(vehicle.position)
            contactPosition.value.y = contacts.reduce((sum, wheel) => sum + wheel.contactPoint.y, 0) / contacts.length
            contactDirection.value.set(vehicle.forward.x, vehicle.forward.z).normalize()
        }
        this.game.overlay.mesh.visible = false
        this.game.view.speedLines.mesh.visible = false
        const item = this.game.interactivePoints.activeItem
        if(item?.state === 4 && !this.game.modals.current?.isOpen) this.hint(`${item.text} • A`, 1)
        for(const point of this.game.interactivePoints.items) {
            if(this.mode === 'immersive-ar') {
                if(!this.savedVisibility.has(point.group)) this.savedVisibility.set(point.group, point.group.visible)
                point.group.visible = false
            } else if(point.group.visible) {
                if(!this.savedPointRotations.has(point.group)) this.savedPointRotations.set(point.group, point.group.quaternion.clone())
                point.group.rotation.set(0, this.vehicleCamera.headingYaw || 0, 0)
            }
        }
        if(this.mode === 'immersive-ar') {
            this.sky.mesh.visible = false
            this.vehicleCamera.setCabinVisible(false)
            for(const object of this.arParticles) object.visible = false
            this.rig.matrixAutoUpdate = false
            if(this.placed && this.anchorTracked) roomToWorld(this.anchorPosition, this.yaw, this.width, this.rig.matrix)
            // Keep one scene and its shader/binding layout throughout AR. Until
            // placement, put the viewer above the world's far clip plane; the
            // room-space reticle/HUD stay with the rig and remain visible.
            else this.rig.matrix.makeTranslation(0, WORLD_SPAN * 8, 0)
            this.rig.matrixWorldNeedsUpdate = true
            world.floor.mesh.position.set(WORLD_CENTER.x, 0, WORLD_CENTER.z)
            world.waterSurface.mesh.position.x = WORLD_CENTER.x
            world.waterSurface.mesh.position.z = WORLD_CENTER.z
            world.waterSurface.mesh.scale.setScalar(WORLD_SPAN)
            this.game.fog.near.value = 100000
            this.game.fog.far.value = 100001
        } else if(this.headCalibrated) {
            this.rig.matrixAutoUpdate = true
            this.rig.scale.setScalar(1)
            const vehicle = this.game.physicalVehicle
            this.vehicleCamera.update(vehicle, this.headOrigin, this.rig, this.lookYaw, this.game.player.steering, this.dt)
            this.sky.update(this.vehicleCamera.position)
            world.floor.mesh.position.x = vehicle.position.x
            world.floor.mesh.position.z = vehicle.position.z
            world.waterSurface.mesh.position.x = vehicle.position.x
            world.waterSurface.mesh.position.z = vehicle.position.z
            world.waterSurface.mesh.scale.setScalar(320)
            this.game.fog.near.value = 90
            this.game.fog.far.value = 220
            this.game.scene.background.copy(this.game.dayCycles.properties.fogColorA.value)
        }
        this.rig.updateWorldMatrix(true, true)
    }

    render() {
        if(!this.saved) return
        // One stereo render is essential: WebGPURenderer's output conversion can
        // replace the first scene when a helper scene is drawn in a second pass.
        const scene = this.game.scene
        if(this.rig.parent !== scene) scene.add(this.rig)
        this.renderer.render(scene, this.camera)
    }

    reposition() {
        if(this.mode !== 'immersive-ar' || !this.session) return
        this.placementToken++
        this.anchor?.delete(); this.anchor = null
        this.placed = false
        this.base.visible = false
        this.vehicleCamera.setCabinVisible(false)
        this.surfaceHit = null
        this.reticle.visible = false
        this.gesture = null
        this.actions.release()
        this.anchorHeading = null
        this.anchorTracked = true
        this.hint('وجّه المؤشر إلى سطح جديد واضغط الزناد', 12)
    }

    async exit() {
        try { await this.session?.end() } catch(error) { this.status('تعذّر الخروج. استخدم زر Meta للعودة إلى المتصفح.'); console.error(error) }
    }

    onEnd(session) {
        if(this.session !== session) return
        this.session = null
        contactStrength.value = 0
        this.sky.mesh.visible = false
        this.placementToken++
        this.anchor?.delete(); this.anchor = null
        for(const source of this.hitSources.values()) source?.cancel()
        this.hitSources.clear()
        this.controls = null
        this.actions.release()
        this.primarySince = null
        this.tracking = false
        this.gesture = null
        this.placed = false
        this.base.visible = false
        this.vehicleCamera.setCabinVisible(false)
        this.reticle.visible = false
        this.helperScene.add(this.rig)
        this.rig.matrixAutoUpdate = true
        this.rig.position.set(0, 0, 0); this.rig.quaternion.identity(); this.rig.scale.setScalar(1)
        for(const [object, visible] of this.savedVisibility) object.visible = visible
        for(const [object, culled] of this.savedCulling) object.frustumCulled = culled
        for(const [object, rotation] of this.savedPointRotations) object.quaternion.copy(rotation)
        this.savedPointRotations.clear()
        this.savedVisibility.clear(); this.savedCulling.clear()
        this.arParticles.clear()
        if(this.saved) {
            this.game.scene.background = this.saved.background
            this.game.scene.backgroundNode = this.saved.backgroundNode
            this.renderer.shadowMap.enabled = this.saved.shadows
            this.renderer.setClearColor(this.saved.clearColor, this.saved.clearAlpha)
            this.game.ticker.scale = this.saved.tickerScale
            this.game.world.floor.mesh.geometry = this.saved.floorGeometry
            this.game.world.waterSurface.mesh.scale.copy(this.saved.waterScale)
            this.saved = null
        }
        this.game.player.accelerating = 0; this.game.player.braking = 0; this.game.player.steering = 0
        this.ui.classList.remove('xr-entered')
        this.ui.querySelector('.xr-toolbar').hidden = true
        this.status('اختر تجربتك')
        if(this.game.modals.current?.isOpen) {
            this.ui.classList.add('xr-modal-open')
            document.documentElement.classList.add('xr-modal-open')
            this.game.modals.element.classList.add('is-visible')
        }
        this.game.rendering.resize()
    }
}
