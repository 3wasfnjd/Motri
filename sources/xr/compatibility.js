import { Quaternion, Vector3 } from 'three/webgpu'

// Three r183's WebGL backend treats every XR render target as a native FBO.
// Meta's desktop emulator draws its XRWebGLLayer into the default framebuffer
// (null), which cannot be a WeakMap key or use COLOR_ATTACHMENT0. Keep native
// Quest framebuffers on Three's normal path and use BACK only for that fallback.
export function installXRFramebufferCompatibility(renderer) {
    const state = renderer.backend?.state
    if(!state?.drawBuffers) return
    const drawBuffers = state.drawBuffers
    state.drawBuffers = function(context, framebuffer) {
        if(framebuffer === null && context.renderTarget?.isXRRenderTarget) {
            this.bindFramebuffer(this.gl.FRAMEBUFFER, null)
            this.gl.drawBuffers([this.gl.BACK])
            return
        }
        return drawBuffers.call(this, context, framebuffer)
    }
}

// r183's union frustum mixes units: the eye distance is measured in world units
// but near/far/FOV come from the eyes' unscaled projections. Under the tabletop
// rig (world units per metre ≈ 140) the union camera is pushed far behind the
// eyes and culls visible scenery. Rebuild it in rig units so culling stays valid.
const _left = new Vector3(), _right = new Vector3(), _position = new Vector3(), _scale = new Vector3(), _offset = new Vector3()
const _quaternion = new Quaternion()
export function setScaledProjectionFromUnion(camera, cameraL, cameraR) {
    cameraL.matrixWorld.decompose(_position, _quaternion, _scale)
    const scale = _scale.x
    const ipd = _left.setFromMatrixPosition(cameraL.matrixWorld).distanceTo(_right.setFromMatrixPosition(cameraR.matrixWorld)) / scale
    const projL = cameraL.projectionMatrix.elements, projR = cameraR.projectionMatrix.elements
    const near = projL[14] / (projL[10] - 1), far = projL[14] / (projL[10] + 1)
    const topFov = (projL[9] + 1) / projL[5], bottomFov = (projL[9] - 1) / projL[5]
    const leftFov = (projL[8] - 1) / projL[0], rightFov = (projR[8] + 1) / projR[0]
    const zOffset = ipd / (-leftFov + rightFov), xOffset = zOffset * -leftFov
    _position.add(_offset.set(xOffset * scale, 0, zOffset * scale).applyQuaternion(_quaternion))
    camera.matrixWorld.compose(_position, _quaternion, _scale)
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert()
    if(projL[10] === -1) {
        camera.projectionMatrix.copy(cameraL.projectionMatrix)
    } else {
        const near2 = near + zOffset, far2 = far + zOffset
        camera.projectionMatrix.makePerspective(near * leftFov - xOffset, near * rightFov + ipd - xOffset,
            topFov * far / far2 * near2, bottomFov * far / far2 * near2, near2, far2)
    }
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
}

export function installXRScaledStereoCulling(renderer) {
    const xr = renderer.xr
    const updateCamera = xr.updateCamera
    xr.updateCamera = function(camera) {
        updateCamera.call(this, camera)
        const cameraXR = this.getCamera()
        const [cameraL, cameraR] = cameraXR.cameras
        if(!cameraR || Math.abs(cameraL.matrixWorld.getMaxScaleOnAxis() - 1) < 1e-6) return
        setScaledProjectionFromUnion(cameraXR, cameraL, cameraR)
    }
}

// r183 shares camera uniform buffers across materials, but stores each buffer's
// binding index globally. A helper shader and a terrain shader have different
// layouts: cameraIndex can overwrite a terrain/instance buffer at the same slot.
// Resolve slots from each draw's layout and link each program to that layout once.
export function installXRBindingCompatibility(renderer) {
    const backend = renderer.backend
    if(!backend?.isWebGLBackend) return
    const layouts = new WeakMap()
    const linkedPrograms = new WeakSet()
    const draw = backend.draw
    backend.draw = function(renderObject, ...args) {
        const groups = renderObject.getBindings()
        let layout = layouts.get(groups)
        if(!layout) {
            layout = []
            let buffers = 0, textures = 0
            for(const group of groups) for(const binding of group.bindings) {
                if(binding.isUniformBuffer || binding.isUniformsGroup) layout.push({ binding, index: buffers++, buffer: true })
                else if(binding.isSampledTexture) layout.push({ binding, index: textures++, buffer: false })
            }
            layouts.set(groups, layout)
        }
        for(const item of layout) this.get(item.binding).index = item.index
        const program = this.get(renderObject.pipeline).programGPU
        if(!linkedPrograms.has(program)) {
            const gl = this.gl
            this.state.useProgram(program)
            for(const item of layout) {
                if(item.buffer) {
                    const location = gl.getUniformBlockIndex(program, item.binding.name)
                    if(location !== gl.INVALID_INDEX) gl.uniformBlockBinding(program, location, item.index)
                } else {
                    const location = gl.getUniformLocation(program, item.binding.name)
                    if(location !== null) gl.uniform1i(location, item.index)
                }
            }
            linkedPrograms.add(program)
        }
        return draw.call(this, renderObject, ...args)
    }
}
