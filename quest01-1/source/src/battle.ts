import * as THREE from 'three';
import { Fx, BK } from './fx';
import { Feel } from './feel';
import { bus } from './events';
import { audio } from './audio';
import { Enemy, makeShipMesh, makePlayerShip } from './enemy';
import { PATTERNS, type PatternCtx } from './patterns';
import { makeNebula, makePlanet, makeStarfield, col, glowTexture } from './render';
import { GALAXIES } from './data';
import { computeStageScore } from './scoring';
import { COMBO, ENEMY, PLAYER, UPGRADES, WAVE, countScale, dmgScale, hpScale, type UpgradeId } from './tuning';
import type { Controls } from './input';
import type { BonusId, GalaxyData, MissionData, ScoreBreakdown, ShipKind } from './types';

const T1 = new THREE.Vector3(), T2 = new THREE.Vector3(), T3 = new THREE.Vector3(), T4 = new THREE.Vector3();
const QT = new THREE.Quaternion(), QE = new THREE.Euler(), M4 = new THREE.Matrix4();
const WHITE = new THREE.Color(1, 1, 1);

export interface Objective { pos: THREE.Vector3; hp: number; maxHp: number; radius: number; mesh: THREE.Object3D; kind: 'beacon' | 'freighter'; ang: number }
export interface BattleResult {
  victory: boolean; score?: ScoreBreakdown; bonusDone: boolean[]; reason?: string;
  stats: Battle['stats'];
}
export type BattleState = 'play' | 'collapse' | 'victory' | 'defeat';

export class Battle {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, 1, 0.5, 4000);
  fx: Fx;
  feel: Feel;
  galaxy: GalaxyData;
  diff: number;
  palette: THREE.Color[];
  state: BattleState = 'play';
  onEnd?: (r: BattleResult) => void;
  enemies: Enemy[] = [];
  boss: Enemy | null = null;
  objective: Objective | null = null;
  rings: { pos: THREE.Vector3; mesh: THREE.Mesh }[] = [];
  ringIdx = 0;
  timeLimit = 0;
  banner = '';
  bannerT = 0;
  warnT = 0;
  autoplay = false;

  p = {
    pos: new THREE.Vector3(0, 0, -250), quat: new THREE.Quaternion(), vel: new THREE.Vector3(),
    hull: PLAYER.hull, maxHull: PLAYER.hull, shield: PLAYER.shield, maxShield: PLAYER.shield, sinceHit: 99,
    invuln: 0, dashCd: 0, missileCd: 0, nova: 0, fireCd: 0, boost: 100, dashV: new THREE.Vector3(), bank: 0, speed: 0, alt: 0,
  };
  stats = { time: 0, kills: 0, spawned: 0, damageTaken: 0, maxCombo: 0, combo: 0, comboT: 0, missileKills: 0, novaUsed: 0, shots: 0, hits: 0, dashUsed: 0, hitsTaken: 0 };
  waveIdx = -1; waveTotal: number;
  private queue: { kind: ShipKind; race: number }[] = [];
  private spawnT = 0; private waveGap = 0.4; private waveSince = 0; private wavesDone = false; private reinforceT = 0;
  private playerMesh = makePlayerShip();
  private bankNode = new THREE.Group();
  private wingmen: { mesh: THREE.Mesh; ang: number; cd: number }[] = [];
  private shieldMesh: THREE.Mesh;
  private beacons: THREE.Object3D[] = [];
  private collapseT = 0; private endT = 0;
  private lights: THREE.Light[] = [];
  private upg: Partial<Record<UpgradeId, number>>;
  private camPos = new THREE.Vector3();
  private ctx: PatternCtx;
  private rngS = 12345;
  private expected = 0;
  private fortressT = 0;
  private lastEngine = 0;
  private bossCd = [0, 0, 0, 0];
  private spin = 0;
  private starDir = new THREE.Vector3(0.6, 0.5, -0.6).normalize();
  private fireSide = 1;

  constructor(public mission: MissionData, upgrades: Partial<Record<UpgradeId, number>>, particleCap: number) {
    this.galaxy = GALAXIES[mission.galaxy - 1];
    this.diff = mission.difficulty;
    this.palette = this.galaxy.palette.map((c) => col(c));
    this.upg = upgrades;
    this.rngS = mission.planetSeed * 2654435761 >>> 0;
    this.fx = new Fx(particleCap);
    this.feel = new Feel(this.fx);
    this.waveTotal = mission.waves.length;
    this.expected = Math.round(mission.waves.reduce((a, w) => a + w.groups.reduce((b, g) => b + g.count, 0), 0) * countScale(this.diff)) + (mission.boss ? 1 : 0);
    this.p.maxShield = PLAYER.shield + 25 * (upgrades.SHIELD ?? 0); this.p.shield = this.p.maxShield;

    // world
    this.scene.add(makeNebula(this.palette, mission.planetSeed));
    this.scene.add(makeStarfield(3500, 2200, this.palette));
    const planetDir = new THREE.Vector3().setFromSphericalCoords(1, 1.0 + (mission.planetSeed % 7) * 0.2, (mission.planetSeed % 11) * 0.6).normalize();
    const { group: planet, clouds } = makePlanet(mission.planetSeed, this.palette, 300, this.starDir.clone());
    planet.position.copy(planetDir.multiplyScalar(1800));
    this.scene.add(planet);
    this.planetClouds = clouds; this.planetGroup = planet;
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col(this.galaxy.starColor), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    sun.scale.set(500, 500, 1); sun.position.copy(this.starDir.clone().multiplyScalar(2000));
    this.scene.add(sun);
    const dl = new THREE.DirectionalLight(col(this.galaxy.starColor), 2.6); dl.position.copy(this.starDir);
    const hl = new THREE.HemisphereLight(this.palette[0], this.palette[1], 0.7);
    this.scene.add(dl, hl); this.lights.push(dl, hl);
    this.scene.add(this.fx.group);

    // player
    this.bankNode.add(this.playerMesh);
    this.scene.add(this.bankNode);
    this.shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(6.5, 20, 14), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { a: { value: 0 } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'uniform float a; varying vec3 vN; varying vec3 vV; void main(){ float f=pow(1.-abs(dot(vN,vV)),2.5); gl_FragColor=vec4(vec3(.2,.9,1.)*f*2.5*a, f*a); }',
    }));
    this.bankNode.add(this.shieldMesh);
    for (let i = 0; i < Math.min(3, upgrades.WINGMAN ?? 0); i++) {
      const w = makeShipMesh('fighter', new THREE.Color(0.2, 0.9, 1)); w.scale.setScalar(0.7);
      this.scene.add(w); this.wingmen.push({ mesh: w, ang: (i * Math.PI * 2) / 3, cd: 0 });
    }
    this.camPos.copy(this.p.pos).add(new THREE.Vector3(0, 6, -20));

    // mission specifics
    const t = mission.type;
    if (t === 'DEFENSE' || t === 'ESCORT') this.makeObjective(t === 'DEFENSE' ? 'beacon' : 'freighter');
    if (t === 'INFILTRATE') this.makeRings();
    if (t === 'ASSAULT') this.timeLimit = mission.parTime * 2.2;
    if (t === 'PURSUIT') this.timeLimit = mission.parTime * 2;
    if (t === 'INFILTRATE') this.timeLimit = mission.parTime * 2.2;

    this.ctx = this.makeCtx();
    if (mission.boss) this.spawnBoss();
    if (t === 'SIEGE') this.spawnFortress();
    this.say(`${mission.name} — ${t}`);
  }
  planetClouds!: THREE.Mesh; planetGroup!: THREE.Group;

  private rand = () => { this.rngS = (this.rngS * 1664525 + 1013904223) >>> 0; return this.rngS / 4294967296; };
  private say(s: string, t = 2.2) { this.banner = s; this.bannerT = t; }

  // ---------------------------------------------------------------- helpers
  forward(out = new THREE.Vector3()) { return out.set(0, 0, 1).applyQuaternion(this.p.quat); }
  private makeCtx(): PatternCtx {
    const b = this;
    return {
      dt: 0, time: 0, diff: this.diff, target: new THREE.Vector3(), targetVel: new THREE.Vector3(),
      rand: () => b.rand(),
      fire(e, dir, speed, dmgMul = 1) {
        const c = e.color;
        b.fx.bullets.spawn(BK.ENEMY, e.pos.x + dir.x * e.radius, e.pos.y + dir.y * e.radius, e.pos.z + dir.z * e.radius, dir.x * speed, dir.y * speed, dir.z * speed, 5, ENEMY.bulletDamage * dmgScale(b.diff) * dmgMul * e.dmgMul, c.r * 2.4 + 0.4, c.g * 2.4 + 0.4, c.b * 2.4 + 0.4);
        if (b.rand() < 0.25 && e.pos.distanceToSquared(b.p.pos) < 160000) audio.enemyLaser();
      },
      ring(e, count, speed, offset) {
        T1.copy(b.ctx.target).sub(e.pos).normalize();
        T2.set(Math.abs(T1.y) < 0.9 ? 0 : 1, Math.abs(T1.y) < 0.9 ? 1 : 0, 0).cross(T1).normalize();
        T3.copy(T1).cross(T2);
        for (let k = 0; k < count; k++) {
          const a = offset + (k / count) * Math.PI * 2;
          T4.copy(T1).multiplyScalar(0.8).addScaledVector(T2, Math.cos(a) * 0.6).addScaledVector(T3, Math.sin(a) * 0.6).normalize();
          b.ctx.fire(e, T4, speed, 0.8);
        }
      },
      spawnChild(e) {
        const c = b.spawnEnemy('fighter', e.raceIdx, T1.copy(e.pos).add(T2.set(b.rand() - 0.5, b.rand() - 0.5, b.rand() - 0.5).multiplyScalar(10)), e.wave);
        c.noSplit = true; c.hp = c.maxHp = e.maxHp * 0.4; c.mesh.scale.setScalar(0.7); c.radius *= 0.7;
        c.vel.copy(T2).multiplyScalar(6);
      },
      telegraph(e) { bus.emit('telegraph', { pos: e.pos, color: '#' + e.color.getHexString() }); },
    };
  }

  spawnEnemy(kind: ShipKind, raceIdx: number, at?: THREE.Vector3, wave = 0, aim?: 'player' | 'obj'): Enemy {
    const race = this.galaxy.races[raceIdx % 5];
    const pat = PATTERNS[race.pattern];
    const e = new Enemy();
    e.kind = kind; e.raceIdx = raceIdx % 5; e.pattern = race.pattern; e.wave = wave;
    e.color = col(race.color);
    const base = ENEMY[kind];
    e.maxHp = e.hp = base.hp * hpScale(this.diff) * pat.hpMul;
    e.radius = base.radius; e.speedMul = pat.speedMul * (0.9 + this.rand() * 0.2);
    e.mesh = makeShipMesh(kind, e.color, race.pattern === 'CLOAK');
    if (at) e.pos.copy(at);
    else {
      const o = this.objective && this.mission.type === 'DEFENSE' ? this.objective.pos : this.p.pos;
      const fwd = this.forward(T1);
      T2.set(this.rand() - 0.5, this.rand() - 0.5, this.rand() - 0.5).normalize();
      const spread = this.mission.type === 'DEFENSE' ? 1.6 : 0.9;
      T3.copy(fwd).addScaledVector(T2, spread).normalize();
      e.pos.copy(o).addScaledVector(T3, 330 + this.rand() * 170);
    }
    e.vel.copy(T4.copy(this.p.pos).sub(e.pos).normalize().multiplyScalar(30));
    e.quat.setFromUnitVectors(T1.set(0, 0, 1), T4.copy(e.vel).normalize());
    e.aim = aim ?? (this.objective && this.rand() < (this.mission.type === 'DEFENSE' ? 0.55 : 0.45) ? 'obj' : 'player');
    if (kind === 'carrier') e.speedMul *= 0.6;
    pat.init(e);
    if (race.pattern === 'SHIELD') {
      const s = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.2, 2), transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.scale.setScalar(base.radius * 1.5); s.name = 'shield'; e.mesh.add(s);
    }
    e.mesh.position.copy(e.pos); e.mesh.quaternion.copy(e.quat);
    this.scene.add(e.mesh);
    this.enemies.push(e);
    this.stats.spawned++;
    return e;
  }

  private spawnBoss() {
    const bd = this.mission.boss!;
    const race = this.galaxy.races[bd.race % 5];
    const e = new Enemy();
    e.isBoss = true; e.kind = 'carrier'; e.raceIdx = bd.race; e.pattern = race.pattern;
    e.color = col(race.color);
    e.maxHp = e.hp = bd.hp * hpScale(this.diff);
    e.radius = 24; e.speedMul = 1;
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x15161f, emissive: e.color, emissiveIntensity: 1.1, metalness: 0.8, roughness: 0.3, flatShading: true });
    g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(22, 1), mat));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(34, 2.2, 8, 56), new THREE.MeshBasicMaterial({ color: new THREE.Color(e.color).multiplyScalar(2.5), toneMapped: false }));
    ring.name = 'ring'; ring.rotation.x = Math.PI / 2; g.add(ring);
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Mesh(new THREE.ConeGeometry(4, 22, 5), mat);
      const d = T1.setFromSphericalCoords(1, Math.acos(1 - (2 * (i + 0.5)) / 8), i * 2.4);
      s.position.copy(d).multiplyScalar(26); s.quaternion.setFromUnitVectors(T2.set(0, 1, 0), d);
      g.add(s);
    }
    e.mesh = g;
    e.pos.copy(this.p.pos).addScaledVector(this.forward(T1), 330);
    e.quat.identity();
    g.position.copy(e.pos);
    this.scene.add(g);
    this.enemies.push(e);
    this.boss = e;
    e.st.partsDead = 0; e.st.trans = 0; e.st.ang = 0; e.st.spin = 0;
    for (let i = 0; i < bd.parts; i++) {
      const p = new Enemy();
      p.isPart = true; p.countsKill = false; p.parent = e; p.kind = 'frigate'; p.pattern = race.pattern;
      p.color = e.color; p.radius = 6.5;
      p.maxHp = p.hp = 260 * hpScale(this.diff);
      p.local.setFromSphericalCoords(1, Math.acos(1 - (2 * (i + 0.5)) / bd.parts), i * 2.4).multiplyScalar(38);
      p.mesh = new THREE.Mesh(new THREE.SphereGeometry(5.5, 12, 8), new THREE.MeshStandardMaterial({ color: 0x222233, emissive: new THREE.Color(1, 0.35, 0.1), emissiveIntensity: 1.8, metalness: 0.6, roughness: 0.4 }));
      p.cd = 2 + this.rand() * 2;
      p.pos.copy(e.pos).add(p.local);
      this.scene.add(p.mesh);
      this.enemies.push(p);
    }
    this.warnT = 3;
    audio.warning();
    this.say(`WARNING — ${bd.name}`, 3);
    audio.startBgm(this.galaxy.id, true);
  }
  partsAlive() { return this.enemies.filter((e) => e.isPart && e.alive).length; }

  private spawnFortress() {
    const e = this.spawnEnemy('carrier', this.mission.race, T1.copy(this.p.pos).addScaledVector(this.forward(T2), 420), 0, 'player');
    e.isFortress = true; e.pattern = 'BULLET_HELL'; PATTERNS.BULLET_HELL.init(e);
    e.speedMul = 0; e.maxHp = e.hp = 900 * hpScale(this.diff); e.radius = 28; e.mesh.scale.setScalar(2.2);
    e.vel.set(0, 0, 0);
    this.say('SIEGE — 요새를 파괴하라');
  }

  private makeObjective(kind: 'beacon' | 'freighter') {
    const g = new THREE.Group();
    if (kind === 'beacon') {
      g.add(new THREE.Mesh(new THREE.OctahedronGeometry(9, 1), new THREE.MeshStandardMaterial({ color: 0x223344, emissive: new THREE.Color(0.2, 1, 0.6), emissiveIntensity: 1.8, flatShading: true })));
      const r = new THREE.Mesh(new THREE.TorusGeometry(15, 0.7, 6, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.2, 1.4), toneMapped: false })); r.rotation.x = 1.2; g.add(r);
    } else {
      const m = makeShipMesh('frigate', new THREE.Color(0.2, 1, 0.6)); m.scale.setScalar(1.3); g.add(m);
    }
    this.objective = { pos: new THREE.Vector3(0, 0, 0), hp: ENEMY.objectiveHp * hpScale(this.diff), maxHp: ENEMY.objectiveHp * hpScale(this.diff), radius: kind === 'beacon' ? 14 : 12, mesh: g, kind, ang: 0 };
    if (kind === 'beacon') this.p.pos.set(0, 0, -90);
    this.scene.add(g);
  }
  private makeRings() {
    for (let i = 0; i < 6; i++) {
      const a = i * 1.1 + this.rand();
      const pos = new THREE.Vector3(Math.cos(a) * (200 + i * 40), (this.rand() - 0.5) * 220, Math.sin(a) * (200 + i * 40));
      const m = new THREE.Mesh(new THREE.TorusGeometry(20, 1.1, 8, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 1.4, 2), toneMapped: false, transparent: true }));
      m.position.copy(pos); m.lookAt(0, 0, 0);
      this.scene.add(m); this.rings.push({ pos, mesh: m });
    }
  }

  // ---------------------------------------------------------------- waves
  private startWave(i: number) {
    this.waveIdx = i;
    const w = this.mission.waves[i];
    this.queue.length = 0;
    const sc = this.boss ? 1 : countScale(this.diff);
    for (const g of w.groups) for (let k = 0, n = Math.max(1, Math.round(g.count * sc)); k < n; k++) this.queue.push({ kind: g.kind, race: g.race });
    this.waveSince = 0;
    this.say(w.spectacle ? `FINAL WAVE ${i + 1}/${this.waveTotal}` : `WAVE ${i + 1}/${this.waveTotal}`, 1.8);
    if (w.spectacle) { bus.emit('shake', 0.3); audio.warning(); }
    if (i === 0 && this.mission.type === 'PURSUIT') this.spawnPursuitTarget();
  }
  private spawnPursuitTarget() {
    const e = this.spawnEnemy('fighter', this.mission.race, T1.copy(this.p.pos).addScaledVector(this.forward(T2), 360), 0, 'player');
    e.isTarget = true; e.pattern = 'SNIPE'; e.maxHp = e.hp = 170 * hpScale(this.diff); e.mesh.scale.setScalar(1.8); e.radius = 6; e.speedMul = 1;
    this.say('PURSUIT — 도주하는 목표를 격추하라', 2.5);
  }
  private waveAlive() { let n = 0; for (const e of this.enemies) if (e.alive && !e.isPart && !e.isBoss && !e.isFortress && !e.isTarget) n++; return n; }

  private updateWaves(dt: number) {
    if (this.queue.length) {
      this.spawnT -= dt;
      let guard = 6;
      while (this.spawnT <= 0 && this.queue.length && guard-- > 0 && this.enemies.length < 90) {
        const q = this.queue.shift()!;
        this.spawnEnemy(q.kind, q.race, undefined, this.waveIdx);
        this.spawnT += 0.07;
      }
      return;
    }
    this.waveSince += dt;
    if (this.waveIdx + 1 < this.waveTotal) {
      const alive = this.waveAlive();
      if (alive === 0 || this.waveSince > WAVE.stallBreak) {
        this.waveGap -= dt;
        if (this.waveGap <= 0 || this.waveSince > WAVE.stallBreak) {
          this.waveGap = this.mission.waves[this.waveIdx + 1].delay + 0.6;
          this.startWave(this.waveIdx + 1);
        }
      }
    } else {
      this.wavesDone = true;
      // objective missions keep a trickle of reinforcements until the goal is met
      const t = this.mission.type;
      if ((t === 'SIEGE' || t === 'PURSUIT' || t === 'INFILTRATE' || t === 'BOSS') && this.state === 'play') {
        this.reinforceT -= dt;
        if (this.reinforceT <= 0 && this.waveAlive() < 4) {
          this.reinforceT = 7;
          for (let i = 0; i < 4; i++) this.spawnEnemy('fighter', this.mission.race, undefined, this.waveIdx);
        }
      }
    }
  }

  // ---------------------------------------------------------------- main update
  update(realDt: number, c: Controls) {
    let dt = Math.min(realDt, 1 / 20);
    const f = this.feel;
    if (f.hitStop > 0) { f.hitStop -= realDt; dt *= 0.05; }
    f.update(realDt);
    const p = this.p;
    this.spin += dt;

    if (this.state === 'play' || this.state === 'collapse') {
      this.stats.time += dt;
      this.updatePlayer(dt, c);
      this.updateWaves(dt);
      this.updateEnemies(dt);
      this.updateBullets(dt);
      this.updateObjectives(dt);
      this.updateWingmen(dt);
      this.updateCombo(dt);
    } else {
      this.updateEnemies(dt * 0.3);
      this.updateBullets(dt * 0.3);
    }
    if (this.state === 'collapse') this.updateCollapse(dt);
    if (this.state === 'victory' || this.state === 'defeat') {
      this.endT += dt;
      if (this.endT > (this.state === 'victory' ? 1.2 : 1.8) && this.onEnd) { const cb = this.onEnd; this.onEnd = undefined; cb(this.result()); }
    }
    this.fx.update(dt);
    this.updateVisuals(dt);
    if (this.bannerT > 0) this.bannerT -= dt;
    if (this.warnT > 0) this.warnT -= dt;
    const alive = this.waveAlive();
    audio.setIntensity(Math.min(1, alive / 12 + (this.boss ? 0.5 : 0)));
  }

  private updatePlayer(dt: number, c: Controls) {
    const p = this.p, up = UPGRADES;
    // rotation
    QE.set(-c.pitch * PLAYER.pitchRate * dt, c.yaw * PLAYER.yawRate * dt, 0, 'YXZ');
    QT.setFromEuler(QE);
    p.quat.multiply(QT).normalize();
    p.bank += (c.yaw * 0.7 + c.strafe * -0.35 - p.bank) * Math.min(1, dt * 6);
    // speed
    const fwd = this.forward(T1);
    const right = T2.set(-1, 0, 0).applyQuaternion(p.quat);
    let speed = PLAYER.cruise + (c.thrust > 0 ? PLAYER.thrust - PLAYER.cruise : c.thrust < 0 ? PLAYER.brake - PLAYER.cruise : 0);
    const boosting = c.boost && p.boost > 5;
    if (boosting) { speed = PLAYER.boost; p.boost = Math.max(0, p.boost - 38 * dt); } else p.boost = Math.min(100, p.boost + 16 * dt);
    p.speed += (speed - p.speed) * Math.min(1, dt * 3);
    p.dashV.multiplyScalar(Math.max(0, 1 - 4 * dt));
    p.vel.copy(fwd).multiplyScalar(p.speed).addScaledVector(right, c.strafe * PLAYER.strafe).add(p.dashV);
    p.pos.addScaledVector(p.vel, dt);
    const r = p.pos.length();
    if (r > PLAYER.arena) { p.pos.multiplyScalar(PLAYER.arena / r); this.warnT = 0.3; this.say('전투 구역으로 복귀하라', 0.5); }

    // timers
    p.sinceHit += dt; p.invuln = Math.max(0, p.invuln - dt); p.dashCd = Math.max(0, p.dashCd - dt); p.missileCd = Math.max(0, p.missileCd - dt); p.fireCd -= dt;
    const regen = PLAYER.shieldRegen * (1 + 0.2 * (this.upg.SHIELD ?? 0));
    if (p.sinceHit > PLAYER.shieldRegenDelay && p.shield < p.maxShield) p.shield = Math.min(p.maxShield, p.shield + regen * dt);

    // dash
    if (c.dash && p.dashCd <= 0) {
      const dir = T3.copy(fwd);
      if (c.strafe !== 0) dir.copy(right).multiplyScalar(c.strafe);
      p.dashV.copy(dir).multiplyScalar(PLAYER.dashImpulse);
      p.invuln = PLAYER.dashInvuln; p.dashCd = PLAYER.dashCooldown * Math.pow(0.82, this.upg.DASH ?? 0);
      this.stats.dashUsed++;
      audio.dash(); bus.emit('dash', { pos: p.pos });
    }
    // lasers
    const rate = PLAYER.laserRate * (1 + 0.18 * (this.upg.FIRE ?? 0));
    if (c.fire && p.fireCd <= 0) {
      p.fireCd = 1 / rate;
      this.fireLaser(fwd, right);
    }
    // missiles
    if (c.missile && p.missileCd <= 0) {
      const n = 1 + (this.upg.MISSILE ?? 0);
      p.missileCd = PLAYER.missileCooldown * Math.pow(0.92, this.upg.MISSILE ?? 0);
      const targets = this.enemies.filter((e) => e.alive && !e.invuln && !e.isPart && T3.copy(e.pos).sub(p.pos).normalize().dot(fwd) > 0.3).sort((a, b) => a.pos.distanceToSquared(p.pos) - b.pos.distanceToSquared(p.pos));
      for (let i = 0; i < n; i++) {
        const sp = (i - (n - 1) / 2) * 0.22;
        T3.copy(fwd).addScaledVector(right, sp).normalize();
        this.fx.bullets.spawn(BK.MISSILE, p.pos.x + right.x * sp * 8, p.pos.y + right.y * sp * 8 - 1, p.pos.z + right.z * sp * 8, T3.x * PLAYER.missileSpeed, T3.y * PLAYER.missileSpeed, T3.z * PLAYER.missileSpeed, 4, PLAYER.missileDamage, 3.5, 2.2, 0.8, targets[i % Math.max(1, targets.length)] ?? null);
      }
      bus.emit('missile');
    }
    // nova burst
    if (c.nova && p.nova >= 100) this.novaBurst();
    // engine trail
    this.lastEngine += dt;
    if (this.lastEngine > 0.012) {
      this.lastEngine = 0;
      T3.copy(p.pos).addScaledVector(fwd, -4);
      const k = boosting ? 2 : 1;
      this.fx.particles.emit(T3.x, T3.y, T3.z, -p.vel.x * 0.15 + (Math.random() - 0.5) * 3, -p.vel.y * 0.15 + (Math.random() - 0.5) * 3, -p.vel.z * 0.15 + (Math.random() - 0.5) * 3, 0.2 * k, 0.8 * k, 1.4 * k, 1.1 * k, 0.4, 1);
    }
  }

  private fireLaser(fwd: THREE.Vector3, right: THREE.Vector3) {
    const p = this.p;
    this.fireSide *= -1;
    let best: Enemy | null = null, bd = PLAYER.aimAssistCos;
    for (const e of this.enemies) {
      if (!e.alive || e.invuln) continue;
      T3.copy(e.pos).sub(p.pos);
      const dist = T3.length();
      if (dist > 650) continue;
      const d = T3.multiplyScalar(1 / dist).dot(fwd);
      if (d > bd) { bd = d; best = e; }
    }
    const dir = T4.copy(fwd);
    if (best) {
      T3.copy(best.pos).addScaledVector(best.vel, best.pos.distanceTo(p.pos) / PLAYER.laserSpeed).sub(p.pos).normalize();
      dir.lerp(T3, 0.75).normalize();
    }
    const dmg = PLAYER.laserDamage;
    this.fx.bullets.spawn(BK.LASER, p.pos.x + right.x * 2 * this.fireSide + fwd.x * 3, p.pos.y + right.y * 2 * this.fireSide + fwd.y * 3, p.pos.z + right.z * 2 * this.fireSide + fwd.z * 3,
      dir.x * PLAYER.laserSpeed, dir.y * PLAYER.laserSpeed, dir.z * PLAYER.laserSpeed, PLAYER.laserLife, dmg, 0.3, 2.4, 3.2);
    this.stats.shots++;
    bus.emit('fire');
  }

  private novaBurst() {
    const p = this.p;
    p.nova = 0; this.stats.novaUsed++;
    p.invuln = Math.max(p.invuln, 0.8);
    bus.emit('nova', { pos: p.pos.clone() });
    bus.emit('hitstop', { t: 0.08 });
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = e.pos.distanceTo(p.pos);
      if (d < 420) { this.damageEnemy(e, e.isBoss ? 600 : 420 * (1 - d / 700), false); }
    }
    const b = this.fx.bullets;
    for (let i = b.n - 1; i >= 0; i--) {
      if (b.kind[i] >= BK.ENEMY && T3.set(b.px[i], b.py[i], b.pz[i]).distanceTo(p.pos) < 520) {
        this.fx.particles.emit(b.px[i], b.py[i], b.pz[i], 0, 0, 0, b.cr[i], b.cg[i], b.cb[i], 2, 0.4);
        b.remove(i);
      }
    }
  }

  private updateWingmen(dt: number) {
    const p = this.p;
    for (const w of this.wingmen) {
      w.ang += dt * 0.9;
      T1.set(Math.cos(w.ang) * 12, Math.sin(w.ang * 1.3) * 5, -4 + Math.sin(w.ang) * 4).applyQuaternion(p.quat).add(p.pos);
      w.mesh.position.lerp(T1, Math.min(1, dt * 6));
      w.mesh.quaternion.slerp(p.quat, Math.min(1, dt * 6));
      w.cd -= dt;
      if (w.cd <= 0) {
        let best: Enemy | null = null, bd = 160000;
        for (const e of this.enemies) { if (!e.alive || e.invuln) continue; const d = e.pos.distanceToSquared(w.mesh.position); if (d < bd) { bd = d; best = e; } }
        if (best) {
          T2.copy(best.pos).sub(w.mesh.position).normalize();
          this.fx.bullets.spawn(BK.LASER, w.mesh.position.x, w.mesh.position.y, w.mesh.position.z, T2.x * 380, T2.y * 380, T2.z * 380, 1.2, 5, 0.3, 2.2, 3);
          w.cd = 0.4;
        } else w.cd = 0.2;
      }
    }
  }

  private updateCombo(dt: number) {
    const s = this.stats;
    if (s.comboT > 0) { s.comboT -= dt; if (s.comboT <= 0) s.combo = 0; }
  }

  // ---------------------------------------------------------------- enemies
  private updateEnemies(dt: number) {
    const ctx = this.ctx, p = this.p;
    ctx.dt = dt; ctx.time = this.stats.time;
    ctx.targetVel.copy(p.vel);
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.alive) continue;
      e.t += dt;
      if (e.isPart) {
        const par = e.parent!;
        e.pos.copy(e.local).applyQuaternion(par.quat).add(par.pos);
        e.mesh.position.copy(e.pos);
        e.cd -= dt;
        if (e.cd <= 0 && this.state === 'play' && par.st.trans <= 0) {
          ctx.target.copy(p.pos);
          T1.copy(p.pos).sub(e.pos).normalize();
          ctx.fire(e, T1, 135, 0.9);
          e.cd = 2.4 + this.rand() * 1.6;
        }
        continue;
      }
      if (e.isBoss) { this.updateBoss(e, dt); continue; }
      // target resolution
      if (e.aim === 'obj' && this.objective) { ctx.target.copy(this.objective.pos); ctx.targetVel.set(0, 0, 0); }
      else { ctx.target.copy(p.pos); ctx.targetVel.copy(p.vel); }
      if (e.isTarget) this.updateFleeing(e, dt);
      else if (this.state === 'play') PATTERNS[e.pattern].update(e, ctx);
      if (e.speedMul === 0) e.vel.set(0, 0, 0);
      e.pos.addScaledVector(e.vel, dt);
      const r = e.pos.length();
      if (r > 900) { e.pos.multiplyScalar(900 / r); e.vel.multiplyScalar(-0.5); }
      e.mesh.position.copy(e.pos); e.mesh.quaternion.copy(e.quat);
      if (e.pattern === 'CLOAK') { const m = (e.mesh as THREE.Mesh).material as THREE.MeshStandardMaterial; m.opacity = 1 - e.cloak * 0.93; }
      const sh = e.mesh.getObjectByName('shield'); if (sh) sh.visible = e.shield > 0;
      if (e.isFortress) {
        this.fortressT += dt;
        if (this.fortressT > 7 && this.waveAlive() < 14) { this.fortressT = 0; for (let k = 0; k < 3; k++) this.spawnEnemy('fighter', e.raceIdx, T1.copy(e.pos).add(T2.set(this.rand() - 0.5, this.rand() - 0.5, this.rand() - 0.5).multiplyScalar(60)), this.waveIdx); }
      }
      // player collision
      const dd = e.pos.distanceTo(p.pos);
      if (dd < e.radius + PLAYER.radius + 1 && this.state === 'play') {
        if (e.pattern === 'RUSH' && !e.isTarget) { this.hurtPlayer(ENEMY.ramDamage * dmgScale(this.diff), e.pos); this.killEnemy(e, false); }
        else { T1.copy(p.pos).sub(e.pos).normalize(); p.pos.addScaledVector(T1, 2); e.vel.addScaledVector(T1, -20); if (!e.isBoss && e.kind !== 'fighter') this.hurtPlayer(3, e.pos); }
      }
      // objective collision (rush)
      if (this.objective && e.pattern === 'RUSH' && e.pos.distanceTo(this.objective.pos) < e.radius + this.objective.radius) { this.hurtObjective(ENEMY.objectiveRam * dmgScale(this.diff)); this.killEnemy(e, false); }
    }
    // compact
    let w = 0;
    for (let i = 0; i < this.enemies.length; i++) { const e = this.enemies[i]; if (e.alive) this.enemies[w++] = e; }
    this.enemies.length = w;
  }

  private updateFleeing(e: Enemy, dt: number) {
    const p = this.p;
    T1.copy(e.pos).sub(p.pos); const d = T1.length(); T1.multiplyScalar(1 / d);
    T2.set(Math.sin(e.t * 0.9), Math.cos(e.t * 1.3), Math.sin(e.t * 0.6 + 2)).cross(T1).normalize();
    T1.addScaledVector(T2, 0.8);
    if (e.pos.length() > 520) T1.addScaledVector(T3.copy(e.pos).negate().normalize(), 1.5);
    T1.normalize();
    e.vel.lerp(T1.multiplyScalar(d < 220 ? 98 : 70), 1 - Math.exp(-2 * dt));
    T1.copy(e.vel).normalize(); e.quat.slerp(QT.setFromUnitVectors(T3.set(0, 0, 1), T1), 1 - Math.exp(-6 * dt));
    e.cd -= dt;
    if (e.cd <= 0 && d < 300) { T2.copy(p.pos).sub(e.pos).normalize(); this.ctx.fire(e, T2, 170, 1); e.cd = 1.4; }
  }

  private updateBoss(e: Enemy, dt: number) {
    const p = this.p, bd = this.mission.boss!;
    const phases = bd.phases;
    const ratio = e.hp / e.maxHp;
    const thr = 1 - (e.phase + 1) / phases;
    const weak = 1 + (e.st.partsDead / Math.max(1, bd.parts)) * 0.9;
    // phase change
    if (e.phase < phases - 1 && ratio < thr && e.st.trans <= 0 && this.state === 'play') {
      e.phase++; e.st.trans = 2.2; e.invuln = true;
      bus.emit('bossPhase', { phase: e.phase + 1, of: phases });
      bus.emit('explosion', { pos: e.pos.clone(), size: 14, color: e.color, big: true });
      this.say(`PHASE ${e.phase + 1}/${phases}`, 2);
      this.warnT = 1.5; audio.warning();
      const n = 3 + Math.min(5, e.phase * 2);
      for (let i = 0; i < n; i++) this.spawnEnemy('fighter', e.raceIdx, undefined, this.waveIdx);
    }
    if (e.st.trans > 0) { e.st.trans -= dt; if (e.st.trans <= 0) e.invuln = false; }
    // movement: orbit ahead of the player
    e.st.ang += dt * (0.18 + e.phase * 0.07);
    const a = e.st.ang;
    this.forward(T1);
    T2.set(Math.cos(a) * 190, Math.sin(a * 0.8) * 90, Math.sin(a) * 190);
    T3.copy(p.pos).addScaledVector(T1, 120).add(T2);
    T3.sub(e.pos).multiplyScalar(0.8);
    const sp = T3.length(); if (sp > 55 + e.phase * 8) T3.multiplyScalar((55 + e.phase * 8) / sp);
    e.vel.lerp(T3, 1 - Math.exp(-1.5 * dt));
    if (this.state !== 'collapse') e.pos.addScaledVector(e.vel, dt);
    e.st.spin += dt * (0.3 + e.phase * 0.2);
    T4.copy(p.pos).sub(e.pos).normalize();
    e.quat.setFromUnitVectors(T2.set(0, 0, 1), T4);
    QT.setFromAxisAngle(T2.set(0, 1, 0), e.st.spin); e.quat.multiply(QT);
    e.mesh.position.copy(e.pos); e.mesh.quaternion.copy(e.quat);
    const ring = e.mesh.getObjectByName('ring'); if (ring) ring.rotation.z += dt * (1 + e.phase);
    if (this.state !== 'play' || e.st.trans > 0) return;
    // attacks
    const ctx = this.ctx; ctx.target.copy(p.pos); ctx.targetVel.copy(p.vel);
    const ph = e.phase, k = (1 - 0.07 * ph) * weak;
    this.bossCd[0] -= dt; this.bossCd[1] -= dt; this.bossCd[2] -= dt; this.bossCd[3] -= dt;
    if (this.bossCd[0] <= 0) { // aimed volley
      this.bossCd[0] = 1.5 * k;
      const n = 3 + Math.min(2, ph);
      for (let i = 0; i < n; i++) { T1.copy(p.pos).addScaledVector(p.vel, 0.4).sub(e.pos).normalize(); T1.x += (i - (n - 1) / 2) * 0.05; T1.normalize(); ctx.fire(e, T1, 150 + ph * 10, 1); }
    }
    if (this.bossCd[1] <= 0) { // ring
      this.bossCd[1] = 5 * k;
      ctx.ring(e, 18 + ph * 4, 90, e.t);
      bus.emit('shake', 0.1);
    }
    if (ph >= 1 && this.bossCd[2] <= 0) { // spiral
      this.bossCd[2] = 0.3 * k;
      e.st.sp = (e.st.sp ?? 0) + 0.55;
      ctx.ring(e, 2, 100 + ph * 6, e.st.sp);
    }
    if (ph >= 2 && this.bossCd[3] <= 0) { // homing missiles
      this.bossCd[3] = 4.2 * k;
      for (let i = 0; i < 2 + (ph >= 3 ? 2 : 0); i++) {
        T1.set(this.rand() - 0.5, this.rand() - 0.5, this.rand() - 0.5).normalize();
        this.fx.bullets.spawn(BK.ENEMY_HOMING, e.pos.x, e.pos.y, e.pos.z, T1.x * 60, T1.y * 60, T1.z * 60, 7, ENEMY.bulletDamage * 1.6 * dmgScale(this.diff), 3, 1.0, 0.3);
      }
    }
  }

  // ---------------------------------------------------------------- bullets
  private updateBullets(dt: number) {
    const b = this.fx.bullets, p = this.p;
    for (let i = b.n - 1; i >= 0; i--) {
      const kind = b.kind[i];
      // homing
      if (kind === BK.MISSILE) {
        let t = b.tgt[i] as Enemy | null;
        if (!t || !t.alive || t.invuln) {
          t = null; let bd = 1e9;
          for (const e of this.enemies) { if (!e.alive || e.invuln) continue; const d = e.pos.distanceToSquared(T1.set(b.px[i], b.py[i], b.pz[i])); if (d < bd) { bd = d; t = e; } }
          b.tgt[i] = t;
        }
        if (t) {
          T1.set(b.vx[i], b.vy[i], b.vz[i]); const sp = T1.length(); T1.multiplyScalar(1 / sp);
          T2.copy(t.pos).sub(T3.set(b.px[i], b.py[i], b.pz[i])).normalize();
          T1.lerp(T2, Math.min(1, PLAYER.missileTurn * dt)).normalize();
          const s2 = Math.min(PLAYER.missileSpeed * 1.5, sp + 120 * dt);
          b.vx[i] = T1.x * s2; b.vy[i] = T1.y * s2; b.vz[i] = T1.z * s2;
        }
        this.fx.particles.emit(b.px[i], b.py[i], b.pz[i], 0, 0, 0, 2.2, 1.1, 0.4, 2, 0.45, 2);
      } else if (kind === BK.ENEMY_HOMING) {
        T1.set(b.vx[i], b.vy[i], b.vz[i]); const sp = T1.length(); T1.multiplyScalar(1 / sp);
        T2.copy(p.pos).sub(T3.set(b.px[i], b.py[i], b.pz[i])).normalize();
        T1.lerp(T2, Math.min(1, 1.3 * dt)).normalize();
        const s2 = Math.min(110, sp + 30 * dt);
        b.vx[i] = T1.x * s2; b.vy[i] = T1.y * s2; b.vz[i] = T1.z * s2;
        this.fx.particles.emit(b.px[i], b.py[i], b.pz[i], 0, 0, 0, 2.5, 0.8, 0.3, 2, 0.5, 2);
      }
      const ox = b.px[i], oy = b.py[i], oz = b.pz[i];
      b.px[i] += b.vx[i] * dt; b.py[i] += b.vy[i] * dt; b.pz[i] += b.vz[i] * dt;
      b.life[i] -= dt;
      let dead = b.life[i] <= 0;
      if (!dead && kind <= BK.MISSILE) {
        // vs enemies (swept)
        for (let j = 0; j < this.enemies.length; j++) {
          const e = this.enemies[j];
          if (!e.alive || e.invuln) continue;
          const r = e.radius * (kind === BK.MISSILE ? 1.1 : 1.15) + 0.6;
          if (segHit(ox, oy, oz, b.px[i], b.py[i], b.pz[i], e.pos.x, e.pos.y, e.pos.z, r)) {
            if (kind === BK.LASER) { this.stats.hits++; this.damageEnemy(e, b.dmg[i], false, T1.set(b.px[i], b.py[i], b.pz[i])); }
            else this.missileBlast(b.px[i], b.py[i], b.pz[i], b.dmg[i]);
            dead = true; break;
          }
        }
      } else if (!dead) {
        // enemy bullet vs player / objective
        const dx = b.px[i] - p.pos.x, dy = b.py[i] - p.pos.y, dz = b.pz[i] - p.pos.z;
        if (dx * dx + dy * dy + dz * dz < (PLAYER.radius + 2.2) ** 2 && this.state === 'play') {
          this.hurtPlayer(b.dmg[i], T1.set(b.px[i], b.py[i], b.pz[i]));
          dead = true;
        } else if (this.objective && T1.set(b.px[i], b.py[i], b.pz[i]).distanceToSquared(this.objective.pos) < (this.objective.radius + 1.5) ** 2) {
          this.hurtObjective(b.dmg[i] * ENEMY.objectiveDamageMul); dead = true;
        }
      }
      if (dead) {
        if (kind === BK.MISSILE && b.life[i] <= 0) this.missileBlast(b.px[i], b.py[i], b.pz[i], b.dmg[i] * 0.5);
        b.remove(i);
      }
    }
  }

  private missileBlast(x: number, y: number, z: number, dmg: number) {
    const c = new THREE.Vector3(x, y, z);
    bus.emit('explosion', { pos: c.clone(), size: 6, color: new THREE.Color(1, 0.6, 0.2), big: false });
    for (const e of this.enemies) {
      if (!e.alive || e.invuln) continue;
      const d = e.pos.distanceTo(c) - e.radius;
      if (d < PLAYER.missileSplash) this.damageEnemy(e, dmg * (1 - Math.max(0, d) / PLAYER.missileSplash * 0.6), true, e.pos);
    }
  }

  // ---------------------------------------------------------------- damage
  damageEnemy(e: Enemy, dmg: number, byMissile: boolean, at?: THREE.Vector3) {
    if (!e.alive || e.invuln) return;
    const pat = PATTERNS[e.pattern];
    let eff = dmg;
    if (e.isBoss && this.partsAlive() > 0) eff *= 0.4;
    if (pat.absorb && !e.isBoss && !e.isPart) eff = pat.absorb(e, eff);
    e.hp -= eff;
    e.lastHit = 0;
    if (byMissile) e.killedByMissile = true;
    bus.emit('hit', { pos: (at ?? e.pos).clone(), dmg, color: e.color, crit: byMissile });
    if (e.hp <= 0) this.killEnemy(e, byMissile);
  }

  killEnemy(e: Enemy, byMissile: boolean, silent = false) {
    if (!e.alive) return;
    e.alive = false;
    this.scene.remove(e.mesh);
    const big = e.kind !== 'fighter' || e.isBoss;
    const size = e.isBoss ? 22 : e.isFortress ? 24 : e.kind === 'carrier' ? 14 : e.kind === 'frigate' ? 8 : 4.5;
    if (!silent) bus.emit('explosion', { pos: e.pos.clone(), size, color: e.color, big: e.kind === 'carrier' && !e.isBoss });
    if (e.isPart) {
      const par = e.parent!; par.st.partsDead++;
      if (!silent) { bus.emit('hitstop', { t: 0.05 }); this.say('부위 파괴! 공격 패턴 약화', 1.4); }
      return;
    }
    if (!e.countsKill) return;
    const s = this.stats;
    if (this.wiping) { if (this.wipeCounts) s.kills++; return; }
    s.kills++;
    if (byMissile || e.killedByMissile) s.missileKills++;
    s.combo = s.comboT > 0 ? s.combo + 1 : 1; s.comboT = COMBO.window;
    if (s.combo > s.maxCombo) s.maxCombo = s.combo;
    this.p.nova = Math.min(100, this.p.nova + COMBO.novaPerKill * (e.kind === 'fighter' ? 1 : e.kind === 'frigate' ? 2.5 : 5) + s.combo * COMBO.novaPerComboStep);
    if (big) bus.emit('hitstop', { t: 0.04 });
    PATTERNS[e.pattern].onDeath?.(e, this.ctx);
    bus.emit('kill', { enemy: e, combo: s.combo });
    if (e.isBoss) this.beginCollapse();
    else if (e.isFortress) this.finishObjective(true);
    else if (e.isTarget && this.mission.type === 'PURSUIT') this.finishObjective(false);
  }

  hurtPlayer(dmg: number, at: THREE.Vector3) {
    const p = this.p;
    if (p.invuln > 0 || this.state !== 'play') return;
    p.sinceHit = 0;
    this.stats.damageTaken += dmg; this.stats.hitsTaken++;
    this.stats.combo = 0; this.stats.comboT = 0;
    let shieldUp = p.shield > 0;
    if (p.shield > 0) { const a = Math.min(p.shield, dmg); p.shield -= a; dmg -= a; (this.shieldMesh.material as THREE.ShaderMaterial).uniforms.a.value = 1; }
    if (dmg > 0) p.hull -= dmg;
    bus.emit('playerHit', { pos: at.clone(), shieldUp: shieldUp && dmg <= 0 });
    if (p.hull <= 0) { p.hull = 0; this.defeat('격침당했다'); }
  }
  hurtObjective(dmg: number) {
    const o = this.objective; if (!o || this.state !== 'play') return;
    o.hp -= dmg; this.objHitT = 0;
    bus.emit('explosion', { pos: o.pos.clone().add(T1.set((this.rand() - 0.5) * 12, (this.rand() - 0.5) * 12, (this.rand() - 0.5) * 12)), size: 2.5, color: new THREE.Color(0.3, 1, 0.8), big: false });
    if (o.hp <= 0) { o.hp = 0; bus.emit('explosion', { pos: o.pos.clone(), size: 20, color: new THREE.Color(0.3, 1, 0.8), big: true }); this.defeat(o.kind === 'beacon' ? '방어 거점이 파괴되었다' : '수송선이 격침되었다'); }
  }

  private updateObjectives(dt: number) {
    const o = this.objective;
    if (o) {
      if (o.kind === 'freighter') { o.ang += dt * 0.035; o.pos.set(Math.cos(o.ang) * 230, Math.sin(o.ang * 1.7) * 40, Math.sin(o.ang) * 230); T1.set(-Math.sin(o.ang), 0, Math.cos(o.ang)); o.mesh.quaternion.setFromUnitVectors(T2.set(0, 0, 1), T1); }
      else o.mesh.rotation.y += dt * 0.6;
      // auto-repair once the objective has been left alone for a while
      this.objHitT += dt;
      if (this.objHitT > ENEMY.objectiveRepairDelay && o.hp > 0) o.hp = Math.min(o.maxHp, o.hp + o.maxHp * ENEMY.objectiveRepair * dt);
      o.mesh.position.copy(o.pos);
    }
    const t = this.mission.type;
    if (this.timeLimit > 0 && this.stats.time > this.timeLimit && this.state === 'play') this.defeat('제한 시간 초과');
    if (t === 'INFILTRATE' && this.state === 'play') {
      this.rings.forEach((r, i) => { const m = r.mesh.material as THREE.MeshBasicMaterial; m.opacity = i === this.ringIdx ? 1 : i < this.ringIdx ? 0 : 0.25; r.mesh.scale.setScalar(i === this.ringIdx ? 1 + Math.sin(this.spin * 6) * 0.06 : 1); });
      const r = this.rings[this.ringIdx];
      if (r && r.pos.distanceTo(this.p.pos) < 22) {
        this.ringIdx++; bus.emit('explosion', { pos: r.pos.clone(), size: 6, color: new THREE.Color(0.2, 1, 1), big: false });
        this.say(`체크포인트 ${this.ringIdx}/${this.rings.length}`, 1.2);
        if (this.ringIdx >= this.rings.length) this.finishObjective(false);
      }
    }
    if (this.state === 'play') {
      const allDone = this.wavesDone && this.waveAlive() === 0;
      if ((t === 'ANNIHILATE' || t === 'ASSAULT' || t === 'ESCORT' || t === 'DEFENSE') && allDone) this.victory();
    }
  }

  // ---------------------------------------------------------------- end states
  private finishObjective(wipe: boolean) {
    if (this.state !== 'play') return;
    // remaining forces collapse; for siege they count as destroyed
    this.wiping = true; this.wipeCounts = wipe;
    for (const e of this.enemies) if (e.alive && !e.isBoss) this.killEnemy(e, false);
    this.wiping = false;
    this.fx.bullets.clear();
    this.victory();
  }
  private wiping = false; private wipeCounts = false;
  private objHitT = 0;
  private beginCollapse() {
    if (this.state !== 'play') return;
    this.state = 'collapse'; this.collapseT = 0;
    this.fx.bullets.clear();
    this.wiping = true; this.wipeCounts = true;
    for (const e of this.enemies) if (e.alive && !e.isBoss && !e.isPart) this.killEnemy(e, false);
    for (const e of this.enemies) if (e.alive && e.isPart) this.killEnemy(e, false, true);
    this.wiping = false;
    this.say('TARGET DESTROYED', 3);
    bus.emit('hitstop', { t: 0.2 });
  }
  private updateCollapse(dt: number) {
    const b = this.boss; if (!b) { this.victory(); return; }
    this.collapseT += dt;
    b.mesh.visible = this.collapseT < 2.6;
    b.mesh.position.copy(b.pos);
    b.mesh.rotation.z += dt * 2;
    if (Math.random() < dt * 22) {
      T1.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(20 + Math.random() * 15).add(b.pos);
      bus.emit('explosion', { pos: T1.clone(), size: 5 + Math.random() * 8, color: b.color, big: false });
    }
    bus.emit('shake', dt * 1.5);
    if (this.collapseT > 2.8) {
      bus.emit('explosion', { pos: b.pos.clone(), size: 40, color: b.color, big: true });
      this.scene.remove(b.mesh);
      this.victory();
    }
  }
  private victory() {
    if (this.state === 'victory' || this.state === 'defeat') return;
    this.state = 'victory'; this.endT = 0;
    this.say('MISSION COMPLETE', 3);
  }
  private defeat(reason: string) {
    if (this.state === 'victory' || this.state === 'defeat') return;
    this.state = 'defeat'; this.endT = 0; this.defeatReason = reason;
    bus.emit('explosion', { pos: this.p.pos.clone(), size: 14, color: new THREE.Color(0.3, 0.9, 1), big: true });
    this.bankNode.visible = false;
    this.say('MISSION FAILED — ' + reason, 3);
  }
  defeatReason = '';

  bonusState(): boolean[] {
    const s = this.stats, m = this.mission;
    return m.bonus.map((id: BonusId) => {
      switch (id) {
        case 'NO_HIT': return s.damageTaken === 0;
        case 'COMBO': return s.maxCombo >= m.comboTarget * 1.3;
        case 'FAST': return s.time <= m.parTime * 0.8;
        case 'MISSILE_KILLS': return s.missileKills >= 5;
        case 'NOVA': return s.novaUsed >= 1;
        case 'ACCURACY': return s.shots > 0 && s.hits / s.shots >= 0.45;
        case 'NO_DASH': return s.dashUsed === 0;
      }
    });
  }
  private killRatio() { return this.stats.spawned > 0 ? this.stats.kills / this.stats.spawned : 1; }
  private hullFrac() { return 1 - this.stats.damageTaken / (2 * (this.p.maxHull + this.p.maxShield)); }
  predictScore(): ScoreBreakdown {
    const s = this.stats;
    return computeStageScore({
      killRatio: Math.min(1, s.kills / Math.max(1, this.expected)), time: s.time, parTime: this.mission.parTime,
      hullFrac: this.hullFrac(), maxCombo: s.maxCombo, comboTarget: this.mission.comboTarget, bonusHits: this.bonusState().filter(Boolean).length,
    });
  }
  result(): BattleResult {
    const bonus = this.bonusState();
    if (this.state !== 'victory') return { victory: false, bonusDone: bonus, reason: this.defeatReason, stats: this.stats };
    const score = computeStageScore({
      killRatio: this.killRatio(), time: this.stats.time, parTime: this.mission.parTime, hullFrac: this.hullFrac(),
      maxCombo: this.stats.maxCombo, comboTarget: this.mission.comboTarget, bonusHits: bonus.filter(Boolean).length,
    });
    return { victory: true, score, bonusDone: bonus, stats: this.stats };
  }

  // ---------------------------------------------------------------- visuals
  private updateVisuals(dt: number) {
    const p = this.p;
    this.bankNode.position.copy(p.pos);
    this.bankNode.quaternion.copy(p.quat);
    this.playerMesh.rotation.z = p.bank;
    const sm = (this.shieldMesh.material as THREE.ShaderMaterial).uniforms.a;
    sm.value = Math.max(0, sm.value - dt * 2.5) + (p.invuln > 0 ? 0.35 : 0);
    this.planetClouds.rotation.y += dt * 0.01; this.planetGroup.rotation.y += dt * 0.003;
    // chase camera
    const cam = this.camera;
    const boostK = Math.max(0, (p.speed - PLAYER.thrust) / (PLAYER.boost - PLAYER.thrust));
    T1.set(0, 5, -18 - boostK * 6).applyQuaternion(p.quat).add(p.pos);
    this.camPos.lerp(T1, 1 - Math.exp(-9 * dt));
    cam.position.copy(this.camPos);
    const sh = this.feel.shake * 0.9;
    if (sh > 0.001) cam.position.add(T2.set((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh));
    T3.set(0, 1, 0).applyQuaternion(p.quat);
    T2.set(0, 0, 40).applyQuaternion(p.quat).add(p.pos);
    M4.lookAt(cam.position, T2, T3);
    QT.setFromRotationMatrix(M4);
    cam.quaternion.slerp(QT, 1 - Math.exp(-14 * dt));
    cam.fov += ((70 + boostK * 16 + (p.dashCd > PLAYER.dashCooldown - 0.2 ? 8 : 0)) - cam.fov) * Math.min(1, dt * 6);
    cam.updateProjectionMatrix();
    this.fx.particles.uScale.value = (window.innerHeight * (window.devicePixelRatio || 1)) / (2 * Math.tan((cam.fov * Math.PI) / 360));
  }

  setAspect(a: number) { this.camera.aspect = a; this.camera.updateProjectionMatrix(); }

  dispose() {
    this.feel.dispose();
    audio.stopBgm();
    this.scene.traverse((o: any) => { if (o.geometry && !o.userData.shared) { /* shared geos are cached */ } });
  }
}

function segHit(px: number, py: number, pz: number, qx: number, qy: number, qz: number, cx: number, cy: number, cz: number, r: number) {
  const dx = qx - px, dy = qy - py, dz = qz - pz;
  const l2 = dx * dx + dy * dy + dz * dz;
  let t = l2 > 0 ? ((cx - px) * dx + (cy - py) * dy + (cz - pz) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = px + dx * t - cx, ey = py + dy * t - cy, ez = pz + dz * t - cz;
  return ex * ex + ey * ey + ez * ez < r * r;
}
