import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import { Events } from '../sources/Game/Events.js'
import { VirtualReality } from '../sources/Game/VirtualReality.js'
import { readXRControls } from '../sources/Game/Inputs/XRControls.js'

const original = Object.fromEntries(['window', 'document', 'navigator', 'location'].map(key =>
    [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
afterEach(() => {
    for(const [key, descriptor] of Object.entries(original))
        if(descriptor) Object.defineProperty(globalThis, key, descriptor)
        else delete globalThis[key]
})

function controller(hand, buttons = {}, axes = [0, 0, 0, 0])
{
    return { handedness: hand, gamepad: { mapping: 'xr-standard', axes,
        buttons: Array.from({ length: 6 }, (_, index) => ({ value: buttons[index] || 0, pressed: !!buttons[index] })) } }
}

function harness()
{
    const classes = new Set()
    const button = { disabled: false, attrs: {}, classList: { toggle() {} },
        addEventListener() {}, setAttribute(key, value) { this.attrs[key] = value } }
    const status = { textContent: '', hidden: true }
    globalThis.window = { isSecureContext: true }
    globalThis.location = { href: 'https://motri.test/Motri/', search: '', assign(url) { this.assigned = url } }
    globalThis.document = {
        querySelector: selector => selector === '.js-vr-button' ? button : status,
        documentElement: { classList: { add: name => classes.add(name), remove: name => classes.delete(name) } },
        createElement: () => ({ getContext: () => ({ clearRect() {}, fillRect() {}, fillText() {} }) })
    }
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
        xr: { isSessionSupported: async () => true }
    } })
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(25, 1, 0.1, 200)
    scene.add(camera)
    const log = []
    const actions = new Map(['forward', 'interact', 'suspensions', 'honk', 'respawn', 'boost'].map(name =>
        [name, { name, keys: [], activeKeys: new Set(), active: false }]))
    const xr = new THREE.EventDispatcher()
    let pose = { transform: { position: new THREE.Vector3(0, 1.65, 0), orientation: new THREE.Quaternion() } }
    Object.assign(xr, {
        setReferenceSpaceType() {}, setFramebufferScaleFactor() {}, setFoveation() {},
        getReferenceSpace: () => ({ addEventListener() {} }),
        getFrame: () => ({ getViewerPose: () => pose }),
        updateCamera: target => {
            target.position.copy(pose.transform.position)
            target.quaternion.copy(pose.transform.orientation)
            target.updateMatrixWorld(true)
        },
        setSession: async () => {}
    })
    const game = {
        scene, ticker: { delta: 1 / 72 },
        inputs: {
            actions, mode: 1, allowed: true,
            checkCategory() { return this.allowed },
            start(key) { const action = actions.get(key.split('.')[1]); action.active = true; action.activeKeys.add(key); log.push(['start', key]) },
            end(key) { const action = actions.get(key.split('.')[1]); if(action) { action.active = false; action.activeKeys.delete(key) }; log.push(['end', key]) },
            updateMode(mode) { this.mode = mode },
            nipple: { active: false, progress: 0, group: { visible: false } }
        },
        player: { position: new THREE.Vector3(10, 1, 20), accelerating: 0, steering: 0, boosting: 0, braking: 0 },
        physicalVehicle: { forward: new THREE.Vector3(1, 0, 0) },
        rendering: { renderer: { xr, backend: { isWebGPUBackend: false } }, resize() {} },
        view: { camera, position: new THREE.Vector3(),
            speedLines: { mesh: { visible: true } },
            focusPoint: { position: new THREE.Vector3(), smoothedPosition: new THREE.Vector3() },
            optimalArea: { position: new THREE.Vector3(), quad2: Array.from({ length: 4 }, () => ({ offseted: new THREE.Vector2() })) },
            update() {} },
        quality: { level: 0, changeLevel(level) { this.level = level } },
        viewport: { events: new Events() },
        menu: { events: new Events(), close() {} }, modals: { events: new Events(), close() {} },
        audio: { init() {} }, reveal: { step: 0, start() { this.step = 1 } }
    }
    const vr = new VirtualReality(game)
    game.vr = vr
    vr.setReady()
    const session = {
        visibilityState: 'visible', inputSources: [], addEventListener() {},
        end: async () => { xr.dispatchEvent({ type: 'sessionend' }) }
    }
    vr.session = session
    return { vr, game, button, status, log, session, classes, setPose: next => { pose = next } }
}

test('Quest controls use handedness and xr-standard indexes, independent of source order', () => {
    const left = controller('left', { 0: .3, 1: .4, 4: 1 }, [0, 0, .575, 0])
    const right = controller('right', { 0: .8, 1: 1, 4: 1, 5: 1 })
    const input = readXRControls([right, left])
    assert.deepEqual(input, readXRControls([left, right]))
    assert.ok(Math.abs(input.steering + .5) < 1e-6)
    assert.equal(input.throttle, .8)
    assert.equal(input.reverse, .3)
    assert.equal(input.brake, .4)
    assert.equal(input.jump && input.interact && input.boost && input.view, true)
})

test('deadzone, non-XR pads, hand tracking and disconnected sources produce no phantom motion', () => {
    const small = readXRControls([controller('left', {}, [0, 0, .1, 0])])
    assert.equal(small.steering, 0)
    const ordinary = controller('right', { 0: 1 })
    ordinary.gamepad.mapping = 'standard'
    const ignored = readXRControls([ordinary, { handedness: 'left' }])
    assert.equal(ignored.throttle, 0)
    assert.equal(ignored.connected, false)
})

test('entry/resume requires neutral controls; disconnect and loss of focus release boost and throttle', async () => {
    const { vr, session, game } = harness()
    await vr.supportPromise
    vr.begin()
    session.inputSources = [controller('right', { 0: 1, 5: 1 })]
    vr.updateInputs()
    vr.applyDriving(game.player)
    assert.equal(game.player.accelerating, 0)
    session.inputSources = [controller('right')]
    vr.updateInputs()
    session.inputSources = [controller('right', { 0: .7, 5: 1 })]
    vr.updateInputs()
    vr.applyDriving(game.player)
    assert.equal(game.player.accelerating, .7)
    assert.equal(game.player.boosting, 1)
    session.visibilityState = 'visible-blurred'
    vr.updateInputs()
    assert.equal(game.player.accelerating, 0)
    assert.equal(game.inputs.actions.get('boost').active, false)
    session.visibilityState = 'visible'
    vr.updateInputs()
    assert.equal(vr.armed, false)
    session.inputSources = []
    vr.updateInputs()
    assert.equal(vr.controls.connected, false)
})

test('modal/category gating brakes the car and analog reverse/handbrake are respected', async () => {
    const { vr, game } = harness()
    await vr.supportPromise
    vr.armed = true
    vr.controls = readXRControls([controller('left', { 0: .6 })])
    vr.applyDriving(game.player)
    assert.equal(game.player.accelerating, -.6)
    vr.controls.brake = .8
    vr.applyDriving(game.player)
    assert.equal(game.player.accelerating, 0)
    assert.equal(game.player.braking, .8)
    game.inputs.allowed = false
    vr.applyDriving(game.player)
    assert.equal(game.player.braking, 1)
})

test('head calibration preserves eye height while vehicle yaw aligns forward and roll stays level', async () => {
    const { vr, game, setPose } = harness()
    await vr.supportPromise
    vr.begin()
    // A seated, off-center viewer initially looking 90 degrees right.
    setPose({ transform: { position: new THREE.Vector3(.5, .7, -.3),
        orientation: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2) } })
    vr.updateView()
    assert.ok(game.view.position.distanceTo(new THREE.Vector3(10.35, 2.45, 20)) < 1e-6)
    assert.ok(game.view.camera.getWorldDirection(new THREE.Vector3()).distanceTo(new THREE.Vector3(1, 0, 0)) < 1e-6)
    assert.equal(vr.rig.rotation.x, 0)
    assert.equal(vr.rig.rotation.z, 0)
    // Physical head movement remains six-degree-of-freedom after calibration.
    setPose({ transform: { position: new THREE.Vector3(.5, .9, -.3), orientation: new THREE.Quaternion() } })
    vr.updateView()
    assert.ok(Math.abs(game.view.position.y - 2.65) < 1e-6)
    assert.ok(game.view.camera.getWorldDirection(new THREE.Vector3()).distanceTo(new THREE.Vector3(0, 0, -1)) < 1e-6)
})

test('session end and re-entry restore camera parent, quality, input mode and screen effects', async () => {
    const { vr, game, session, classes } = harness()
    await vr.supportPromise
    for(let i = 0; i < 2; i++)
    {
        vr.session = session
        vr.begin()
        assert.equal(game.view.camera.parent, vr.rig)
        assert.equal(game.quality.level, 1)
        await vr.exit()
        assert.equal(vr.active, false)
        assert.equal(game.view.camera.parent, game.scene)
        assert.equal(game.view.camera.far, 200)
        assert.equal(game.view.camera.fov, 25)
        assert.equal(game.quality.level, 0)
        assert.equal(game.inputs.mode, 1)
        assert.equal(game.view.speedLines.mesh.visible, true)
        assert.equal(classes.has('is-vr'), false)
    }
})

test('opening an HTML menu exits VR so its controls remain accessible in the browser', async () => {
    const { vr, game } = harness()
    await vr.supportPromise
    vr.begin()
    game.menu.events.trigger('open')
    await Promise.resolve()
    assert.equal(vr.active, false)
    assert.equal(vr.session, null)
})

test('re-entering VR does not duplicate ambient audio or playlists', async () => {
    const { vr, game, session } = harness()
    await vr.supportPromise
    game.reveal.step = 2
    let initializations = 0
    game.audio.init = () => initializations++
    vr.begin()
    await vr.exit()
    vr.session = session
    vr.begin()
    assert.equal(initializations, 0)
})

test('permission rejection leaves normal play and the entry button usable', async () => {
    const { vr, game, button, status } = harness()
    await vr.supportPromise
    navigator.xr.requestSession = async () => { throw Object.assign(new Error('Denied'), { name: 'NotAllowedError' }) }
    const savedWarn = console.warn
    console.warn = () => {}
    try { await vr.enter() } finally { console.warn = savedWarn }
    assert.equal(vr.active, false)
    assert.equal(vr.pending, false)
    assert.equal(button.disabled, false)
    assert.equal(button.attrs['aria-busy'], 'false')
    assert.equal(game.view.camera.parent, game.scene)
    assert.match(status.textContent, /لم يُسمح/)
})

test('VR explicitly prepares WebGL while preserving the current URL and requiring a fresh gesture', async () => {
    const { vr, game } = harness()
    await vr.supportPromise
    game.rendering.renderer.backend.isWebGPUBackend = true
    location.href = 'https://motri.test/Motri/?language=ar#skip'
    let requests = 0
    navigator.xr.requestSession = async () => { requests++ }
    await vr.enter()
    assert.equal(location.assigned, 'https://motri.test/Motri/?language=ar&vr=1#skip')
    assert.equal(vr.active, false)
    assert.equal(requests, 0)
})
