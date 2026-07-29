/**
 * Allocation-conscious 2D spatial hash used for boats, projectiles and hazards.
 * The simulation remains authoritative; this structure only reduces broadphase work.
 */
export class SpatialHash2D {
  constructor(cellSize = 12) {
    this.cellSize = Math.max(0.25, cellSize);
    this.inverseCellSize = 1 / this.cellSize;
    this.cells = new Map();
    this.queryStamp = 1;
    this.result = [];
  }

  clear() {
    for (const bucket of this.cells.values()) bucket.length = 0;
  }

  key(ix, iz) {
    // Integer pairing as a string is fast enough for the small deterministic world and
    // avoids precision surprises from bit packing negative coordinates.
    return `${ix},${iz}`;
  }

  bucket(ix, iz, create = false) {
    const key = this.key(ix, iz);
    let value = this.cells.get(key);
    if (!value && create) {
      value = [];
      this.cells.set(key, value);
    }
    return value;
  }

  insert(item, x, z, radius = 0) {
    const minX = Math.floor((x - radius) * this.inverseCellSize);
    const maxX = Math.floor((x + radius) * this.inverseCellSize);
    const minZ = Math.floor((z - radius) * this.inverseCellSize);
    const maxZ = Math.floor((z + radius) * this.inverseCellSize);
    for (let iz = minZ; iz <= maxZ; iz++) {
      for (let ix = minX; ix <= maxX; ix++) this.bucket(ix, iz, true).push(item);
    }
    return item;
  }

  queryAABB(minX, minZ, maxX, maxZ, out = this.result) {
    out.length = 0;
    const stamp = ++this.queryStamp;
    const cellMinX = Math.floor(minX * this.inverseCellSize);
    const cellMaxX = Math.floor(maxX * this.inverseCellSize);
    const cellMinZ = Math.floor(minZ * this.inverseCellSize);
    const cellMaxZ = Math.floor(maxZ * this.inverseCellSize);
    for (let iz = cellMinZ; iz <= cellMaxZ; iz++) {
      for (let ix = cellMinX; ix <= cellMaxX; ix++) {
        const bucket = this.bucket(ix, iz, false);
        if (!bucket) continue;
        for (const item of bucket) {
          if (item.__spatialHashStamp === stamp) continue;
          item.__spatialHashStamp = stamp;
          out.push(item);
        }
      }
    }
    return out;
  }

  queryCircle(x, z, radius, out = this.result) {
    return this.queryAABB(x - radius, z - radius, x + radius, z + radius, out);
  }
}
