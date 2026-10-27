import { RANKS, SCORE } from './tuning';
import type { ScoreBreakdown, ScoreInput } from './types';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** FR-30: 4000 + 2000 + 1500 + 1500 + 1000 = 10000 */
export function computeStageScore(i: ScoreInput): ScoreBreakdown {
  const kill = Math.round(SCORE.kill * clamp01(i.killRatio));
  const over = Math.max(0, i.time - i.parTime);
  const speed = Math.round(SCORE.speed * clamp01(1 - over / (i.parTime * 2)));
  const survival = Math.round(SCORE.survival * clamp01(i.hullFrac));
  const combo = Math.round(SCORE.combo * clamp01(i.maxCombo / Math.max(1, i.comboTarget)));
  const bonus = Math.round((SCORE.bonus / 2) * Math.max(0, Math.min(2, i.bonusHits)));
  const total = kill + speed + survival + combo + bonus;
  return { kill, speed, survival, combo, bonus, total, rank: rankOf(total) };
}

/** FR-32 */
export function rankOf(score: number): string {
  for (const r of RANKS) if (score >= r.min) return r.rank;
  return 'C';
}

/** FR-24 */
export function difficulty(g: number, m: number, boss: boolean): number {
  return Math.round((1 + (g - 1) * 0.35 + (m - 1) * 0.03 + (boss ? 0.2 : 0)) * 100) / 100;
}
