import gsap from 'gsap'

// Own the root timeline for the lifetime of the XR page, including its lobby.
// Quest can suspend window.requestAnimationFrame during an immersive session.
// The renderer clock continues, so explosions, recovery and activities do too.
export class AnimationClock {
    constructor() {
        this.time = gsap.globalTimeline.time()
        this.previous = null
        gsap.ticker.remove(gsap.updateRoot)
    }

    update(timestamp) {
        if(!Number.isFinite(timestamp)) return
        if(this.previous !== null && timestamp > this.previous)
            this.time += Math.min((timestamp - this.previous) / 1000, 0.05)
        this.previous = timestamp
        gsap.updateRoot(this.time)
    }
}
