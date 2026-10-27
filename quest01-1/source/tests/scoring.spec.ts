import { describe, expect, it } from 'vitest';
import { computeStageScore, rankOf, difficulty } from '../src/scoring';
import { GALAXIES, MISSIONS, stageId } from '../src/data';

const perfect = { killRatio: 1, time: 10, parTime: 60, hullFrac: 1, maxCombo: 99, comboTarget: 10, bonusHits: 2 };

describe('scoring', () => {
  it('max input gives exactly 10,000 (FR-30)', () => {
    const s = computeStageScore(perfect);
    expect(s.total).toBe(10000);
    expect(s.rank).toBe('S+');
  });
  it('100 perfect stages sum to 1,000,000 (FR-31)', () => {
    let t = 0;
    for (let i = 0; i < 100; i++) t += computeStageScore(perfect).total;
    expect(t).toBe(1_000_000);
  });
  it('rank boundaries (FR-32)', () => {
    expect(rankOf(10000)).toBe('S+');
    expect(rankOf(9999)).toBe('S');
    expect(rankOf(9000)).toBe('S');
    expect(rankOf(8999)).toBe('A');
    expect(rankOf(7500)).toBe('A');
    expect(rankOf(7499)).toBe('B');
    expect(rankOf(5500)).toBe('B');
    expect(rankOf(5499)).toBe('C');
    expect(rankOf(0)).toBe('C');
  });
  it('minimum clears are never negative or over cap', () => {
    const s = computeStageScore({ killRatio: -1, time: 9999, parTime: 60, hullFrac: -3, maxCombo: 0, comboTarget: 10, bonusHits: 0 });
    expect(s.total).toBe(0);
  });
});

describe('content data', () => {
  it('10 galaxies, 100 unique missions, ids complete (FR-01)', () => {
    expect(GALAXIES.length).toBe(10);
    expect(Object.keys(MISSIONS).length).toBe(100);
    for (let g = 1; g <= 10; g++) for (let m = 1; m <= 10; m++) expect(MISSIONS[stageId(g, m)]).toBeTruthy();
  });
  it('50 races, 5 per galaxy, unique names', () => {
    const names = GALAXIES.flatMap((g) => g.races.map((r) => r.name));
    expect(names.length).toBe(50);
    expect(new Set(names).size).toBe(50);
    for (const g of GALAXIES) expect(new Set(g.races.map((r) => r.pattern)).size).toBe(5);
  });
  it('all 8 mission types and 8 patterns appear', () => {
    const types = new Set(Object.values(MISSIONS).map((m) => m.type));
    expect(types.size).toBe(8);
    const pats = new Set(GALAXIES.flatMap((g) => g.races.map((r) => r.pattern)));
    expect(pats.size).toBe(8);
  });
  it('M05 and M10 are bosses; 3/5 phases; waves 3-5; last wave spectacle', () => {
    for (const m of Object.values(MISSIONS)) {
      const boss = m.index === 5 || m.index === 10;
      expect(m.type === 'BOSS').toBe(boss);
      if (boss) expect(m.boss!.phases).toBe(m.galaxy === 10 && m.index === 10 ? 5 : 3);
      expect(m.waves.length).toBeGreaterThanOrEqual(3);
      expect(m.waves.length).toBeLessThanOrEqual(5);
      expect(m.waves[m.waves.length - 1].spectacle).toBe(true);
      expect(m.bonus.length).toBe(2);
      expect(m.bonus[0]).not.toBe(m.bonus[1]);
    }
  });
  it('difficulty formula and galaxy-level monotonicity (FR-24)', () => {
    let prev = 0;
    for (let g = 1; g <= 10; g++) {
      let sum = 0;
      for (let m = 1; m <= 10; m++) {
        const mis = MISSIONS[stageId(g, m)];
        expect(mis.difficulty).toBeCloseTo(difficulty(g, m, mis.type === 'BOSS'), 5);
        sum += mis.difficulty;
      }
      expect(sum / 10).toBeGreaterThan(prev);
      prev = sum / 10;
    }
  });
});
