// Generates data/galaxies/galaxy-XX.json and data/waves/GXX-MYY.json (deterministic).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data');
fs.mkdirSync(path.join(root, 'galaxies'), { recursive: true });
fs.mkdirSync(path.join(root, 'waves'), { recursive: true });

const PATTERNS = ['SWARM', 'RUSH', 'SNIPE', 'SHIELD', 'BULLET_HELL', 'CLOAK', 'REGEN', 'SPLIT'];
const NOUN = {
  SWARM: 'Swarm', RUSH: 'Rammers', SNIPE: 'Sharpshooters', SHIELD: 'Bulwarks',
  BULLET_HELL: 'Stormcallers', CLOAK: 'Phantoms', REGEN: 'Weavers', SPLIT: 'Brood',
};
const TYPES = ['ANNIHILATE', 'ASSAULT', 'ESCORT', 'SIEGE', 'PURSUIT', 'DEFENSE', 'INFILTRATE'];
const BONUS = ['NO_HIT', 'COMBO', 'FAST', 'MISSILE_KILLS', 'NOVA', 'ACCURACY', 'NO_DASH'];

const G = [
  { name: 'Aurelia Reach', adj: 'Aurelian', pal: ['#ffc23d', '#ff7a2f', '#3df0ff'], star: '#fff2b0', guardian: 'Gilded Sentinel', boss: 'Sun-Eater Aurex' },
  { name: 'Verdant Maw', adj: 'Verdine', pal: ['#38ff8a', '#0fa36b', '#c8ff4a'], star: '#d6ffd0', guardian: 'Thornwarden', boss: 'Hive-Mother Viridia' },
  { name: 'Crimson Veil', adj: 'Crimsori', pal: ['#ff2f55', '#a3123a', '#ff9a6b'], star: '#ffd0c0', guardian: 'Veilbreaker', boss: 'Blood Regent Sanguine' },
  { name: 'Cobalt Drift', adj: 'Cobaltine', pal: ['#3d7bff', '#1747c9', '#6fe3ff'], star: '#cfe4ff', guardian: 'Driftwall Titan', boss: 'Tidal Colossus Azur' },
  { name: 'Violet Abyss', adj: 'Violari', pal: ['#b04dff', '#5a1bd1', '#ff4de1'], star: '#ecd0ff', guardian: 'Abyss Warden', boss: 'Void Oracle Noctis' },
  { name: 'Emberfall', adj: 'Emberkin', pal: ['#ff8a1f', '#d1380f', '#ffe14d'], star: '#ffe2b0', guardian: 'Cinder Bastion', boss: 'Pyre Tyrant Ignis' },
  { name: 'Glacier Crown', adj: 'Glacian', pal: ['#8fe9ff', '#3aa8d9', '#ffffff'], star: '#e8fbff', guardian: 'Frost Aegis', boss: 'Rime Empress Hiemal' },
  { name: 'Obsidian Choir', adj: 'Obsidari', pal: ['#8a8aa8', '#2b2b4a', '#ff3d8a'], star: '#d8d8ff', guardian: 'Dirge Colossus', boss: 'Maestro Umbral' },
  { name: 'Solar Halo', adj: 'Halonid', pal: ['#fff04d', '#ffa600', '#ff5fa2'], star: '#fffbe0', guardian: 'Halo Lancer', boss: 'Radiant Judge Solis' },
  { name: 'Nova Heart', adj: 'Novaborn', pal: ['#ffffff', '#4dfcff', '#ff4dd8'], star: '#ffffff', guardian: 'Heartgate Prime', boss: 'The Final Star' },
];
const PLANET_A = ['Ar', 'Bel', 'Cor', 'Dra', 'El', 'Fen', 'Gar', 'Hel', 'Ith', 'Jor', 'Kal', 'Lun', 'Mor', 'Nys', 'Or', 'Pyr', 'Quo', 'Rhe', 'Syl', 'Tor'];
const PLANET_B = ['dara', 'vex', 'thos', 'mira', 'gon', 'lis', 'zen', 'kai', 'noa', 'rux'];

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const pad = (n) => String(n).padStart(2, '0');

for (let gi = 0; gi < 10; gi++) {
  const g = gi + 1;
  const gd = G[gi];
  const races = [];
  for (let i = 0; i < 5; i++) {
    const pattern = PATTERNS[(gi + i * 3) % 8];
    const hue = pad(i);
    races.push({
      id: `R${pad(g)}${hue}`,
      name: `${gd.adj} ${NOUN[pattern]}`,
      pattern,
      color: gd.pal[i % 3] === gd.pal[(i + 1) % 3] ? gd.pal[0] : tint(gd.pal[i % 3], i),
    });
  }
  const missions = [];
  let slot = 0;
  for (let m = 1; m <= 10; m++) {
    const id = `G${pad(g)}-M${pad(m)}`;
    const r = rng(g * 1000 + m * 17);
    const boss = m === 5 || m === 10;
    const type = boss ? 'BOSS' : TYPES[(slot++ + gi) % 7];
    const race = m === 10 ? 4 : m === 5 ? gi % 5 : (m - 1) % 5;
    const diff = round2(1 + (g - 1) * 0.35 + (m - 1) * 0.03 + (boss ? 0.2 : 0));
    const waveCount = m <= 3 ? 3 : m <= 7 ? 4 : 5;
    const baseCount = 4 + Math.floor(m * 0.6) + Math.floor(g * 0.5);
    const waves = [];
    for (let w = 0; w < waveCount; w++) {
      const last = w === waveCount - 1;
      const n = Math.max(2, Math.round(baseCount * (0.8 + w * 0.2) * (boss ? 0.5 : 1)));
      const groups = [{ kind: 'fighter', race, count: last ? n * 2 : n }];
      if (m >= 3 && w >= 1) groups.push({ kind: 'frigate', race: (race + 1) % 5, count: last ? 2 + Math.floor(g / 4) : 1 + Math.floor(g / 6) });
      if (m >= 6 && last) groups.push({ kind: 'carrier', race: (race + 2) % 5, count: 1 });
      waves.push({ delay: w === 0 ? 0 : 1.2, spectacle: last, groups });
    }
    const total = waves.reduce((a, w) => a + w.groups.reduce((b, x) => b + x.count, 0), 0);
    const b1 = BONUS[(g + m) % 7];
    const b2 = BONUS[(g * 3 + m * 2 + 1) % 7] === b1 ? BONUS[(g + m + 3) % 7] : BONUS[(g * 3 + m * 2 + 1) % 7];
    const mission = {
      id,
      galaxy: g,
      index: m,
      name: `${PLANET_A[(g * 2 + m * 3) % 20]}${PLANET_B[(g + m) % 10]}`,
      planetSeed: g * 100 + m,
      type,
      race,
      difficulty: diff,
      parTime: Math.round((boss ? 90 : 45) + total * 1.2 + (type === 'PURSUIT' ? 15 : 0)),
      comboTarget: Math.min(60, Math.round(8 + total * 0.35)),
      bonus: [b1, b2],
      waves,
    };
    if (boss) {
      mission.boss = {
        name: m === 5 ? gd.guardian : gd.boss,
        phases: m === 10 && g === 10 ? 5 : 3,
        parts: m === 10 ? 6 : 4,
        hp: m === 10 ? (g === 10 ? 6000 : 4000) : 2500,
        race,
      };
    }
    missions.push(mission);
    fs.writeFileSync(path.join(root, 'waves', `${id}.json`), JSON.stringify(mission, null, 1));
  }
  fs.writeFileSync(
    path.join(root, 'galaxies', `galaxy-${pad(g)}.json`),
    JSON.stringify({ id: g, name: gd.name, palette: gd.pal, starColor: gd.star, guardian: gd.guardian, boss: gd.boss, races, missions: missions.map((x) => x.id) }, null, 1),
  );
}

function round2(x) { return Math.round(x * 100) / 100; }
function tint(hex, i) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const k = 1 - i * 0.08;
  r = Math.min(255, Math.round(r * k)); g = Math.min(255, Math.round(g * k)); b = Math.min(255, Math.round(b * k));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
console.log('generated 10 galaxies, 100 missions');
