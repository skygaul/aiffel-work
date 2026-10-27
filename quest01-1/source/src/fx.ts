import * as THREE from 'three';
import { MAX_BULLETS } from './tuning';
import { glowTexture, ringTexture } from './render';

/** GPU-friendly particle system: typed ring of particles drawn as one additive Points call. */
export class Particles {
  points: THREE.Points;
  n = 0;
  cap: number;
  private pos: Float32Array; private col: Float32Array; private par: Float32Array;
  private vel: Float32Array; private life: Float32Array; private max: Float32Array; private drag: Float32Array;
  private geo: THREE.BufferGeometry;
  uScale = { value: 400 };

  constructor(cap: number) {
    this.cap = cap;
    this.pos = new Float32Array(cap * 3); this.col = new Float32Array(cap * 3); this.par = new Float32Array(cap * 2);
    this.vel = new Float32Array(cap * 3); this.life = new Float32Array(cap); this.max = new Float32Array(cap); this.drag = new Float32Array(cap);
    this.geo = new THREE.BufferGeometry();
    const pa = new THREE.BufferAttribute(this.pos, 3); pa.setUsage(THREE.DynamicDrawUsage);
    const ca = new THREE.BufferAttribute(this.col, 3); ca.setUsage(THREE.DynamicDrawUsage);
    const sa = new THREE.BufferAttribute(this.par, 2); sa.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', pa); this.geo.setAttribute('color', ca); this.geo.setAttribute('par', sa);
    this.geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uScale: this.uScale },
      vertexShader: `attribute vec3 color; attribute vec2 par; varying vec3 vC; varying float vA; uniform float uScale;
        void main(){ vC=color; vA=par.x; vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv;
          gl_PointSize=clamp(par.y*par.x*uScale/max(-mv.z,1.),1.,160.); }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 d=gl_PointCoord-.5; float r=length(d)*2.; if(r>1.) discard;
        float f=pow(1.-r,1.6); gl_FragColor=vec4(vC*f*vA,f*vA); }`,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, r: number, g: number, b: number, size: number, life: number, drag = 0.6) {
    if (this.n >= this.cap) return;
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    this.par[i * 2] = 1; this.par[i * 2 + 1] = size;
    this.life[i] = life; this.max[i] = life; this.drag[i] = drag;
  }
  /** Radial burst helper. */
  burst(x: number, y: number, z: number, count: number, speed: number, c: THREE.Color, size: number, life: number, hdr = 1, drag = 0.8) {
    for (let k = 0; k < count; k++) {
      const u = Math.random() * 2 - 1, t = Math.random() * 6.2832, rr = Math.sqrt(1 - u * u), s = speed * (0.25 + Math.random() * 0.75);
      this.emit(x, y, z, rr * Math.cos(t) * s, u * s, rr * Math.sin(t) * s, c.r * hdr, c.g * hdr, c.b * hdr, size * (0.5 + Math.random()), life * (0.5 + Math.random() * 0.7), drag);
    }
  }
  update(dt: number) {
    const { pos, vel, life, max, drag, par, col } = this;
    for (let i = 0; i < this.n; ) {
      life[i] -= dt;
      if (life[i] <= 0) {
        const l = --this.n;
        if (i !== l) {
          for (let k = 0; k < 3; k++) { pos[i * 3 + k] = pos[l * 3 + k]; vel[i * 3 + k] = vel[l * 3 + k]; col[i * 3 + k] = col[l * 3 + k]; }
          par[i * 2] = par[l * 2]; par[i * 2 + 1] = par[l * 2 + 1];
          life[i] = life[l]; max[i] = max[l]; drag[i] = drag[l];
        }
        continue;
      }
      const d = Math.max(0, 1 - drag[i] * dt);
      vel[i * 3] *= d; vel[i * 3 + 1] *= d; vel[i * 3 + 2] *= d;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      par[i * 2] = life[i] / max[i];
      i++;
    }
    const g = this.geo;
    g.setDrawRange(0, this.n);
    for (const name of ['position', 'color', 'par']) {
      const a = g.getAttribute(name) as THREE.BufferAttribute;
      a.clearUpdateRanges(); a.addUpdateRange(0, this.n * a.itemSize); a.needsUpdate = true;
    }
  }
  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
}

/** Pool of billboard sprites used for flashes and shock rings. */
export class SpritePool {
  group = new THREE.Group();
  private items: { s: THREE.Sprite; t: number; life: number; from: number; to: number; alpha: number }[] = [];
  constructor(tex: THREE.Texture, count: number) {
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.visible = false;
      this.group.add(s);
      this.items.push({ s, t: 0, life: 0, from: 1, to: 1, alpha: 1 });
    }
  }
  spawn(x: number, y: number, z: number, color: THREE.Color, from: number, to: number, life: number, alpha = 1) {
    let it = this.items.find((i) => i.life <= 0);
    if (!it) it = this.items[0];
    it.s.position.set(x, y, z);
    (it.s.material as THREE.SpriteMaterial).color.copy(color);
    it.t = 0; it.life = life; it.from = from; it.to = to; it.alpha = alpha; it.s.visible = true;
  }
  update(dt: number) {
    for (const it of this.items) {
      if (it.life <= 0) continue;
      it.t += dt;
      const k = it.t / it.life;
      if (k >= 1) { it.life = 0; it.s.visible = false; continue; }
      const sc = it.from + (it.to - it.from) * (1 - Math.pow(1 - k, 2));
      it.s.scale.set(sc, sc, 1);
      (it.s.material as THREE.SpriteMaterial).opacity = it.alpha * (1 - k);
    }
  }
  clear() { for (const it of this.items) { it.life = 0; it.s.visible = false; } }
}

export const enum BK { LASER = 0, MISSILE = 1, ENEMY = 2, ENEMY_HOMING = 3 }

/** FR: 3,000 projectiles in a single InstancedMesh. */
export class BulletPool {
  mesh: THREE.InstancedMesh;
  n = 0;
  px = new Float32Array(MAX_BULLETS); py = new Float32Array(MAX_BULLETS); pz = new Float32Array(MAX_BULLETS);
  vx = new Float32Array(MAX_BULLETS); vy = new Float32Array(MAX_BULLETS); vz = new Float32Array(MAX_BULLETS);
  life = new Float32Array(MAX_BULLETS); dmg = new Float32Array(MAX_BULLETS); kind = new Uint8Array(MAX_BULLETS);
  cr = new Float32Array(MAX_BULLETS); cg = new Float32Array(MAX_BULLETS); cb = new Float32Array(MAX_BULLETS);
  tgt: (any | null)[] = new Array(MAX_BULLETS).fill(null);
  private m4 = new THREE.Matrix4(); private q = new THREE.Quaternion(); private v = new THREE.Vector3(); private s = new THREE.Vector3(); private c = new THREE.Color();
  private z = new THREE.Vector3(0, 0, 1);

  constructor() {
    const geo = new THREE.BoxGeometry(0.5, 0.5, 6);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), MAX_BULLETS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BULLETS * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }
  spawn(kind: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, dmg: number, r: number, g: number, b: number, tgt: any = null): number {
    if (this.n >= MAX_BULLETS) return -1;
    const i = this.n++;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z; this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.life[i] = life; this.dmg[i] = dmg; this.kind[i] = kind; this.cr[i] = r; this.cg[i] = g; this.cb[i] = b; this.tgt[i] = tgt;
    return i;
  }
  remove(i: number) {
    const l = --this.n;
    if (i !== l) {
      this.px[i] = this.px[l]; this.py[i] = this.py[l]; this.pz[i] = this.pz[l];
      this.vx[i] = this.vx[l]; this.vy[i] = this.vy[l]; this.vz[i] = this.vz[l];
      this.life[i] = this.life[l]; this.dmg[i] = this.dmg[l]; this.kind[i] = this.kind[l];
      this.cr[i] = this.cr[l]; this.cg[i] = this.cg[l]; this.cb[i] = this.cb[l]; this.tgt[i] = this.tgt[l];
    }
    this.tgt[l] = null;
  }
  /** Writes instance transforms for rendering. */
  sync() {
    const ic = this.mesh.instanceColor!;
    for (let i = 0; i < this.n; i++) {
      this.v.set(this.vx[i], this.vy[i], this.vz[i]);
      const sp = this.v.length() || 1;
      this.v.multiplyScalar(1 / sp);
      this.q.setFromUnitVectors(this.z, this.v);
      const big = this.kind[i] === BK.MISSILE ? 1.8 : this.kind[i] >= BK.ENEMY ? 0.9 : 1;
      this.s.set(big, big, this.kind[i] >= BK.ENEMY ? 0.5 : 1);
      this.m4.compose(this.v.set(this.px[i], this.py[i], this.pz[i]), this.q, this.s);
      this.mesh.setMatrixAt(i, this.m4);
      this.c.setRGB(this.cr[i], this.cg[i], this.cb[i]);
      ic.setXYZ(i, this.c.r, this.c.g, this.c.b);
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    ic.needsUpdate = true;
  }
  clear() { this.n = 0; this.tgt.fill(null); this.mesh.count = 0; }
}

export class Fx {
  particles: Particles;
  rings: SpritePool;
  glows: SpritePool;
  bullets = new BulletPool();
  group = new THREE.Group();
  constructor(cap: number) {
    this.particles = new Particles(cap);
    this.rings = new SpritePool(ringTexture(), 40);
    this.glows = new SpritePool(glowTexture(), 60);
    this.group.add(this.particles.points, this.rings.group, this.glows.group, this.bullets.mesh);
  }
  update(dt: number) { this.particles.update(dt); this.rings.update(dt); this.glows.update(dt); this.bullets.sync(); }
  clear() { this.particles.clear(); this.rings.clear(); this.glows.clear(); this.bullets.clear(); }
}
