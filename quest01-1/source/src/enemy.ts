import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PatternId, ShipKind } from './types';

export class Enemy {
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  quat = new THREE.Quaternion();
  hp = 1; maxHp = 1; radius = 3; scale = 1;
  kind: ShipKind = 'fighter';
  raceIdx = 0;
  pattern: PatternId = 'SWARM';
  mesh!: THREE.Object3D;
  t = 0; cd = 0; lastHit = 99;
  st: Record<string, number> = {};
  alive = true;
  wave = 0;
  countsKill = true;
  aim: 'player' | 'obj' = 'player';
  speedMul = 1;
  shield = 0; maxShield = 0;
  cloak = 0; invuln = false;
  parent: Enemy | null = null;
  local = new THREE.Vector3();
  isBoss = false; isPart = false; isTarget = false; isFortress = false;
  noSplit = false;
  color = new THREE.Color();
  killedByMissile = false;
  phase = 0;
  dmgMul = 1;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
function fighterGeo() {
  const body = new THREE.ConeGeometry(1.1, 5, 6); body.rotateX(Math.PI / 2);
  const wl = new THREE.BoxGeometry(3.4, 0.2, 1.8); wl.translate(0, 0, -0.8);
  const fin = new THREE.BoxGeometry(0.2, 1.2, 1.4); fin.translate(0, 0.7, -1.6);
  return mergeGeometries([body, wl, fin])!;
}
function frigateGeo() {
  const hull = new THREE.BoxGeometry(3.2, 2.2, 12); const bridge = new THREE.BoxGeometry(2, 1.6, 3); bridge.translate(0, 1.8, -2);
  const e1 = new THREE.CylinderGeometry(0.8, 1, 3, 6); e1.rotateX(Math.PI / 2); e1.translate(1.6, 0, -6.5);
  const e2 = e1.clone(); e2.translate(-3.2, 0, 0);
  const nose = new THREE.ConeGeometry(1.6, 4, 4); nose.rotateX(Math.PI / 2); nose.translate(0, 0, 8);
  return mergeGeometries([hull, bridge, e1, e2, nose])!;
}
function carrierGeo() {
  const deck = new THREE.BoxGeometry(14, 2.4, 26); const tower = new THREE.BoxGeometry(3, 5, 6); tower.translate(4, 3.5, -5);
  const b1 = new THREE.BoxGeometry(3, 1.6, 12); b1.translate(8.5, -1, 2); const b2 = b1.clone(); b2.translate(-17, 0, 0);
  const nose = new THREE.ConeGeometry(5, 8, 6); nose.rotateX(Math.PI / 2); nose.translate(0, 0, 17);
  return mergeGeometries([deck, tower, b1, b2, nose])!;
}
export function shipGeo(kind: ShipKind) {
  let g = geoCache.get(kind);
  if (!g) { g = kind === 'fighter' ? fighterGeo() : kind === 'frigate' ? frigateGeo() : carrierGeo(); geoCache.set(kind, g); }
  return g;
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();
export function shipMat(color: THREE.Color, own = false) {
  const key = color.getHexString();
  let m = matCache.get(key);
  if (!m || own) {
    m = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x1a1c26).lerp(color, 0.25), emissive: color, emissiveIntensity: 1.6, metalness: 0.7, roughness: 0.35, flatShading: true });
    if (own) { m.transparent = true; return m; }
    matCache.set(key, m);
  }
  return m;
}

export function makeShipMesh(kind: ShipKind, color: THREE.Color, ownMaterial = false): THREE.Mesh {
  return new THREE.Mesh(shipGeo(kind), shipMat(color, ownMaterial));
}

/** Player ship: white hull + cyan emissive trims. */
export function makePlayerShip(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.ConeGeometry(1.3, 7, 8); body.rotateX(Math.PI / 2); body.translate(0, 0, 1);
  const wings = new THREE.BoxGeometry(7.5, 0.25, 3); wings.translate(0, -0.2, -1.5);
  const tail = new THREE.BoxGeometry(0.25, 1.8, 2); tail.translate(0, 1, -2.5);
  g.add(new THREE.Mesh(mergeGeometries([body, wings, tail])!, new THREE.MeshStandardMaterial({ color: 0xe8f4ff, metalness: 0.8, roughness: 0.25, flatShading: true, emissive: 0x2a5a7a, emissiveIntensity: 0.6 })));
  const t1 = new THREE.BoxGeometry(0.3, 0.3, 5); t1.translate(3.6, -0.1, -1.5); const t2 = t1.clone(); t2.translate(-7.2, 0, 0);
  const cock = new THREE.SphereGeometry(0.7, 8, 6); cock.translate(0, 0.7, 0.8);
  g.add(new THREE.Mesh(mergeGeometries([t1, t2, cock])!, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.15, 1.1, 1.6), toneMapped: false })));
  const eng = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.2, 2.0), toneMapped: false }));
  eng.position.set(0, 0, -3.4); eng.scale.set(0.8, 0.8, 1.6);
  g.add(eng);
  return g;
}
