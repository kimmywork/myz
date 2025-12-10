interface Node {
  id: string;
  vector: Float32Array;
  level: number;
  neighbors: string[][]; // neighbors[level] = [id1, id2, ...]
}

export interface HNSWConfig {
  M?: number;
  efConstruction?: number;
  efSearch?: number;
  levelMultiplier?: number;
}

export class HNSWIndex {
  private nodes: Map<string, Node> = new Map();
  private entryPointId: string | null = null;
  private M: number;
  private efConstruction: number;
  private efSearch: number;
  private levelMultiplier: number;
  private maxLevel: number = 0;

  constructor(config: HNSWConfig = {}) {
    this.M = config.M || 16;
    this.efConstruction = config.efConstruction || 200;
    this.efSearch = config.efSearch || 200; // Increased default efSearch for better recall
    this.levelMultiplier = config.levelMultiplier || (1 / Math.log(this.M));
  }

  public addPoint(id: string, vector: number[]): Set<string> {
    const floatVector = new Float32Array(vector);
    const touchedNodes = new Set<string>();
    
    if (this.nodes.has(id)) {
      throw new Error(`Node with id ${id} already exists`);
    }

    const level = this.getRandomLevel();
    const newNode: Node = {
      id,
      vector: floatVector,
      level,
      neighbors: Array(level + 1).fill([]).map(() => [])
    };

    this.nodes.set(id, newNode);
    touchedNodes.add(id);

    if (this.entryPointId === null) {
      this.entryPointId = id;
      this.maxLevel = level;
      return touchedNodes;
    }

    let currObj = this.nodes.get(this.entryPointId)!;
    let currDist = this.dist(floatVector, currObj.vector);

    // Search from top level down to level + 1
    for (let l = this.maxLevel; l > level; l--) {
      let changed = true;
      while (changed) {
        changed = false;
        const neighbors = currObj.neighbors[l];
        
        let bestNeighbor: Node | null = null;
        let bestDist = currDist;

        for (const neighborId of neighbors) {
          const neighbor = this.nodes.get(neighborId)!;
          const d = this.dist(floatVector, neighbor.vector);
          if (d > bestDist) {
            bestDist = d;
            bestNeighbor = neighbor;
          }
        }

        if (bestNeighbor) {
          currDist = bestDist;
          currObj = bestNeighbor;
          changed = true;
        }
      }
    }

    // From level down to 0, connect
    for (let l = Math.min(level, this.maxLevel); l >= 0; l--) {
      // Search for nearest neighbors in this layer
      const W = this.searchLayer(floatVector, currObj, this.efConstruction, l);
      
      // Connect newNode to neighbors
      const neighbors = this.selectNeighbors(W, this.M);
      newNode.neighbors[l] = neighbors.map(n => n.id);
      // newNode is already in touchedNodes

      // Connect neighbors to newNode
      for (const neighborInfo of neighbors) {
        const neighbor = this.nodes.get(neighborInfo.id)!;
        neighbor.neighbors[l].push(id);
        touchedNodes.add(neighbor.id);
        
        // Shrink connections if needed
        if (neighbor.neighbors[l].length > this.M) {
           // Re-evaluate neighbors for this node
           const neighborCandidates = neighbor.neighbors[l].map(nid => {
             const n = this.nodes.get(nid)!;
             return { id: nid, score: this.dist(neighbor.vector, n.vector) };
           });
           // Keep best M
           neighbor.neighbors[l] = this.selectNeighbors(neighborCandidates, this.M).map(n => n.id);
           // neighbor is already in touchedNodes
        }
      }
      
      // Update entry point for next iteration (closest found so far)
      if (W.length > 0) {
          currObj = this.nodes.get(W[0].id)!;
      }
    }

    if (level > this.maxLevel) {
      this.maxLevel = level;
      this.entryPointId = id;
    }

    return touchedNodes;
  }

  public getNode(id: string): Node | undefined {
    return this.nodes.get(id);
  }

  public search(query: number[], k: number): { id: string; score: number }[] {
    if (this.entryPointId === null) return [];

    const queryVector = new Float32Array(query);
    let currObj = this.nodes.get(this.entryPointId)!;
    let currDist = this.dist(queryVector, currObj.vector);

    // 1. Zoom in from top to layer 1
    for (let l = this.maxLevel; l > 0; l--) {
      let changed = true;
      while (changed) {
        changed = false;
        const neighbors = currObj.neighbors[l];
        
        let bestNeighbor: Node | null = null;
        let bestDist = currDist;

        for (const neighborId of neighbors) {
          const neighbor = this.nodes.get(neighborId)!;
          const d = this.dist(queryVector, neighbor.vector);
          if (d > bestDist) {
            bestDist = d;
            bestNeighbor = neighbor;
          }
        }

        if (bestNeighbor) {
          currDist = bestDist;
          currObj = bestNeighbor;
          changed = true;
        }
      }
    }

    // 2. Search layer 0 with efSearch
    const W = this.searchLayer(queryVector, currObj, this.efSearch, 0);
    
    // 3. Return top K
    return W.slice(0, k);
  }

  private searchLayer(query: Float32Array, entry: Node, ef: number, level: number): { id: string; score: number }[] {
    const v = new Set<string>();
    v.add(entry.id);

    // Candidates: min-heap by score (we want to explore best candidates)
    // But JS doesn't have a heap. We'll use an array and sort.
    // Since ef is small (e.g. 50-200), sorting is acceptable.
    
    let C: { id: string; score: number }[] = [{ id: entry.id, score: this.dist(query, entry.vector) }];
    let W: { id: string; score: number }[] = [{ id: entry.id, score: this.dist(query, entry.vector) }];

    while (C.length > 0) {
      // Get candidate with BEST score (closest)
      C.sort((a, b) => b.score - a.score); // Descending
      const c = C.shift()!; // Best candidate
      
      // Get worst result in W (lowest score)
      W.sort((a, b) => b.score - a.score); // Descending
      const f = W[W.length - 1];

      if (c.score < f.score && W.length >= ef) {
        // If candidate is worse than the worst in W, and W is full, stop exploring this branch
        // Optimization: in HNSW paper, it breaks.
        // For Cosine: score is similarity. Lower score = worse.
        break;
      }

      const cNode = this.nodes.get(c.id)!;
      const neighbors = cNode.neighbors[level];

      for (const neighborId of neighbors) {
        if (!v.has(neighborId)) {
          v.add(neighborId);
          const neighbor = this.nodes.get(neighborId)!;
          const score = this.dist(query, neighbor.vector);
          
          // If score is better than worst in W, or W is not full
          if (W.length < ef || score > f.score) {
            const e = { id: neighborId, score };
            C.push(e);
            W.push(e);
            
            // Keep W size <= ef
            W.sort((a, b) => b.score - a.score);
            if (W.length > ef) {
              W.pop(); // Remove worst
            }
          }
        }
      }
    }

    return W;
  }

  private selectNeighbors(candidates: { id: string; score: number }[], M: number): { id: string; score: number }[] {
    // Simple heuristic: select M closest
    // HNSW paper suggests heuristic for diversity, but simple selection works for basic implementation
    return candidates.sort((a, b) => b.score - a.score).slice(0, M);
  }

  private dist(a: Float32Array, b: Float32Array): number {
    // Cosine Similarity
    // Assuming vectors are NOT normalized, we need full calc.
    // But transformers.js usually normalizes.
    // Let's assume normalized for speed if possible, but safe to calc full.
    // Re-using the vector.ts logic but optimized for Float32Array
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-6);
  }

  private getRandomLevel(): number {
    let level = 0;
    while (Math.random() < this.levelMultiplier && level < 16) {
      level++;
    }
    return level;
  }

  public toJSON() {
    return {
      M: this.M,
      efConstruction: this.efConstruction,
      efSearch: this.efSearch,
      levelMultiplier: this.levelMultiplier,
      maxLevel: this.maxLevel,
      entryPointId: this.entryPointId,
      nodes: Array.from(this.nodes.entries()).map(([id, node]) => ({
        id,
        vector: Array.from(node.vector), // Float32Array to Array
        level: node.level,
        neighbors: node.neighbors
      }))
    };
  }

  public static fromJSON(json: any): HNSWIndex {
    const index = new HNSWIndex({
      M: json.M,
      efConstruction: json.efConstruction,
      efSearch: json.efSearch,
      levelMultiplier: json.levelMultiplier
    });
    index.maxLevel = json.maxLevel;
    index.entryPointId = json.entryPointId;
    
    for (const nodeData of json.nodes) {
      index.nodes.set(nodeData.id, {
        id: nodeData.id,
        vector: new Float32Array(nodeData.vector),
        level: nodeData.level,
        neighbors: nodeData.neighbors
      });
    }
    return index;
  }
}
