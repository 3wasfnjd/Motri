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

            if(remote.physical?.body)
            {
                remote.physical.body.setTranslation({
                    x: snapshot.position.x,
                    y: snapshot.position.y,
                    z: snapshot.position.z
                }, true)
                remote.physical.body.setRotation({
                    x: snapshot.quaternion.x,
                    y: snapshot.quaternion.y,
                    z: snapshot.quaternion.z,
                    w: snapshot.quaternion.w
                }, true)
                remote.physical.body.setEnabled(true)
            }

            remote.initialized = true
        }
    }


    createRemoteCollisionBody(uuid)
    {
        const physical = this.game.physics.getPhysical({
            type: 'kinematicVelocityBased',
            position: { x: 0, y: -1000, z: 0 },
            enabled: false,
            canSleep: false,
            friction: 0.42,
            restitution: 0.08,
            linearDamping: 0,
            angularDamping: 0,
            waterGravityMultiplier: 0,
            colliders: [
                {
                    shape: 'cuboid',
                    parameters: [ 1.3, 0.4, 0.85 ],
                    position: { x: 0, y: -0.1, z: 0 },
                    category: 'remoteVehicle'
                },
                {
                    shape: 'cuboid',
                    parameters: [ 0.5, 0.15, 0.65 ],
                    position: { x: 0, y: 0.4, z: 0 },
                    category: 'remoteVehicle'
                }
            ]
        })

        physical.body.userData = {
            multiplayerRemoteUuid: uuid
        }

        return physical
    }

    destroyRemoteCollisionBody(remote)
    {
        const physical = remote?.physical
        if(!physical)
            return

        const index = this.game.physics.physicals.indexOf(physical)
        if(index !== -1)
            this.game.physics.physicals.splice(index, 1)

        try
        {
            this.game.physics.world.removeRigidBody(physical.body)
        }
        catch {}

        remote.physical = null
    }

    updateRemoteCollisionBody(remote)
    {
        const body = remote?.physical?.body
        const latest = remote?.snapshots?.[remote.snapshots.length - 1]
        if(!body || !latest)
            return

        if(!body.isEnabled())
            body.setEnabled(true)

        this.tempCollisionPosition
            .copy(latest.position)
            .addScaledVector(latest.velocity, COLLISION_PREDICTION_SECONDS)

        const currentPosition = body.translation()
        this.tempCollisionError.set(
            this.tempCollisionPosition.x - currentPosition.x,
            this.tempCollisionPosition.y - currentPosition.y,
            this.tempCollisionPosition.z - currentPosition.z
        )

        const errorDistance = this.tempCollisionError.length()

        if(errorDistance > 4.5)
        {
            body.setTranslation({
                x: this.tempCollisionPosition.x,
                y: this.tempCollisionPosition.y,
                z: this.tempCollisionPosition.z
            }, true)
            body.setRotation({
                x: latest.quaternion.x,
                y: latest.quaternion.y,
                z: latest.quaternion.z,
                w: latest.quaternion.w
            }, true)
            body.setLinvel({
                x: latest.velocity.x,
                y: latest.velocity.y,
                z: latest.velocity.z
            }, true)
            body.setAngvel({ x: 0, y: 0, z: 0 }, true)
            return
        }

        this.tempCollisionVelocity
            .copy(latest.velocity)

        const correction = this.tempCollisionError.clone()
            .multiplyScalar(COLLISION_POSITION_GAIN)

        if(correction.length() > COLLISION_MAX_CORRECTION_SPEED)
            correction.setLength(COLLISION_MAX_CORRECTION_SPEED)

        this.tempCollisionVelocity.add(correction)

        body.setLinvel({
            x: this.tempCollisionVelocity.x,
            y: this.tempCollisionVelocity.y,
            z: this.tempCollisionVelocity.z
        }, true)

        const currentRotation = body.rotation()
        this.tempRotationCurrent.set(
            currentRotation.x,
            currentRotation.y,
            currentRotation.z,
            currentRotation.w
        ).normalize()

        this.tempRotationInverse
            .copy(this.tempRotationCurrent)
            .invert()

        this.tempRotationError
            .copy(latest.quaternion)
            .multiply(this.tempRotationInverse)
            .normalize()

        if(this.tempRotationError.w < 0)
        {
            this.tempRotationError.set(
                -this.tempRotationError.x,
                -this.tempRotationError.y,
                -this.tempRotationError.z,
                -this.tempRotationError.w
            )
        }

        const angle = 2 * Math.acos(
            THREE.MathUtils.clamp(this.tempRotationError.w, -1, 1)
        )
        const sinHalf = Math.sqrt(
            Math.max(0, 1 - this.tempRotationError.w * this.tempRotationError.w)
        )

        if(angle > 0.0005 && sinHalf > 0.0001)
        {
            this.tempRotationAxis.set(
                this.tempRotationError.x / sinHalf,
                this.tempRotationError.y / sinHalf,
                this.tempRotationError.z / sinHalf
            )

            const angularSpeed = Math.min(
                COLLISION_MAX_ANGULAR_SPEED,
                angle * COLLISION_ROTATION_GAIN
            )

            this.tempRotationAxis.multiplyScalar(angularSpeed)
            body.setAngvel({
                x: this.tempRotationAxis.x,
                y: this.tempRotationAxis.y,
                z: this.tempRotationAxis.z
            }, true)
        }
        else
        {
            body.setAngvel({ x: 0, y: 0, z: 0 }, true)
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
            paintMaterials: new Map(),
            physical: this.createRemoteCollisionBody(uuid),
            h9Parts: [],
            styleGroups: new Map(),
            bodyPainted: null,
            stylePainted: [],
            wheelPainted: [],
            wheels: [],
            stopLights: [],
            backLights: [],
            blinkerLeft: [],
            blinkerRight: [],
            directionIndicator: null,
            directionArrow: null,
            directionLabel: null,
            indicatorX: 0,
            indicatorY: 0,
            indicatorAngle: 0,
            indicatorReady: false
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

            if(/_BodyPaint$/i.test(child.name))
                remote.stylePainted.push(child)

            if(/^wheelPainted/i.test(child.name))
                remote.wheelPainted.push(child)

            if(Number.isInteger(child.userData?.remoteWheelIndex))
            {
                const index = child.userData.remoteWheelIndex
                remote.wheels[index] = {
                    index,
                    container: child,
                    baseRotationY: index === 0 || index === 2 ? Math.PI : 0,
                    cylinder: null,
                    suspension: null
                }

                child.traverse((part) =>
                {
                    if(/^wheelCylinder/i.test(part.name))
                        remote.wheels[index].cylinder = part
                    else if(/^wheelSuspension/i.test(part.name))
                        remote.wheels[index].suspension = part
                })
            }

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
        nameElement.hidden = true

        const leaderElement = document.createElement('span')
        leaderElement.className = 'multiplayer-leader-badge'
        leaderElement.textContent = '👑 القائد'

        const playerNameElement = document.createElement('span')
        playerNameElement.className = 'multiplayer-player-name'
        playerNameElement.textContent = remote.name

        nameElement.append(leaderElement, playerNameElement)
        this.game.domElement.append(nameElement)
        remote.nameElement = nameElement
        remote.leaderElement = leaderElement
        remote.playerNameElement = playerNameElement

        const directionIndicator = document.createElement('div')
        directionIndicator.className = 'multiplayer-direction-indicator'
        directionIndicator.hidden = true

        const directionArrow = document.createElement('span')
        directionArrow.className = 'multiplayer-direction-arrow'
        directionArrow.textContent = '▲'

        const directionLabel = document.createElement('span')
        directionLabel.className = 'multiplayer-direction-label'

        directionIndicator.append(directionArrow, directionLabel)
        this.game.domElement.append(directionIndicator)

        remote.directionIndicator = directionIndicator
        remote.directionArrow = directionArrow
        remote.directionLabel = directionLabel

        this.game.scene.add(model)
        this.remotePlayers.set(uuid, remote)
        this.updateLeaderPresentation()
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

        const normalizedName = choices[paintName] ? paintName : 'red'
        if(remote.paint === normalizedName)
            return

        let material = remote.paintMaterials.get(normalizedName)
        if(!material)
        {
            const source = choices[normalizedName] || choices.red
            material = source.clone()
            material.name = `Remote_${remote.uuid}_${normalizedName}`
            remote.paintMaterials.set(normalizedName, material)
        }

        if(remote.bodyPainted && !remote.bodyPainted.userData.fixedPaint)
            remote.bodyPainted.material = material

        for(const bodyPaint of remote.stylePainted)
            bodyPaint.material = material

        for(const wheel of remote.wheelPainted)
            wheel.material = material

        remote.paint = normalizedName
    }

    removeRemotePlayer(uuid)
    {
        const remote = this.remotePlayers.get(uuid)
        if(!remote)
            return

        this.destroyRemoteCollisionBody(remote)
        remote.model.removeFromParent()
        remote.nameElement?.remove()
        remote.directionIndicator?.remove()

        for(const material of remote.paintMaterials?.values?.() || [])
            material.dispose()

        remote.paintMaterials?.clear?.()
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

        const rapierVelocity = vehicle.chassis?.physical?.body?.linvel?.() || { x: 0, y: 0, z: 0 }

        return {
            p: vehicle.position.toArray().map(value => Number(value.toFixed(3))),
            q: vehicle.quaternion.toArray().map(value => Number(value.toFixed(4))),
            v: [ rapierVelocity.x, rapierVelocity.y, rapierVelocity.z ]
                .map(value => Number(value.toFixed(3))),
            s: Number(player.steering.toFixed(3)),
            a: Number(player.accelerating.toFixed(3)),
            b: player.braking > 0 ? 1 : 0,
            boost: player.boosting > 0 ? 1 : 0,
            l: inputs.get('left')?.active ? 1 : 0,
            r: inputs.get('right')?.active ? 1 : 0,
            body: visualVehicle?.bodyStyles?.current || this.selectedCar || 'h9',
            paint: this.selectedColor || 'red',
            wy: visualVehicle?.wheels?.items?.map(wheel =>
                Number((wheel.container?.position?.y ?? -0.88).toFixed(3))
            ) || [ -0.88, -0.88, -0.88, -0.88 ],
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

            const seconds = span / 1000
            const t2 = t * t
            const t3 = t2 * t
            const h00 = 2 * t3 - 3 * t2 + 1
            const h10 = t3 - 2 * t2 + t
            const h01 = -2 * t3 + 3 * t2
            const h11 = t3 - t2

            this.tempPosition
                .copy(a.position)
                .multiplyScalar(h00)
                .add(this.tempHermite0.copy(a.velocity).multiplyScalar(h10 * seconds))
                .add(this.tempHermite1.copy(b.position).multiplyScalar(h01))
                .add(this.tempHermite2.copy(b.velocity).multiplyScalar(h11 * seconds))

            this.tempQuaternion.copy(a.quaternion).slerp(b.quaternion, t)

            return {
                position: this.tempPosition,
                quaternion: this.tempQuaternion,
                velocity: this.tempHermite3.copy(a.velocity).lerp(b.velocity, t),
                steering: THREE.MathUtils.lerp(a.steering, b.steering, t),
                accelerating: THREE.MathUtils.lerp(a.accelerating, b.accelerating, t),
                braking: t < 0.5 ? a.braking : b.braking,
                boosting: t < 0.5 ? a.boosting : b.boosting,
                left: t < 0.5 ? a.left : b.left,
                right: t < 0.5 ? a.right : b.right,
                wheelY: a.wheelY.map((value, index) =>
                    THREE.MathUtils.lerp(value, b.wheelY[index], t)
                )
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
            right: latest.right,
            wheelY: latest.wheelY
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

    updateRemoteDirectionIndicator(remote, dt)
    {
        const indicator = remote.directionIndicator
        if(!indicator || !remote.initialized || !this.game.server.active)
        {
            if(indicator)
                indicator.hidden = true
            remote.indicatorReady = false
            return
        }

        const camera = this.game.view.camera

        this.tempCameraSpace
            .copy(remote.model.position)
            .applyMatrix4(camera.matrixWorldInverse)

        this.tempProjected
            .copy(remote.model.position)
            .project(camera)

        const behind = this.tempCameraSpace.z >= -0.05
        const onScreen =
            !behind &&
            this.tempProjected.z >= -1 &&
            this.tempProjected.z <= 1 &&
            Math.abs(this.tempProjected.x) < 0.86 &&
            Math.abs(this.tempProjected.y) < 0.80

        if(onScreen)
        {
            indicator.hidden = true
            remote.indicatorReady = false
            return
        }

        let dx = Number.isFinite(this.tempProjected.x)
            ? this.tempProjected.x
            : 0
        let dy = Number.isFinite(this.tempProjected.y)
            ? -this.tempProjected.y
            : 0

        if(behind)
        {
            dx = -dx
            dy = -dy
        }

        if(Math.abs(dx) + Math.abs(dy) < 0.001)
        {
            dx = this.tempCameraSpace.x
            dy = behind ? 1 : -1
        }

        const length = Math.hypot(dx, dy) || 1
        dx /= length
        dy /= length

        const rect = this.game.domElement.getBoundingClientRect()
        const halfWidth = rect.width * 0.5
        const halfHeight = rect.height * 0.5
        const safeX = Math.max(28, halfWidth - 42)
        const safeY = Math.max(28, halfHeight - 54)

        const edgeScale = Math.min(
            safeX / Math.max(0.001, Math.abs(dx)),
            safeY / Math.max(0.001, Math.abs(dy))
        )

        const targetX = halfWidth + dx * edgeScale
        const targetY = halfHeight + dy * edgeScale
        const targetAngle = Math.atan2(dx, -dy)

        if(!remote.indicatorReady)
        {
            remote.indicatorX = targetX
            remote.indicatorY = targetY
            remote.indicatorAngle = targetAngle
            remote.indicatorReady = true
        }
        else
        {
            const positionAlpha = 1 - Math.exp(-10 * dt)
            const rotationAlpha = 1 - Math.exp(-12 * dt)

            remote.indicatorX = THREE.MathUtils.lerp(
                remote.indicatorX,
                targetX,
                positionAlpha
            )
            remote.indicatorY = THREE.MathUtils.lerp(
                remote.indicatorY,
                targetY,
                positionAlpha
            )

            const deltaAngle = Math.atan2(
                Math.sin(targetAngle - remote.indicatorAngle),
                Math.cos(targetAngle - remote.indicatorAngle)
            )
            remote.indicatorAngle += deltaAngle * rotationAlpha
        }

        const distance = Math.round(
            this.game.physicalVehicle.position.distanceTo(remote.model.position)
        )
        const leader = this.authorityUuid === remote.uuid ? '👑 ' : ''

        indicator.hidden = false
        indicator.style.transform =
            `translate3d(${remote.indicatorX.toFixed(1)}px, ${remote.indicatorY.toFixed(1)}px, 0) translate(-50%, -50%)`
        remote.directionArrow.style.transform =
            `rotate(${remote.indicatorAngle.toFixed(3)}rad)`
        remote.directionLabel.textContent =
            `${leader}${remote.name} · ${distance}م`
        indicator.classList.toggle(
            'is-leader',
            this.authorityUuid === remote.uuid
        )
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
        const positionAlpha = 1 - Math.exp(-26 * dt)
        const rotationAlpha = 1 - Math.exp(-28 * dt)

        this.worldSync.update(dt)

        for(const remote of this.remotePlayers.values())
        {
            const state = this.getRenderState(remote, renderTime)
            if(!state)
            {
                this.updateRemoteNameTag(remote)
                this.updateRemoteDirectionIndicator(remote, dt)
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

            this.updateRemoteCollisionBody(remote)

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
