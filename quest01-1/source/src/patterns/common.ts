import * as THREE from 'three';
import type { Enemy } from '../enemy';
import type { PatternCtx } from './types';

const A = new THREE.Vector3(), B = new THREE.Vector3(), Q = new THREE.Quaternion();
const FWD = new THREE.Vector3(0, 0, 1);

/** Smoothly steer velocity toward dir*speed. */
export function steer(e: Enemy, dir: THREE.Vector3, speed: number, dt: number, turn = 2.2) {
  A.copy(dir).multiplyScalar(speed);
  e.vel.lerp(A, 1 - Math.exp(-turn * dt));
}
export function toTarget(e: Enemy, c: PatternCtx, out: THREE.Vector3) {
  out.copy(c.target).sub(e.pos);
  const d = out.length();
  if (d > 1e-4) out.multiplyScalar(1 / d);
  return d;
}
/** Perpendicular unit vector used for weaving/strafing. */
export function perp(dir: THREE.Vector3, ph: number, out: THREE.Vector3) {
  A.set(Math.sin(ph), Math.cos(ph * 1.3), Math.sin(ph * 0.7 + 1)).cross(dir);
  const l = A.length();
  return out.copy(A).multiplyScalar(l > 1e-4 ? 1 / l : 0);
}
export function faceVelocity(e: Enemy, dt: number) {
  const l = e.vel.length();
  if (l < 1) return;
  B.copy(e.vel).multiplyScalar(1 / l);
  Q.setFromUnitVectors(FWD, B);
  e.quat.slerp(Q, 1 - Math.exp(-6 * dt));
}
/** Fire an aimed (lead-predicted) shot. */
export function aimedShot(e: Enemy, c: PatternCtx, speed: number, spread = 0, dmgMul = 1, lead = 0.5) {
  const d = e.pos.distanceTo(c.target);
  A.copy(c.target).addScaledVector(c.targetVel, (d / speed) * lead).sub(e.pos).normalize();
  if (spread > 0) A.add(B.set((c.rand() - 0.5) * spread, (c.rand() - 0.5) * spread, (c.rand() - 0.5) * spread)).normalize();
  c.fire(e, A, speed, dmgMul);
}
