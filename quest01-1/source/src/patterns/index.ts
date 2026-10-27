import type { Pattern } from './types';
import type { PatternId } from '../types';
import { Swarm } from './swarm';
import { Rush } from './rush';
import { Snipe } from './snipe';
import { Shield } from './shield';
import { BulletHell } from './bulletHell';
import { Cloak } from './cloak';
import { Regen } from './regen';
import { Split } from './split';

export const PATTERNS: Record<PatternId, Pattern> = {
  SWARM: Swarm, RUSH: Rush, SNIPE: Snipe, SHIELD: Shield,
  BULLET_HELL: BulletHell, CLOAK: Cloak, REGEN: Regen, SPLIT: Split,
};
export type { Pattern, PatternCtx } from './types';
