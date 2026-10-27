import * as THREE from 'three';
import type { Pattern } from './types';
import { faceVelocity, perp, steer, toTarget } from './common';

const D = new THREE.Vector3(), P = new THREE.Vector3();

/** BULLET_HELL: slow orbiter that sprays rings and spirals. */
export const BulletHell: Pattern = {
  id: 'BULLET_HELL', hpMul: 1.2, speedMul: 0.7,
  init(e) { e.cd = 1.5 + Math.random() * 2; e.st.spin = Math.random() * 6; e.st.n = 0; },
  update(e, c) {
    const d = toTarget(e, c, D);
    perp(D, e.t * 0.3, P);
    D.multiplyScalar(d > 200 ? 1 : d < 130 ? -0.8 : 0).addScaledVector(P, 0.5);
    if (D.lengthSq() > 1e-4) D.normalize();
    steer(e, D, 30 * e.speedMul, c.dt, 1.2);
    faceVelocity(e, c.dt);
    e.cd -= c.dt;
    if (e.cd <= 0 && d < 380) {
      e.st.n++;
      if (e.st.n % 3 === 0) c.ring(e, 14 + Math.min(10, Math.floor(c.diff * 2)), 85, 0);
      else { e.st.spin += 0.45; c.ring(e, 5, 95, e.st.spin); }
      e.cd = 0.55 + Math.random() * 0.3;
    }
  },
};
