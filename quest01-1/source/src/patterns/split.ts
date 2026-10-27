import * as THREE from 'three';
import type { Pattern } from './types';
import { aimedShot, faceVelocity, perp, steer, toTarget } from './common';

const D = new THREE.Vector3(), P = new THREE.Vector3();

/** SPLIT: breaks into two smaller ships on death (children cannot split again). */
export const Split: Pattern = {
  id: 'SPLIT', hpMul: 1.0, speedMul: 1.0,
  init(e) { e.cd = 1.5 + Math.random() * 2; e.st.ph = Math.random() * 6; },
  update(e, c) {
    const d = toTarget(e, c, D);
    perp(D, e.t + e.st.ph, P);
    D.multiplyScalar(d > 90 ? 1 : -0.5).addScaledVector(P, 0.5).normalize();
    steer(e, D, 52 * e.speedMul, c.dt, 2);
    faceVelocity(e, c.dt);
    e.cd -= c.dt;
    if (e.cd <= 0 && d < 280) { aimedShot(e, c, 150, 0.08); e.cd = 2 + Math.random(); }
  },
  onDeath(e, c) {
    if (e.noSplit) return;
    c.spawnChild(e);
    c.spawnChild(e);
  },
};
