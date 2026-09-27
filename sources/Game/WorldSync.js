import * as THREE from 'three/webgpu'

const OBJECT_SEND_INTERVAL = 1 / 8
const ANIMAL_SEND_INTERVAL = 1 / 6
const REMOTE_SUPPRESSION_MS = 900
const MAX_WORLD_CHANGES = 96

function n(value, digits = 3)
{
    return Number(Number(value || 0).toFixed(digits))
}

function vec3(value, digits = 3)
{
    return [ n(value.x, digits), n(value.y, digits), n(value.z, digits) ]
}

function quat(value)
{
    return [ n(value.x, 4), n(value.y, 4), n(value.z, 4), n(value.w, 4) ]
}

export class WorldSync
{
    constructor(game, multiplayer)
    {
        this.game = game
        this.multiplayer = multiplayer
        this.entries = new Map()
        this.lastSent = new Map()
        this.lastApplied = new Map()
        this.objectAccumulator = 0
        this.animalAccumulator = 0

        this.registerWorldObjects()
    }

    registerWorldObjects()
    {
        const world = this.game.world
        const addObjects = (prefix, objects = []) =>
        {
            objects.forEach((object, index) => this.registerObject(`${prefix}:${index}`, object))
        }

        addObjects('brick', world.bricks?.objects)
        addObjects('fence', world.fences?.objects)
        addObjects('bench', world.benches?.objects)
        addObjects('lantern', world.lanterns?.objects)

        for(const [ index, crate ] of (world.explosiveCrates?.items || []).entries())
            this.registerObject(`crate:${index}`, crate.object, { kind: 'crate', source: crate })

        for(const [ index, item ] of (world.camelCamp?.motion?.items || []).entries())
            this.registerObject(`camel:${index}`, item.object, { kind: 'camel', source: item })

        const bowling = world.areas?.bowling
        for(const [ index, pin ] of (bowling?.pins?.items || []).entries())
            this.registerObject(`bowling-pin:${index}`, pin.object)

        const ballObject = bowling?.ball?.body?.userData?.object
        if(ballObject)
            this.registerObject('bowling-ball:0', ballObject)

        if(bowling?.bumpers?.object)
            this.registerObject('bowling-bumpers:0', bowling.bumpers.object)

        addObjects('cookie', world.areas?.cookie?.cookies?.objects)
    }

    registerObject(id, object, meta = {})
    {
        const body = object?.physical?.body
        if(!body)
            return

        const entry = { id, object, body, meta }
        this.entries.set(id, entry)
        this.lastSent.set(id, this.signature(this.serializeEntry(entry)))
    }

    serializeEntry(entry)
    {
        const physical = entry.object.physical
        const body = entry.body
        return {
            id: entry.id,
            p: vec3(body.translation()),
            q: quat(body.rotation()),
            v: vec3(body.linvel()),
            w: vec3(body.angvel()),
            e: body.isEnabled() ? 1 : 0,
            sl: body.isSleeping() ? 1 : 0,
            t: physical.type === 'fixed' ? 'fixed' : physical.type === 'kinematicPositionBased' ? 'kinematic' : 'dynamic'
        }
    }

    signature(state)
    {
        return [
            ...state.p, ...state.q, ...state.v, ...state.w,
            state.e, state.sl, state.t
        ].join('|')
    }

    collectObjectChanges()
    {
        const now = Date.now()
        const changes = []

        for(const entry of this.entries.values())
        {
            if((this.lastApplied.get(entry.id) || 0) > now)
                continue

            const state = this.serializeEntry(entry)
            const signature = this.signature(state)
            if(signature === this.lastSent.get(entry.id))
                continue

            this.lastSent.set(entry.id, signature)
            changes.push(state)

            if(changes.length >= MAX_WORLD_CHANGES)
                break
        }

        return changes
    }

    sendFullSnapshot()
    {
        if(!this.game.server.connected)
            return

        const states = [ ...this.entries.values() ].map(entry => this.serializeEntry(entry))
        for(let i = 0; i < states.length; i += 48)
            this.game.server.send({ type: 'worldDelta', changes: states.slice(i, i + 48) })
    }

    sendAnimalsNow()
    {
        if(!this.game.server.connected)
            return

        this.game.server.send({
            type: 'animalState',
            animals: this.serializeAnimals()
        })
    }

    applySnapshot(snapshot)
    {
        if(!snapshot || typeof snapshot !== 'object')
            return

        const states = Array.isArray(snapshot) ? snapshot : Object.values(snapshot)
        for(const state of states)
            this.applyObjectState(state)
    }

    applyObjectState(state)
    {
        const entry = this.entries.get(state?.id)
        if(!entry || !Array.isArray(state.p) || !Array.isArray(state.q))
            return

        const timestamp = Number(state.ts) || Date.now()
        const currentTimestamp = this.lastApplied.get(entry.id + ':ts') || 0
        if(timestamp < currentTimestamp)
            return

        this.lastApplied.set(entry.id + ':ts', timestamp)
        this.lastApplied.set(entry.id, Date.now() + REMOTE_SUPPRESSION_MS)

        const { body, object, meta } = entry
        const enabled = !!state.e

        if(!enabled)
        {
            if(meta.kind === 'crate' && !meta.source.exploded)
            {
                meta.source.exploded = true
                const position = new THREE.Vector3().fromArray(state.p)
                this.game.world.fireballs?.create(position)
                const sounds = this.game.world.explosiveCrates?.sounds?.explosions
                if(sounds?.length)
                    sounds[Math.floor(Math.random() * sounds.length)].play(position)
            }

            if(body.isEnabled())
                this.game.objects.disable(object)

            this.lastSent.set(entry.id, this.signature({ ...state, t: state.t || object.physical.type }))
            return
        }

        if(!body.isEnabled())
            this.game.objects.enable(object)

        if(meta.kind === 'crate')
            meta.source.exploded = false

        if(state.t === 'dynamic' && object.physical.type !== 'dynamic')
        {
            body.setBodyType(this.game.RAPIER.RigidBodyType.Dynamic, true)
            body.recomputeMassPropertiesFromColliders()
            object.physical.type = 'dynamic'

            if(meta.kind === 'camel' && !meta.source.active)
            {
                meta.source.active = true
                this.game.world.camelCamp.motion.activeCount++
            }
        }
        else if(state.t === 'fixed' && object.physical.type !== 'fixed')
        {
            body.setBodyType(this.game.RAPIER.RigidBodyType.Fixed, true)
            object.physical.type = 'fixed'

            if(meta.kind === 'camel' && meta.source.active)
            {
                meta.source.active = false
                meta.source.remaining = 0
                this.game.world.camelCamp.motion.activeCount = Math.max(0, this.game.world.camelCamp.motion.activeCount - 1)
            }
        }

        body.setTranslation({ x: state.p[0], y: state.p[1], z: state.p[2] }, true)
        body.setRotation({ x: state.q[0], y: state.q[1], z: state.q[2], w: state.q[3] }, true)

        if(Array.isArray(state.v))
            body.setLinvel({ x: state.v[0], y: state.v[1], z: state.v[2] }, true)
        if(Array.isArray(state.w))
            body.setAngvel({ x: state.w[0], y: state.w[1], z: state.w[2] }, true)

        if(state.sl)
            body.sleep()

        object.needsUpdate = true
        if(object.visual?.object3D)
            object.visual.object3D.needsUpdate = true

        this.lastSent.set(entry.id, this.signature(this.serializeEntry(entry)))
    }

    serializeAnimals()
    {
        const sheep = this.game.world.sheepPen?.motion?.states?.map(s => [
            n(s.x), n(s.z), n(s.yaw, 4), n(s.speed), n(s.walkAmount),
            n(s.stride), n(s.graze), String(s.mode || 'idle')
        ]) || null

        const poultry = this.game.world.restHouse?.poultry?.motion?.birds?.map(b => [
            n(b.x), n(b.z), n(b.yaw, 4), n(b.speed), String(b.state || 'walk'),
            n(b.time), n(b.phase), b.alert ? 1 : 0, n(b.fear)
        ]) || null

        return {
            ts: Date.now(),
            sheep,
            poultry
        }
    }

    applyAnimals(payload)
    {
        if(!payload || this.multiplayer.isWorldAuthority())
            return

        const sheepPen = this.game.world.sheepPen
        if(Array.isArray(payload.sheep) && sheepPen?.motion?.states)
        {
            payload.sheep.forEach((data, index) =>
            {
                const s = sheepPen.motion.states[index]
                if(!s || !Array.isArray(data))
                    return

                s.x = Number(data[0]) || 0
                s.z = Number(data[1]) || 0
                s.yaw = Number(data[2]) || 0
                s.speed = Number(data[3]) || 0
                s.walkAmount = Number(data[4]) || 0
                s.stride = Number(data[5]) || 0
                s.graze = Number(data[6]) || 0
                s.mode = String(data[7] || 'idle')

                sheepPen.position.set(
                    sheepPen.root.position.x + s.x,
                    .60 * s.size,
                    sheepPen.root.position.z + s.z
                )
                sheepPen.rotation.setFromAxisAngle(sheepPen.up, s.yaw)
                sheepPen.sheepBodies[index]?.setNextKinematicTranslation(sheepPen.position)
                sheepPen.sheepBodies[index]?.setNextKinematicRotation(sheepPen.rotation)
            })

            sheepPen.flock.pose(sheepPen.motion.states, sheepPen.time)
        }

        const poultry = this.game.world.restHouse?.poultry
        if(Array.isArray(payload.poultry) && poultry?.motion?.birds)
        {
            payload.poultry.forEach((data, index) =>
            {
                const b = poultry.motion.birds[index]
                if(!b || !Array.isArray(data))
                    return

                b.x = Number(data[0]) || 0
                b.z = Number(data[1]) || 0
                b.yaw = Number(data[2]) || 0
                b.speed = Number(data[3]) || 0
                b.state = String(data[4] || 'walk')
                b.time = Number(data[5]) || 0
                b.phase = Number(data[6]) || 0
                b.alert = !!data[7]
                b.fear = Number(data[8]) || 0
            })

            poultry.model.pose()
        }
    }

    update(dt)
    {
        if(!this.multiplayer.enabled || !this.game.server.connected)
            return

        this.objectAccumulator += dt
        if(this.objectAccumulator >= OBJECT_SEND_INTERVAL)
        {
            this.objectAccumulator %= OBJECT_SEND_INTERVAL
            const changes = this.collectObjectChanges()
            if(changes.length)
                this.game.server.send({ type: 'worldDelta', changes })
        }

        if(this.multiplayer.isWorldAuthority())
        {
            this.animalAccumulator += dt
            if(this.animalAccumulator >= ANIMAL_SEND_INTERVAL)
            {
                this.animalAccumulator %= ANIMAL_SEND_INTERVAL
                this.game.server.send({
                    type: 'animalState',
                    animals: this.serializeAnimals()
                })
            }
        }
        else
        {
            this.animalAccumulator = 0
        }
    }
}
