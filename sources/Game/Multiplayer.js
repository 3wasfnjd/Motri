import * as THREE from 'three/webgpu'
import { Game } from './Game.js'
import { VEHICLE_BODY_STYLES } from './World/VehicleBodyStyles.js'
import { WorldSync } from './WorldSync.js'

const SEND_INTERVAL = 1 / 12
const INTERPOLATION_DELAY_MS = 120
const MAX_EXTRAPOLATION_SECONDS = 0.16
const MAX_SNAPSHOTS = 20
const TELEPORT_DISTANCE = 22
const MAX_NAME_LENGTH = 12
const MAX_NAME_TAG_DISTANCE = 75

const H9_BODY_NAMES = new Set([
    'H9_Body_trim',
    'H9_Body_glass',
    'H9_Body_metal',
    'H9_HavalBadge',
    'H9_GWMBadge'
])

function cleanName(value)
{
    return String(value || '')
        .replace(/[^\p{L}\p{N}_\- ]/gu, '')
        .trim()
        .slice(0, MAX_NAME_LENGTH)
}

export class Multiplayer
{
    constructor()
    {
        this.game = Game.getInstance()
        this.enabled = !!import.meta.env.VITE_SERVER_URL
        this.remotePlayers = new Map()
        this.peerIds = new Set()
        this.sendAccumulator = 0
        this.sequence = 0
        this.maxPlayers = 6
        this.localName = this.resolveLocalName()
        this.remoteVehicleTemplate = null
        this.tempPosition = new THREE.Vector3()
        this.tempQuaternion = new THREE.Quaternion()
        this.tempProjected = new THREE.Vector3()
        this.tempCameraSpace = new THREE.Vector3()

        this.prepareRemoteVehicleTemplate()
        this.worldSync = new WorldSync(this.game, this)
        this.setHud()

        this.game.server.events.on('connected', () => this.onConnected())
        this.game.server.events.on('message', (message) => this.onMessage(message))
        this.game.server.events.on('disconnected', () => this.onDisconnected())

        this.game.ticker.events.on('tick', () => this.update(), 9)
    }

    resolveLocalName()
    {
        const params = new URLSearchParams(window.location.search)
        const queryName = cleanName(params.get('name'))
        if(queryName)
        {
            try { localStorage.setItem('multiplayerName', queryName) }
            catch {}
            return queryName
        }

        let storedName = ''
        try { storedName = cleanName(localStorage.getItem('multiplayerName')) }
        catch {}

        if(storedName)
            return storedName

        return `MOTRI-${this.game.server.sessionUuid.slice(0, 4).toUpperCase()}`
    }

    setHud()
    {
        this.hud = document.createElement('div')
        this.hud.className = 'multiplayer-hud'
        this.hud.hidden = true

        this.hudStatus = document.createElement('div')
        this.hudStatus.className = 'multiplayer-hud-status'

        this.hudRoom = document.createElement('div')
        this.hudRoom.className = 'multiplayer-hud-room'

        this.hud.append(this.hudStatus, this.hudRoom)
        this.game.domElement.append(this.hud)
        this.updateHud()
    }

    updateHud()
    {
        if(!this.enabled)
        {
            this.hud.hidden = true
            return
        }

        this.hud.hidden = false
        this.hud.classList.toggle('is-connected', this.game.server.connected)

        if(this.game.server.connected)
        {
            const count = Math.min(this.maxPlayers, 1 + this.peerIds.size)
            this.hudStatus.textContent = `${this.localName} · ${count}/${this.maxPlayers}`
            this.hudRoom.textContent = `الغرفة: ${this.game.server.room}`
        }
        else
        {
            this.hudStatus.textContent = 'اللعب الجماعي غير متصل'
            this.hudRoom.textContent = ''
        }
    }

    prepareRemoteVehicleTemplate()
    {
        const visualVehicle = this.game.world?.visualVehicle
        const bodyStyles = visualVehicle?.bodyStyles
        const chassis = visualVehicle?.parts?.chassis
        if(!bodyStyles || !chassis)
            return

        const currentStyle = bodyStyles.current

        // Build every visual body once, then clone an H9-baseline template.
        // This only toggles visibility synchronously and never changes physics.
        for(const style of VEHICLE_BODY_STYLES)
            bodyStyles.changeTo(style.id, false)

        bodyStyles.changeTo('h9', false)
        this.remoteVehicleTemplate = chassis.clone(true)
        this.remoteVehicleTemplate.name = 'RemoteVehicleTemplate'
        this.remoteVehicleTemplate.removeFromParent()

        bodyStyles.changeTo(currentStyle, false)
    }

    onConnected()
    {
        this.peerIds.clear()
        this.clearRemotePlayers(false)
        this.updateHud()

        this.game.server.send({
            type: 'hello',
            name: this.localName
        })
    }

    onDisconnected()
    {
        this.peerIds.clear()
        this.clearRemotePlayers(false)
        this.updateHud()
    }

    onMessage(message)
    {
        if(!message || typeof message !== 'object')
            return

        if(message.type === 'welcome')
        {
            if(Number.isFinite(message.maxPlayers))
                this.maxPlayers = Math.max(2, Math.min(12, Math.floor(message.maxPlayers)))

            if(Array.isArray(message.players))
            {
                for(const player of message.players)
                {
                    if(!player?.uuid || player.uuid === this.game.server.sessionUuid)
                        continue

                    this.peerIds.add(player.uuid)
                    if(player.state)
                        this.applyRemoteState(player.uuid, player.name, player.state)
                }
            }

            if(message.world)
                this.worldSync.applySnapshot(message.world)
            if(message.animals)
                this.worldSync.applyAnimals(message.animals)

            this.updateHud()
            return
        }

        if(message.type === 'worldDelta')
        {
            this.worldSync.applySnapshot(message.changes)
            return
        }

        if(message.type === 'animalState')
        {
            this.worldSync.applyAnimals(message.animals)
            return
        }

        if(message.type === 'join' && message.uuid && message.uuid !== this.game.server.sessionUuid)
        {
            this.peerIds.add(message.uuid)
            this.updateHud()
            return
        }

        if(message.type === 'state' && message.uuid && message.uuid !== this.game.server.sessionUuid)
        {
            this.peerIds.add(message.uuid)
            this.applyRemoteState(message.uuid, message.name, message.state)
            this.updateHud()
            return
        }

        if(message.type === 'leave' && message.uuid)
        {
            this.peerIds.delete(message.uuid)
            this.removeRemotePlayer(message.uuid)
            this.updateHud()
        }
    }

    isWorldAuthority()
    {
        const ids = [ this.game.server.sessionUuid, ...this.peerIds ].filter(Boolean).sort()
        return ids.length === 0 || ids[0] === this.game.server.sessionUuid
    }

    getClosestVehicleState(target)
    {
        const localVehicle = this.game.physicalVehicle
        let best = {
            position: localVehicle.position,
            velocity: localVehicle.velocity,
            distance: localVehicle.position.distanceTo(target),
            local: true
        }

        for(const remote of this.remotePlayers.values())
        {
            if(!remote.initialized)
                continue

            const latest = remote.snapshots[remote.snapshots.length - 1]
            const distance = remote.model.position.distanceTo(target)
            if(distance >= best.distance)
                continue

            best = {
                position: remote.model.position,
                velocity: latest?.velocity || this.tempPosition.set(0, 0, 0),
                distance,
                local: false
            }
        }

        return best
    }

    applyRemoteState(uuid, name, state)
    {
        if(!state || !Array.isArray(state.p) || !Array.isArray(state.q))
            return

        let remote = this.remotePlayers.get(uuid)
        if(!remote)
            remote = this.createRemotePlayer(uuid, name)

        if(!remote)
            return

        const cleanRemoteName = cleanName(name) || remote.name || 'MOTRI'
        if(cleanRemoteName !== remote.name)
        {
            remote.name = cleanRemoteName
            remote.nameElement.textContent = cleanRemoteName
        }

        const timestamp = Number.isFinite(state.ts) ? state.ts : Date.now()
        const snapshot = {
            ts: timestamp,
            position: new THREE.Vector3().fromArray(state.p),
            quaternion: new THREE.Quaternion().fromArray(state.q).normalize(),
            velocity: new THREE.Vector3().fromArray(Array.isArray(state.v) ? state.v : [ 0, 0, 0 ]),
            steering: Number.isFinite(state.s) ? state.s : 0,
            accelerating: Number.isFinite(state.a) ? state.a : 0,
            braking: !!state.b,
            boosting: !!state.boost,
            left: !!state.l,
            right: !!state.r
        }

        const lastSnapshot = remote.snapshots[remote.snapshots.length - 1]
        if(lastSnapshot && snapshot.ts < lastSnapshot.ts)
            return

        if(lastSnapshot && snapshot.ts === lastSnapshot.ts)
            remote.snapshots[remote.snapshots.length - 1] = snapshot
        else
            remote.snapshots.push(snapshot)

        if(remote.snapshots.length > MAX_SNAPSHOTS)
            remote.snapshots.splice(0, remote.snapshots.length - MAX_SNAPSHOTS)

        this.applyRemoteBodyStyle(remote, state.body)
        this.applyRemotePaint(remote, state.paint)

        if(!remote.initialized)
        {
            remote.model.position.copy(snapshot.position)
            remote.model.quaternion.copy(snapshot.quaternion)
            remote.initialized = true
        }
    }

    createRemotePlayer(uuid, name)
    {
        if(!this.remoteVehicleTemplate)
            this.prepareRemoteVehicleTemplate()

        if(!this.remoteVehicleTemplate)
            return null

        const model = this.remoteVehicleTemplate.clone(true)
        model.name = `RemoteVehicle_${uuid}`

        const remote = {
            uuid,
            name: cleanName(name) || 'MOTRI',
            model,
            snapshots: [],
            initialized: false,
            bodyStyle: null,
            paint: null,
            h9Parts: [],
            styleGroups: new Map(),
            bodyPainted: null,
            wheelPainted: [],
            frontWheels: [],
            wheelCylinders: [],
            stopLights: [],
            backLights: [],
            blinkerLeft: [],
            blinkerRight: []
        }

        model.traverse((child) =>
        {
            child.userData = { ...child.userData }

            if(child.isMesh)
            {
                child.castShadow = true
                child.receiveShadow = true
            }

            if(/^bodyPainted/i.test(child.name))
            {
                remote.bodyPainted = child
                remote.h9Parts.push({ object: child, visible: child.visible })
            }
            else if(H9_BODY_NAMES.has(child.name))
            {
                remote.h9Parts.push({ object: child, visible: child.visible })
            }

            if(child.name === 'Shas_BodyStyle')
                remote.styleGroups.set('shas', child)
            else if(child.name === 'Datsun_BodyStyle')
                remote.styleGroups.set('datsun', child)

            if(/^wheelPainted/i.test(child.name))
                remote.wheelPainted.push(child)

            if(/^wheelContainer/i.test(child.name) && child.position.x > 0)
                remote.frontWheels.push({ object: child, baseRotationY: child.rotation.y })

            if(/^wheelCylinder/i.test(child.name))
                remote.wheelCylinders.push(child)

            if(/^stopLights/i.test(child.name))
                remote.stopLights.push(child)
            if(/^backLights/i.test(child.name))
                remote.backLights.push(child)
            if(/^blinkerLeft/i.test(child.name))
                remote.blinkerLeft.push(child)
            if(/^blinkerRight/i.test(child.name))
                remote.blinkerRight.push(child)
        })

        const nameElement = document.createElement('div')
        nameElement.className = 'multiplayer-name-tag'
        nameElement.textContent = remote.name
        nameElement.hidden = true
        this.game.domElement.append(nameElement)
        remote.nameElement = nameElement

        this.game.scene.add(model)
        this.remotePlayers.set(uuid, remote)
        this.applyRemoteBodyStyle(remote, 'h9')
        this.applyRemotePaint(remote, 'red')
        return remote
    }

    applyRemoteBodyStyle(remote, styleId)
    {
        const id = VEHICLE_BODY_STYLES.some(style => style.id === styleId) ? styleId : 'h9'
        if(remote.bodyStyle === id)
            return

        for(const part of remote.h9Parts)
            part.object.visible = id === 'h9' && part.visible

        for(const [ bodyId, body ] of remote.styleGroups)
            body.visible = bodyId === id

        remote.bodyStyle = id
        // Re-apply paint because H9 body visibility may have changed.
        remote.paint = null
    }

    applyRemotePaint(remote, paintName)
    {
        const choices = this.game.world?.visualVehicle?.paints?.choices
        if(!choices)
            return

        const fallback = choices.red
        const material = choices[paintName] || fallback
        const normalizedName = choices[paintName] ? paintName : 'red'
        if(remote.paint === normalizedName)
            return

        if(remote.bodyStyle === 'h9' && remote.bodyPainted && !remote.bodyPainted.userData.fixedPaint)
            remote.bodyPainted.material = material

        for(const wheel of remote.wheelPainted)
            wheel.material = material

        remote.paint = normalizedName
    }

    removeRemotePlayer(uuid)
    {
        const remote = this.remotePlayers.get(uuid)
        if(!remote)
            return

        remote.model.removeFromParent()
        remote.nameElement?.remove()
        this.remotePlayers.delete(uuid)
    }

    clearRemotePlayers(updateHud = true)
    {
        for(const uuid of [ ...this.remotePlayers.keys() ])
            this.removeRemotePlayer(uuid)

        if(updateHud)
            this.updateHud()
    }

    buildLocalState()
    {
        const vehicle = this.game.physicalVehicle
        const player = this.game.player
        const visualVehicle = this.game.world?.visualVehicle
        const inputs = this.game.inputs.actions

        return {
            p: vehicle.position.toArray().map(value => Number(value.toFixed(3))),
            q: vehicle.quaternion.toArray().map(value => Number(value.toFixed(4))),
            v: vehicle.velocity.toArray().map(value => Number(value.toFixed(3))),
            s: Number(player.steering.toFixed(3)),
            a: Number(player.accelerating.toFixed(3)),
            b: player.braking > 0 ? 1 : 0,
            boost: player.boosting > 0 ? 1 : 0,
            l: inputs.get('left')?.active ? 1 : 0,
            r: inputs.get('right')?.active ? 1 : 0,
            body: visualVehicle?.bodyStyles?.current || 'h9',
            paint: this.game.achievements?.rewards?.current?.name || 'red',
            seq: ++this.sequence
        }
    }

    getRenderState(remote, renderTime)
    {
        const snapshots = remote.snapshots
        if(!snapshots.length)
            return null

        while(snapshots.length >= 3 && snapshots[1].ts <= renderTime)
            snapshots.shift()

        if(snapshots.length >= 2 && snapshots[0].ts <= renderTime && renderTime <= snapshots[1].ts)
        {
            const a = snapshots[0]
            const b = snapshots[1]
            const span = Math.max(1, b.ts - a.ts)
            const t = Math.max(0, Math.min(1, (renderTime - a.ts) / span))

            this.tempPosition.copy(a.position).lerp(b.position, t)
            this.tempQuaternion.copy(a.quaternion).slerp(b.quaternion, t)

            return {
                position: this.tempPosition,
                quaternion: this.tempQuaternion,
                velocity: a.velocity.clone().lerp(b.velocity, t),
                steering: THREE.MathUtils.lerp(a.steering, b.steering, t),
                accelerating: THREE.MathUtils.lerp(a.accelerating, b.accelerating, t),
                braking: t < 0.5 ? a.braking : b.braking,
                boosting: t < 0.5 ? a.boosting : b.boosting,
                left: t < 0.5 ? a.left : b.left,
                right: t < 0.5 ? a.right : b.right
            }
        }

        const latest = snapshots[snapshots.length - 1]
        const extrapolation = Math.max(0, Math.min(
            MAX_EXTRAPOLATION_SECONDS,
            (renderTime - latest.ts) / 1000
        ))

        this.tempPosition.copy(latest.position).addScaledVector(latest.velocity, extrapolation)
        this.tempQuaternion.copy(latest.quaternion)

        return {
            position: this.tempPosition,
            quaternion: this.tempQuaternion,
            velocity: latest.velocity,
            steering: latest.steering,
            accelerating: latest.accelerating,
            braking: latest.braking,
            boosting: latest.boosting,
            left: latest.left,
            right: latest.right
        }
    }

    updateRemoteNameTag(remote)
    {
        if(!remote.initialized)
        {
            remote.nameElement.hidden = true
            return
        }

        const camera = this.game.view.camera
        this.tempProjected.copy(remote.model.position)
        this.tempProjected.y += 2.15

        const distance = this.tempProjected.distanceTo(camera.position)
        this.tempCameraSpace.copy(this.tempProjected).applyMatrix4(camera.matrixWorldInverse)
        if(distance > MAX_NAME_TAG_DISTANCE || this.tempCameraSpace.z >= 0)
        {
            remote.nameElement.hidden = true
            return
        }

        this.tempProjected.project(camera)
        if(
            this.tempProjected.z < -1 || this.tempProjected.z > 1 ||
            Math.abs(this.tempProjected.x) > 1.15 ||
            Math.abs(this.tempProjected.y) > 1.15
        )
        {
            remote.nameElement.hidden = true
            return
        }

        const rect = this.game.domElement.getBoundingClientRect()
        const x = (this.tempProjected.x * 0.5 + 0.5) * rect.width
        const y = (-this.tempProjected.y * 0.5 + 0.5) * rect.height

        remote.nameElement.hidden = false
        remote.nameElement.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) translate(-50%, -115%)`
    }

    update()
    {
        if(!this.enabled)
            return

        const dt = Math.max(0, Math.min(this.game.ticker.delta, 0.1))

        if(this.game.server.connected)
        {
            this.sendAccumulator += dt
            if(this.sendAccumulator >= SEND_INTERVAL)
            {
                this.sendAccumulator %= SEND_INTERVAL
                this.game.server.send({
                    type: 'state',
                    state: this.buildLocalState()
                })
            }
        }

        const renderTime = Date.now() - INTERPOLATION_DELAY_MS
        const positionAlpha = 1 - Math.exp(-18 * dt)
        const rotationAlpha = 1 - Math.exp(-20 * dt)

        this.worldSync.update(dt)

        for(const remote of this.remotePlayers.values())
        {
            const state = this.getRenderState(remote, renderTime)
            if(!state)
            {
                this.updateRemoteNameTag(remote)
                continue
            }

            if(!remote.initialized || remote.model.position.distanceTo(state.position) > TELEPORT_DISTANCE)
            {
                remote.model.position.copy(state.position)
                remote.model.quaternion.copy(state.quaternion)
                remote.initialized = true
            }
            else
            {
                remote.model.position.lerp(state.position, positionAlpha)
                remote.model.quaternion.slerp(state.quaternion, rotationAlpha)
            }

            for(const frontWheel of remote.frontWheels)
            {
                const sideBase = Math.abs(frontWheel.baseRotationY) > Math.PI * 0.5 ? Math.PI : 0
                frontWheel.object.rotation.y = sideBase + state.steering * this.game.physicalVehicle.steeringAmplitude
            }

            const speed = state.velocity.length()
            const wheelRotation = speed * dt / this.game.physicalVehicle.wheels.settings.radius
            for(const wheel of remote.wheelCylinders)
                wheel.rotation.z += wheelRotation

            for(const light of remote.stopLights)
                light.visible = state.braking
            for(const light of remote.backLights)
                light.visible = state.accelerating < -0.05

            const blinkOn = Math.floor(Date.now() / 400) % 2 === 0
            for(const light of remote.blinkerLeft)
                light.visible = state.left && blinkOn
            for(const light of remote.blinkerRight)
                light.visible = state.right && blinkOn

            this.updateRemoteNameTag(remote)
        }
    }
}
