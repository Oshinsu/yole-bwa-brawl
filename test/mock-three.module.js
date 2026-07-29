export const REVISION = "185.1-mock";
export const BackSide = 1;
export const DoubleSide = 2;
export const AdditiveBlending = 3;
export const PCFSoftShadowMap = 4;
export const SRGBColorSpace = "srgb";
export const ACESFilmicToneMapping = 5;
export const ClampToEdgeWrapping = 6;
export const LinearFilter = 7;
export const RGBAFormat = 8;
export const DynamicDrawUsage = 9;

export class Vector2 {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  set(x = 0, y = 0) { this.x = x; this.y = y; return this; }
  copy(value) { return this.set(value.x, value.y); }
}

export class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; return this; }
  setScalar(value) { this.x = value; this.y = value; this.z = value; return this; }
  copy(value) { return this.set(value.x, value.y, value.z); }
  clone() { return new Vector3(this.x, this.y, this.z); }
  add(value) { this.x += value.x; this.y += value.y; this.z += value.z; return this; }
  sub(value) { this.x -= value.x; this.y -= value.y; this.z -= value.z; return this; }
  multiplyScalar(value) { this.x *= value; this.y *= value; this.z *= value; return this; }
  normalize() { const length = Math.hypot(this.x, this.y, this.z) || 1; return this.multiplyScalar(1 / length); }
  lerp(value, t) { this.x += (value.x - this.x) * t; this.y += (value.y - this.y) * t; this.z += (value.z - this.z) * t; return this; }
}

export class Vector4 {
  constructor(x = 0, y = 0, z = 0, w = 0) { this.x = x; this.y = y; this.z = z; this.w = w; }
  set(x = 0, y = 0, z = 0, w = 0) { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
}

class Euler {
  constructor() { this.x = 0; this.y = 0; this.z = 0; }
  set(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; return this; }
}

export class Color {
  constructor(value = 0xffffff) { this.setHex(typeof value === "number" ? value : 0xffffff); }
  setHex(value) { this.r = ((value >> 16) & 255) / 255; this.g = ((value >> 8) & 255) / 255; this.b = (value & 255) / 255; this.hex = value; return this; }
  set(value) { return this.setHex(typeof value === "number" ? value : value?.hex ?? 0xffffff); }
  multiplyScalar(value) { this.r *= value; this.g *= value; this.b *= value; return this; }
  copy(color) { this.r = color.r; this.g = color.g; this.b = color.b; this.hex = color.hex; return this; }
  clone() { const c = new Color(); return c.copy(this); }
  addScalar(value) { this.r += value; this.g += value; this.b += value; return this; }
  lerp(color, alpha) {
    this.r += (color.r - this.r) * alpha;
    this.g += (color.g - this.g) * alpha;
    this.b += (color.b - this.b) * alpha;
    return this;
  }
  getHexString() {
    const to = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0");
    return `${to(this.r)}${to(this.g)}${to(this.b)}`;
  }
}

export class Object3D {
  constructor() {
    this.position = new Vector3();
    this.rotation = new Euler();
    this.scale = new Vector3(1, 1, 1);
    this.children = [];
    this.parent = null;
    this.userData = {};
    this.visible = true;
    this.frustumCulled = true;
    this.renderOrder = 0;
    this.matrix = {};
  }
  add(...objects) { for (const object of objects) { if (!object) continue; if (object.parent) object.parent.remove(object); object.parent = this; this.children.push(object); } return this; }
  remove(object) { const index = this.children.indexOf(object); if (index >= 0) this.children.splice(index, 1); if (object) object.parent = null; return this; }
  lookAt() { return this; }
  rotateZ(angle) { this.rotation.z += angle; return this; }
  rotateX(angle) { this.rotation.x += angle; return this; }
  rotateY(angle) { this.rotation.y += angle; return this; }
  updateMatrix() { this.matrix = { position: { ...this.position }, rotation: { ...this.rotation }, scale: { ...this.scale } }; return this; }
  clone() { const clone = new this.constructor(this.geometry, this.material); clone.position.copy(this.position); clone.rotation.set(this.rotation.x, this.rotation.y, this.rotation.z); clone.scale.copy(this.scale); clone.userData = { ...this.userData }; return clone; }
}

export class Group extends Object3D {}
export class Scene extends Group {}
export class PerspectiveCamera extends Object3D { constructor(fov = 60, aspect = 1, near = 0.1, far = 1000) { super(); this.fov = fov; this.aspect = aspect; this.near = near; this.far = far; } updateProjectionMatrix() {} }
export class OrthographicCamera extends Object3D { constructor(...args) { super(); this.args = args; } }
export class FogExp2 { constructor(color, density) { this.color = new Color(color); this.density = density; } }

export class BufferAttribute {
  constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.needsUpdate = false; }
}
export class Float32BufferAttribute extends BufferAttribute { constructor(array, itemSize) { super(array instanceof Float32Array ? array : new Float32Array(array), itemSize); } }
export class BufferGeometry {
  constructor() { this.attributes = {}; this.index = null; this.drawRange = { start: 0, count: Infinity }; this.userData = {}; }
  setAttribute(name, attribute) { this.attributes[name] = attribute; return this; }
  setIndex(index) { this.index = index; return this; }
  computeVertexNormals() { return this; }
  rotateX() { return this; }
  setDrawRange(start, count) { this.drawRange = { start, count }; return this; }
  setFromPoints(points) { const values = []; for (const point of points) values.push(point.x, point.y, point.z); this.setAttribute("position", new Float32BufferAttribute(values, 3)); return this; }
  dispose() {}
}
function geometry(name) { return class extends BufferGeometry { constructor(...args) { super(); this.type = name; this.args = args; } }; }
export const SphereGeometry = geometry("SphereGeometry");
export const PlaneGeometry = geometry("PlaneGeometry");
export const BoxGeometry = geometry("BoxGeometry");
export const CylinderGeometry = geometry("CylinderGeometry");
export const CircleGeometry = geometry("CircleGeometry");
export const ConeGeometry = geometry("ConeGeometry");
export const RingGeometry = geometry("RingGeometry");
export const TorusGeometry = geometry("TorusGeometry");
export const DodecahedronGeometry = geometry("DodecahedronGeometry");

class Material {
  constructor(options = {}) {
    Object.assign(this, options);
    if (typeof this.color === "number") this.color = new Color(this.color);
    if (typeof this.emissive === "number") this.emissive = new Color(this.emissive);
    if (!this.color) this.color = new Color(0xffffff);
    if (!this.emissive) this.emissive = new Color(0);
    this.opacity = options.opacity ?? 1;
    this.uniforms = options.uniforms || {};
  }
  clone() { return new this.constructor({ ...this, color: this.color?.hex ?? this.color, emissive: this.emissive?.hex ?? this.emissive, uniforms: this.uniforms }); }
  dispose() {}
}
export class ShaderMaterial extends Material {}
export class MeshStandardMaterial extends Material {}
export class MeshBasicMaterial extends Material {}
export class PointsMaterial extends Material {}
export class LineBasicMaterial extends Material {}

export class Mesh extends Object3D { constructor(geometry = new BufferGeometry(), material = new Material()) { super(); this.geometry = geometry; this.material = material; } }
export class InstancedMesh extends Mesh {
  constructor(geometry = new BufferGeometry(), material = new Material(), count = 1) {
    super(geometry, material);
    this.count = count;
    this.maxCount = count;
    this.matrices = new Array(count);
    this.instanceMatrix = { needsUpdate: false, usage: null, setUsage(value) { this.usage = value; return this; } };
  }
  setMatrixAt(index, matrix) { this.matrices[index] = matrix; }
}
export class Points extends Mesh {}
export class Line extends Mesh {}
export class HemisphereLight extends Object3D { constructor(...args) { super(); this.args = args; this.intensity = args[2] ?? 1; } }
export class PointLight extends Object3D { constructor(...args) { super(); this.args = args; } }
export class DirectionalLight extends Object3D { constructor(...args) { super(); this.args = args; this.intensity = args[1] ?? 1; this.shadow = { mapSize: { set() {} }, camera: {} }; this.target = new Object3D(); } }

export class CanvasTexture {
  constructor(image) { this.image = image; this.needsUpdate = false; this.generateMipmaps = true; }
}
export class WebGLRenderTarget {
  constructor(width, height, options = {}) { this.width = width; this.height = height; this.options = options; this.texture = {}; }
  setSize(width, height) { this.width = width; this.height = height; }
  dispose() {}
}

export class WebGLRenderer {
  constructor() {
    this.domElement = document.createElement("canvas");
    this.domElement.width = 640;
    this.domElement.height = 360;
    this.shadowMap = { enabled: false, type: null };
    this.toneMappingExposure = 1;
    this.loop = null;
    this.info = { render: { calls: 42, triangles: 12000 } };
    this.currentTarget = null;
  }
  setPixelRatio(value) { this.pixelRatio = value; }
  setSize(width, height) { this.domElement.width = width; this.domElement.height = height; }
  setAnimationLoop(callback) { this.loop = callback; const tick = (time) => { if (this.loop) { this.loop(time); requestAnimationFrame(tick); } }; requestAnimationFrame(tick); }
  setRenderTarget(target) { this.currentTarget = target; }
  render() { this.info.render.calls = 42; }
}
