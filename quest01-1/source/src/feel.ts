import * as THREE from 'three';
import { bus } from './events';
import type { Fx } from './fx';
import { audio } from './audio';
import { settings } from './save';
import { FEEL } from './tuning';

export interface DmgNumber { x: number; y: number; z: number; text: string; t: number; color: string; crit: boolean }

const C = new THREE.Color();
const WHITE = new THREE.Color(1, 1, 1);

/**
 * Game feel layer (FR-13): hit-stop, camera shake, damage numbers and all VFX.
 * Gameplay code only emits events on the bus; this class reacts.
 */
export class Feel {
  shake = 0;
  hitStop = 0;
  flash = 0;
  aberr = 0;
  numbers: DmgNumber[] = [];
  private subs: [string, (p: any) => void][] = [];

  constructor(private fx: Fx) {
    this.sub('explosion', (p) => this.explosion(p.pos, p.size, p.color, p.big));
    this.sub('hit', (p) => this.hit(p));
    this.sub('playerHit', (p) => {
      const s = settings();
      this.shake = Math.min(1.5, this.shake + 0.5 * s.shake);
      this.flash = Math.max(this.flash, 0.35 * s.flash);
      this.aberr = Math.max(this.aberr, 0.012 * s.aberration);
      this.fx.rings.spawn(p.pos.x, p.pos.y, p.pos.z, C.set('#7ff'), 4, 16, 0.4, 0.9);
      if (p.shieldUp) audio.shield(); else audio.playerHit();
    });
    this.sub('hitstop', (p) => { this.hitStop = Math.max(this.hitStop, p?.t ?? FEEL.hitStop); });
    this.sub('shake', (p) => { this.shake = Math.min(2, this.shake + p * settings().shake); });
    this.sub('nova', (p) => this.nova(p.pos));
    this.sub('dash', (p) => { this.aberr = Math.max(this.aberr, 0.008 * settings().aberration); this.fx.particles.burst(p.pos.x, p.pos.y, p.pos.z, 24, 40, C.set('#8ff'), 1.4, 0.5, 2); });
    this.sub('fire', (p) => audio.laser());
    this.sub('missile', () => audio.missile());
    this.sub('telegraph', (p) => { this.fx.glows.spawn(p.pos.x, p.pos.y, p.pos.z, C.set(p.color), 3, 14, 0.7, 0.9); });
  }
  private sub(ev: string, f: (p: any) => void) { bus.on(ev, f); this.subs.push([ev, f]); }
  dispose() { for (const [e, f] of this.subs) bus.off(e, f); this.subs.length = 0; }

  update(dt: number) {
    this.shake = Math.max(0, this.shake - dt * 2.2);
    this.flash = Math.max(0, this.flash - dt * 1.6);
    this.aberr = Math.max(0, this.aberr - dt * 0.05);
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i];
      n.t += dt; n.y += dt * 6;
      if (n.t > 0.8) this.numbers.splice(i, 1);
    }
  }

  /** FR-44: explosion = flash + fireball + sparks + debris + shockwave + smoke (6 elements) */
  explosion(pos: THREE.Vector3, size: number, color: THREE.Color, big = false) {
    const f = this.fx, p = f.particles;
    const n = Math.min(80, Math.round(10 + size * 3)) * (big ? 1.5 : 1) | 0;
    f.glows.spawn(pos.x, pos.y, pos.z, WHITE, size * 1.5, size * 5, 0.25, 1);
    p.burst(pos.x, pos.y, pos.z, n, size * 5, C.set('#ffb040').lerp(color, 0.35), size * 0.9, 0.7, 3, 1.2);
    p.burst(pos.x, pos.y, pos.z, n, size * 14, WHITE.clone().lerp(color, 0.5), 0.35, 0.55, 4, 0.5);
    p.burst(pos.x, pos.y, pos.z, Math.round(n * 0.4), size * 7, C.set('#ff7a30'), 1.0, 1.4, 1.4, 1.8);
    f.rings.spawn(pos.x, pos.y, pos.z, color.clone().lerp(WHITE, 0.4), size * 1.2, size * 9, 0.55, 0.9);
    p.burst(pos.x, pos.y, pos.z, Math.round(n * 0.3), size * 3, C.set('#443040'), size * 1.6, 2.0, 0.7, 2.2);
    if (big) { f.rings.spawn(pos.x, pos.y, pos.z, WHITE, size * 2, size * 16, 0.9, 0.8); this.shake = Math.min(2, this.shake + 0.45 * settings().shake); }
    else this.shake = Math.min(2, this.shake + Math.min(0.2, size * 0.012) * settings().shake);
    audio.explosion(big || size > 8);
  }
  private hit(p: { pos: THREE.Vector3; dmg: number; color: THREE.Color; crit?: boolean }) {
    this.fx.particles.burst(p.pos.x, p.pos.y, p.pos.z, 5, 30, p.color, 0.5, 0.25, 3, 1.5);
    this.numbers.push({ x: p.pos.x, y: p.pos.y + 2, z: p.pos.z, text: String(Math.round(p.dmg)), t: 0, color: p.crit ? '#ffd24a' : '#bff', crit: !!p.crit });
    if (this.numbers.length > 40) this.numbers.shift();
    audio.hit();
  }
  private nova(pos: THREE.Vector3) {
    const f = this.fx;
    f.glows.spawn(pos.x, pos.y, pos.z, WHITE, 40, 600, 0.9, 1);
    f.rings.spawn(pos.x, pos.y, pos.z, C.set('#8ff'), 10, 500, 1.1, 1);
    f.rings.spawn(pos.x, pos.y, pos.z, C.set('#f8f'), 6, 380, 0.9, 1);
    f.particles.burst(pos.x, pos.y, pos.z, 400, 420, C.set('#aef'), 1.6, 1.2, 3.5, 0.9);
    this.shake = 2; this.flash = 0.8 * settings().flash; this.aberr = 0.03 * settings().aberration;
    audio.nova();
  }
}
