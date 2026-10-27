import * as THREE from 'three';
import type { Battle } from './battle';
import type { Controls } from './input';
import { BK } from './fx';

const L = new THREE.Vector3(), D = new THREE.Vector3(), Q = new THREE.Quaternion(), F = new THREE.Vector3();

/** ?autoplay=1 — drives the player ship for headless/soak verification (FR-72). */
export function botControls(b: Battle, c: Controls) {
  const p = b.p;
  c.fire = false; c.boost = false; c.missile = false; c.nova = false; c.dash = false; c.strafe = 0; c.thrust = 0; c.yaw = 0; c.pitch = 0;
  let tgt: THREE.Vector3 | null = null; let tv: THREE.Vector3 | null = null; let isEnemy = false;
  const type = b.mission.type;
  if (type === 'INFILTRATE' && b.rings[b.ringIdx]) tgt = b.rings[b.ringIdx].pos;
  else {
    let best = 1e12;
    const parts = b.enemies.some((e) => e.alive && e.isPart);
    for (const e of b.enemies) {
      if (!e.alive || e.invuln) continue;
      if (parts && e.isBoss) continue;
      let d = e.pos.distanceToSquared(b.objective ? b.objective.pos : p.pos);
      if (b.objective && e.aim === 'obj') d *= 0.3;
      if (e.isTarget) d *= 0.2;
      if (d < best) { best = d; tgt = e.pos; tv = e.vel; isEnemy = true; }
    }
    if (!tgt && b.objective) tgt = b.objective.pos;
    if (!tgt && b.boss && b.boss.alive) { tgt = b.boss.pos; isEnemy = true; }
  }
  if (!tgt || p.pos.length() > 560) tgt = tgt && p.pos.length() < 560 ? tgt : L.set(0, 0, 0);
  D.copy(tgt);
  const dist = D.distanceTo(p.pos);
  if (tv) D.addScaledVector(tv, dist / 420);
  D.sub(p.pos).normalize();
  Q.copy(p.quat).invert();
  L.copy(D).applyQuaternion(Q);
  c.yaw = Math.max(-1, Math.min(1, L.x * 5));
  c.pitch = Math.max(-1, Math.min(1, L.y * 5));
  if (L.z < 0) { c.yaw = L.x >= 0 ? 1 : -1; }
  F.set(0, 0, 1).applyQuaternion(p.quat);
  const aligned = F.dot(D) > 0.97;
  c.fire = isEnemy && aligned && dist < 560;
  const keep = b.boss && b.boss.alive ? 150 : 70;
  c.thrust = dist > keep + 90 ? 1 : dist < keep && isEnemy ? -1 : 0;
  c.boost = dist > 280 || type === 'PURSUIT' || type === 'INFILTRATE';
  c.strafe = Math.floor(b.stats.time / 0.7) % 2 ? 1 : -1;
  if (p.hull < p.maxHull * 0.5 && p.dashCd <= 0) c.dash = true;
  if (isEnemy && aligned && p.missileCd <= 0 && dist < 450) c.missile = true;
  const alive = b.enemies.filter((e) => e.alive && !e.isPart).length;
  if (p.nova >= 100 && (alive > 7 || b.boss)) c.nova = true;
  // dodge incoming fire
  const bl = b.fx.bullets;
  for (let i = 0; i < bl.n; i++) {
    if (bl.kind[i] < BK.ENEMY) continue;
    const dx = bl.px[i] - p.pos.x, dy = bl.py[i] - p.pos.y, dz = bl.pz[i] - p.pos.z;
    if (dx * dx + dy * dy + dz * dz < 22 * 22) { if (p.dashCd <= 0) c.dash = true; break; }
  }
}
