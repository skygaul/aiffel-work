import * as THREE from 'three';
import type { Enemy } from '../enemy';

/** Services the battle offers to attack patterns. */
export interface PatternCtx {
  dt: number;
  time: number;
  diff: number;
  target: THREE.Vector3;
  targetVel: THREE.Vector3;
  rand(): number;
  fire(e: Enemy, dir: THREE.Vector3, speed: number, dmgMul?: number): void;
  ring(e: Enemy, count: number, speed: number, offset: number): void;
  spawnChild(e: Enemy): void;
  telegraph(e: Enemy): void;
}

/** Common interface: one file per attack pattern (FR-21). */
export interface Pattern {
  id: string;
  hpMul: number;
  speedMul: number;
  init(e: Enemy): void;
  update(e: Enemy, c: PatternCtx): void;
  /** Returns the damage that actually reaches hull after shields etc. */
  absorb?(e: Enemy, dmg: number): number;
  onDeath?(e: Enemy, c: PatternCtx): void;
}
