export class RNG {
  constructor(seed = 1) {
    this.state = seed >>> 0 || 1;
  }

  clone() {
    const copy = new RNG(1);
    copy.state = this.state;
    return copy;
  }

  nextUint() {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0 || 1;
    return this.state;
  }

  next() {
    return this.nextUint() / 4294967296;
  }

  signed() {
    return this.next() * 2 - 1;
  }

  range(min, max) {
    return min + (max - min) * this.next();
  }

  int(min, maxInclusive) {
    return min + Math.floor(this.next() * (maxInclusive - min + 1));
  }

  chance(probability) {
    return this.next() < probability;
  }

  pick(array) {
    return array[Math.min(array.length - 1, Math.floor(this.next() * array.length))];
  }
}

export function seedFromString(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 1;
}
