// All gameplay numbers live here (NFR-07).
export const SCORE = { kill: 4000, speed: 2000, survival: 1500, combo: 1500, bonus: 1000, stage: 10000 } as const;
export const RANKS = [
  { rank: 'S+', min: 10000 },
  { rank: 'S', min: 9000 },
  { rank: 'A', min: 7500 },
  { rank: 'B', min: 5500 },
  { rank: 'C', min: 0 },
] as const;

export const PLAYER = {
  hull: 130, shield: 120, shieldRegenDelay: 2.5, shieldRegen: 28,
  cruise: 45, thrust: 70, brake: 22, boost: 125, strafe: 38,
  yawRate: 2.1, pitchRate: 1.7, radius: 3,
  laserRate: 12, laserSpeed: 420, laserDamage: 9, laserLife: 1.4,
  missileCooldown: 2.2, missileSpeed: 190, missileDamage: 70, missileSplash: 22, missileTurn: 3.2,
  dashCooldown: 1.6, dashInvuln: 0.25, dashImpulse: 150,
  arena: 650, aimAssistCos: 0.985,
};
export const ENEMY = {
  fighter: { hp: 30, radius: 3.2, speed: 62, score: 1 },
  frigate: { hp: 130, radius: 7, speed: 34, score: 3 },
  carrier: { hp: 320, radius: 13, speed: 20, score: 6 },
  ramDamage: 9, maxChargers: 3,
  bulletDamage: 4.5, bulletSpeed: 150, objectiveHp: 1600, objectiveDamageMul: 0.18, objectiveRepairDelay: 3, objectiveRepair: 0.025, objectiveRam: 7,
};
export const COMBO = { window: 2.0, novaPerKill: 4, novaPerComboStep: 0.6 };
export const FEEL = { hitStop: 0.04, shake: 1 };
export const WAVE = { deadTime: 2.2, stallBreak: 28 };
export const MAX_BULLETS = 3000;
export const QUALITY = {
  LOW: { particles: 8000, pixelRatio: 1, bloom: false, bloomStrength: 0 },
  HIGH: { particles: 20000, pixelRatio: 1.25, bloom: true, bloomStrength: 0.5 },
  ULTRA: { particles: 50000, pixelRatio: 2, bloom: true, bloomStrength: 0.7 },
} as const;
export type QualityName = keyof typeof QUALITY;

export const hpScale = (diff: number) => 1 + (diff - 1) * 0.5;
export const dmgScale = (diff: number) => 1 + (diff - 1) * 0.25;
export const countScale = (diff: number) => Math.pow(diff, 0.55);

export const UPGRADES = {
  FIRE: { name: '연사 강화', desc: '주포 연사 속도 +18%', max: 5 },
  MISSILE: { name: '유도탄 강화', desc: '미사일 +1발 · 쿨다운 단축', max: 4 },
  SHIELD: { name: '실드 증폭', desc: '실드 +25 · 재생 +20%', max: 5 },
  DASH: { name: '위상 대시', desc: '대시 쿨다운 -18%', max: 4 },
  WINGMAN: { name: '윙맨 호출', desc: '자동 사격 윙맨 +1기', max: 3 },
} as const;
export type UpgradeId = keyof typeof UPGRADES;
