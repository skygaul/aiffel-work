import * as THREE from 'three';
import type { Pattern } from './types';
import { aimedShot, faceVelocity, perp, steer, toTarget } from './common';

const D = new THREE.Vector3(), P = new THREE.Vector3();

/** CLOAK: fades out (untargetable) while repositioning, then ambushes with a short burst. */
export const Cloak: Pattern = {
  id: 'CLOAK', hpMul: 0.8, speedMul: 1.0,
  // fully desynchronised cycles so a whole wave never reveals and fires at once
  init(e) { e.st.cyc = Math.random() * 6; e.st.ph = Math.random() * 6; e.cd = 1 + Math.random() * 2; },
  update(e, c) {
    e.st.cyc += c.dt;
    const cyc = e.st.cyc % 6;
    const d = toTarget(e, c, D);
    // 0-3 visible, 3-3.5 fade, 3.5-5.5 cloaked, 5.5-6 reveal
    let target = 0;
    if (cyc > 3 && cyc < 3.5) target = (cyc - 3) * 2;
    else if (cyc >= 3.5 && cyc < 5.5) target = 1;
    else if (cyc >= 5.5) target = 1 - (cyc - 5.5) * 2;
    e.cloak = target;
    e.invuln = target > 0.85;
    // hold a ring around the target instead of closing to point blank
    perp(D, e.t * 0.7 + e.st.ph, P);
    D.multiplyScalar(d > 140 ? 1 : d < 90 ? -0.8 : 0).addScaledVector(P, 0.7);
    if (D.lengthSq() > 1e-4) D.normalize();
    steer(e, D, (e.invuln ? 70 : 48) * e.speedMul, c.dt, 2);
    faceVelocity(e, c.dt);
    e.cd -= c.dt;
    if (!e.invuln && e.cd <= 0 && d < 280 && d > 50) {
      const ambush = cyc > 5.5 || cyc < 0.4;
      aimedShot(e, c, 160, 0.06, 0.8);
      if (ambush) aimedShot(e, c, 160, 0.16, 0.8);
      e.cd = 2.2 + Math.random();
    }
  },
};
