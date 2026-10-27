import * as THREE from 'three';
import type { Pattern } from './types';
import { aimedShot, faceVelocity, perp, steer, toTarget } from './common';

const D = new THREE.Vector3(), P = new THREE.Vector3();

/** REGEN: sturdy ship that heals when left alone — burst it down. */
export const Regen: Pattern = {
  id: 'REGEN', hpMul: 1.3, speedMul: 0.95,
  init(e) { e.cd = 1 + Math.random() * 2; e.st.ph = Math.random() * 6; },
  absorb(e, dmg) { e.lastHit = 0; return dmg; },
  update(e, c) {
    e.lastHit += c.dt;
    if (e.lastHit > 1.6 && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.07 * c.dt);
    const d = toTarget(e, c, D);
    perp(D, e.t * 0.8 + e.st.ph, P);
    D.multiplyScalar(d > 110 ? 1 : -0.4).addScaledVector(P, 0.7).normalize();
    steer(e, D, 46 * e.speedMul, c.dt, 1.8);
    faceVelocity(e, c.dt);
    e.cd -= c.dt;
    if (e.cd <= 0 && d < 300) { aimedShot(e, c, 150, 0.05); aimedShot(e, c, 150, 0.05); e.cd = 1.8 + Math.random() * 0.8; }
  },
};
