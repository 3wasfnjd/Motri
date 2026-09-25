// A small, lazy navigation grid shared by the six birds. Only return trips use
// A*: ordinary roaming and fleeing keep their inexpensive local steering.
const directions = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]

export class RestHousePoultryNavigation {
    constructor(bounds, staticFree, segmentFree) {
        this.bounds = bounds
        this.staticFree = staticFree
        this.segmentFree = segmentFree
        this.cell = .4
        this.width = Math.floor((bounds[1] - bounds[0]) / this.cell) + 1
        this.height = Math.floor((bounds[3] - bounds[2]) / this.cell) + 1
        this.count = this.width * this.height
        this.grids = new Map()
    }

    point(id) {
        return { x: this.bounds[0] + id % this.width * this.cell, z: this.bounds[2] + Math.floor(id / this.width) * this.cell }
    }

    findPath(start, goal, radius, freeFor) {
        if(this.segmentFree(start.x, start.z, goal.x, goal.z, radius, freeFor)) return [goal]
        let grid = this.grids.get(radius)
        if(!grid) {
            grid = { nodes: new Uint8Array(this.count), edges: new Uint8Array(this.count), knownEdges: new Uint8Array(this.count) }
            this.grids.set(radius, grid)
        }
        const nodeFree = id => {
            if(!grid.nodes[id]) {
                const p = this.point(id)
                grid.nodes[id] = this.staticFree(p.x, p.z, radius) ? 2 : 1
            }
            return grid.nodes[id] === 2
        }
        const edgeFree = (id, next, direction) => {
            const bit = 1 << direction
            if(!(grid.knownEdges[id] & bit)) {
                const a = this.point(id), b = this.point(next)
                const clear = this.segmentFree(a.x, a.z, b.x, b.z, radius)
                const opposite = 1 << ((direction + 4) % 8)
                grid.knownEdges[id] |= bit; grid.knownEdges[next] |= opposite
                if(clear) { grid.edges[id] |= bit; grid.edges[next] |= opposite }
            }
            return Boolean(grid.edges[id] & bit)
        }
        const nearest = p => {
            const cx = Math.round((p.x - this.bounds[0]) / this.cell)
            const cz = Math.round((p.z - this.bounds[2]) / this.cell)
            let best = -1, shortest = Infinity
            for(let dz = -2; dz <= 2; dz++) for(let dx = -2; dx <= 2; dx++) {
                const x = cx + dx, z = cz + dz
                if(x < 0 || x >= this.width || z < 0 || z >= this.height) continue
                const id = z * this.width + x, q = this.point(id), length = Math.hypot(q.x - p.x, q.z - p.z)
                if(length >= shortest || !nodeFree(id) || !freeFor(q.x, q.z)) continue
                if(!this.segmentFree(p.x, p.z, q.x, q.z, radius, freeFor)) continue
                shortest = length; best = id
            }
            return best
        }
        const first = nearest(start), last = nearest(goal)
        if(first < 0 || last < 0) return []
        const costs = new Float32Array(this.count).fill(Infinity)
        const parents = new Int32Array(this.count).fill(-1), closed = new Uint8Array(this.count)
        const heap = []
        const heuristic = id => {
            const dx = Math.abs(id % this.width - last % this.width)
            const dz = Math.abs(Math.floor(id / this.width) - Math.floor(last / this.width))
            return (Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz)) * this.cell
        }
        const push = (id, score) => {
            const item = { id, score }; let i = heap.length
            heap.push(item)
            while(i > 0) {
                const parent = (i - 1) >> 1
                if(heap[parent].score <= score) break
                heap[i] = heap[parent]; i = parent
            }
            heap[i] = item
        }
        const pop = () => {
            const first = heap[0], tail = heap.pop()
            if(heap.length) {
                let i = 0
                while(i * 2 + 1 < heap.length) {
                    let child = i * 2 + 1
                    if(child + 1 < heap.length && heap[child + 1].score < heap[child].score) child++
                    if(tail.score <= heap[child].score) break
                    heap[i] = heap[child]; i = child
                }
                heap[i] = tail
            }
            return first.id
        }
        costs[first] = 0; push(first, heuristic(first))
        while(heap.length) {
            const id = pop()
            if(closed[id]) continue
            closed[id] = 1
            if(id === last) {
                const route = [goal]
                for(let cursor = last; cursor !== -1; cursor = parents[cursor]) route.push(this.point(cursor))
                route.reverse()
                // Retain only corners that cannot safely be skipped. No path can
                // cut through a basin, building, tree trunk or another bird.
                const smooth = []; let from = start, i = 0
                while(i < route.length) {
                    let next = route.length - 1
                    while(next > i && !this.segmentFree(from.x, from.z, route[next].x, route[next].z, radius, freeFor)) next--
                    smooth.push(route[next]); from = route[next]; i = next + 1
                }
                return smooth
            }
            const ix = id % this.width, iz = Math.floor(id / this.width)
            for(let direction = 0; direction < directions.length; direction++) {
                const [dx, dz] = directions[direction], x = ix + dx, z = iz + dz
                if(x < 0 || x >= this.width || z < 0 || z >= this.height) continue
                const next = z * this.width + x
                if(closed[next] || !nodeFree(next)) continue
                const cost = costs[id] + this.cell * (dx && dz ? Math.SQRT2 : 1)
                if(cost >= costs[next]) continue
                const p = this.point(next)
                if(!freeFor(p.x, p.z) || !edgeFree(id, next, direction)) continue
                costs[next] = cost; parents[next] = id
                push(next, cost + heuristic(next))
            }
        }
        return []
    }
}
