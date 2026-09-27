import { VEHICLE_BODY_STYLES } from './World/VehicleBodyStyles.js'

const COLORS = [
    { id: 'red', label: 'أحمر' },
    { id: 'orange', label: 'برتقالي' },
    { id: 'white', label: 'أبيض' },
    { id: 'black', label: 'أسود' }
]

function cleanRoom(value)
{
    return String(value || '')
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, '')
        .slice(0, 12)
}

export class MultiplayerLobby
{
    constructor(game, multiplayer)
    {
        this.game = game
        this.multiplayer = multiplayer
        this.server = game.server
        this.createAttempt = 0
        this.joinMode = null
        this.previousFilters = null
        this.pendingInvite = this.server.inviteRoom

        this.build()
        this.bind()
        this.refreshAppearance()
        this.update()

        if(this.pendingInvite)
            this.open(true)
    }

    build()
    {
        this.launchButton = document.createElement('button')
        this.launchButton.type = 'button'
        this.launchButton.className = 'multiplayer-launch-button'
        this.launchButton.textContent = 'ONLINE'

        this.root = document.createElement('div')
        this.root.className = 'multiplayer-lobby'
        this.root.hidden = true
        this.root.innerHTML = /* html */`
            <div class="multiplayer-lobby-backdrop"></div>
            <div class="multiplayer-lobby-panel" role="dialog" aria-modal="true" aria-label="اللعب الجماعي">
                <button type="button" class="multiplayer-lobby-close" aria-label="إغلاق">×</button>

                <div class="multiplayer-lobby-setup">
                    <div class="multiplayer-lobby-title">اللعب الجماعي</div>
                    <div class="multiplayer-lobby-subtitle">ادخل العالم أولًا ثم اختر كيف تريد اللعب مع الآخرين.</div>

                    <div class="multiplayer-invite" hidden>
                        <div class="multiplayer-invite-label">دعوة للغرفة</div>
                        <div class="multiplayer-invite-code"></div>
                        <div class="multiplayer-inline-actions">
                            <button type="button" class="multiplayer-accept-invite primary">دخول الغرفة</button>
                            <button type="button" class="multiplayer-dismiss-invite">لاحقًا</button>
                        </div>
                    </div>

                    <label class="multiplayer-field">
                        <span>اسم اللاعب</span>
                        <input class="multiplayer-name-input" maxlength="12" autocomplete="off" inputmode="text">
                    </label>

                    <div class="multiplayer-field">
                        <span>السيارة</span>
                        <div class="multiplayer-car-options"></div>
                    </div>

                    <div class="multiplayer-field">
                        <span>اللون</span>
                        <div class="multiplayer-color-options"></div>
                    </div>

                    <button type="button" class="multiplayer-quick primary">دخول سريع</button>

                    <div class="multiplayer-divider"><span>أو</span></div>

                    <button type="button" class="multiplayer-create">إنشاء غرفة</button>

                    <form class="multiplayer-join-form">
                        <input class="multiplayer-room-input" maxlength="12" autocomplete="off" autocapitalize="characters" placeholder="كود الغرفة">
                        <button type="submit">دخول بكود</button>
                    </form>

                    <div class="multiplayer-lobby-status" aria-live="polite"></div>
                </div>

                <div class="multiplayer-lobby-room" hidden>
                    <div class="multiplayer-lobby-title">الغرفة</div>
                    <div class="multiplayer-room-code"></div>
                    <div class="multiplayer-room-count"></div>
                    <div class="multiplayer-player-list"></div>

                    <button type="button" class="multiplayer-copy-invite primary">نسخ رابط الدعوة</button>
                    <button type="button" class="multiplayer-leave">خروج من الغرفة</button>
                </div>
            </div>
        `

        this.setupElement = this.root.querySelector('.multiplayer-lobby-setup')
        this.roomElement = this.root.querySelector('.multiplayer-lobby-room')
        this.closeButton = this.root.querySelector('.multiplayer-lobby-close')
        this.nameInput = this.root.querySelector('.multiplayer-name-input')
        this.carOptions = this.root.querySelector('.multiplayer-car-options')
        this.colorOptions = this.root.querySelector('.multiplayer-color-options')
        this.quickButton = this.root.querySelector('.multiplayer-quick')
        this.createButton = this.root.querySelector('.multiplayer-create')
        this.joinForm = this.root.querySelector('.multiplayer-join-form')
        this.roomInput = this.root.querySelector('.multiplayer-room-input')
        this.statusElement = this.root.querySelector('.multiplayer-lobby-status')
        this.inviteElement = this.root.querySelector('.multiplayer-invite')
        this.inviteCodeElement = this.root.querySelector('.multiplayer-invite-code')
        this.acceptInviteButton = this.root.querySelector('.multiplayer-accept-invite')
        this.dismissInviteButton = this.root.querySelector('.multiplayer-dismiss-invite')
        this.roomCodeElement = this.root.querySelector('.multiplayer-room-code')
        this.roomCountElement = this.root.querySelector('.multiplayer-room-count')
        this.playerListElement = this.root.querySelector('.multiplayer-player-list')
        this.copyInviteButton = this.root.querySelector('.multiplayer-copy-invite')
        this.leaveButton = this.root.querySelector('.multiplayer-leave')

        for(const style of VEHICLE_BODY_STYLES)
        {
            const button = document.createElement('button')
            button.type = 'button'
            button.className = 'multiplayer-choice multiplayer-car-choice'
            button.dataset.car = style.id
            button.textContent = style.label.replace(' 2026', '')
            this.carOptions.append(button)
        }

        for(const color of COLORS)
        {
            const button = document.createElement('button')
            button.type = 'button'
            button.className = `multiplayer-color-choice is-${color.id}`
            button.dataset.color = color.id
            button.setAttribute('aria-label', color.label)
            button.title = color.label
            this.colorOptions.append(button)
        }

        this.game.domElement.append(this.launchButton, this.root)
    }

    bind()
    {
        this.launchButton.addEventListener('click', () => this.open())
        this.closeButton.addEventListener('click', () => this.close())
        this.root.querySelector('.multiplayer-lobby-backdrop').addEventListener('click', () => this.close())

        this.nameInput.addEventListener('input', () =>
        {
            const name = this.multiplayer.setLocalName(this.nameInput.value)
            if(name !== this.nameInput.value)
                this.nameInput.value = name
        })

        this.carOptions.addEventListener('click', (event) =>
        {
            const button = event.target.closest('[data-car]')
            if(!button || this.server.connected || this.server.connecting)
                return

            this.multiplayer.setAppearance(button.dataset.car, this.multiplayer.selectedColor)
            this.refreshAppearance()
        })

        this.colorOptions.addEventListener('click', (event) =>
        {
            const button = event.target.closest('[data-color]')
            if(!button || this.server.connected || this.server.connecting)
                return

            this.multiplayer.setAppearance(this.multiplayer.selectedCar, button.dataset.color)
            this.refreshAppearance()
        })

        this.quickButton.addEventListener('click', () => this.joinRoom('public', 'quick'))
        this.createButton.addEventListener('click', () =>
        {
            this.createAttempt = 0
            this.joinRoom(this.generateRoomCode(), 'create')
        })

        this.joinForm.addEventListener('submit', (event) =>
        {
            event.preventDefault()
            const room = cleanRoom(this.roomInput.value)
            if(!room)
            {
                this.setStatus('اكتب كود الغرفة.')
                return
            }
            this.joinRoom(room, 'code')
        })

        this.acceptInviteButton.addEventListener('click', () =>
        {
            if(this.pendingInvite)
                this.joinRoom(this.pendingInvite, 'invite')
        })

        this.dismissInviteButton.addEventListener('click', () =>
        {
            this.pendingInvite = null
            this.inviteElement.hidden = true
        })

        this.copyInviteButton.addEventListener('click', async () =>
        {
            const url = new URL(window.location.href)
            url.searchParams.set('room', this.server.room)
            url.searchParams.delete('name')

            try
            {
                await navigator.clipboard.writeText(url.toString())
                this.copyInviteButton.textContent = 'تم نسخ رابط الدعوة'
                window.setTimeout(() => { this.copyInviteButton.textContent = 'نسخ رابط الدعوة' }, 1800)
            }
            catch
            {
                this.setStatus('تعذر نسخ الرابط من المتصفح.')
            }
        })

        this.leaveButton.addEventListener('click', () =>
        {
            this.server.stop(false)
            this.joinMode = null
            this.setStatus('')
            this.update()
        })

        this.server.events.on('started', () => this.update())
        this.server.events.on('connecting', () =>
        {
            this.setStatus(`جارٍ الاتصال بالغرفة ${this.server.room}…`)
            this.update()
        })
        this.server.events.on('connected', () => this.update())
        this.server.events.on('disconnected', () => this.update())
        this.server.events.on('connectionError', () =>
        {
            if(this.server.active)
                this.setStatus('تعذر الاتصال. ستتم إعادة المحاولة تلقائيًا.')
            this.update()
        })
    }

    open(fromInvite = false)
    {
        if(this.root.hidden)
        {
            this.previousFilters = [ ...this.game.inputs.filters ]
            this.game.inputs.filters.clear()
            this.game.inputs.filters.add('multiplayer')
        }

        this.root.hidden = false
        this.nameInput.value = this.multiplayer.localName

        if(fromInvite && this.pendingInvite)
        {
            this.inviteElement.hidden = false
            this.inviteCodeElement.textContent = this.pendingInvite
        }
        else if(!this.pendingInvite)
        {
            this.inviteElement.hidden = true
        }

        this.update()
    }

    close()
    {
        this.root.hidden = true

        if(this.previousFilters)
        {
            this.game.inputs.filters.clear()
            for(const filter of this.previousFilters)
                this.game.inputs.filters.add(filter)
            this.previousFilters = null
        }
    }

    setStatus(text)
    {
        this.statusElement.textContent = text || ''
    }

    generateRoomCode()
    {
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
        const bytes = new Uint8Array(6)
        crypto.getRandomValues(bytes)
        return [ ...bytes ].map(value => alphabet[value % alphabet.length]).join('')
    }

    joinRoom(room, mode)
    {
        room = cleanRoom(room)
        if(!room)
            return

        this.multiplayer.applyLocalAppearance()
        this.joinMode = mode
        this.setStatus(`جارٍ الدخول إلى ${room}…`)
        this.server.start(room)
        this.update()
    }

    onWelcome(message)
    {
        if(this.joinMode === 'create' && Array.isArray(message.players) && message.players.length)
        {
            if(this.createAttempt < 4)
            {
                this.createAttempt++
                this.server.stop(false)
                window.setTimeout(() => this.joinRoom(this.generateRoomCode(), 'create'), 80)
                return false
            }

            this.setStatus('تعذر إنشاء غرفة جديدة. حاول مرة أخرى.')
            this.server.stop(false)
            return false
        }

        this.joinMode = null
        this.pendingInvite = null
        this.inviteElement.hidden = true
        this.update()
        return true
    }

    refreshAppearance()
    {
        this.nameInput.value = this.multiplayer.localName

        for(const button of this.carOptions.querySelectorAll('[data-car]'))
            button.classList.toggle('is-active', button.dataset.car === this.multiplayer.selectedCar)

        for(const button of this.colorOptions.querySelectorAll('[data-color]'))
            button.classList.toggle('is-active', button.dataset.color === this.multiplayer.selectedColor)
    }

    update()
    {
        const connected = this.server.connected
        const connecting = this.server.connecting
        const inRoom = this.server.active && !!this.server.room

        this.setupElement.hidden = inRoom
        this.roomElement.hidden = !inRoom
        this.launchButton.classList.toggle('is-connected', inRoom)
        this.launchButton.textContent = inRoom ? `غرفة ${this.server.room}` : 'ONLINE'

        this.nameInput.disabled = inRoom || connecting
        for(const button of this.carOptions.querySelectorAll('button'))
            button.disabled = inRoom || connecting
        for(const button of this.colorOptions.querySelectorAll('button'))
            button.disabled = inRoom || connecting
        this.quickButton.disabled = connecting
        this.createButton.disabled = connecting
        this.roomInput.disabled = connecting
        this.joinForm.querySelector('button').disabled = connecting

        if(!inRoom)
            return

        this.roomCodeElement.textContent = this.server.room
        this.roomCountElement.textContent = connected
            ? `${Math.min(this.multiplayer.maxPlayers, 1 + this.multiplayer.peerIds.size)} / ${this.multiplayer.maxPlayers}`
            : 'جارٍ إعادة الاتصال…'

        if(!connected)
            return

        const players = [
            {
                uuid: this.server.sessionUuid,
                name: this.multiplayer.localName
            },
            ...[ ...this.multiplayer.remotePlayers.values() ].map(remote => ({
                uuid: remote.uuid,
                name: remote.name
            }))
        ]

        players.sort((a, b) =>
        {
            if(a.uuid === this.multiplayer.authorityUuid) return -1
            if(b.uuid === this.multiplayer.authorityUuid) return 1
            return a.name.localeCompare(b.name, 'ar')
        })

        this.roomCountElement.textContent = `${players.length} / ${this.multiplayer.maxPlayers}`
        this.playerListElement.replaceChildren()

        for(const player of players)
        {
            const row = document.createElement('div')
            row.className = 'multiplayer-player-row'
            if(player.uuid === this.multiplayer.authorityUuid)
                row.classList.add('is-leader')

            const role = document.createElement('span')
            role.className = 'multiplayer-player-role'
            role.textContent = player.uuid === this.multiplayer.authorityUuid ? '👑' : '•'

            const name = document.createElement('span')
            name.className = 'multiplayer-player-row-name'
            name.textContent = player.name

            row.append(role, name)
            this.playerListElement.append(row)
        }
    }
}
