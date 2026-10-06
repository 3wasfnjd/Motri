import * as THREE from 'three/webgpu'
import { VEHICLE_BODY_STYLES } from '../Game/World/VehicleBodyStyles.js'

const SIZE = 1024
const C = {
    panel: 'rgba(12,29,32,.97)', edge: '#627d72', card: '#1b3537', cardHigh: '#244446',
    accent: '#c6ee88', onAccent: '#132a22', text: '#eff4e6', muted: '#a9bcb5', faint: '#6f8a84',
    on: '#8fd16a', off: '#56706b', danger: '#f0937a', gold: '#f2c66d', track: '#0f2426'
}
const FONT = 'system-ui, sans-serif'

// Destinations shown on the map, in the desktop map's order and wording.
const LOCATIONS = [
    ['landing', 'البداية'], ['projects', 'المعرض'], ['lab', 'منطقة التجارب'], ['career', 'قاعة العرض'],
    ['circuit', 'الحلبة'], ['bowling', 'البولينغ'], ['cookie', 'الكوكي'], ['altar', 'المنصة'],
    ['achievements', 'الإنجازات'], ['behindTheScene', 'خلف الكواليس'], ['restHouse', 'الاستراحة'],
    ['sheepPen', 'حوش الغنم'], ['camelCamp', 'مراح الإبل'], ['dunes', 'النفود']
]
const MAP_OVERLAYS = ['dunes', 'restHouse', 'sheepPen', 'camelCamp']

// Small vector icons, drawn in a 48 px box centred on (x, y).
const ICONS = {
    car(c) { c.beginPath(); c.roundRect(-20, -6, 40, 14, 5); c.moveTo(-12, -6); c.lineTo(-7, -15); c.lineTo(9, -15); c.lineTo(14, -6); c.stroke(); for(const x of [-11, 11]) { c.beginPath(); c.arc(x, 10, 5, 0, Math.PI * 2); c.fill() } },
    gear(c) { for(let i = 0; i < 8; i++) { c.save(); c.rotate(i * Math.PI / 4); c.fillRect(-4, -20, 8, 9); c.restore() } c.beginPath(); c.arc(0, 0, 13, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.arc(0, 0, 5, 0, Math.PI * 2); c.fill() },
    pin(c) { c.beginPath(); c.arc(0, -6, 12, Math.PI * .85, Math.PI * .15); c.lineTo(0, 18); c.closePath(); c.stroke(); c.beginPath(); c.arc(0, -6, 4.5, 0, Math.PI * 2); c.fill() },
    trophy(c) { c.beginPath(); c.moveTo(-12, -16); c.lineTo(12, -16); c.lineTo(10, -2); c.quadraticCurveTo(0, 8, -10, -2); c.closePath(); c.stroke(); c.beginPath(); c.arc(-14, -9, 5, Math.PI * .5, Math.PI * 1.5); c.arc(14, -9, 5, -Math.PI * .5, Math.PI * .5); c.stroke(); c.fillRect(-2, 4, 4, 8); c.fillRect(-9, 12, 18, 5) },
    list(c) { for(const y of [-11, 0, 11]) { c.fillRect(-17, y - 2.5, 5, 5); c.fillRect(-7, y - 2, 24, 4) } },
    play(c) { c.beginPath(); c.moveTo(-8, -14); c.lineTo(14, 0); c.lineTo(-8, 14); c.closePath(); c.fill() },
    sound(c) { c.beginPath(); c.moveTo(-16, -6); c.lineTo(-8, -6); c.lineTo(2, -15); c.lineTo(2, 15); c.lineTo(-8, 6); c.lineTo(-16, 6); c.closePath(); c.fill(); c.beginPath(); c.arc(4, 0, 10, -.8, .8); c.stroke() },
    eye(c) { c.beginPath(); c.ellipse(0, 0, 19, 11, 0, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.arc(0, 0, 5, 0, Math.PI * 2); c.fill() },
    camera(c) { c.beginPath(); c.roundRect(-18, -10, 26, 20, 4); c.stroke(); c.beginPath(); c.moveTo(8, -3); c.lineTo(18, -9); c.lineTo(18, 9); c.lineTo(8, 3); c.fill() },
    target(c) { c.beginPath(); c.arc(0, 0, 15, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.arc(0, 0, 5, 0, Math.PI * 2); c.fill(); for(const [x, y] of [[0, -20], [0, 20], [-20, 0], [20, 0]]) { c.beginPath(); c.moveTo(x * .55, y * .55); c.lineTo(x, y); c.stroke() } },
    recover(c) { c.beginPath(); c.arc(0, 0, 14, -Math.PI * .1, Math.PI * 1.55); c.stroke(); c.beginPath(); c.moveTo(14, -12); c.lineTo(15, 2); c.lineTo(3, -3); c.closePath(); c.fill() },
    exit(c) { c.beginPath(); c.roundRect(-16, -16, 20, 32, 3); c.stroke(); c.beginPath(); c.moveTo(-2, 0); c.lineTo(18, 0); c.moveTo(11, -7); c.lineTo(18, 0); c.lineTo(11, 7); c.stroke() }
}

// A stereo canvas panel, controlled entirely with either Touch controller.
// It calls the existing vehicle/settings APIs rather than opening hidden HTML.
export class XRMenu {
    constructor(xr) {
        this.xr = xr
        this.game = xr.game
        this.opened = false
        this.canvas = document.createElement('canvas')
        this.canvas.width = SIZE; this.canvas.height = SIZE
        this.ctx = this.canvas.getContext('2d')
        this.texture = new THREE.CanvasTexture(this.canvas)
        this.texture.colorSpace = THREE.SRGBColorSpace
        this.texture.generateMipmaps = false
        this.texture.minFilter = THREE.LinearFilter
        this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(.82, .82), new THREE.MeshBasicNodeMaterial({ map: this.texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }))
        this.mesh.renderOrder = 120
        this.mesh.visible = false
        this.mesh.frustumCulled = false
        // World-locked in the rig (room metres in AR, the car in VR) instead of
        // following the head, per Meta's comfort guidance for stereo panels.
        xr.rig.add(this.mesh)
        this.mapImages = {}
    }

    toggle() { this.opened ? this.close() : this.open() }
    open() {
        this.xr.actions.release()
        this.filters = [...this.game.inputs.filters]
        this.game.inputs.filters.clear(); this.game.inputs.filters.add('xr-menu')
        this.place()
        this.opened = this.mesh.visible = true
        this.confirmHeld = true // A driving trigger must be released before selecting.
        this.navHeld = true
        this.xr.primarySince = null
        this.show('home')
    }
    close() {
        if(!this.opened) return
        this.opened = this.mesh.visible = false
        this.game.inputs.filters.clear()
        for(const filter of this.filters) this.game.inputs.filters.add(filter)
        this.xr.actions.release()
        this.xr.primarySince = null
        this.xr.menuReleaseRequired = true
    }
    place() {
        const head = this.xr.camera
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(head.quaternion).setY(0)
        if(forward.lengthSq() < 1e-4) forward.set(0, 0, -1)
        forward.normalize()
        this.mesh.position.copy(head.position).addScaledVector(forward, 1.05)
        this.mesh.position.y -= 0.08
        this.mesh.rotation.set(0, Math.atan2(-forward.x, -forward.z), 0)
    }
    back() {
        if(this.page === 'home') return this.close()
        // Return to the parent page with the entry we came from selected.
        const [parent, selected] = this.page === 'read' ? [this.readParent, this.readSelected] : ['home', null]
        const from = this.page
        this.show(parent)
        const index = selected ?? this.items.findIndex(item => item.id === from)
        if(index >= 0) { this.selected = Math.min(index, this.items.length - 1); this.draw() }
    }

    show(page) {
        this.page = page
        this.selected = 0
        this.lines = null
        this.subtitle = null
        const ar = this.xr.mode === 'immersive-ar'
        const item = (id, label, action, extra = {}) => ({ id, label, action, ...extra })
        const go = (id, label, icon, hint) => item(id, label, () => this.show(id), { icon, hint, kind: 'nav' })
        const finish = action => () => { this.close(); action() }
        if(page === 'home') {
            this.title = 'موتري'
            this.subtitle = ar ? 'الواقع المعزز' : 'الواقع الافتراضي'
            const style = VEHICLE_BODY_STYLES.find(s => s.id === this.game.world.visualVehicle.bodyStyles.current)
            const progress = this.game.achievements.globalProgress
            this.items = [
                go('cars', 'اختيار السيارة', 'car', style?.label),
                go('settings', 'الإعدادات', 'gear', 'الصوت والعرض والكاميرا'),
                go('locations', 'الخريطة والمناطق', 'pin', `${LOCATIONS.length} وجهة`),
                go('achievements', 'الإنجازات', 'trophy', `${progress.achievedCount} من ${progress.totalCount}`),
                go('menus', 'قوائم اللعبة', 'list', 'المعلومات والتحكم'),
                item('resume', 'متابعة القيادة', () => this.close(), { icon: 'play', kind: 'primary' })
            ]
        } else if(page === 'cars') {
            this.title = 'اختيار السيارة'
            const current = this.game.world.visualVehicle.bodyStyles.current
            this.items = VEHICLE_BODY_STYLES.map(style => item(style.id, style.label, () => {
                this.game.world.visualVehicle.bodyStyles.changeTo(style.id)
                this.show('cars')
                this.selected = VEHICLE_BODY_STYLES.indexOf(style)
                this.draw()
                this.xr.pulse()
            }, { icon: 'car', value: current === style.id ? 'الحالية' : null, valueOn: true }))
        } else if(page === 'settings') {
            this.title = 'الإعدادات'
            const muted = this.game.audio.mute.active, high = this.game.quality.level === 0, driver = this.xr.vehicleCamera.mode === 'driver'
            this.items = [
                item('sound', 'الصوت', () => { this.game.audio.mute.toggle(); this.refresh() }, { section: 'الصوت والعرض', icon: 'sound', kind: 'toggle', on: !muted, value: muted ? 'مكتوم' : 'يعمل' }),
                item('quality', 'جودة الرسوم', () => { this.game.quality.changeLevel(high ? 1 : 0); this.refresh() }, { icon: 'eye', kind: 'toggle', on: high, value: high ? 'عالية' : 'منخفضة' }),
                ar
                    ? item('view', 'تحديد سطح آخر', finish(() => this.xr.reposition()), { section: 'المكان', icon: 'target', hint: 'إعادة وضع العالم على سطح' })
                    : item('view', 'الكاميرا', () => { this.xr.setCameraMode(driver ? 'chase' : 'driver'); this.refresh() }, { section: 'الكاميرا', icon: 'camera', kind: 'choice', value: driver ? 'داخل السيارة' : 'خلف السيارة' }),
                item('recenter', ar ? 'مسح الغرفة' : 'توسيط النظر', finish(() => { if(ar) this.xr.captureRoom(); else { this.xr.lookYaw = 0; this.xr.headOrigin.copy(this.xr.viewerPosition) } }), { icon: ar ? 'eye' : 'target', hint: ar ? 'تحديث أسطح الغرفة في الكويست' : 'يعيد المقعد أمامك' }),
                item('recover', 'إعادة السيارة', finish(() => { this.game.player.respawn(); this.xr.vehicleCamera.reset() }), { section: 'الجلسة', icon: 'recover', hint: 'إلى أقرب نقطة آمنة' }),
                item('reset', 'إعادة الأشياء إلى أماكنها', finish(() => this.game.reset()), { icon: 'recover' }),
                item('exit', 'الخروج من النظارة', finish(() => this.xr.exit()), { icon: 'exit', kind: 'danger' })
            ]
        } else if(page === 'locations') {
            this.title = 'الخريطة والمناطق'
            this.items = LOCATIONS.filter(([name]) => this.game.respawns.items.has(name))
                .map(([name, label]) => item(name, label, finish(() => { this.game.player.respawn(name); this.xr.vehicleCamera.reset() })))
            // Start from the destination nearest to the car.
            const player = this.game.player.position
            let best = Infinity
            this.items.forEach((entry, index) => {
                const p = this.game.respawns.getByName(entry.id).position
                const distance = Math.hypot(p.x - player.x, p.z - player.z)
                if(distance < best) { best = distance; this.selected = index }
            })
        } else if(page === 'achievements') {
            const progress = this.game.achievements.globalProgress
            this.title = 'الإنجازات'
            this.progress = progress
            this.items = [...this.game.achievements.groups.values()].flatMap(group => group.items.map(a => {
                const title = a.itemElement.querySelector('.title').textContent.trim()
                const description = a.itemElement.querySelector('.description .text').textContent.trim()
                return item('achievement', title, () => this.read(title, description, null, 'achievements'), {
                    description, current: Math.min(Number(a.progressCurrentElement.textContent) || 0, a.total), total: a.total, achieved: a.achieved
                })
            }))
            // Unfinished goals first, then those already achieved.
            this.items.sort((a, b) => a.achieved - b.achieved)
        } else if(page === 'menus') {
            this.title = 'قوائم اللعبة'
            this.items = [...this.game.menu.items.values()].map(entry => item(entry.name, entry.navigationElement.getAttribute('aria-label') || entry.name, () => {
                if(entry.name === 'options') this.show('settings')
                else if(entry.name === 'achievements') this.show('achievements')
                else if(entry.name === 'controls') this.read('التحكم', 'X: القائمة. العصا اليسرى للتوجيه. VR: الزناد الأيمن للقيادة والأيسر للرجوع. القبضة اليمنى فرامل واليسرى تسارع إضافي. Y لتبديل الكاميرا. A للتفاعل والقفز. AR: العصا اليسرى للقيادة واليمنى للحجم والدوران. داخل القائمة: العصا للتنقل والزناد للاختيار وY أو B للرجوع.', null, 'menus')
                else {
                    const copy = entry.contentElement.cloneNode(true)
                    copy.querySelectorAll('button,form,svg,img,.tooltip,[hidden]').forEach(el => el.remove())
                    this.read(entry.navigationElement.getAttribute('aria-label'), copy.textContent, entry.name, 'menus')
                }
            }, { icon: 'list', kind: 'nav' }))
        }
        this.draw()
    }

    // Re-run the current page after a setting changes, keeping the selection.
    refresh() {
        const selected = this.selected
        this.show(this.page)
        this.selected = Math.min(selected, this.items.length - 1)
        this.draw()
        this.xr.pulse()
    }

    read(title, text, source = null, parent = 'menus') {
        this.readSelected = this.selected
        this.page = 'read'; this.readParent = parent; this.title = title; this.subtitle = null; this.selected = 0; this.textPage = 0
        this.ctx.font = `34px ${FONT}`
        this.lines = []; let line = ''
        for(const word of text.trim().split(/\s+/)) {
            const next = line ? `${line} ${word}` : word
            if(this.ctx.measureText(next).width > 840 && line) { this.lines.push(line); line = word }
            else line = next
        }
        if(line) this.lines.push(line)
        this.items = []
        if(this.lines.length > 11) this.items.push({ id: 'next', label: 'الصفحة التالية', action: () => { this.textPage = (this.textPage + 1) % Math.ceil(this.lines.length / 11); this.draw() } })
        if(source) this.items.push({ id: 'full', label: 'فتح القائمة الكاملة في المتصفح', action: () => { this.close(); this.xr.browserMenu = source; this.xr.exit() } })
        this.items.push({ id: 'back', label: 'رجوع', action: () => this.back() })
        this.draw()
    }

    update(controls) {
        const { left, right } = controls
        const y = left?.y || right?.y || 0
        if(Math.abs(y) < .3) this.navHeld = false
        else if(Math.abs(y) > .55 && !this.navHeld) {
            this.navHeld = true
            this.selected = (this.selected + Math.sign(y) + this.items.length) % this.items.length
            this.draw()
        }
        const confirm = left?.trigger > .55 || right?.trigger > .55 || !!right?.lower
        if(confirm && !this.confirmHeld) { this.confirmHeld = true; this.items[this.selected]?.action() }
        else if(!confirm) this.confirmHeld = false
    }

    // Drawing ---------------------------------------------------------------

    draw() {
        const c = this.ctx
        c.setTransform(1, 0, 0, 1, 0, 0)
        c.clearRect(0, 0, SIZE, SIZE)
        c.fillStyle = C.panel; c.beginPath(); c.roundRect(0, 0, SIZE, SIZE, 44); c.fill()
        c.strokeStyle = C.edge; c.lineWidth = 3; c.stroke()
        c.direction = 'rtl'; c.textBaseline = 'middle'
        this.drawHeader()
        if(this.page === 'locations') this.drawMapPage()
        else if(this.page === 'achievements') this.drawAchievements()
        else if(this.page === 'read') this.drawRead()
        else this.drawList()
        this.drawFooter()
        this.texture.needsUpdate = true
    }

    text(value, x, y, { size = 34, weight = 400, color = C.text, align = 'right', max, dir = 'rtl' } = {}) {
        const c = this.ctx
        c.direction = dir
        c.font = `${weight} ${size}px ${FONT}`; c.fillStyle = color; c.textAlign = align
        let s = String(value ?? '')
        if(max && c.measureText(s).width > max) {
            while(s.length > 1 && c.measureText(`${s}…`).width > max) s = s.slice(0, -1)
            s = `${s.trim()}…`
        }
        c.fillText(s, x, y)
        c.direction = 'rtl'
    }

    icon(name, x, y, color, scale = 1) {
        const c = this.ctx, draw = ICONS[name]
        if(!draw) return
        c.save(); c.translate(x, y); c.scale(scale, scale)
        c.fillStyle = c.strokeStyle = color; c.lineWidth = 3.2; c.lineJoin = c.lineCap = 'round'
        draw(c); c.restore()
    }

    bar(x, y, width, height, ratio, color) {
        const c = this.ctx
        c.fillStyle = C.track; c.beginPath(); c.roundRect(x, y, width, height, height / 2); c.fill()
        if(ratio <= 0) return
        // RTL progress fills from the right edge.
        const w = Math.max(height, width * Math.min(1, ratio))
        c.fillStyle = color; c.beginPath(); c.roundRect(x + width - w, y, w, height, height / 2); c.fill()
    }

    drawHeader() {
        const c = this.ctx
        this.text(this.title, 940, 82, { size: 52, weight: 700, max: 560 })
        if(this.subtitle) this.text(this.subtitle, 940, 128, { size: 26, color: C.muted })
        else if(this.page !== 'home') this.text(this.page === 'read' ? 'موتري  ›  قراءة' : 'موتري', 940, 128, { size: 26, color: C.muted })
        if(this.page === 'achievements') {
            const p = this.progress
            this.text(`${p.achievedCount} / ${p.totalCount}`, 84, 82, { size: 46, weight: 700, color: C.gold, align: 'left', dir: 'ltr' })
            this.text(`مكتمل ${Math.round(p.achievedCount / Math.max(1, p.totalCount) * 100)}%`, 84, 126, { size: 24, color: C.muted, align: 'left' })
        } else if(this.page !== 'home') {
            c.fillStyle = C.cardHigh; c.beginPath(); c.roundRect(70, 58, 150, 50, 25); c.fill()
            this.text('Y  رجوع', 145, 84, { size: 26, weight: 600, color: C.muted, align: 'center' })
        }
        c.fillStyle = C.accent; c.fillRect(84, 156, 856, 3)
    }

    drawFooter() {
        const c = this.ctx
        let label = 'العصا: تنقّل   •   الزناد: اختيار   •   Y: رجوع   •   X: إغلاق'
        if(this.page === 'locations') label = 'العصا: اختيار الوجهة   •   الزناد: الانتقال   •   Y: رجوع'
        const pages = this.page === 'read' ? Math.ceil((this.lines?.length || 0) / 11) : this.pageCount
        if(pages > 1) {
            const current = this.page === 'read' ? this.textPage : this.pageIndex
            for(let i = 0; i < pages; i++) {
                c.fillStyle = i === current ? C.accent : C.off
                c.beginPath(); c.arc(512 + (i - (pages - 1) / 2) * 24, 925, i === current ? 7 : 5, 0, Math.PI * 2); c.fill()
            }
        }
        this.text(label, 512, 972, { size: 24, color: C.faint, align: 'center', max: 900 })
    }

    // A page of `perPage` entries that always contains the selection.
    window(perPage) {
        this.pageCount = Math.ceil(this.items.length / perPage)
        this.pageIndex = Math.floor(this.selected / perPage)
        const start = this.pageIndex * perPage
        return { start, rows: this.items.slice(start, start + perPage) }
    }

    drawList() {
        const c = this.ctx
        const sections = this.items.some(item => item.section)
        const height = this.page === 'home' ? 112 : sections ? 78 : 100
        const gap = this.page === 'home' ? 13 : sections ? 10 : 12
        const { start, rows } = this.window(this.page === 'home' ? 6 : sections ? 8 : 6)
        let y = 180
        rows.forEach((item, i) => {
            if(item.section) { this.text(item.section, 930, y + 14, { size: 24, weight: 600, color: C.faint }); y += 34 }
            const active = start + i === this.selected
            const danger = item.kind === 'danger', primary = item.kind === 'primary'
            c.fillStyle = active ? (danger ? C.danger : C.accent) : primary ? C.cardHigh : C.card
            c.beginPath(); c.roundRect(64, y, 896, height, 22); c.fill()
            const ink = active ? C.onAccent : danger ? C.danger : C.text
            const sub = active ? 'rgba(19,42,34,.72)' : C.muted
            let right = 920
            if(item.icon) {
                c.fillStyle = active ? 'rgba(19,42,34,.14)' : 'rgba(198,238,136,.08)'
                c.beginPath(); c.arc(right - 26, y + height / 2, 30, 0, Math.PI * 2); c.fill()
                this.icon(item.icon, right - 26, y + height / 2, active ? C.onAccent : danger ? C.danger : C.accent, height > 100 ? 1.05 : .9)
                right -= 80
            }
            const twoLines = item.hint && height >= 100
            this.text(item.label, right, y + height / 2 - (twoLines ? 16 : 0), { size: this.page === 'home' ? 40 : 36, weight: 600, color: ink, max: 520 })
            if(twoLines) this.text(item.hint, right, y + height / 2 + 24, { size: 25, color: sub, max: 520 })
            this.drawValue(item, y, height, active)
            y += height + gap
        })
    }

    drawValue(item, y, height, active) {
        const c = this.ctx, mid = y + height / 2
        if(item.kind === 'toggle') {
            // Switch: knob on the right when on (RTL reading order).
            const x = 96, w = 84, h = 44
            c.fillStyle = item.on ? C.on : C.off
            c.beginPath(); c.roundRect(x, mid - h / 2, w, h, h / 2); c.fill()
            c.fillStyle = '#f4f8ee'; c.beginPath(); c.arc(item.on ? x + w - h / 2 : x + h / 2, mid, h / 2 - 5, 0, Math.PI * 2); c.fill()
            this.text(item.value, x + w + 20, mid, { size: 28, weight: 600, color: active ? C.onAccent : C.muted, align: 'left' })
        } else if(item.value) {
            c.font = `600 28px ${FONT}`
            const w = c.measureText(item.value).width + 40
            c.fillStyle = active ? 'rgba(19,42,34,.16)' : item.valueOn ? 'rgba(143,209,106,.18)' : C.cardHigh
            c.beginPath(); c.roundRect(96, mid - 24, w, 48, 24); c.fill()
            this.text(item.value, 96 + w / 2, mid, { size: 28, weight: 600, color: active ? C.onAccent : item.valueOn ? C.on : C.text, align: 'center' })
            if(item.kind === 'choice') this.text('⇄', 96 + w + 28, mid, { size: 30, color: active ? C.onAccent : C.muted, align: 'center' })
        } else if(item.hint && height < 100) {
            this.text(item.hint, 96, mid, { size: 25, color: active ? C.onAccent : C.muted, align: 'left', max: 330 })
        } else if(item.kind === 'nav') {
            this.text('‹', 104, mid - 3, { size: 48, weight: 300, color: active ? C.onAccent : C.faint, align: 'left' })
        }
    }

    drawAchievements() {
        const c = this.ctx, p = this.progress
        this.bar(84, 176, 856, 12, p.achievedCount / Math.max(1, p.totalCount), C.gold)
        const { start, rows } = this.window(5)
        rows.forEach((item, i) => {
            const y = 212 + i * 138, active = start + i === this.selected
            c.fillStyle = active ? C.cardHigh : C.card
            c.beginPath(); c.roundRect(64, y, 896, 124, 22); c.fill()
            if(active) { c.strokeStyle = C.accent; c.lineWidth = 4; c.stroke() }
            // Badge: gold check when achieved, otherwise the progress ratio.
            c.fillStyle = item.achieved ? C.gold : C.track
            c.beginPath(); c.arc(894, y + 62, 34, 0, Math.PI * 2); c.fill()
            if(item.achieved) {
                c.strokeStyle = C.onAccent; c.lineWidth = 7; c.lineCap = c.lineJoin = 'round'
                c.beginPath(); c.moveTo(878, y + 63); c.lineTo(890, y + 75); c.lineTo(911, y + 50); c.stroke()
            } else {
                c.strokeStyle = C.accent; c.lineWidth = 6; c.lineCap = 'round'
                c.beginPath(); c.arc(894, y + 62, 28, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * item.current / item.total); if(item.current) c.stroke()
                this.text(`${Math.round(item.current / item.total * 100)}%`, 894, y + 63, { size: 20, weight: 700, color: C.muted, align: 'center', dir: 'ltr' })
            }
            this.text(item.label, 836, y + 34, { size: 32, weight: 700, color: item.achieved ? C.gold : C.text, max: 600 })
            this.text(item.description, 836, y + 72, { size: 25, color: C.muted, max: 740 })
            this.bar(220, y + 100, 616, 10, item.current / item.total, item.achieved ? C.gold : C.accent)
            this.text(`${item.current} / ${item.total}`, 96, y + 104, { size: 25, weight: 600, color: item.achieved ? C.gold : C.muted, align: 'left', dir: 'ltr' })
        })
    }

    drawRead() {
        const c = this.ctx
        this.lines.slice(this.textPage * 11, this.textPage * 11 + 11).forEach((line, i) => this.text(line, 930, 206 + i * 44, { size: 34, color: '#d4dfd6', max: 850 }))
        const rows = this.items
        this.pageCount = 1
        rows.forEach((item, i) => {
            const y = 714 + (i - rows.length + 3) * 64, active = i === this.selected
            c.fillStyle = active ? C.accent : C.card; c.beginPath(); c.roundRect(64, y, 896, 54, 20); c.fill()
            this.text(item.label, 512, y + 28, { size: 30, weight: 600, color: active ? C.onAccent : C.text, align: 'center' })
        })
    }

    // Map page: the desktop map image with its live area overlays, every
    // destination pin, the car's position and heading, and the list.
    mapImage(night) {
        const key = night ? 'night' : 'day'
        if(!this.mapImages[key]) {
            const image = new Image()
            image.onload = () => { if(this.opened && this.page === 'locations') this.draw() }
            image.src = `ui/map/map-${key}.webp`
            this.mapImages[key] = image
        }
        if(this.overlayNight !== night) {
            this.overlayNight = night
            const container = this.game.map?.element || document.createElement('div')
            for(const name of MAP_OVERLAYS) this.game.world[name]?.drawMap?.(container, night)
        }
        return this.mapImages[key]
    }

    worldToMap(position) {
        const size = this.game.terrain.size
        return { x: Math.min(1, Math.max(0, position.x / size + .5)), y: Math.min(1, Math.max(0, position.z / size + .5)) }
    }

    drawMapPage() {
        const c = this.ctx
        const night = !!this.game.dayCycles.intervalEvents.get('night')?.inInterval
        const X = 48, Y = 180, S = 600
        c.save(); c.beginPath(); c.roundRect(X, Y, S, S, 26); c.clip()
        c.fillStyle = night ? '#132b3d' : '#2e6f8e'; c.fillRect(X, Y, S, S)
        const image = this.mapImage(night)
        if(image.complete && image.naturalWidth) c.drawImage(image, X, Y, S, S)
        for(const name of MAP_OVERLAYS) {
            const overlay = this.game.world[name]?.mapCanvas
            if(overlay) c.drawImage(overlay, X, Y, S, S)
        }
        c.restore()
        c.strokeStyle = C.edge; c.lineWidth = 3; c.beginPath(); c.roundRect(X, Y, S, S, 26); c.stroke()

        // Pins
        const selected = this.items[this.selected]
        this.items.forEach((item, i) => {
            if(i === this.selected) return
            const m = this.worldToMap(this.game.respawns.getByName(item.id).position)
            const x = X + m.x * S, y = Y + m.y * S
            c.fillStyle = 'rgba(12,29,32,.85)'; c.beginPath(); c.arc(x, y, 10, 0, Math.PI * 2); c.fill()
            c.fillStyle = C.text; c.beginPath(); c.arc(x, y, 5.5, 0, Math.PI * 2); c.fill()
        })

        // Car: arrow along the vehicle heading (map +x = world +x, +y = world +z).
        const player = this.game.player.position
        const pm = this.worldToMap(player)
        const forward = this.game.physicalVehicle.forward
        c.save(); c.translate(X + pm.x * S, Y + pm.y * S); c.rotate(Math.atan2(forward.z, forward.x))
        c.fillStyle = '#ff6b4a'; c.strokeStyle = '#fff'; c.lineWidth = 3
        c.beginPath(); c.moveTo(17, 0); c.lineTo(-11, -11); c.lineTo(-5, 0); c.lineTo(-11, 11); c.closePath(); c.fill(); c.stroke()
        c.restore()

        // Selected destination: larger pin, label and route line from the car.
        if(selected) {
            const p = this.game.respawns.getByName(selected.id).position, m = this.worldToMap(p)
            const x = X + m.x * S, y = Y + m.y * S
            c.setLineDash([10, 8]); c.strokeStyle = 'rgba(198,238,136,.85)'; c.lineWidth = 3
            c.beginPath(); c.moveTo(X + pm.x * S, Y + pm.y * S); c.lineTo(x, y); c.stroke(); c.setLineDash([])
            c.fillStyle = C.accent; c.strokeStyle = C.onAccent; c.lineWidth = 4
            c.beginPath(); c.arc(x, y - 22, 16, Math.PI * .8, Math.PI * .2); c.lineTo(x, y); c.closePath(); c.fill(); c.stroke()
            c.fillStyle = C.onAccent; c.beginPath(); c.arc(x, y - 22, 6, 0, Math.PI * 2); c.fill()
            c.font = `700 28px ${FONT}`
            const w = c.measureText(selected.label).width + 32
            const bx = Math.min(X + S - w - 10, Math.max(X + 10, x - w / 2)), by = y - 92 < Y + 8 ? y + 14 : y - 92
            c.fillStyle = 'rgba(12,29,32,.92)'; c.beginPath(); c.roundRect(bx, by, w, 44, 14); c.fill()
            this.text(selected.label, bx + w / 2, by + 23, { size: 28, weight: 700, color: C.accent, align: 'center' })
            // Distance on the ground, in metres, from the car to the destination.
            const distance = Math.round(Math.hypot(p.x - player.x, p.z - player.z))
            this.text(`الانتقال إلى ${selected.label}`, X + S, Y + S + 44, { size: 30, weight: 600, max: 430 })
            this.text(distance < 8 ? 'أنت هنا' : `على بعد ${distance} م`, X, Y + S + 44, { size: 28, weight: 600, color: C.accent, align: 'left' })
        }

        // Destination list (right column, RTL).
        const LX = 672, LW = 288, H = 41, G = 3.5
        this.pageCount = 1
        this.items.forEach((item, i) => {
            const y = Y + i * (H + G), active = i === this.selected
            c.fillStyle = active ? C.accent : i % 2 ? C.card : 'rgba(27,53,55,.55)'
            c.beginPath(); c.roundRect(LX, y, LW, H, 12); c.fill()
            this.text(item.label, LX + LW - 16, y + H / 2 + 1, { size: 26, weight: active ? 700 : 500, color: active ? C.onAccent : C.text, max: LW - 32 })
        })
    }
}
