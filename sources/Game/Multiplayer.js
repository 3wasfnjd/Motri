import * as THREE from 'three/webgpu'
import { Game } from './Game.js'
import { VEHICLE_BODY_STYLES } from './World/VehicleBodyStyles.js'
import { WorldSync } from './WorldSync.js'
import { MultiplayerLobby } from './MultiplayerLobby.js'

const SEND_INTERVAL = 1 / 20
const INTERPOLATION_DELAY_MS = 55
const MAX_EXTRAPOLATION_SECONDS = 0.12
const MAX_SNAPSHOTS = 20
const TELEPORT_DISTANCE = 22
const MAX_NAME_LENGTH = 12
const MAX_NAME_TAG_DISTANCE = 75
const COLLISION_PREDICTION_SECONDS = 0.045
const COLLISION_POSITION_GAIN = 7.5
const COLLISION_MAX_CORRECTION_SPEED = 10
const COLLISION_ROTATION_GAIN = 10
const COLLISION_MAX_ANGULAR_SPEED = 7

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
        this.authorityUuid = null
        this.worldReady = false
        this.localName = this.resolveLocalName()
        this.selectedCar = this.resolveSelectedCar()
        this.selectedColor = this.resolveSelectedColor()
        this.remoteVehicleTemplate = null
        this.tempPosition = new THREE.Vector3()
        this.tempQuaternion = new THREE.Quaternion()
        this.tempProjected = new THREE.Vector3()
        this.tempCameraSpace = new THREE.Vector3()
        this.tempCollisionPosition = new THREE.Vector3()
        this.tempCollisionVelocity = new THREE.Vector3()
        this.tempCollisionError = new THREE.Vector3()
        this.tempHermite0 = new THREE.Vector3()
        this.tempHermite1 = new THREE.Vector3()
        this.tempHermite2 = new THREE.Vector3()
        this.tempHermite3 = new THREE.Vector3()
        this.tempRotationCurrent = new THREE.Quaternion()
        this.tempRotationError = new THREE.Quaternion()
        this.tempRotationInverse = new THREE.Quaternion()
        this.tempRotationAxis = new THREE.Vector3()

        this.prepareRemoteVehicleTemplate()
        this.worldSync = new WorldSync(this.game, this)
        this.setHud()

        if(this.enabled)
            this.lobby = new MultiplayerLobby(this.game, this)

        this.game.server.events.on('connected', () => this.onConnected())
        this.game.server.events.on('message', (message) => this.onMessage(message))
        this.game.server.events.on('disconnected', () => this.onDisconnected())

        this.game.achievements.events.on('rewardActiveChange', () =>
        {
            if(this.game.server.active)
                this.applyLocalAppearance()
        })

        this.game.ticker.events.on('tick', () => this.update(), 9)

        if(this.enabled && this.game.server.resumeRoom)
            this.game.server.start(this.game.server.resumeRoom)
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

    resolveSelectedCar()
    {
        let stored = ''
        try { stored = localStorage.getItem('motri.multiplayer.car') || '' }
        catch {}

        if(VEHICLE_BODY_STYLES.some(style => style.id === stored))
            return stored

        return this.game.world?.visualVehicle?.bodyStyles?.current || 'h9'
    }

    resolveSelectedColor()
    {
        const allowed = new Set([ 'red', 'orange', 'white', 'black' ])
        let stored = ''
        try { stored = localStorage.getItem('motri.multiplayer.color') || '' }
        catch {}

        return allowed.has(stored) ? stored : 'red'
    }

    setLocalName(value)
    {
        const name = cleanName(value) || this.localName || 'MOTRI'
        this.localName = name

        try { localStorage.setItem('multiplayerName', name) }
        catch {}

        this.updateHud()
        return name
    }

    setAppearance(car, paint)
    {
        if(!VEHICLE_BODY_STYLES.some(style => style.id === car))
            car = 'h9'

        const choices = this.game.world?.visualVehicle?.paints?.choices || {}
        if(![ 'red', 'orange', 'white', 'black' ].includes(paint) || !choices[paint])
            paint = 'red'

        this.selectedCar = car
        this.selectedColor = paint

        try
        {
            localStorage.setItem('motri.multiplayer.car', car)
            localStorage.setItem('motri.multiplayer.color', paint)
        }
        catch {}

        this.applyLocalAppearance()
        return { car, paint }
    }

    applyLocalAppearance()
    {
        const visualVehicle = this.game.world?.visualVehicle
        const material = visualVehicle?.paints?.choices?.[this.selectedColor]
        if(!visualVehicle || !material)
            return

        visualVehicle.paints.changeTo(this.selectedColor)
        visualVehicle.bodyStyles.setPaintMaterial(material)
        visualVehicle.bodyStyles.changeTo(this.selectedCar)
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

        const inRoom = this.game.server.active && !!this.game.server.room
        this.hud.hidden = !inRoom
        this.hud.classList.toggle('is-connected', this.game.server.connected)

        if(inRoom)
        {
            const count = Math.min(this.maxPlayers, 1 + this.peerIds.size)
            const leaderPrefix = this.isWorldAuthority() ? '👑 القائد · ' : ''
            const reconnecting = this.game.server.connected ? '' : ' · إعادة اتصال'
            this.hudStatus.textContent = `${leaderPrefix}${this.localName} · ${count}/${this.maxPlayers}${reconnecting}`
            this.hudRoom.textContent = `الغرفة: ${this.game.server.room}`
            this.hud.classList.toggle('is-leader', this.isWorldAuthority())
        }
        else
        {
            this.hudStatus.textContent = ''
            this.hudRoom.textContent = ''
            this.hud.classList.remove('is-leader')
        }

        this.lobby?.update()
    }

    prepareRemoteVehicleTemplate()
    {
        const visualVehicle = this.game.world?.visualVehicle
        const bodyStyles = visualVehicle?.bodyStyles
        const chassis = visualVehicle?.parts?.chassis
        const physicalVehicle = this.game.physicalVehicle
        if(!bodyStyles || !chassis || !physicalVehicle?.wheels?.items?.length)
            return

        const currentStyle = bodyStyles.current

        // Build every body once so the remote template can switch body styles
        // without touching the local vehicle or creating runtime geometry later.
        for(const style of VEHICLE_BODY_STYLES)
            bodyStyles.changeTo(style.id, false)

        bodyStyles.changeTo('h9', false)

        const template = chassis.clone(true)
        template.name = 'RemoteVehicleTemplate'
        template.removeFromParent()

        // The gameplay chassis contains the authored wheel template plus the four
        // runtime wheel clones. Copying the chassis directly duplicates all five
        // before their transforms are guaranteed to be final, which makes the
        // remote wheels overlap. Remove every wheel container and rebuild exactly
        // four remote wheels at the physics axle positions.
        const staleWheelContainers = []
        template.traverse((child) =>
        {
            if(/^wheelContainer/i.test(child.name))
                staleWheelContainers.push(child)
        })
        for(const wheel of staleWheelContainers)
            wheel.removeFromParent()

        const defaultSuspension = physicalVehicle.suspensionsHeights.low

        for(let i = 0; i < 4; i++)
        {
            const sourceWheel = visualVehicle.wheels.items[i]?.container
            const physicalWheel = physicalVehicle.wheels.items[i]
            if(!sourceWheel || !physicalWheel)
                continue

            const wheel = sourceWheel.clone(true)
            wheel.name = `RemoteWheelContainer${i}`
            wheel.userData = { ...wheel.userData, remoteWheelIndex: i }

            const suspensionLength = Number.isFinite(physicalWheel.suspensionLength)
                ? physicalWheel.suspensionLength
                : defaultSuspension
            const wheelY = Math.min(physicalWheel.basePosition.y - suspensionLength, -0.5)

            wheel.position.set(
                physicalWheel.basePosition.x,
                wheelY,
                physicalWheel.basePosition.z
            )
            wheel.rotation.set(0, i === 0 || i === 2 ? Math.PI : 0, 0)

            wheel.traverse((child) =>
            {
                if(/^wheelCylinder/i.test(child.name))
                    child.position.set(0, 0, 0)

                if(/^wheelSuspension/i.test(child.name))
                    child.scale.y = Math.max(0, Math.abs(wheelY) - 0.5)
            })

            template.add(wheel)
        }

        this.remoteVehicleTemplate = template
        bodyStyles.changeTo(currentStyle, false)
    }

    onConnected()
    {
        this.worldReady = false
        this.updateHud()

        this.applyLocalAppearance()

        this.game.server.send({
            type: 'hello',
            name: this.localName,
            body: this.selectedCar,
            paint: this.selectedColor
        })
    }

    onDisconnected()
    {
        this.worldReady = false

        if(!this.game.server.active)
        {
            this.peerIds.clear()
            this.authorityUuid = null
            this.clearRemotePlayers(false)
        }

        this.updateHud()
    }

    onMessage(message)
    {
        if(!message || typeof message !== 'object')
            return

        if(message.type === 'welcome')
        {
            if(this.lobby && !this.lobby.onWelcome(message))
                return

            if(Number.isFinite(message.maxPlayers))
                this.maxPlayers = Math.max(2, Math.min(12, Math.floor(message.maxPlayers)))

            this.authorityUuid = message.authorityUuid || this.game.server.sessionUuid
            this.worldReady = !message.snapshotSourceUuid

            if(Array.isArray(message.players))
            {
                const nextPeerIds = new Set()

                for(const player of message.players)
                {
                    if(!player?.uuid || player.uuid === this.game.server.sessionUuid)
                        continue

                    nextPeerIds.add(player.uuid)
                    if(player.state)
                        this.applyRemoteState(player.uuid, player.name, player.state)
                }

                for(const uuid of [ ...this.remotePlayers.keys() ])
                {
                    if(!nextPeerIds.has(uuid))
                        this.removeRemotePlayer(uuid)
                }

                this.peerIds = nextPeerIds
            }

            if(message.world)
                this.worldSync.applySnapshot(message.world)
            if(message.animals)
                this.worldSync.applyAnimals(message.animals)

            this.updateLeaderPresentation()
            this.updateHud()
            return
        }

        if(message.type === 'worldSnapshotStart')
        {
            this.worldReady = false
            return
        }

        if(message.type === 'worldSnapshotEnd')
        {
            this.worldReady = true
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
            if(message.authorityUuid)
                this.authorityUuid = message.authorityUuid

            this.updateLeaderPresentation()

            if(message.snapshotSourceUuid === this.game.server.sessionUuid)
                this.worldSync.sendFullSnapshot()

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

        if(message.type === 'roomFull')
        {
            this.lobby?.setStatus(`الغرفة ممتلئة (${message.maxPlayers || this.maxPlayers} لاعبين).`)
            this.game.server.stop(false)
            return
        }

        if(message.type === 'authority')
        {
            this.authorityUuid = message.uuid || this.game.server.sessionUuid
            this.updateLeaderPresentation()
            this.updateHud()
            return
        }

        if(message.type === 'leave' && message.uuid)
        {
            this.peerIds.delete(message.uuid)
            this.removeRemotePlayer(message.uuid)
            if(this.authorityUuid === message.uuid)
                this.authorityUuid = null
            this.updateLeaderPresentation()
            this.updateHud()
        }
    }

    updateLeaderPresentation()
    {
        const localIsLeader = this.isWorldAuthority()
        if(this.hud)
            this.hud.classList.toggle('is-leader', localIsLeader)

        for(const remote of this.remotePlayers.values())
        {
            const isLeader = !!this.authorityUuid && remote.uuid === this.authorityUuid
            remote.nameElement?.classList.toggle('is-leader', isLeader)
            if(remote.leaderElement)
                remote.leaderElement.hidden = !isLeader
        }
    }

    isWorldAuthority()
    {
        return !this.authorityUuid || this.authorityUuid === this.game.server.sessionUuid
    }

    getClosestVehicleState(target)
    {
        const localVehicle = this.game.physicalVehicle
        const localLinvel = localVehicle.chassis?.physical?.body?.linvel?.() || { x: 0, y: 0, z: 0 }
        let best = {
            position: localVehicle.position,
            velocity: new THREE.Vector3(localLinvel.x, localLinvel.y, localLinvel.z),
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
            remote.playerNameElement.textContent = cleanRemoteName
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
            right: !!state.r,
            wheelY: Array.isArray(state.wy) && state.wy.length === 4
                ? state.wy.map(value => Number.isFinite(value) ? value : -0.88)
                : [ -0.88, -0.88, -0.88, -0.88 ]
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

            this.updateRemoteCollisionBody(remote, dt)

            const speed = state.velocity.length()
            const wheelRotation = speed * dt / this.game.physicalVehicle.wheels.settings.radius

            for(let i = 0; i < remote.wheels.length; i++)
            {
                const wheel = remote.wheels[i]
                if(!wheel)
                    continue

                const steering = i < 2
                    ? state.steering * this.game.physicalVehicle.steeringAmplitude
                    : 0

                wheel.container.rotation.y = wheel.baseRotationY + steering

                const wheelY = Number.isFinite(state.wheelY?.[i])
                    ? state.wheelY[i]
                    : -0.88
                wheel.container.position.y = wheelY

                if(wheel.suspension)
                    wheel.suspension.scale.y = Math.max(0, Math.abs(wheelY) - 0.5)

                if(wheel.cylinder)
                    wheel.cylinder.rotation.z += wheelRotation * (i === 0 || i === 2 ? 1 : -1)
            }

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
            this.updateRemoteDirectionIndicator(remote, dt)
        }
    }
}
