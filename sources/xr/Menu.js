import * as THREE from 'three/webgpu'
import { VEHICLE_BODY_STYLES } from '../Game/World/VehicleBodyStyles.js'

// A stereo canvas panel, controlled entirely with either Touch controller.
// It calls the existing vehicle/settings APIs rather than opening hidden HTML.
export class XRMenu {
    constructor(xr) {
        this.xr = xr
        this.game = xr.game
        this.opened = false
        this.canvas = document.createElement('canvas')
        this.canvas.width = 1024; this.canvas.height = 1024
        this.ctx = this.canvas.getContext('2d')
        this.texture = new THREE.CanvasTexture(this.canvas)
        this.texture.colorSpace = THREE.SRGBColorSpace
        this.texture.generateMipmaps = false
        this.texture.minFilter = THREE.LinearFilter
        this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(.82, .82), new THREE.MeshBasicNodeMaterial({ map: this.texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }))
        this.mesh.position.set(0, 0, -1.05)
        this.mesh.renderOrder = 120
        this.mesh.visible = false
        this.mesh.frustumCulled = false
        xr.camera.add(this.mesh)
    }

    toggle() { this.opened ? this.close() : this.open() }
    open() {
        this.xr.actions.release()
        this.filters = [...this.game.inputs.filters]
        this.game.inputs.filters.clear(); this.game.inputs.filters.add('xr-menu')
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
    back() { this.page === 'home' ? this.close() : this.show('home') }

    show(page) {
        this.page = page
        this.selected = 0
        this.lines = null
        const item = (id, label, action) => ({ id, label, action })
        const go = (id, label) => item(id, label, () => this.show(id))
        const finish = action => () => { this.close(); action() }
        if(page === 'home') {
            this.title = 'موتري'
            this.items = [go('cars', 'اختيار السيارة'), go('settings', 'الإعدادات'), go('locations', 'الخريطة والمناطق'), go('achievements', 'الإنجازات'), go('menus', 'قوائم اللعبة'), item('resume', 'متابعة القيادة', () => this.close())]
        } else if(page === 'cars') {
            this.title = 'اختيار السيارة'
            this.items = VEHICLE_BODY_STYLES.map(style => item(style.id, `${this.game.world.visualVehicle.bodyStyles.current === style.id ? '✓  ' : ''}${style.label}`, () => {
                this.game.world.visualVehicle.bodyStyles.changeTo(style.id)
                this.show('cars')
                this.selected = VEHICLE_BODY_STYLES.indexOf(style)
                this.draw()
                this.xr.pulse()
            }))
        } else if(page === 'settings') {
            this.title = 'الإعدادات'
            this.items = [
                item('sound', `الصوت: ${this.game.audio.mute.active ? 'مكتوم' : 'يعمل'}`, () => { this.game.audio.mute.toggle(); this.show(page) }),
                item('quality', `جودة الرسوم: ${this.game.quality.level === 0 ? 'عالية' : 'منخفضة'}`, () => { this.game.quality.changeLevel(this.game.quality.level === 0 ? 1 : 0); this.show(page) }),
                item('view', this.xr.mode === 'immersive-ar' ? 'تحديد سطح آخر' : `الكاميرا: ${this.xr.vehicleCamera.mode === 'driver' ? 'داخل السيارة' : 'خلف السيارة'}`, finish(() => this.xr.mode === 'immersive-ar' ? this.xr.reposition() : this.xr.setCameraMode(this.xr.vehicleCamera.mode === 'driver' ? 'chase' : 'driver'))),
                item('recenter', this.xr.mode === 'immersive-ar' ? 'مسح الغرفة' : 'توسيط النظر', finish(() => { if(this.xr.mode === 'immersive-ar') this.xr.captureRoom(); else { this.xr.lookYaw = 0; this.xr.headOrigin.copy(this.xr.viewerPosition) } })),
                item('recover', 'إعادة السيارة', finish(() => { this.game.player.respawn(); this.xr.vehicleCamera.reset() })),
                item('reset', 'إعادة الأشياء إلى أماكنها', finish(() => this.game.reset())),
                item('exit', 'الخروج من النظارة', finish(() => this.xr.exit()))
            ]
        } else if(page === 'locations') {
            this.title = 'الخريطة والمناطق'
            const names = { landing: 'البداية', achievements: 'الإنجازات', altar: 'المنصة', bowling: 'البولينغ', career: 'قاعة العرض', circuit: 'الحلبة', cookie: 'الكوكي', lab: 'منطقة التجارب', projects: 'المعرض', restHouse: 'الاستراحة', sheepPen: 'حوش الغنم', camelCamp: 'مراح الإبل', dunes: 'النفود', behindTheScene: 'خلف الكواليس' }
            this.items = [...this.game.respawns.items.keys()].filter(name => names[name]).map(name => item(name, names[name], finish(() => { this.game.player.respawn(name); this.xr.vehicleCamera.reset() })))
        } else if(page === 'achievements') {
            const progress = this.game.achievements.globalProgress
            this.title = `الإنجازات  ${progress.achievedCount} / ${progress.totalCount}`
            this.items = [...this.game.achievements.groups.values()].flatMap(group => group.items.map(a => item('achievement', `${a.achieved ? '✓ ' : ''}${a.itemElement.querySelector('.title').textContent}  ${a.progressCurrentElement.textContent}/${a.total}`, () => this.read(a.itemElement.querySelector('.title').textContent, a.itemElement.querySelector('.description .text').textContent))))
        } else if(page === 'menus') {
            this.title = 'قوائم اللعبة'
            this.items = [...this.game.menu.items.values()].map(entry => item(entry.name, entry.navigationElement.getAttribute('aria-label') || entry.name, () => {
                if(entry.name === 'options') this.show('settings')
                else if(entry.name === 'achievements') this.show('achievements')
                else if(entry.name === 'controls') this.read('التحكم', 'X: القائمة. العصا اليسرى للتوجيه. VR: الزناد الأيمن للقيادة والأيسر للرجوع. القبضة اليمنى فرامل واليسرى تسارع إضافي. Y لتبديل الكاميرا. A للتفاعل والقفز. AR: العصا اليسرى للقيادة واليمنى للحجم والدوران. داخل القائمة: العصا للتنقل والزناد للاختيار وY أو B للرجوع.')
                else {
                    const copy = entry.contentElement.cloneNode(true)
                    copy.querySelectorAll('button,form,svg,img,.tooltip,[hidden]').forEach(el => el.remove())
                    this.read(entry.navigationElement.getAttribute('aria-label'), copy.textContent, entry.name)
                }
            }))
        }
        this.draw()
    }

    read(title, text, source = null) {
        this.page = 'read'; this.title = title; this.selected = 0; this.textPage = 0
        this.ctx.font = '36px system-ui'
        this.lines = []; let line = ''
        for(const word of text.trim().split(/\s+/)) {
            const next = line ? `${line} ${word}` : word
            if(this.ctx.measureText(next).width > 850 && line) { this.lines.push(line); line = word }
            else line = next
        }
        if(line) this.lines.push(line)
        this.items = []
        if(this.lines.length > 12) this.items.push({ id: 'next', label: 'الصفحة التالية', action: () => { this.textPage = (this.textPage + 1) % Math.ceil(this.lines.length / 12); this.draw() } })
        if(source) this.items.push({ id: 'full', label: 'فتح القائمة الكاملة في المتصفح', action: () => { this.close(); this.xr.browserMenu = source; this.xr.exit() } })
        this.items.push({ id: 'back', label: 'رجوع', action: () => this.show('menus') })
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

    draw() {
        const c = this.ctx
        c.clearRect(0, 0, 1024, 1024)
        c.fillStyle = 'rgba(12,29,32,.97)'; c.beginPath(); c.roundRect(0, 0, 1024, 1024, 44); c.fill()
        c.strokeStyle = '#627d72'; c.lineWidth = 3; c.stroke()
        c.direction = 'rtl'; c.textAlign = 'right'; c.textBaseline = 'middle'
        c.fillStyle = '#eaf3de'; c.font = '700 54px system-ui'; c.fillText(this.title, 940, 89, 860)
        c.fillStyle = '#c6ee88'; c.fillRect(80, 142, 864, 3)
        if(this.lines) {
            c.fillStyle = '#d4dfd6'; c.font = '36px system-ui'
            this.lines.slice(this.textPage * 12, this.textPage * 12 + 12).forEach((line, i) => c.fillText(line, 940, 190 + i * 42, 860))
        }
        const start = this.lines ? 0 : Math.floor(this.selected / 6) * 6
        const rows = this.lines ? this.items : this.items.slice(start, start + 6)
        rows.forEach((item, i) => {
            const y = this.lines ? 715 + i * 67 : 183 + i * 113
            const active = start + i === this.selected
            c.fillStyle = active ? '#c6ee88' : '#203c3e'; c.beginPath(); c.roundRect(70, y, 884, this.lines ? 57 : 94, 20); c.fill()
            c.fillStyle = active ? '#132a22' : '#eff4e6'; c.font = `600 ${this.lines ? 30 : 40}px system-ui`; c.fillText(item.label, 923, y + (this.lines ? 28 : 47), 822)
        })
        c.fillStyle = '#a9bcb5'; c.font = '26px system-ui'; c.textAlign = 'center'
        if(!this.lines && this.items.length > 6) c.fillText(`${Math.floor(this.selected / 6) + 1} / ${Math.ceil(this.items.length / 6)}`, 512, 910)
        c.fillText('العصا: تنقل   •   الزناد: اختيار   •   Y: رجوع   •   X: إغلاق', 512, 970, 925)
        this.texture.needsUpdate = true
    }
}
