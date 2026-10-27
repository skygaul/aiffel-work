import type { GalaxyData, MissionData } from './types';
import { isCleared } from './save';

const gx = import.meta.glob('./data/galaxies/*.json', { eager: true, import: 'default' }) as Record<string, GalaxyData>;
const ms = import.meta.glob('./data/waves/*.json', { eager: true, import: 'default' }) as Record<string, MissionData>;

export const GALAXIES: GalaxyData[] = Object.keys(gx).sort().map((k) => gx[k]);
export const MISSIONS: Record<string, MissionData> = {};
for (const k of Object.keys(ms)) MISSIONS[ms[k].id] = ms[k];

export const stageId = (g: number, m: number) => `G${String(g).padStart(2, '0')}-M${String(m).padStart(2, '0')}`;
export const getMission = (id: string) => MISSIONS[id];
export const galaxyMissions = (g: number) => GALAXIES[g - 1].missions.map((id) => MISSIONS[id]);

/** FR-02 / FR-03 */
export function isMissionUnlocked(g: number, m: number): boolean {
  if (m <= 3) return true;
  if (m === 10) {
    let c = 0;
    for (let i = 1; i <= 9; i++) if (isCleared(stageId(g, i))) c++;
    return c >= 9;
  }
  return isCleared(stageId(g, m - 1));
}
/** FR-04 */
export const isGalaxyUnlocked = (g: number) => g === 1 || isCleared(stageId(g - 1, 10));
