export type MissionType = 'ANNIHILATE' | 'SIEGE' | 'ESCORT' | 'ASSAULT' | 'PURSUIT' | 'DEFENSE' | 'INFILTRATE' | 'BOSS';
export type PatternId = 'SWARM' | 'RUSH' | 'SNIPE' | 'SHIELD' | 'BULLET_HELL' | 'CLOAK' | 'REGEN' | 'SPLIT';
export type ShipKind = 'fighter' | 'frigate' | 'carrier';
export type BonusId = 'NO_HIT' | 'COMBO' | 'FAST' | 'MISSILE_KILLS' | 'NOVA' | 'ACCURACY' | 'NO_DASH';

export interface Race { id: string; name: string; pattern: PatternId; color: string }
export interface GalaxyData {
  id: number; name: string; palette: [string, string, string]; starColor: string;
  guardian: string; boss: string; races: Race[]; missions: string[];
}
export interface WaveGroup { kind: ShipKind; race: number; count: number }
export interface WaveData { delay: number; spectacle: boolean; groups: WaveGroup[] }
export interface BossData { name: string; phases: number; parts: number; hp: number; race: number }
export interface MissionData {
  id: string; galaxy: number; index: number; name: string; planetSeed: number;
  type: MissionType; race: number; difficulty: number; parTime: number; comboTarget: number;
  bonus: [BonusId, BonusId]; waves: WaveData[]; boss?: BossData;
}
export interface ScoreInput {
  killRatio: number; time: number; parTime: number; hullFrac: number;
  maxCombo: number; comboTarget: number; bonusHits: number;
}
export interface ScoreBreakdown { kill: number; speed: number; survival: number; combo: number; bonus: number; total: number; rank: string }
