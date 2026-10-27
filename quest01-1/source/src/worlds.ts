import * as THREE from 'three';
import { GALAXIES } from './data';
import { col, glowTexture, makeNebula, makePlanet, makeStarfield } from './render';

/** FR-40: galaxy map — one Points object (single draw call), 10 spiral clouds, 120k stars. */
export class GalaxyMap {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(55, 1, 1, 6000);
  centers: THREE.Vector3[] = [];
  private focus = new THREE.Vector3();
  private focusTo = new THREE.Vector3();
  private dist = 520; private distTo = 520;
  private t = 0;
  selected = 0;
  points: THREE.Points;

  constructor() {
    const per = 12500, total = per * GALAXIES.length;
    const pos = new Float32Array(total * 3), cl = new Float32Array(total * 3);
    GALAXIES.forEach((g, gi) => {
      const ang = (gi / 10) * Math.PI * 2;
      const c = new THREE.Vector3(Math.cos(ang) * 330, Math.sin(gi * 1.7) * 60, Math.sin(ang) * 330);
      this.centers.push(c);
      const pal = g.palette.map((x) => col(x));
      const tilt = new THREE.Euler(0.4 + gi * 0.13, gi, gi * 0.3);
      const m = new THREE.Matrix4().makeRotationFromEuler(tilt);
      for (let i = 0; i < per; i++) {
        const arm = i % 3;
        const r = Math.pow(Math.random(), 0.7) * 68;
        const a = (arm / 3) * Math.PI * 2 + r * 0.09 + (Math.random() - 0.5) * (0.5 + 60 / (r + 20) * 0.04);
        const v = new THREE.Vector3(Math.cos(a) * r, (Math.random() - 0.5) * 6 * (1 - r / 90), Math.sin(a) * r).applyMatrix4(m).add(c);
        const k = (gi * per + i) * 3;
        pos[k] = v.x; pos[k + 1] = v.y; pos[k + 2] = v.z;
        const cc = pal[arm].clone().lerp(pal[(arm + 1) % 3], Math.random() * 0.5).lerp(new THREE.Color(1, 1, 1), Math.max(0, 1 - r / 14) * 0.9);
        const b = 0.5 + Math.random() * 0.9 + (r < 12 ? 1.2 : 0);
        cl[k] = cc.r * b; cl[k + 1] = cc.g * b; cl[k + 2] = cc.b * b;
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(cl, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.9, vertexColors: true, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    this.scene.add(makeStarfield(2500, 3500, [col('#ffffff'), col('#9ad'), col('#fda')]));
    this.scene.add(makeNebula([col('#2a1a6a'), col('#0a2a5a'), col('#5a1a4a')], 77));
    // glow cores
    GALAXIES.forEach((g, gi) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col(g.starColor), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
      s.scale.set(24, 24, 1); s.material.opacity = 0.7; s.position.copy(this.centers[gi]); this.scene.add(s);
    });
    this.select(0, true);
  }
  select(i: number, snap = false) {
    this.selected = i;
    this.focusTo.copy(this.centers[i]);
    this.distTo = 150;
    if (snap) { this.focus.copy(this.focusTo); this.dist = this.distTo; }
  }
  overview() { this.focusTo.set(0, 0, 0); this.distTo = 760; }
  update(dt: number) {
    this.t += dt;
    this.focus.lerp(this.focusTo, 1 - Math.exp(-2.5 * dt));
    this.dist += (this.distTo - this.dist) * (1 - Math.exp(-2.5 * dt));
    const a = this.t * 0.12;
    this.camera.position.set(this.focus.x + Math.cos(a) * this.dist, this.focus.y + this.dist * 0.38, this.focus.z + Math.sin(a) * this.dist);
    this.camera.lookAt(this.focus);
  }
  /** Projects a galaxy center to screen px. */
  project(i: number, W: number, H: number, out: { x: number; y: number; ok: boolean }) {
    const v = this.centers[i].clone().project(this.camera);
    out.x = (v.x * 0.5 + 0.5) * W; out.y = (-v.y * 0.5 + 0.5) * H; out.ok = v.z < 1;
  }
}

/** FR-41: solar system hub — star + god-ray streaks, 10 orbiting procedural planets. */
export class SolarHub {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, 1, 1, 6000);
  planets: { group: THREE.Group; clouds: THREE.Mesh; orbit: THREE.Group; r: number; speed: number; ang: number; rad: number }[] = [];
  private rays: THREE.Sprite[] = [];
  private starGroup = new THREE.Group();
  private t = 0;
  private zoom = 1;
  selected = -1;
  private sel = new THREE.Vector3();

  build(galaxyIdx: number, missionSeeds: number[]) {
    const s = this.scene;
    while (s.children.length) s.remove(s.children[0]);
    this.planets = []; this.rays = [];
    const g = GALAXIES[galaxyIdx];
    const pal = g.palette.map((c) => col(c));
    s.add(makeNebula(pal, galaxyIdx + 3));
    s.add(makeStarfield(3000, 2400, pal));
    this.starGroup = new THREE.Group();
    const star = new THREE.Mesh(new THREE.SphereGeometry(26, 32, 24), new THREE.MeshBasicMaterial({ color: col(g.starColor).multiplyScalar(2.2), toneMapped: false }));
    this.starGroup.add(star);
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col(g.starColor), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    gl.scale.set(240, 240, 1); this.starGroup.add(gl);
    for (let i = 0; i < 14; i++) {
      const r = new THREE.Sprite(new THREE.SpriteMaterial({ map: rayTexture(), color: col(g.starColor), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.35 }));
      r.scale.set(520, 26, 1); r.material.rotation = (i / 14) * Math.PI; this.rays.push(r); this.starGroup.add(r);
    }
    s.add(this.starGroup);
    s.add(new THREE.PointLight(col(g.starColor), 6, 0, 0));
    s.add(new THREE.AmbientLight(0x334466, 0.9));
    missionSeeds.forEach((seed, i) => {
      const rad = 85 + i * 30;
      const orbit = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.RingGeometry(rad - 0.15, rad + 0.15, 128), new THREE.MeshBasicMaterial({ color: 0x4488aa, transparent: true, opacity: 0.18, side: THREE.DoubleSide }));
      ring.rotation.x = Math.PI / 2; s.add(ring);
      const size = i === 4 ? 13 : i === 9 ? 17 : 6 + (seed % 5);
      const lightDir = new THREE.Vector3(-1, 0, 0);
      const { group, clouds } = makePlanet(seed, pal, size, lightDir);
      group.position.set(rad, 0, 0);
      orbit.add(group); s.add(orbit);
      this.planets.push({ group, clouds, orbit, r: size, speed: 0.12 / Math.sqrt(1 + i * 0.9), ang: (i / 10) * 6.28 + 0.6, rad });
    });
    this.camera.position.set(0, 260, 380);
    this.camera.lookAt(0, 0, 0);
  }
  select(i: number) { this.selected = i; }
  update(dt: number) {
    this.t += dt;
    this.rays.forEach((r, i) => { r.material.rotation += dt * 0.02 * (i % 2 ? 1 : -1); });
    for (const p of this.planets) {
      p.ang += p.speed * dt;
      p.orbit.rotation.y = -p.ang;
      p.group.rotation.y += dt * 0.15; p.clouds.rotation.y += dt * 0.05;
      p.group.children.forEach((c) => { const m = (c as THREE.Mesh).material as THREE.ShaderMaterial; if (m?.uniforms?.L) m.uniforms.L.value.copy(p.group.getWorldPosition(this.sel)).negate().normalize(); });
    }
    const camAng = Math.sin(this.t * 0.07) * 0.35;
    let tx = 0, tz = 0, ty = 0, dist = 430;
    if (this.selected >= 0) {
      const p = this.planets[this.selected];
      p.group.getWorldPosition(this.sel);
      tx = this.sel.x * 0.55; tz = this.sel.z * 0.55; dist = 340;
    }
    this.camera.position.x += (Math.sin(camAng) * dist + tx - this.camera.position.x) * (1 - Math.exp(-2 * dt));
    this.camera.position.y += (dist * 0.55 - this.camera.position.y) * (1 - Math.exp(-2 * dt));
    this.camera.position.z += (Math.cos(camAng) * dist + tz - this.camera.position.z) * (1 - Math.exp(-2 * dt));
    this.camera.lookAt(tx * 0.8, ty, tz * 0.8);
  }
  project(i: number, W: number, H: number, out: { x: number; y: number; ok: boolean }) {
    const v = this.planets[i].group.getWorldPosition(this.sel).clone();
    v.y += this.planets[i].r * 1.1;
    v.project(this.camera);
    out.x = (v.x * 0.5 + 0.5) * W; out.y = (-v.y * 0.5 + 0.5) * H; out.ok = v.z < 1;
  }
}

function rayTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 16;
  const x = c.getContext('2d')!;
  const gr = x.createLinearGradient(0, 0, 256, 0);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 256, 16);
  const t = new THREE.CanvasTexture(c); return t;
}
