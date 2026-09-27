import { DurableObject } from 'cloudflare:workers'

const MAX_PLAYERS = 6
const MIN_STATE_INTERVAL_MS = 40
const MAX_WORLD_CHANGES = 96
const WORLD_OWNER_MOVING_MS = 1600
const WORLD_OWNER_SLEEPING_MS = 1100
const VEHICLE_IMPACT_COOLDOWN_MS = 180
const VEHICLE_IMPACT_MAX = 11
const DISCONNECT_GRACE_MS = 10 * 60 * 1000
const PENDING_PREFIX = 'pending:'

function cleanName(value)
{
    const name = String(value || 'MOTRI').trim().slice(0, 18)
    return name || 'MOTRI'
}

function cleanBody(value)
{
    return [ 'h9', 'shas', 'datsun' ].includes(value) ? value : 'h9'
}

function cleanPaint(value)
{
    return [ 'red', 'orange', 'white', 'black' ].includes(value) ? value : 'red'
}

function cleanNumber(value, fallback = 0, min = -10000, max = 10000)
{
    const number = Number(value)
    if(!Number.isFinite(number))
        return fallback
    return Math.max(min, Math.min(max, number))
}

function cleanArray(value, length, fallback, min, max)
{
    if(!Array.isArray(value) || value.length !== length)
        return [ ...fallback ]

    return value.map((item, index) => cleanNumber(item, fallback[index], min, max))
}

function cleanImpulse(value)
{
    if(!Array.isArray(value) || value.length !== 3)
        return null

    const impulse = value.map(item => cleanNumber(item, 0, -VEHICLE_IMPACT_MAX, VEHICLE_IMPACT_MAX))
    const magnitude = Math.hypot(...impulse)
    if(magnitude < 0.05)
        return null

    if(magnitude > VEHICLE_IMPACT_MAX)
    {
        const scale = VEHICLE_IMPACT_MAX / magnitude
        return impulse.map(item => item * scale)
    }

    return impulse
}

function cleanState(value)
{
    if(!value || typeof value !== 'object')
        return null

    return {
        p: cleanArray(value.p, 3, [ 0, 1, 0 ], -2000, 2000),
        q: cleanArray(value.q, 4, [ 0, 0, 0, 1 ], -1.5, 1.5),
        v: cleanArray(value.v, 3, [ 0, 0, 0 ], -250, 250),
        s: cleanNumber(value.s, 0, -1, 1),
        a: cleanNumber(value.a, 0, -1, 1),
        b: value.b ? 1 : 0,
        boost: value.boost ? 1 : 0,
        l: value.l ? 1 : 0,
        r: value.r ? 1 : 0,
        body: cleanBody(value.body),
        paint: cleanPaint(value.paint),
        wy: cleanArray(value.wy, 4, [ -0.88, -0.88, -0.88, -0.88 ], -3, 1),
        seq: Math.max(0, Math.floor(cleanNumber(value.seq, 0, 0, Number.MAX_SAFE_INTEGER))),
        ts: Date.now()
    }
}

function cleanWorldChange(value)
{
    if(!value || typeof value !== 'object')
        return null

    const id = String(value.id || '').replace(/[^a-z0-9:_-]/gi, '').slice(0, 64)
    if(!id)
        return null

    return {
        id,
        p: cleanArray(value.p, 3, [ 0, 0, 0 ], -4000, 4000),
        q: cleanArray(value.q, 4, [ 0, 0, 0, 1 ], -1.5, 1.5),
        v: cleanArray(value.v, 3, [ 0, 0, 0 ], -500, 500),
        w: cleanArray(value.w, 3, [ 0, 0, 0 ], -100, 100),
        e: value.e ? 1 : 0,
        sl: value.sl ? 1 : 0,
        t: value.t === 'fixed' ? 'fixed' : value.t === 'kinematic' ? 'kinematic' : 'dynamic',
        ts: Date.now()
    }
}

function cleanSheepRows(value)
{
    if(!Array.isArray(value))
        return null

    return value.slice(0, 24).map(row =>
    {
        if(!Array.isArray(row) || row.length < 8)
            return null

        return [
            cleanNumber(row[0], 0, -100, 100),
            cleanNumber(row[1], 0, -100, 100),
            cleanNumber(row[2], 0, -10, 10),
            cleanNumber(row[3], 0, 0, 20),
            cleanNumber(row[4], 0, 0, 2),
            cleanNumber(row[5], 0, -100000, 100000),
            cleanNumber(row[6], 0, 0, 1),
            String(row[7] || 'idle').replace(/[^a-z_-]/gi, '').slice(0, 16) || 'idle'
        ]
    }).filter(Boolean)
}

function cleanPoultryRows(value)
{
    if(!Array.isArray(value))
        return null

    return value.slice(0, 24).map(row =>
    {
        if(!Array.isArray(row) || row.length < 9)
            return null

        return [
            cleanNumber(row[0], 0, -100, 100),
            cleanNumber(row[1], 0, -100, 100),
            cleanNumber(row[2], 0, -10, 10),
            cleanNumber(row[3], 0, 0, 20),
            String(row[4] || 'walk').replace(/[^a-z_-]/gi, '').slice(0, 16) || 'walk',
            cleanNumber(row[5], 0, -100000, 100000),
            cleanNumber(row[6], 0, -100000, 100000),
            row[7] ? 1 : 0,
            cleanNumber(row[8], 0, 0, 100)
        ]
    }).filter(Boolean)
}

function cleanAnimals(value)
{
    if(!value || typeof value !== 'object')
        return null

    return {
        ts: Date.now(),
        sheep: cleanSheepRows(value.sheep),
        poultry: cleanPoultryRows(value.poultry)
    }
}

function defaultAttachment()
{
    return {
        uuid: null,
        deviceUuid: null,
        name: 'MOTRI',
        body: 'h9',
        paint: 'red',
        state: null,
        lastStateAt: 0,
        joinedAt: null,
        explicitLeave: false,
        suppressClose: false
    }
}

export default {
    async fetch(request, env)
    {
        const url = new URL(request.url)
        const parts = url.pathname.split('/').filter(Boolean)

        if(parts[0] !== 'room')
            return new Response('Motri multiplayer server. Connect with /room/<room-id>.', { status: 200 })

        if(request.headers.get('Upgrade') !== 'websocket')
            return new Response('Expected WebSocket upgrade.', { status: 426 })

        const roomId = (parts[1] || 'public').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'public'
        return env.ROOMS.getByName(roomId).fetch(request)
    }
}

export class MotriRoom extends DurableObject
{
    constructor(ctx, env)
    {
        super(ctx, env)
        this.worldOwners = new Map()
        this.worldStates = new Map()
        this.vehicleImpactLastAt = new Map()
        this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
    }

    async fetch()
    {
        const pair = new WebSocketPair()
        const [ client, server ] = Object.values(pair)

        this.ctx.acceptWebSocket(server)
        server.serializeAttachment(defaultAttachment())

        return new Response(null, { status: 101, webSocket: client })
    }

    async webSocketMessage(ws, rawMessage)
    {
        if(typeof rawMessage !== 'string')
            return

        let message
        try
        {
            message = JSON.parse(rawMessage)
        }
        catch
        {
            return
        }

        const attachment = { ...defaultAttachment(), ...(ws.deserializeAttachment() || {}) }

        if(message.type === 'hello')
        {
            const uuid = String(message.uuid || '').slice(0, 64)
            const deviceUuid = String(message.deviceUuid || '').slice(0, 64)
            if(!uuid)
                return

            const legacyUuids = new Set()

            // One-time migration cleanup: builds before persistent device identity
            // can leave suspended/live ghosts with no deviceUuid. Modern clients
            // always provide deviceUuid, so these legacy records are safe to retire.
            for(const other of this.ctx.getWebSockets())
            {
                if(other === ws)
                    continue

                const otherAttachment = { ...defaultAttachment(), ...(other.deserializeAttachment() || {}) }
                if(!otherAttachment.uuid || otherAttachment.deviceUuid)
                    continue

                legacyUuids.add(otherAttachment.uuid)
                otherAttachment.suppressClose = true
                other.serializeAttachment(otherAttachment)
                try { other.close(4002, 'legacy session cleanup') } catch {}
            }

            const legacyPending = await this.ctx.storage.list({ prefix: PENDING_PREFIX })
            for(const [ key, record ] of legacyPending)
            {
                if(!record?.uuid || record.deviceUuid)
                    continue

                legacyUuids.add(record.uuid)
                await this.ctx.storage.delete(key)
            }

            for(const legacyUuid of legacyUuids)
                this.broadcast({ type: 'leave', uuid: legacyUuid }, ws)

            if(legacyUuids.size)
                await this.scheduleNextAlarm()

            const identityMatches = (value) =>
                value?.uuid === uuid ||
                (!!deviceUuid && value?.deviceUuid === deviceUuid)

            let resumed = null
            const removedUuids = new Set()
            const rememberResume = (value) =>
            {
                if(!value)
                    return

                const joinedAt = Number.isFinite(value.joinedAt)
                    ? value.joinedAt
                    : Number.MAX_SAFE_INTEGER

                if(!resumed || joinedAt < resumed.joinedAt)
                {
                    resumed = {
                        uuid: value.uuid,
                        deviceUuid: value.deviceUuid,
                        name: value.name,
                        body: cleanBody(value.body || value.state?.body),
                        paint: cleanPaint(value.paint || value.state?.paint),
                        state: value.state || null,
                        joinedAt
                    }
                    return
                }

                const stateTs = Number(value.state?.ts || 0)
                const resumedStateTs = Number(resumed.state?.ts || 0)
                if(stateTs > resumedStateTs)
                    resumed.state = value.state
            }

            // Collapse any older live socket belonging to this same logical player.
            for(const other of this.ctx.getWebSockets())
            {
                if(other === ws)
                    continue

                const otherAttachment = { ...defaultAttachment(), ...(other.deserializeAttachment() || {}) }
                if(!identityMatches(otherAttachment))
                    continue

                rememberResume(otherAttachment)
                if(otherAttachment.uuid && otherAttachment.uuid !== uuid)
                    removedUuids.add(otherAttachment.uuid)

                otherAttachment.suppressClose = true
                other.serializeAttachment(otherAttachment)
                try { other.close(4000, 'player replaced') } catch {}
            }

            // Collapse suspended records too. This also cleans ghosts created by
            // older builds that generated a new session UUID on every re-entry.
            const pendingEntries = await this.ctx.storage.list({ prefix: PENDING_PREFIX })
            for(const [ key, record ] of pendingEntries)
            {
                if(!identityMatches(record))
                    continue

                rememberResume(record)
                if(record?.uuid && record.uuid !== uuid)
                    removedUuids.add(record.uuid)

                await this.ctx.storage.delete(key)
            }

            for(const oldUuid of removedUuids)
                this.broadcast({ type: 'leave', uuid: oldUuid }, ws)

            // Count logical players, not sockets. One device can never consume
            // multiple room slots because of reconnects or stale browser sockets.
            const ownIdentity = deviceUuid || uuid
            const logicalMembers = new Set()

            for(const other of this.ctx.getWebSockets())
            {
                if(other === ws)
                    continue

                const otherAttachment = { ...defaultAttachment(), ...(other.deserializeAttachment() || {}) }
                if(!otherAttachment.uuid)
                    continue

                const identity = otherAttachment.deviceUuid || otherAttachment.uuid
                if(identity !== ownIdentity)
                    logicalMembers.add(identity)
            }

            const remainingPendingForCount = await this.ctx.storage.list({ prefix: PENDING_PREFIX })
            for(const record of remainingPendingForCount.values())
            {
                if(!record?.uuid)
                    continue

                const identity = record.deviceUuid || record.uuid
                if(identity !== ownIdentity)
                    logicalMembers.add(identity)
            }

            if(!resumed && logicalMembers.size >= MAX_PLAYERS)
            {
                ws.send(JSON.stringify({ type: 'roomFull', maxPlayers: MAX_PLAYERS }))
                attachment.suppressClose = true
                ws.serializeAttachment(attachment)
                try { ws.close(4001, 'room full') } catch {}
                return
            }

            attachment.uuid = uuid
            attachment.deviceUuid = deviceUuid || null
            attachment.name = cleanName(message.name)
            attachment.body = cleanBody(message.body)
            attachment.paint = cleanPaint(message.paint)
            attachment.joinedAt = Number.isFinite(resumed?.joinedAt) && resumed.joinedAt !== Number.MAX_SAFE_INTEGER
                ? resumed.joinedAt
                : Date.now()
            attachment.state = resumed?.state
                ? { ...resumed.state, body: attachment.body, paint: attachment.paint }
                : null
            attachment.explicitLeave = false
            attachment.suppressClose = false
            ws.serializeAttachment(attachment)

            const players = new Map()

            for(const other of this.ctx.getWebSockets())
            {
                if(other === ws)
                    continue

                const otherAttachment = { ...defaultAttachment(), ...(other.deserializeAttachment() || {}) }
                if(!otherAttachment.uuid)
                    continue

                const identity = otherAttachment.deviceUuid || otherAttachment.uuid
                players.set(identity, {
                    uuid: otherAttachment.uuid,
                    name: otherAttachment.name,
                    body: cleanBody(otherAttachment.body || otherAttachment.state?.body),
                    paint: cleanPaint(otherAttachment.paint || otherAttachment.state?.paint),
                    state: otherAttachment.state,
                    suspended: false
                })
            }

            const remainingPending = await this.ctx.storage.list({ prefix: PENDING_PREFIX })
            for(const record of remainingPending.values())
            {
                if(!record?.uuid)
                    continue

                const identity = record.deviceUuid || record.uuid
                if(!players.has(identity))
                {
                    players.set(identity, {
                        uuid: record.uuid,
                        name: record.name,
                        body: cleanBody(record.body || record.state?.body),
                        paint: cleanPaint(record.paint || record.state?.paint),
                        state: record.state,
                        suspended: true
                    })
                }
            }

            const authorityUuid = await this.getAuthorityUuid()
            const snapshotSourceUuid = this.getSnapshotSourceUuid(ws, authorityUuid)

            ws.send(JSON.stringify({
                type: 'welcome',
                uuid: attachment.uuid,
                maxPlayers: MAX_PLAYERS,
                authorityUuid,
                snapshotSourceUuid,
                resumed: !!resumed,
                players: [ ...players.values() ]
            }))

            this.broadcast({
                type: 'join',
                uuid: attachment.uuid,
                name: attachment.name,
                body: attachment.body,
                paint: attachment.paint,
                authorityUuid,
                snapshotSourceUuid,
                resumed: !!resumed
            }, ws)

            await this.scheduleNextAlarm()
            return
        }

        if(message.type === 'leaveRoom' && attachment.uuid)
        {
            attachment.explicitLeave = true
            ws.serializeAttachment(attachment)

            await this.ctx.storage.delete(`${PENDING_PREFIX}${attachment.uuid}`)
            this.broadcast({ type: 'leave', uuid: attachment.uuid }, ws)

            const authorityUuid = await this.getAuthorityUuid(attachment.uuid)
            this.broadcast({ type: 'authority', uuid: authorityUuid }, ws)

            await this.scheduleNextAlarm()
            try { ws.close(1000, 'left room') } catch {}
            return
        }

        if(message.type === 'state' && attachment.uuid)
        {
            const now = Date.now()
            if(now - attachment.lastStateAt < MIN_STATE_INTERVAL_MS)
                return

            const state = cleanState(message.state)
            if(!state)
                return

            state.body = attachment.body
            state.paint = attachment.paint
            attachment.state = state
            attachment.lastStateAt = now
            ws.serializeAttachment(attachment)

            this.broadcast({
                type: 'state',
                uuid: attachment.uuid,
                name: attachment.name,
                state
            }, ws)
            return
        }

        if(message.type === 'vehicleImpact' && attachment.uuid)
        {
            const targetUuid = String(message.targetUuid || '').slice(0, 64)
            if(!targetUuid || targetUuid === attachment.uuid)
                return

            const impulse = cleanImpulse(message.impulse)
            if(!impulse)
                return

            const now = Date.now()
            const pairKey = `${attachment.uuid}>${targetUuid}`
            const lastAt = this.vehicleImpactLastAt.get(pairKey) || 0
            if(now - lastAt < VEHICLE_IMPACT_COOLDOWN_MS)
                return

            let targetSocket = null
            for(const other of this.ctx.getWebSockets())
            {
                const otherAttachment = other.deserializeAttachment()
                if(otherAttachment?.uuid === targetUuid)
                {
                    targetSocket = other
                    break
                }
            }

            if(!targetSocket)
                return

            this.vehicleImpactLastAt.set(pairKey, now)

            try
            {
                targetSocket.send(JSON.stringify({
                    type: 'vehicleImpact',
                    sourceUuid: attachment.uuid,
                    targetUuid,
                    impulse
                }))
            }
            catch {}

            return
        }

        if(
            (message.type === 'worldSnapshotStart' || message.type === 'worldSnapshotEnd') &&
            attachment.uuid
        )
        {
            this.broadcast({ type: message.type, uuid: attachment.uuid }, ws)
            return
        }

        if(message.type === 'worldDelta' && attachment.uuid)
        {
            const incoming = (Array.isArray(message.changes) ? message.changes : [])
                .slice(0, MAX_WORLD_CHANGES)
                .map(cleanWorldChange)
                .filter(Boolean)

            if(!incoming.length)
                return

            const now = Date.now()
            const accepted = []
            const corrections = []

            for(const change of incoming)
            {
                const owner = this.worldOwners.get(change.id)

                if(
                    owner &&
                    owner.uuid !== attachment.uuid &&
                    owner.until > now
                )
                {
                    const canonical = this.worldStates.get(change.id)
                    if(canonical)
                        corrections.push(canonical)
                    continue
                }

                const motion =
                    Math.abs(change.v[0]) + Math.abs(change.v[1]) + Math.abs(change.v[2]) +
                    Math.abs(change.w[0]) + Math.abs(change.w[1]) + Math.abs(change.w[2])
                const moving = !change.sl || motion > 0.015
                const lease = moving ? WORLD_OWNER_MOVING_MS : WORLD_OWNER_SLEEPING_MS

                this.worldOwners.set(change.id, {
                    uuid: attachment.uuid,
                    until: now + lease
                })
                this.worldStates.set(change.id, change)
                accepted.push(change)
            }

            if(corrections.length)
            {
                try
                {
                    ws.send(JSON.stringify({
                        type: 'worldDelta',
                        uuid: 'server',
                        changes: corrections
                    }))
                }
                catch {}
            }

            if(accepted.length)
            {
                this.broadcast({
                    type: 'worldDelta',
                    uuid: attachment.uuid,
                    changes: accepted
                }, ws)
            }
            return
        }

        if(message.type === 'animalState' && attachment.uuid)
        {
            const animals = cleanAnimals(message.animals)
            if(!animals)
                return

            this.broadcast({
                type: 'animalState',
                uuid: attachment.uuid,
                animals
            }, ws)
        }
    }

    async webSocketClose(ws, code, reason)
    {
        const attachment = { ...defaultAttachment(), ...(ws.deserializeAttachment() || {}) }
        const explicitByClose = code === 1000 && reason === 'left room'

        if(attachment?.uuid && explicitByClose && !attachment.explicitLeave)
        {
            await this.ctx.storage.delete(`${PENDING_PREFIX}${attachment.uuid}`)
            this.broadcast({ type: 'leave', uuid: attachment.uuid }, ws)
            const authorityUuid = await this.getAuthorityUuid(attachment.uuid)
            this.broadcast({ type: 'authority', uuid: authorityUuid }, ws)
            await this.scheduleNextAlarm()
        }
        else if(
            attachment?.uuid &&
            !attachment.explicitLeave &&
            !attachment.suppressClose
        )
        {
            await this.deferDisconnect(attachment)
        }

        try { ws.close(1000, 'closed') } catch {}
    }

    async webSocketError(ws)
    {
        const attachment = { ...defaultAttachment(), ...(ws.deserializeAttachment() || {}) }

        if(
            attachment?.uuid &&
            !attachment.explicitLeave &&
            !attachment.suppressClose
        )
            await this.deferDisconnect(attachment)

        try { ws.close(1011, 'error') } catch {}
    }

    async deferDisconnect(attachment)
    {
        const record = {
            uuid: attachment.uuid,
            deviceUuid: attachment.deviceUuid || null,
            name: attachment.name,
            body: attachment.body,
            paint: attachment.paint,
            state: attachment.state,
            joinedAt: Number.isFinite(attachment.joinedAt) ? attachment.joinedAt : Date.now(),
            expiresAt: Date.now() + DISCONNECT_GRACE_MS
        }

        await this.ctx.storage.put(`${PENDING_PREFIX}${attachment.uuid}`, record)
        await this.scheduleNextAlarm()
        // Intentionally no leave/authority event here: backgrounding is not logout.
    }

    async alarm()
    {
        const now = Date.now()
        const pending = await this.ctx.storage.list({ prefix: PENDING_PREFIX })
        let expiredAny = false

        for(const [ key, record ] of pending)
        {
            if(!record?.uuid || Number(record.expiresAt || 0) > now)
                continue

            expiredAny = true
            await this.ctx.storage.delete(key)
            this.broadcast({ type: 'leave', uuid: record.uuid })
        }

        if(expiredAny)
        {
            const authorityUuid = await this.getAuthorityUuid()
            this.broadcast({ type: 'authority', uuid: authorityUuid })
        }

        await this.scheduleNextAlarm()
    }

    async scheduleNextAlarm()
    {
        const pending = await this.ctx.storage.list({ prefix: PENDING_PREFIX })
        let next = Infinity

        for(const record of pending.values())
        {
            const expiresAt = Number(record?.expiresAt || 0)
            if(expiresAt > 0)
                next = Math.min(next, expiresAt)
        }

        if(Number.isFinite(next))
            await this.ctx.storage.setAlarm(Math.max(Date.now() + 1000, next))
        else
            await this.ctx.storage.deleteAlarm()
    }

    async getAuthorityUuid(exceptUuid = null)
    {
        let leader = null
        const consider = (uuid, joinedAt) =>
        {
            if(!uuid || uuid === exceptUuid)
                return

            const at = Number.isFinite(joinedAt) ? joinedAt : Number.MAX_SAFE_INTEGER
            if(
                !leader ||
                at < leader.joinedAt ||
                (at === leader.joinedAt && uuid < leader.uuid)
            )
                leader = { uuid, joinedAt: at }
        }

        for(const socket of this.ctx.getWebSockets())
        {
            const attachment = socket.deserializeAttachment()
            consider(attachment?.uuid, attachment?.joinedAt)
        }

        const pending = await this.ctx.storage.list({ prefix: PENDING_PREFIX })
        for(const record of pending.values())
            consider(record?.uuid, record?.joinedAt)

        return leader?.uuid || null
    }

    getSnapshotSourceUuid(exceptSocket, authorityUuid)
    {
        let fallback = null

        for(const socket of this.ctx.getWebSockets())
        {
            if(socket === exceptSocket)
                continue

            const attachment = socket.deserializeAttachment()
            if(!attachment?.uuid)
                continue

            if(attachment.uuid === authorityUuid)
                return attachment.uuid

            const joinedAt = Number.isFinite(attachment.joinedAt)
                ? attachment.joinedAt
                : Number.MAX_SAFE_INTEGER

            if(!fallback || joinedAt < fallback.joinedAt)
                fallback = { uuid: attachment.uuid, joinedAt }
        }

        return fallback?.uuid || null
    }

    broadcast(message, except = null)
    {
        const encoded = JSON.stringify(message)
        for(const socket of this.ctx.getWebSockets())
        {
            if(socket === except)
                continue

            try { socket.send(encoded) } catch {}
        }
    }
}
