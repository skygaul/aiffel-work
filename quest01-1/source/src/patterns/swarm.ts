import * as THREE from 'three';
import type { Pattern } from './types';
import { aimedShot, faceVelocity, perp, steer, toTarget } from './common';

const D = new THREE.Vector3(), P = new THREE.Vector3();

/** SWARM: many fragile, fast ships that weave around the target. */
export const Swarm: Pattern = {
  id: 'SWARM', hpMul: 0.6, speedMul: 1.15,
  init(e) { e.st.ph = Math.random() * 6.28; e.cd = 1 + Math.random() * 2; },
  update(e, c) {
    const d = toTarget(e, c, D);
    perp(D, e.t * 1.5 + e.st.ph, P);
    D.addScaledVector(P, d > 60 ? 0.55 : 1.2).normalize();
    if (d < 28) D.negate();
    steer(e, D, 62 * e.speedMul, c.dt, 2.4);
    faceVelocity(e, c.dt);
    e.cd -= c.dt;
    if (e.cd <= 0 && d < 260) { aimedShot(e, c, 150, 0.12); e.cd = 2.6 + Math.random() * 1.6; }
  },
};
