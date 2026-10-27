import * as THREE from 'three';
import type { Pattern } from './types';
import { faceVelocity, steer, toTarget } from './common';
import { ENEMY } from '../tuning';

const D = new THREE.Vector3();
/** End times of charges in progress — caps how many rammers commit at once. */
const charges: number[] = [];

/** RUSH: closes in, telegraphs, then kamikaze-charges (a few at a time). */
export const Rush: Pattern = {
  id: 'RUSH', hpMul: 0.9, speedMul: 1.3,
  init(e) { e.st.mode = 0; e.st.timer = 1.5 + Math.random() * 3; e.cd = 99; },
  update(e, c) {
    const d = toTarget(e, c, D);
    e.st.timer -= c.dt;
    if (e.st.mode === 0) {
      // circle at a distance until a charge slot frees up
      if (d < 120) D.negate();
      steer(e, D, 60 * e.speedMul, c.dt, 2);
      if (d < 200 && e.st.timer < 0) {
        for (let i = charges.length - 1; i >= 0; i--) if (charges[i] < c.time || charges[i] > c.time + 10) charges.splice(i, 1);
        if (charges.length < ENEMY.maxChargers) { charges.push(c.time + 4); e.st.mode = 1; e.st.timer = 1.0; c.telegraph(e); }
        else e.st.timer = 0.5 + Math.random();
      }
    } else if (e.st.mode === 1) {
      e.vel.multiplyScalar(Math.max(0, 1 - 4 * c.dt));
      if (e.st.timer < 0) { e.st.mode = 2; e.st.timer = 2.5; e.vel.copy(D).multiplyScalar(150 * e.speedMul); e.st.dx = D.x; e.st.dy = D.y; e.st.dz = D.z; }
    } else {
      D.set(e.st.dx, e.st.dy, e.st.dz).lerp(D.copy(c.target).sub(e.pos).normalize(), 0.01).normalize();
      e.st.dx = D.x; e.st.dy = D.y; e.st.dz = D.z;
      steer(e, D, 155 * e.speedMul, c.dt, 5);
      if (e.st.timer < 0) { e.st.mode = 0; e.st.timer = 2.5 + Math.random() * 2.5; }
    }
    faceVelocity(e, c.dt);
  },
};
