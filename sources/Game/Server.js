import msgpack from 'msgpack-lite'
import { v4 as uuidv4 } from 'uuid'
import { Events } from './Events.js'
import { Game } from './Game.js'

function cleanRoom(value)
{
    return String(value || 'public')
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .slice(0, 32) || 'public'
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
        this.sessionUuid = uuidv4()
        this.reconnectInterval = null

        const params = new URLSearchParams(window.location.search)
        this.inviteRoom = params.has('room') ? cleanRoom(params.get('room')) : null
        this.room = cleanRoom(import.meta.env.VITE_MULTIPLAYER_ROOM || 'public')

        document.documentElement.classList.add('is-server-offline')
    }

    start(room = this.room)
    {
        if(!import.meta.env.VITE_SERVER_URL)
            return false

        const nextRoom = cleanRoom(room)
        if(this.active && (this.connected || this.connecting) && this.room === nextRoom)
            return true

        if(this.active || this.connected || this.connecting)
            this.stop(false)

        this.room = nextRoom
        this.active = true
        this.initData = null
        this.sessionUuid = uuidv4()

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
        this.socket = null
        this.connecting = false
        this.connected = false
        this.initData = null

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
        if(!base)
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
