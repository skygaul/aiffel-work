import type { UpgradeId } from './tuning';

export interface StageSave { best: number; rank: string; cleared: boolean }
export interface SaveData { v: 1; stages: Record<string, StageSave>; upgrades: Partial<Record<UpgradeId, number>> }
export interface Settings {
  master: number; bgm: number; sfx: number; quality: 'AUTO' | 'LOW' | 'HIGH' | 'ULTRA';
  shake: number; aberration: number; flash: number; warned: boolean;
  keys: Record<string, string>;
}
export const DEFAULT_KEYS: Record<string, string> = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', boost: 'ShiftLeft',
  dash: 'Space', missile: 'KeyE', nova: 'KeyQ',
};
const SAVE_KEY = 'nova.save.v1';
const SET_KEY = 'nova.settings.v1';
const fresh = (): SaveData => ({ v: 1, stages: {}, upgrades: {} });
const freshSettings = (): Settings => ({ master: 0.8, bgm: 0.6, sfx: 0.8, quality: 'AUTO', shake: 1, aberration: 1, flash: 1, warned: false, keys: { ...DEFAULT_KEYS } });

let mem: SaveData = fresh();
let memSet: Settings = freshSettings();

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) { const d = JSON.parse(raw); if (d && d.v === 1) mem = { ...fresh(), ...d }; }
  } catch { /* progress continues in memory (FR-60) */ }
  return mem;
}
let persist = true;
/** Autoplay/soak runs must never touch the player's real progress. */
export function setPersist(v: boolean) { persist = v; }
export function writeSave() { if (!persist) return; try { localStorage.setItem(SAVE_KEY, JSON.stringify(mem)); } catch { /* ignore */ } }
export const save = () => mem;
export function resetSave() { mem = fresh(); writeSave(); }

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SET_KEY);
    if (raw) { const d = JSON.parse(raw); memSet = { ...freshSettings(), ...d, keys: { ...DEFAULT_KEYS, ...(d.keys ?? {}) } }; }
  } catch { /* ignore */ }
  return memSet;
}
export const settings = () => memSet;
export function writeSettings() { try { localStorage.setItem(SET_KEY, JSON.stringify(memSet)); } catch { /* ignore */ } }

/** Records a stage result; only the best score is kept (FR-05). */
export function recordStage(id: string, score: number, rank: string): boolean {
  const prev = mem.stages[id];
  const improved = !prev || score > prev.best;
  mem.stages[id] = { best: improved ? score : prev.best, rank: improved ? rank : prev.rank, cleared: true };
  writeSave();
  return improved;
}
export const isCleared = (id: string) => !!mem.stages[id]?.cleared;
export const bestOf = (id: string) => mem.stages[id]?.best ?? 0;
export const totalScore = () => Object.values(mem.stages).reduce((a, s) => a + s.best, 0);
