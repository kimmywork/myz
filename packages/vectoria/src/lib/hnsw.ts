import type { HNSWConfig } from "../types"
import { cosineSimilarity } from "./vector"

interface Node {
  id: string
  vector: number[]
  level: number
  neighbors: string[][]
}

export class HNSWIndex {
  private nodes: Map<string, Node> = new Map()
  private entryPointId: string | null = null
  private M: number
  private Mmax: number
  private efConstruction: number
  private efSearch: number
  private levelMultiplier: number
  private maxLevel: number = 0

  constructor(config: HNSWConfig = {}) {
    this.M = config.M || 16
    this.Mmax = this.M * 2
    this.efConstruction = config.efConstruction || 200
    this.efSearch = config.efSearch || 200
    this.levelMultiplier = config.levelMultiplier || 1 / Math.log(this.M)
  }

  public addPoint(id: string, vector: number[]): Set<string> {
    const touchedNodes = new Set<string>()

    if (this.nodes.has(id)) {
      throw new Error(`Node with id ${id} already exists`)
    }

    const level = this.getRandomLevel()
    const newNode: Node = {
      id,
      vector,
      level,
      neighbors: Array.from({ length: level + 1 }, () => []),
    }

    this.nodes.set(id, newNode)
    touchedNodes.add(id)

    if (this.entryPointId === null) {
      this.entryPointId = id
      this.maxLevel = level
      return touchedNodes
    }

    let currObj = this.nodes.get(this.entryPointId)!
    let currDist = this.dist(vector, currObj.vector)

    // Search from top level down to level + 1
    for (let l = this.maxLevel; l > level; l--) {
      let changed = true
      while (changed) {
        changed = false
        const neighbors = currObj.neighbors[l]

        for (const neighborId of neighbors) {
          const neighbor = this.nodes.get(neighborId)!
          const d = this.dist(vector, neighbor.vector)
          if (d > currDist) {
            currDist = d
            currObj = neighbor
            changed = true
          }
        }
      }
    }

    // From level down to 0, connect
    for (let l = Math.min(level, this.maxLevel); l >= 0; l--) {
      const W = this.searchLayer(vector, currObj, this.efConstruction, l)

      // Select neighbors using heuristic
      const neighbors = this.selectNeighborsHeuristic(W, this.M, vector)

      newNode.neighbors[l] = neighbors.map((n) => n.id)

      for (const neighborInfo of neighbors) {
        const neighbor = this.nodes.get(neighborInfo.id)!
        touchedNodes.add(neighbor.id)

        // Add new node to neighbor's connections
        if (!neighbor.neighbors[l].includes(id)) {
          neighbor.neighbors[l].push(id)
        }

        // Shrink connections if needed
        if (neighbor.neighbors[l].length > this.Mmax) {
          const candidates = neighbor.neighbors[l].map((nid) => {
            const n = this.nodes.get(nid)!
            return { id: nid, score: this.dist(neighbor.vector, n.vector) }
          })
          const pruned = this.selectNeighborsHeuristic(
            candidates,
            this.M,
            neighbor.vector,
          )
          neighbor.neighbors[l] = pruned.map((n) => n.id)
        }
      }

      if (W.length > 0) {
        currObj = this.nodes.get(W[0].id)!
      }
    }

    if (level > this.maxLevel) {
      this.maxLevel = level
      this.entryPointId = id
    }

    return touchedNodes
  }

  public removePoint(id: string): void {
    const node = this.nodes.get(id)
    if (!node) return

    for (let l = 0; l <= node.level; l++) {
      for (const neighborId of node.neighbors[l]) {
        const neighbor = this.nodes.get(neighborId)
        if (neighbor && neighbor.neighbors[l]) {
          neighbor.neighbors[l] = neighbor.neighbors[l].filter(
            (nid) => nid !== id,
          )
        }
      }
    }

    this.nodes.delete(id)

    if (this.entryPointId === id) {
      if (this.nodes.size === 0) {
        this.entryPointId = null
        this.maxLevel = 0
      } else {
        let maxLevel = 0
        let newEntryPoint: string | null = null
        for (const [nodeId, node] of this.nodes) {
          if (node.level > maxLevel) {
            maxLevel = node.level
            newEntryPoint = nodeId
          }
        }
        this.entryPointId = newEntryPoint
        this.maxLevel = maxLevel
      }
    }
  }

  public size(): number {
    return this.nodes.size
  }

  public search(
    query: number[],
    k: number,
  ): { id: string; score: number }[] {
    if (this.entryPointId === null) return []

    let currObj = this.nodes.get(this.entryPointId)!
    let currDist = this.dist(query, currObj.vector)

    // Zoom in from top to layer 1
    for (let l = this.maxLevel; l > 0; l--) {
      let changed = true
      while (changed) {
        changed = false
        for (const neighborId of currObj.neighbors[l]) {
          const neighbor = this.nodes.get(neighborId)!
          const d = this.dist(query, neighbor.vector)
          if (d > currDist) {
            currDist = d
            currObj = neighbor
            changed = true
          }
        }
      }
    }

    // Search layer 0 with efSearch
    const W = this.searchLayer(query, currObj, this.efSearch, 0)

    return W.slice(0, k)
  }

  private searchLayer(
    query: number[],
    entry: Node,
    ef: number,
    level: number,
  ): { id: string; score: number }[] {
    const visited = new Set<string>()
    visited.add(entry.id)

    const candidates: { id: string; score: number }[] = [
      { id: entry.id, score: this.dist(query, entry.vector) },
    ]
    const results: { id: string; score: number }[] = [
      { id: entry.id, score: this.dist(query, entry.vector) },
    ]

    while (candidates.length > 0) {
      // Get best candidate (highest score = closest)
      let bestIdx = 0
      for (let i = 1; i < candidates.length; i++) {
        if (candidates[i].score > candidates[bestIdx].score) {
          bestIdx = i
        }
      }
      const c = candidates.splice(bestIdx, 1)[0]

      // Get worst result
      let worstIdx = 0
      for (let i = 1; i < results.length; i++) {
        if (results[i].score < results[worstIdx].score) {
          worstIdx = i
        }
      }
      const f = results[worstIdx]

      // If candidate is worse than worst result and results is full, stop
      if (c.score < f.score && results.length >= ef) {
        break
      }

      const cNode = this.nodes.get(c.id)!
      const neighbors = cNode.neighbors[level]

      for (const neighborId of neighbors) {
        if (!visited.has(neighborId)) {
          visited.add(neighborId)
          const neighbor = this.nodes.get(neighborId)!
          const score = this.dist(query, neighbor.vector)

          if (results.length < ef || score > f.score) {
            const e = { id: neighborId, score }
            candidates.push(e)

            // Insert into results maintaining order
            const insertIdx = this.binarySearchInsert(results, score)
            results.splice(insertIdx, 0, e)

            if (results.length > ef) {
              results.pop()
            }
          }
        }
      }
    }

    return results
  }

  /**
   * Select neighbors using heuristic from the HNSW paper.
   * Considers both distance and diversity.
   */
  private selectNeighborsHeuristic(
    candidates: { id: string; score: number }[],
    M: number,
    queryVector: number[],
  ): { id: string; score: number }[] {
    if (candidates.length <= M) {
      return [...candidates]
    }

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score)

    const selected: { id: string; score: number }[] = []
    const remaining = [...candidates]

    // Always select the closest
    selected.push(remaining.shift()!)

    while (selected.length < M && remaining.length > 0) {
      let bestIdx = 0
      let bestDistToSelected = -Infinity

      for (let i = 0; i < remaining.length; i++) {
        // Compute minimum distance to any selected node
        let minDistToSelected = Infinity
        for (const s of selected) {
          const d = this.dist(
            this.nodes.get(remaining[i].id)!.vector,
            this.nodes.get(s.id)!.vector,
          )
          if (d < minDistToSelected) {
            minDistToSelected = d
          }
        }

        // Heuristic: prefer nodes that are close to query but far from selected
        // This promotes diversity
        const distToQuery = remaining[i].score
        const diversity = minDistToSelected
        const heuristic = distToQuery + 0.5 * diversity

        if (heuristic > bestDistToSelected) {
          bestDistToSelected = heuristic
          bestIdx = i
        }
      }

      selected.push(remaining.splice(bestIdx, 1)[0])
    }

    return selected
  }

  /**
   * Binary search to find insertion index for maintaining sorted order (descending).
   */
  private binarySearchInsert(
    arr: { id: string; score: number }[],
    score: number,
  ): number {
    let low = 0
    let high = arr.length
    while (low < high) {
      const mid = (low + high) >>> 1
      if (arr[mid].score > score) {
        low = mid + 1
      } else {
        high = mid
      }
    }
    return low
  }

  private dist(a: number[], b: number[]): number {
    return cosineSimilarity(a, b)
  }

  private getRandomLevel(): number {
    let level = 0
    while (Math.random() < this.levelMultiplier && level < 16) {
      level++
    }
    return level
  }

  public toJSON() {
    return {
      M: this.M,
      Mmax: this.Mmax,
      efConstruction: this.efConstruction,
      efSearch: this.efSearch,
      levelMultiplier: this.levelMultiplier,
      maxLevel: this.maxLevel,
      entryPointId: this.entryPointId,
      nodes: Array.from(this.nodes.entries()).map(([id, node]) => ({
        id,
        vector: node.vector,
        level: node.level,
        neighbors: node.neighbors,
      })),
    }
  }

  public static fromJSON(json: any): HNSWIndex {
    const index = new HNSWIndex({
      M: json.M,
      efConstruction: json.efConstruction,
      efSearch: json.efSearch,
      levelMultiplier: json.levelMultiplier,
    })
    index.maxLevel = json.maxLevel
    index.entryPointId = json.entryPointId

    for (const nodeData of json.nodes) {
      index.nodes.set(nodeData.id, {
        id: nodeData.id,
        vector: nodeData.vector,
        level: nodeData.level,
        neighbors: nodeData.neighbors,
      })
    }
    return index
  }
}
