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
