import * as THREE from 'three';
import type { Pattern } from './types';
import { aimedShot, faceVelocity, perp, steer, toTarget } from './common';

const D = new THREE.Vector3(), P = new THREE.Vector3();

/** SHIELD: a regenerating barrier that absorbs and blunts damage first. */
export const Shield: Pattern = {
  id: 'SHIELD', hpMul: 1.1, speedMul: 0.8,
  init(e) { e.maxShield = e.maxHp * 0.8; e.shield = e.maxShield; e.cd = 1.5 + Math.random() * 1.5; },
  absorb(e, dmg) {
    e.lastHit = 0;
    if (e.shield > 0) {
      const taken = Math.min(e.shield, dmg * 0.6);
      e.shield -= taken;
      return Math.max(0, dmg * 0.6 - taken) * 0.5;
    }
    return dmg;
  },
  update(e, c) {
    e.lastHit += c.dt;
    if (e.lastHit > 4 && e.shield < e.maxShield) e.shield = Math.min(e.maxShield, e.shield + e.maxShield * 0.25 * c.dt);
    const d = toTarget(e, c, D);
    perp(D, e.t * 0.5, P);
    D.multiplyScalar(d > 140 ? 1 : -0.2).addScaledVector(P, 0.6);
    if (D.lengthSq() > 1e-4) D.normalize();
    steer(e, D, 36 * e.speedMul, c.dt, 1.5);
    faceVelocity(e, c.dt);
    e.cd -= c.dt;
    if (e.cd <= 0 && d < 320) { for (let i = -1; i <= 1; i++) aimedShot(e, c, 140, 0.02 + Math.abs(i) * 0.1); e.cd = 2.4 + Math.random(); }
  },
};
