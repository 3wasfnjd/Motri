import * as THREE from 'three/webgpu'
import { pass, mrt, output, emissive, renderOutput, vec4 } from 'three/tsl'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { Game } from './Game.js'
import { cheapDOF } from './Passes/cheapDOF.js'
import { Inspector } from 'three/addons/inspector/Inspector.js'

export class Rendering
{
    constructor()
    {
        this.game = Game.getInstance()
        this.dynamicPixelRatio = null
        this.usePostProcessing = false
        this.adaptiveResolution = null

        if(this.game.debug.active)
        {
            this.debugPanel = this.game.debug.panel.addFolder({
                title: '📸 Rendering',
                expanded: false,
            })
        }
    }

    start()
    {
        this.setStats()
        this.setAdaptiveResolution()

        this.game.ticker.events.on('tick', () =>
        {
            this.updateAdaptiveResolution()
            this.render()
        }, 998)

        this.game.viewport.events.on('change', () =>
        {
            this.resize()
        })
    }

    async setRenderer()
    {
        this.renderer = new THREE.WebGPURenderer({
            canvas: this.game.canvasElement,
            powerPreference: 'high-performance',
            forceWebGL: false,
            antialias:
                this.game.quality.level === 0 &&
                this.game.viewport.pixelRatio <= 1.25
        })

        this.dynamicPixelRatio = this.game.viewport.pixelRatio
        this.renderer.setPixelRatio(this.dynamicPixelRatio)
        this.renderer.setSize(this.game.viewport.width, this.game.viewport.height)
        this.renderer.sortObjects = false

        this.renderer.domElement.classList.add('experience')
        this.renderer.shadowMap.enabled = true
        // this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
        this.renderer.setOpaqueSort((a, b) =>
        {
            return a.renderOrder - b.renderOrder
        })
        this.renderer.setTransparentSort((a, b) =>
        {
            return a.renderOrder - b.renderOrder
        })

        if(location.hash.match(/inspector/i))
        {
            this.renderer.inspector = new Inspector()
        }

        // Make the renderer control the ticker
        this.renderer.setAnimationLoop((elapsedTime) => { this.game.ticker.update(elapsedTime) })

        return this.renderer
            .init()
    }

    setPostprocessing()
    {
        this.postProcessing = new THREE.RenderPipeline(this.renderer)

        const scenePass = pass(this.game.scene, this.game.view.camera)
        const scenePassColor = scenePass.getTextureNode('output')

        this.bloomPass = bloom(scenePassColor)
        this.bloomPass._nMips = 4
        this.bloomPass.threshold.value = 1
        this.bloomPass.strength.value = 0.25
        this.bloomPass.smoothWidth.value = 1

        this.cheapDOFPass = cheapDOF(renderOutput(scenePass))

        // Quality
        const qualityChange = (level) =>
        {
            this.usePostProcessing = level === 0

            if(level === 0)
            {
                this.postProcessing.outputNode =
                    this.cheapDOFPass.add(this.bloomPass)
            }
            else
            {
                // Low quality renders the scene directly in render(). This avoids
                // allocating and processing full-screen bloom/DOF passes every frame.
                this.postProcessing.outputNode = scenePassColor
            }

            this.postProcessing.needsUpdate = true
        }
        qualityChange(this.game.quality.level)
        this.game.quality.events.on('change', qualityChange)

        // Debug
        if(this.game.debug.active)
        {
            const bloomPanel = this.debugPanel.addFolder({
                title: 'bloom',
                expanded: false,
            })

            bloomPanel.addBinding(this.bloomPass.threshold, 'value', { label: 'threshold', min: 0, max: 2, step: 0.01 })
            bloomPanel.addBinding(this.bloomPass.strength, 'value', { label: 'strength', min: 0, max: 3, step: 0.01 })
            bloomPanel.addBinding(this.bloomPass.radius, 'value', { label: 'radius', min: 0, max: 1, step: 0.01 })
            bloomPanel.addBinding(this.bloomPass.smoothWidth, 'value', { label: 'smoothWidth', min: 0, max: 1, step: 0.01 })

            const blurPanel = this.debugPanel.addFolder({
                title: 'blur',
                expanded: true,
            })

            blurPanel.addBinding(this.cheapDOFPass.start, 'value', { label: 'start', min: 0, max: 0.5, step: 0.001 })
            blurPanel.addBinding(this.cheapDOFPass.end, 'value', { label: 'end', min: 0, max: 0.5, step: 0.001 })
            // blurPanel.addBinding(this.cheapDOFPass.size, 'value', { label: 'size', min: 1, max: 5, step: 1 })
            // blurPanel.addBinding(this.cheapDOFPass.separation, 'value', { label: 'separation', min: 0, max: 5, step: 0.001 })
            blurPanel.addBinding(this.cheapDOFPass.repeats, 'value', { label: 'repeats', min: 1, max: 100, step: 1 })
            blurPanel.addBinding(this.cheapDOFPass.amount, 'value', { label: 'amount', min: 0, max: 0.02, step: 0.0001 })
        }
    }

    setAdaptiveResolution()
    {
        const now = performance.now()

        this.dynamicPixelRatio =
            this.dynamicPixelRatio || this.game.viewport.pixelRatio

        this.adaptiveResolution = {
            lastTime: now,
            elapsed: 0,
            frames: 0,
            cooldownUntil: now + 6000,
            fastWindows: 0
        }
    }

    applyPixelRatio(value)
    {
        const viewport = this.game.viewport
        const min = viewport.pixelRatioMin || 0.65
        const max = viewport.pixelRatio

        const next = Math.round(
            Math.max(min, Math.min(max, value)) * 20
        ) / 20

        if(
            Number.isFinite(this.dynamicPixelRatio) &&
            Math.abs(next - this.dynamicPixelRatio) < 0.049
        )
            return

        this.dynamicPixelRatio = next
        this.renderer.setPixelRatio(this.dynamicPixelRatio)
        this.renderer.setSize(
            viewport.width,
            viewport.height,
            false
        )
    }

    updateAdaptiveResolution()
    {
        const adaptive = this.adaptiveResolution
        if(!adaptive)
            return

        const now = performance.now()
        const frameTime = now - adaptive.lastTime
        adaptive.lastTime = now

        if(
            document.hidden ||
            frameTime <= 0 ||
            frameTime > 250
        )
        {
            adaptive.elapsed = 0
            adaptive.frames = 0
            adaptive.fastWindows = 0
            return
        }

        adaptive.elapsed += frameTime
        adaptive.frames++

        if(adaptive.elapsed < 1500)
            return

        const averageFrameTime =
            adaptive.elapsed / Math.max(1, adaptive.frames)

        adaptive.elapsed = 0
        adaptive.frames = 0

        if(now < adaptive.cooldownUntil)
            return

        if(averageFrameTime >= 34)
        {
            if(this.game.quality.level === 0)
                this.game.quality.changeLevel(1, 'performance')

            this.applyPixelRatio(this.dynamicPixelRatio - 0.2)
            adaptive.cooldownUntil = now + 2500
            adaptive.fastWindows = 0
            return
        }

        if(averageFrameTime >= 24)
        {
            if(
                averageFrameTime >= 28 &&
                this.game.quality.level === 0
            )
                this.game.quality.changeLevel(1, 'performance')

            this.applyPixelRatio(this.dynamicPixelRatio - 0.1)
            adaptive.cooldownUntil = now + 2500
            adaptive.fastWindows = 0
            return
        }

        if(averageFrameTime <= 17.5)
        {
            adaptive.fastWindows++

            if(
                adaptive.fastWindows >= 4 &&
                this.dynamicPixelRatio < this.game.viewport.pixelRatio
            )
            {
                this.applyPixelRatio(this.dynamicPixelRatio + 0.05)
                adaptive.cooldownUntil = now + 3500
                adaptive.fastWindows = 0
            }

            return
        }

        adaptive.fastWindows = 0
    }

    setStats()
    {
        if(!location.hash.match(/stats/i))
            return
            
        this.stats = {}
        this.stats.feed = {}
        this.stats.update = () =>
        {
            this.stats.feed.drawCalls = this.renderer.info.render.drawCalls.toLocaleString()
            this.stats.feed.triangles = this.renderer.info.render.triangles.toLocaleString()
            this.stats.feed.geometries = this.renderer.info.memory.geometries.toLocaleString()
            this.stats.feed.textures = this.renderer.info.memory.textures.toLocaleString()
        }

        this.stats.update()

        // Debug
        if(this.game.debug.active)
        {
             const debugPanel = this.debugPanel.addFolder({
                title: 'Stats',
                expanded: true,
            })

            for(const feedName in this.stats.feed)
            {
                debugPanel.addBinding(this.stats.feed, feedName, { readonly: true })
            }
        }
    }

    resize()
    {
        const viewport = this.game.viewport

        if(!Number.isFinite(this.dynamicPixelRatio))
            this.dynamicPixelRatio = viewport.pixelRatio
        else
            this.dynamicPixelRatio = Math.min(
                this.dynamicPixelRatio,
                viewport.pixelRatio
            )

        this.renderer.setPixelRatio(this.dynamicPixelRatio)
        this.renderer.setSize(
            viewport.width,
            viewport.height,
            false
        )
    }

    async render()
    {
        if(this.usePostProcessing)
            this.postProcessing.render()
        else
            this.renderer.render(
                this.game.scene,
                this.game.view.camera
            )

        if(this.stats)
            this.stats.update()

        if(this.game.monitoring?.stats)
        {
            this.game.rendering.renderer.resolveTimestampsAsync(THREE.TimestampQuery.RENDER)
            this.game.monitoring.stats.update()
        }
    }
}