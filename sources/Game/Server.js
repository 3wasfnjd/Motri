import msgpack from 'msgpack-lite'
import { v4 as uuidv4 } from 'uuid'
import { Events } from './Events.js'
import { Game } from './Game.js'

function cleanRoom(value)
{
    const room = String(value || '')
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .slice(0, 32)

    return room || null
}

export class Server
{
    constructor()
    {
        this.game = Game.getInstance()

        // Persistent device ID used by the existing online features.
        this.uuid = localStorage.getItem('uuid')
        if(!this.uuid)
        {
            this.uuid = uuidv4()
            localStorage.setItem('uuid', this.uuid)
        }

        this.connected = false
        this.connecting = false
        this.active = false
        this.initData = null
        this.events = new Events()

        let storedPlayerUuid = null
        let storedRoom = null
        try
        {
            storedPlayerUuid = localStorage.getItem('motri.multiplayer.playerUuid')
                || localStorage.getItem('motri.multiplayer.sessionUuid')
            storedRoom = cleanRoom(localStorage.getItem('motri.multiplayer.activeRoom'))
        }
        catch {}

        this.sessionUuid = storedPlayerUuid || uuidv4()
        this.resumeRoom = storedRoom
        this.reconnectInterval = null

        try
        {
            localStorage.setItem('motri.multiplayer.playerUuid', this.sessionUuid)
            localStorage.removeItem('motri.multiplayer.sessionUuid')
        }
        catch {}

        const params = new URLSearchParams(window.location.search)
        this.inviteRoom = params.has('room') ? cleanRoom(params.get('room')) : null
        this.room = null

        document.documentElement.classList.add('is-server-offline')

        const resumeTransport = () =>
        {
            if(!this.active || this.connected || this.connecting)
                return

            this.connect()
        }

        document.addEventListener('visibilitychange', () =>
        {
            if(document.visibilityState === 'visible')
                resumeTransport()
        })
        window.addEventListener('pageshow', resumeTransport)
        window.addEventListener('online', resumeTransport)
    }

    start(room)
    {
        if(!import.meta.env.VITE_SERVER_URL)
            return false

        const nextRoom = cleanRoom(room)
        if(!nextRoom)
        {
            console.warn('Server > Refusing to start multiplayer without an explicit room')
            return false
        }

        if(this.active && (this.connected || this.connecting) && this.room === nextRoom)
            return true

        if(this.active || this.connected || this.connecting)
            this.stop(false)

        this.room = nextRoom
        this.active = true
        this.initData = null
        this.resumeRoom = nextRoom

        try
        {
            localStorage.setItem('motri.multiplayer.activeRoom', nextRoom)
            localStorage.setItem('motri.multiplayer.playerUuid', this.sessionUuid)
        }
        catch {}

        this.connect()
        this.reconnectInterval = setInterval(() =>
        {
            if(this.active && !this.connected && !this.connecting)
                this.connect()
        }, 2000)

        this.events.trigger('started', [ this.room ])
        return true
    }

    stop(notify = true)
    {
        const wasActive = this.active || this.connected || this.connecting
        this.active = false

        if(this.reconnectInterval)
        {
            clearInterval(this.reconnectInterval)
            this.reconnectInterval = null
        }

        const socket = this.socket
        const room = this.room

        if(socket && this.connected && room)
        {
            try
            {
                socket.send(this.encode({
                    uuid: this.sessionUuid,
                    deviceUuid: this.uuid,
                    room,
                    type: 'leaveRoom'
                }))
            }
            catch {}
        }

        this.socket = null
        this.connecting = false
        this.connected = false
        this.initData = null
        this.room = null
        this.resumeRoom = null

        try
        {
            localStorage.removeItem('motri.multiplayer.activeRoom')
        }
        catch {}

        document.documentElement.classList.add('is-server-offline')
        document.documentElement.classList.remove('is-server-online')

        if(socket)
        {
            try { socket.close(1000, 'left room') }
            catch {}
        }

        if(wasActive)
        {
            this.events.trigger('disconnected')
            this.events.trigger('stopped')

            if(notify && this.game.ticker?.elapsed > 10)
            {
                const html = /* html */`
                    <div class="top">
                        <div class="title">تم الخروج من الغرفة</div>
                    </div>
                `

                this.game.notifications.show(
                    html,
                    'server-disconnected',
                    3,
                    null,
                    'server-disconnected'
                )
            }
        }
    }

    getSocketUrl()
    {
        const base = String(import.meta.env.VITE_SERVER_URL || '').replace(/\/+$/, '')
        if(!base || !this.room)
            return null

        if(base.includes('{room}'))
            return base.replace('{room}', encodeURIComponent(this.room))

        return `${base}/room/${encodeURIComponent(this.room)}`
    }

    connect()
    {
        const socketUrl = this.getSocketUrl()
        if(!this.active || !socketUrl || this.connecting || this.connected)
            return

        this.connecting = true
        this.events.trigger('connecting', [ this.room ])

        let socket
        try
        {
            socket = new WebSocket(socketUrl)
        }
        catch(error)
        {
            this.connecting = false
            console.warn('Server > Invalid WebSocket URL', socketUrl, error)
            this.events.trigger('connectionError')
            return
        }

        this.socket = socket
        socket.binaryType = 'arraybuffer'

        socket.addEventListener('open', () =>
        {
            if(this.socket !== socket || !this.active)
                return

            this.connecting = false
            this.connected = true
            document.documentElement.classList.remove('is-server-offline')
            document.documentElement.classList.add('is-server-online')
            this.events.trigger('connected')

            if(this.game.ticker.elapsed > 10)
            {
                const html = /* html */`
                    <div class="top">
                        <div class="title">تم الاتصال بالغرفة ${this.room}</div>
                    </div>
                `

                this.game.notifications.show(
                    html,
                    'server-connected',
                    3,
                    null,
                    'server-connected'
                )
            }
        })

        socket.addEventListener('message', (message) =>
        {
            if(this.socket === socket)
                this.onReceive(message)
        })

        socket.addEventListener('close', () =>
        {
            if(this.socket !== socket)
                return

            const wasConnected = this.connected
            this.connecting = false
            this.connected = false
            document.documentElement.classList.add('is-server-offline')
            document.documentElement.classList.remove('is-server-online')

            if(wasConnected && this.active && this.game.ticker.elapsed > 10)
            {
                const html = /* html */`
                    <div class="top">
                        <div class="title">انقطع الاتصال باللعب الجماعي</div>
                    </div>
                `

                this.game.notifications.show(
                    html,
                    'server-disconnected',
                    5,
                    null,
                    'server-disconnected'
                )
            }

            this.events.trigger('disconnected')
        })

        socket.addEventListener('error', () =>
        {
            if(this.socket === socket)
            {
                this.connecting = false
                this.events.trigger('connectionError')
            }
        })
    }

    onReceive(message)
    {
        let data
        try
        {
            data = this.decode(message.data)
        }
        catch(error)
        {
            console.warn('Server > Invalid message', error)
            return
        }

        if(this.initData === null)
            this.initData = data

        this.events.trigger('message', [ data ])
    }

    send(message)
    {
        if(!this.connected || !this.socket)
            return false

        this.socket.send(this.encode({
            uuid: this.sessionUuid,
            deviceUuid: this.uuid,
            room: this.room,
            ...message
        }))
        return true
    }

    decode(data)
    {
        if(typeof data === 'string')
            return JSON.parse(data)

        return msgpack.decode(new Uint8Array(data))
    }

    encode(data)
    {
        return JSON.stringify(data)
    }
}
