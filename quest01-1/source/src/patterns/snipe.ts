import * as THREE from 'three';
import type { Pattern } from './types';
import { aimedShot, faceVelocity, perp, steer, toTarget } from './common';

const D = new THREE.Vector3(), P = new THREE.Vector3();

/** SNIPE: keeps distance, charges a telegraphed high-damage shot. */
export const Snipe: Pattern = {
  id: 'SNIPE', hpMul: 0.8, speedMul: 0.85,
  init(e) { e.cd = 2 + Math.random() * 2; e.st.charge = 0; e.st.ph = Math.random() * 6; },
  update(e, c) {
    const d = toTarget(e, c, D);
    if (d < 170) D.negate(); else if (d < 230) D.set(0, 0, 0);
    toTarget(e, c, P);
    perp(P, e.t * 0.6 + e.st.ph, P);
    D.addScaledVector(P, 0.7);
    if (D.lengthSq() > 1e-4) D.normalize();
    steer(e, D, 48 * e.speedMul, c.dt, 1.6);
    faceVelocity(e, c.dt);
    if (e.st.charge > 0) {
      e.st.charge -= c.dt;
      if (e.st.charge <= 0) { aimedShot(e, c, 340, 0.01, 2.4, 0.9); e.cd = 3.2 + Math.random() * 1.5; }
    } else {
      e.cd -= c.dt;
      if (e.cd <= 0 && d < 420) { e.st.charge = 0.9; c.telegraph(e); }
    }
  },
};
