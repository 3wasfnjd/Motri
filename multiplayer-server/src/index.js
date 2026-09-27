import { DurableObject } from 'cloudflare:workers'

const MAX_PLAYERS = 6
const MIN_STATE_INTERVAL_MS = 40
const MAX_WORLD_CHANGES = 96

function cleanName(value)
{
    const name = String(value || 'MOTRI').trim().slice(0, 18)
    return name || 'MOTRI'
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
        body: [ 'h9', 'shas', 'datsun' ].includes(value.body) ? value.body : 'h9',
        paint: String(value.paint || 'red').replace(/[^a-z0-9_-]/gi, '').slice(0, 24) || 'red',
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

function cleanAnimalRows(value, expectedLength, maxRows)
{
    if(!Array.isArray(value))
        return null

    return value.slice(0, maxRows).map(row =>
    {
        if(!Array.isArray(row) || row.length < expectedLength)
            return null

        return row.slice(0, expectedLength).map((item, index) =>
        {
            if(index === expectedLength - 1 && typeof item === 'string')
                return item.replace(/[^a-z_-]/gi, '').slice(0, 16)
            return cleanNumber(item, 0, -10000, 10000)
        })
    }).filter(Boolean)
}

function cleanAnimals(value)
{
    if(!value || typeof value !== 'object')
        return null

    return {
        ts: Date.now(),
        sheep: cleanAnimalRows(value.sheep, 8, 24),
        poultry: cleanAnimalRows(value.poultry, 9, 24)
    }
}

function defaultAttachment()
{
    return {
        uuid: null,
        name: 'MOTRI',
        state: null,
        lastStateAt: 0
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
        this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
    }

    async fetch()
    {
        if(this.ctx.getWebSockets().length >= MAX_PLAYERS)
            return new Response('Room full.', { status: 503 })

        const pair = new WebSocketPair()
        const [ client, server ] = Object.values(pair)

        this.ctx.acceptWebSocket(server)
        server.serializeAttachment(defaultAttachment())

        return new Response(null, { status: 101, webSocket: client })
    }

    webSocketMessage(ws, rawMessage)
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
            if(!uuid)
                return

            attachment.uuid = uuid
            attachment.name = cleanName(message.name)
            ws.serializeAttachment(attachment)

            const players = []
            for(const other of this.ctx.getWebSockets())
            {
                if(other === ws)
                    continue

                const otherAttachment = { ...defaultAttachment(), ...(other.deserializeAttachment() || {}) }
                if(otherAttachment.uuid)
                {
                    players.push({
                        uuid: otherAttachment.uuid,
                        name: otherAttachment.name,
                        state: otherAttachment.state
                    })
                }
            }

            ws.send(JSON.stringify({
                type: 'welcome',
                uuid: attachment.uuid,
                maxPlayers: MAX_PLAYERS,
                players
            }))

            this.broadcast({
                type: 'join',
                uuid: attachment.uuid,
                name: attachment.name
            }, ws)
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

        if(message.type === 'worldDelta' && attachment.uuid)
        {
            const changes = (Array.isArray(message.changes) ? message.changes : [])
                .slice(0, MAX_WORLD_CHANGES)
                .map(cleanWorldChange)
                .filter(Boolean)

            if(!changes.length)
                return

            this.broadcast({
                type: 'worldDelta',
                uuid: attachment.uuid,
                changes
            }, ws)
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

    webSocketClose(ws)
    {
        const attachment = ws.deserializeAttachment()
        if(attachment?.uuid)
            this.broadcast({ type: 'leave', uuid: attachment.uuid }, ws)

        try { ws.close(1000, 'closed') } catch {}
    }

    webSocketError(ws)
    {
        const attachment = ws.deserializeAttachment()
        if(attachment?.uuid)
            this.broadcast({ type: 'leave', uuid: attachment.uuid }, ws)

        try { ws.close(1011, 'error') } catch {}
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
