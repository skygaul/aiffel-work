import { Gfx } from './render';
import { Input, newControls } from './input';
import { Hud, OBJECTIVES } from './hud';
import { Battle, type BattleResult } from './battle';
import { GalaxyMap, SolarHub } from './worlds';
import { GALAXIES, MISSIONS, galaxyMissions, getMission, isGalaxyUnlocked, isMissionUnlocked, stageId } from './data';
import { bestOf, isCleared, loadSave, loadSettings, recordStage, resetSave, save, setPersist, settings, totalScore, writeSave, writeSettings, DEFAULT_KEYS } from './save';
import { audio } from './audio';
import { QUALITY, UPGRADES, type QualityName, type UpgradeId } from './tuning';
import { botControls } from './bot';
import type { MissionData } from './types';

const params = new URLSearchParams(location.search);
const DEBUG = params.get('debug') === '1';
const AUTO = params.get('autoplay') === '1';
const SPEED = Math.max(1, Math.min(20, Number(params.get('speed') || 1)));
const STAGE = params.get('stage');

loadSettings();
if (AUTO) { setPersist(false); } else loadSave();
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const ui = $('ui'), flashEl = $('flash'), dbg = $('debug');
const gfx = new Gfx($<HTMLCanvasElement>('gl'));
const input = new Input(document.body);
const hud = new Hud($('hud'), $<HTMLCanvasElement>('hud2d'));
const galaxyMap = new GalaxyMap();
const hub = new SolarHub();
let battle: Battle | null = null;
let mode: 'title' | 'map' | 'hub' | 'briefing' | 'battle' = 'title';
let paused = false;
let curGalaxy = 1;
let keyHandler: ((e: KeyboardEvent) => void) | null = null;
const controls = newControls();

function applyQuality() {
  const s = settings();
  const q: QualityName = s.quality === 'AUTO' ? gfx.autoQuality() : s.quality;
  gfx.setQuality(q);
  gfx.dynamicScale = true;
  resizeAll();
}
function resizeAll() {
  const a = window.innerWidth / window.innerHeight;
  for (const c of [galaxyMap.camera, hub.camera]) { c.aspect = a; c.updateProjectionMatrix(); }
  battle?.setAspect(a);
}
window.addEventListener('resize', resizeAll);
window.addEventListener('keydown', (e) => keyHandler?.(e));
document.addEventListener('pointerdown', () => audio.init(), { once: false });
applyQuality();
gfx.use(galaxyMap.scene, galaxyMap.camera);
galaxyMap.overview();
(gfx.renderer as any).compileAsync?.(galaxyMap.scene, galaxyMap.camera);

const clear = () => { ui.innerHTML = ''; keyHandler = null; };
const el = (html: string, cls = 'screen fade') => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; ui.appendChild(d); return d; };
const click = (root: HTMLElement, sel: string, f: (e: Event) => void) => root.querySelectorAll(sel).forEach((n) => n.addEventListener('click', (e) => { audio.ui(); f(e); }));
const fmtN = (n: number) => n.toLocaleString('en-US');

// ------------------------------------------------------------------ screens
function showWarning() {
  clear(); mode = 'title';
  const s = settings();
  const d = el(`<div class="panel warnbox"><h2>⚠ PHOTOSENSITIVITY WARNING / 광과민성 경고</h2>
    <p>이 게임에는 강한 섬광, 화면 흔들림, 빠르게 깜박이는 빛이 포함되어 있습니다.<br>광과민성 발작의 위험이 있는 분은 아래에서 강도를 낮추거나 끄고 시작하세요.</p>
    <div style="text-align:left;margin:14px 0">${slider('shake', '화면 셰이크', s.shake)}${slider('aberration', '색수차', s.aberration)}${slider('flash', '플래시', s.flash)}</div>
    <button class="btn primary" id="ok">계속 / CONTINUE</button></div>`);
  bindSliders(d);
  click(d, '#ok', () => { settings().warned = true; writeSettings(); showTitle(); });
}
function slider(key: string, label: string, v: number) {
  return `<label><span>${label}</span><input type="range" min="0" max="1" step="0.05" data-k="${key}" value="${v}"><span>${Math.round(v * 100)}</span></label>`;
}
function bindSliders(root: HTMLElement) {
  root.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((i) => i.addEventListener('input', () => {
    (settings() as any)[i.dataset.k!] = Number(i.value);
    (i.nextElementSibling as HTMLElement).textContent = String(Math.round(Number(i.value) * 100));
    writeSettings(); audio.applyVolumes();
  }));
}

function showTitle() {
  clear(); mode = 'title';
  gfx.use(galaxyMap.scene, galaxyMap.camera); galaxyMap.overview();
  const d = el(`<h1 class="logo">NOVA ARMADA</h1><div class="sub">100 STARS CONQUEST</div>
    <div class="menu"><button class="btn primary" id="start">START</button><button class="btn" id="settings">SETTINGS</button><button class="btn" id="reset">RESET SAVE</button></div>
    <div class="hint">TOTAL ${fmtN(totalScore())} / 1,000,000 · WASD 이동 · 마우스 조준 · 좌클릭 레이저 · E 미사일 · Q 노바 버스트 · Space 대시 · Shift 부스트</div>`);
  click(d, '#start', () => openMap());
  click(d, '#settings', () => showSettings(showTitle));
  click(d, '#reset', () => { if (confirm('저장 데이터를 모두 삭제할까요?')) { resetSave(); showTitle(); } });
  keyHandler = (e) => { if (e.code === 'Enter') openMap(); };
  audio.startBgm(1);
}

const lbl: { x: number; y: number; ok: boolean } = { x: 0, y: 0, ok: false };
function galaxyScore(g: number) { let s = 0; for (let m = 1; m <= 10; m++) s += bestOf(stageId(g, m)); return s; }

function openMap(sel = curGalaxy - 1) {
  clear(); mode = 'map';
  gfx.use(galaxyMap.scene, galaxyMap.camera);
  galaxyMap.select(sel);
  curGalaxy = sel + 1;
  const labels = GALAXIES.map((g, i) => {
    const un = isGalaxyUnlocked(g.id);
    return `<div class="glabel ${un ? '' : 'locked'} ${i === sel ? 'sel' : ''}" data-i="${i}" style="--col:${g.palette[0]};--p:${(galaxyScore(g.id) / 100000) * 100}%"><div class="ring"><span>${g.id}</span></div>${g.name}${un ? '' : ' 🔒'}</div>`;
  }).join('');
  const d = el(`<div class="topbar"><h2>GALAXY MAP</h2><div class="total">TOTAL <b>${fmtN(totalScore())}</b> / 1,000,000</div><button class="btn sm" id="back">TITLE</button></div>${labels}
    <div class="panel sidecard" id="card"></div>`, 'screen fade');
  const card = d.querySelector('#card') as HTMLElement;
  const fill = (i: number) => {
    const g = GALAXIES[i], un = isGalaxyUnlocked(g.id);
    let cleared = 0; for (let m = 1; m <= 10; m++) if (isCleared(stageId(g.id, m))) cleared++;
    card.innerHTML = `<h3 style="color:${g.palette[0]}">G${String(g.id).padStart(2, '0')} · ${g.name.toUpperCase()}</h3>
      <div class="muted">Guardian: ${g.guardian}<br>Boss: ${g.boss}</div>
      <p>누적 점수 <b style="color:#ffd24a">${fmtN(galaxyScore(g.id))}</b> / 100,000<br>클리어 ${cleared}/10</p>
      <div class="muted">${g.races.map((r) => `${r.name} (${r.pattern})`).join('<br>')}</div><br>
      <button class="btn primary" id="enter" ${un ? '' : 'disabled'}>${un ? 'ENTER SYSTEM' : '🔒 이전 은하 보스를 격파하라'}</button>`;
    card.querySelector('#enter')!.addEventListener('click', () => { audio.ui(); openHub(g.id); });
  };
  fill(sel);
  d.querySelectorAll<HTMLElement>('.glabel').forEach((n) => n.addEventListener('click', () => {
    audio.ui();
    const i = Number(n.dataset.i); curGalaxy = i + 1; galaxyMap.select(i);
    d.querySelectorAll('.glabel').forEach((x) => x.classList.remove('sel')); n.classList.add('sel'); fill(i);
  }));
  click(d, '#back', () => showTitle());
  keyHandler = (e) => { if (e.code === 'Enter' && isGalaxyUnlocked(curGalaxy)) openHub(curGalaxy); if (e.code === 'Escape') showTitle(); };
}

function openHub(g: number) {
  clear(); mode = 'hub'; curGalaxy = g;
  const ms = galaxyMissions(g);
  hub.build(g - 1, ms.map((m) => m.planetSeed));
  hub.selected = -1;
  resizeAll();
  gfx.use(hub.scene, hub.camera);
  audio.startBgm(g);
  const gd = GALAXIES[g - 1];
  const nodes = ms.map((m, i) => {
    const un = isMissionUnlocked(g, m.index);
    return `<div class="nodelabel ${un ? '' : 'locked'} ${isCleared(m.id) ? 'cleared' : ''} ${m.type === 'BOSS' ? 'boss' : ''}" data-i="${i}">${m.index === 5 ? '★ ' : m.index === 10 ? '☠ ' : ''}${m.name}<br><span class="muted">${m.id}${isCleared(m.id) ? ' · ' + save().stages[m.id].rank : un ? '' : ' 🔒'}</span></div>`;
  }).join('');
  const rows = ms.map((m, i) => {
    const un = isMissionUnlocked(g, m.index);
    return `<div class="mrow ${un ? '' : 'locked'}" data-i="${i}"><span>${m.index}. ${m.name} <span class="muted">${m.type}</span></span><span>${isCleared(m.id) ? fmtN(bestOf(m.id)) : ''} <span class="rank">${isCleared(m.id) ? save().stages[m.id].rank : un ? '' : '🔒'}</span></span></div>`;
  }).join('');
  const d = el(`<div class="topbar"><h2 style="color:${gd.palette[0]}">G${String(g).padStart(2, '0')} · ${gd.name.toUpperCase()}</h2><div class="total">GALAXY <b>${fmtN(galaxyScore(g))}</b> / 100,000</div><button class="btn sm" id="back">GALAXY MAP</button></div>${nodes}
    <div class="panel sidecard"><h3>MISSIONS</h3><div class="muted">M10은 M01~M09 중 9개 클리어 후 해금</div>${rows}</div>`);
  const open = (i: number) => { const m = ms[i]; if (isMissionUnlocked(g, m.index)) showBriefing(m); };
  d.querySelectorAll<HTMLElement>('.nodelabel, .mrow').forEach((n) => {
    n.addEventListener('click', () => { audio.ui(); open(Number(n.dataset.i)); });
    n.addEventListener('mouseenter', () => hub.select(Number(n.dataset.i)));
    n.addEventListener('mouseleave', () => hub.select(-1));
  });
  click(d, '#back', () => openMap(g - 1));
  keyHandler = (e) => { if (e.code === 'Escape') openMap(g - 1); };
}

const BONUS_TEXT: Record<string, string> = {
  NO_HIT: '피격 0회로 클리어', COMBO: '콤보 목표의 130% 달성', FAST: 'Par 타임의 80% 이내 클리어', MISSILE_KILLS: '미사일로 5기 이상 격추',
  NOVA: 'Nova Burst 1회 이상 사용', ACCURACY: '주포 명중률 45% 이상', NO_DASH: '대시 없이 클리어',
};
function showBriefing(m: MissionData) {
  clear(); mode = 'briefing';
  const gd = GALAXIES[m.galaxy - 1], race = gd.races[m.race];
  const d = el(`<div class="panel briefing"><div class="tag">${m.id} · ${m.type}${m.boss ? ' · ' + m.boss.name : ''}</div><h2>${m.name.toUpperCase()}</h2>
    <p>${OBJECTIVES[m.type]}. 적: <b style="color:${race.color}">${race.name}</b> (${race.pattern}) · 난이도 ${m.difficulty.toFixed(2)} · PAR ${m.parTime}s</p>
    <div class="muted">BONUS GOALS</div>${m.bonus.map((b) => `<div class="goal">${BONUS_TEXT[b]}</div>`).join('')}
    <div class="prog"><i id="p"></i></div><div class="muted" style="margin-top:6px">클릭 / 아무 키: 스킵</div></div>`);
  let done = false;
  const go = () => { if (done) return; done = true; startBattle(m); };
  const t0 = performance.now(); const bar = d.querySelector('#p') as HTMLElement;
  const tick = () => { if (done || mode !== 'briefing') return; const k = (performance.now() - t0) / 2000; bar.style.width = Math.min(100, k * 100) + '%'; if (k >= 1) go(); else requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  d.addEventListener('click', go);
  keyHandler = go;
  prepareBattle(m);
}

let pending: Battle | null = null;
function prepareBattle(m: MissionData) {
  const q = QUALITY[gfx.quality];
  pending = new Battle(m, save().upgrades, q.particles);
  pending.setAspect(window.innerWidth / window.innerHeight);
  (gfx.renderer as any).compileAsync?.(pending.scene, pending.camera);
}

function startBattle(m: MissionData) {
  if (!pending || pending.mission.id !== m.id) prepareBattle(m);
  battle = pending; pending = null;
  clear(); mode = 'battle'; paused = false;
  battle!.autoplay = AUTO;
  battle!.onEnd = (r) => endBattle(m, r);
  gfx.use(battle!.scene, battle!.camera);
  hud.show(true); input.enabled = !AUTO;
  audio.init(); audio.startBgm(m.galaxy, !!m.boss);
  resizeAll();
}

function showPause() {
  paused = true; input.enabled = false;
  const d = el(`<div class="panel menu"><h2 style="margin:0;text-align:center;letter-spacing:.3em">PAUSED</h2>
    <button class="btn primary" id="resume">RESUME</button><button class="btn" id="restart">RESTART</button><button class="btn" id="hubb">SOLAR HUB</button><button class="btn" id="set">SETTINGS</button></div>`);
  const resume = () => { clear(); paused = false; input.enabled = true; };
  click(d, '#resume', resume);
  click(d, '#restart', () => { const m = battle!.mission; abortBattle(); startBattle(m); });
  click(d, '#hubb', () => { const g = battle!.mission.galaxy; abortBattle(); openHub(g); });
  click(d, '#set', () => showSettings(() => { clear(); showPause(); }));
  keyHandler = (e) => { if (e.code === 'Escape') resume(); };
}
function abortBattle() {
  battle?.dispose(); battle = null; hud.show(false); input.enabled = false; paused = false; clear();
}

// ------------------------------------------------------------------ battle end / result
const autoLog: any[] = [];
(window as any).__autoplay = { results: autoLog, done: false };
let autoRetries = 0;

function endBattle(m: MissionData, r: BattleResult) {
  const firstClear = !isCleared(m.id);
  battle?.dispose(); battle = null; hud.show(false); input.enabled = false;
  let improved = false;
  if (r.victory && r.score) improved = recordStage(m.id, r.score.total, r.score.rank);
  if (AUTO) { autoNext(m, r); return; }
  showResult(m, r, improved, firstClear);
}

function showResult(m: MissionData, r: BattleResult, improved: boolean, firstClear: boolean) {
  clear(); mode = 'hub';
  gfx.use(hub.scene, hub.camera);
  const sc = r.score;
  const hasNext = r.victory && m.index < 10;
  const rows = sc
    ? [['섬멸', sc.kill, 4000], ['속도', sc.speed, 2000], ['생존', sc.survival, 1500], ['콤보', sc.combo, 1500], ['보너스', sc.bonus, 1000]]
    : [];
  const d = el(`<div class="panel result"><h2 style="color:${r.victory ? '#4df0ff' : '#ff5470'}">${r.victory ? 'MISSION COMPLETE' : 'MISSION FAILED'}</h2>
    ${r.victory ? '' : `<p>${r.reason ?? ''}</p>`}
    ${rows.map((x, i) => `<div class="row" data-v="${x[1]}"><span>${x[0]} <span class="muted">/ ${fmtN(x[2] as number)}</span></span><b id="r${i}">0</b></div>`).join('')}
    ${sc ? `<div class="total" id="tot">0</div><div class="muted">${improved ? '★ NEW BEST' : `BEST ${fmtN(bestOf(m.id))}`}</div>
      <div class="muted" style="margin-top:8px">${m.bonus.map((b, i) => `${r.bonusDone[i] ? '✔' : '✘'} ${BONUS_TEXT[b]}`).join('<br>')}</div><div class="stamp" id="stamp">${sc.rank}</div>` : ''}
    <div class="actions"><button class="btn primary" id="retry">RETRY [R]</button>
      ${hasNext ? '<button class="btn" id="next">NEXT [Enter]</button>' : ''}<button class="btn" id="hubb">${r.victory && m.index === 10 ? 'CONTINUE [Enter]' : 'SOLAR HUB'}</button></div></div>`);
  // count-up (<= 3s total, skippable)
  let skipped = false;
  const finish = () => {
    skipped = true;
    if (!sc) return;
    rows.forEach((x, i) => (d.querySelector('#r' + i)!.textContent = fmtN(x[1] as number)));
    d.querySelector('#tot')!.textContent = fmtN(sc.total);
    d.querySelector('#stamp')!.classList.add('go');
  };
  if (sc) {
    const t0 = performance.now(); const per = 400;
    const step = () => {
      if (skipped) return;
      const t = performance.now() - t0;
      rows.forEach((x, i) => {
        const k = Math.max(0, Math.min(1, (t - i * per) / per));
        d.querySelector('#r' + i)!.textContent = fmtN(Math.round((x[1] as number) * k));
      });
      const tk = Math.max(0, Math.min(1, (t - 5 * per) / 300));
      d.querySelector('#tot')!.textContent = fmtN(Math.round(sc.total * tk));
      if (Math.floor(t / 60) % 2 === 0) audio.tick();
      if (t >= 5 * per + 300) { d.querySelector('#stamp')!.classList.add('go'); audio.stamp(); skipped = true; return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  d.addEventListener('click', (e) => { if (!skipped && !(e.target as HTMLElement).closest('button')) finish(); });
  const toHub = () => {
    if (r.victory && m.index === 10 && firstClear) afterGalaxyBoss(m.galaxy);
    else openHub(m.galaxy);
  };
  const retry = () => { prepareBattle(m); startBattle(m); };
  click(d, '#retry', retry);
  click(d, '#next', () => showBriefing(getMission(stageId(m.galaxy, m.index + 1))));
  click(d, '#hubb', toHub);
  keyHandler = (e) => {
    if (e.code === 'KeyR') retry();
    else if (e.code === 'Enter') { if (!skipped) finish(); else if (hasNext) showBriefing(getMission(stageId(m.galaxy, m.index + 1))); else toHub(); }
    else if (e.code === 'Space' && !skipped) finish();
  };
}

function afterGalaxyBoss(g: number) {
  const ids = (Object.keys(UPGRADES) as UpgradeId[]).filter((k) => (save().upgrades[k] ?? 0) < UPGRADES[k].max);
  const opts = ids.sort(() => Math.random() - 0.5).slice(0, 3);
  if (!opts.length) return afterUpgrade(g);
  clear();
  const d = el(`<h2 style="letter-spacing:.3em;margin:0 0 22px">GALAXY CLEARED — UPGRADE 선택</h2><div class="cards">${opts.map((k) => `<div class="card" data-k="${k}"><h3>${UPGRADES[k].name}</h3><div class="muted">${UPGRADES[k].desc}</div><div class="lv">LV ${(save().upgrades[k] ?? 0)} → ${(save().upgrades[k] ?? 0) + 1}</div></div>`).join('')}</div>`);
  d.querySelectorAll<HTMLElement>('.card').forEach((c) => c.addEventListener('click', () => {
    const k = c.dataset.k as UpgradeId; save().upgrades[k] = (save().upgrades[k] ?? 0) + 1; writeSave(); audio.ui(); afterUpgrade(g);
  }));
}
function afterUpgrade(g: number) {
  if (g >= 10) { showEnding(); return; }
  clear();
  warp(`ENTERING ${GALAXIES[g].name.toUpperCase()}`, () => { openMap(g); }, 1800);
}
function showEnding() {
  clear();
  const d = el(`<h1 class="logo">ALL STARS CONQUERED</h1><div class="sub">FINAL SCORE ${fmtN(totalScore())} / 1,000,000</div><button class="btn primary" id="ok">GALAXY MAP</button>`);
  click(d, '#ok', () => openMap(9));
}

/** FR-04: hyperwarp transition (also hides loading). */
function warp(text: string, mid: () => void, ms = 1800) {
  const c = document.createElement('canvas'); c.id = 'warpcanvas'; document.body.appendChild(c);
  c.width = window.innerWidth; c.height = window.innerHeight;
  const g = c.getContext('2d')!;
  const N = 260; const st = Array.from({ length: N }, () => ({ a: Math.random() * 6.283, r: Math.random(), z: Math.random() }));
  const t0 = performance.now(); let called = false;
  audio.warp();
  const f = () => {
    const t = (performance.now() - t0) / ms;
    if (t >= 1) { c.remove(); return; }
    if (t > 0.5 && !called) { called = true; mid(); }
    const k = t < 0.5 ? t * 2 : (1 - t) * 2;
    g.fillStyle = `rgba(2,3,10,${0.25 + 0.4 * k})`; g.fillRect(0, 0, c.width, c.height);
    const cx = c.width / 2, cy = c.height / 2, L = Math.hypot(cx, cy);
    g.lineWidth = 1.6;
    for (const s of st) {
      s.z -= 0.006 + k * 0.05; if (s.z <= 0.02) { s.z = 1; s.a = Math.random() * 6.283; }
      const r0 = (s.r * 0.6 + 0.05) * L * (1 - s.z) * (1 + k * 3), r1 = r0 + k * 160 * (1 - s.z) + 4;
      g.strokeStyle = `hsla(${190 + s.r * 120},100%,${70 + k * 25}%,${0.3 + k * 0.7})`;
      g.beginPath(); g.moveTo(cx + Math.cos(s.a) * r0, cy + Math.sin(s.a) * r0); g.lineTo(cx + Math.cos(s.a) * r1, cy + Math.sin(s.a) * r1); g.stroke();
    }
    g.fillStyle = `rgba(255,255,255,${k * 0.8})`; g.font = '28px sans-serif'; g.textAlign = 'center'; g.fillText(text, cx, cy);
    requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
}

function showSettings(back: () => void) {
  clear();
  const s = settings();
  const keyNames: Record<string, string> = { forward: '전진', back: '후진', left: '좌 이동', right: '우 이동', boost: '부스트', dash: '대시', missile: '미사일', nova: 'Nova Burst' };
  const d = el(`<div class="panel settings"><h2 style="margin-top:0;letter-spacing:.3em">SETTINGS</h2>
    ${slider('master', '마스터 볼륨', s.master)}${slider('bgm', 'BGM', s.bgm)}${slider('sfx', 'SFX', s.sfx)}
    <label><span>품질</span><select id="q">${['AUTO', 'LOW', 'HIGH', 'ULTRA'].map((q) => `<option ${q === s.quality ? 'selected' : ''}>${q}</option>`).join('')}</select><span></span></label>
    ${slider('shake', '화면 셰이크', s.shake)}${slider('aberration', '색수차', s.aberration)}${slider('flash', '플래시 강도', s.flash)}
    <h3 style="letter-spacing:.2em">KEYS (클릭 후 새 키 입력)</h3>
    ${Object.keys(keyNames).map((k) => `<div class="keyrow"><span>${keyNames[k]}</span><button class="btn sm" data-key="${k}">${s.keys[k]}</button></div>`).join('')}
    <div style="display:flex;gap:10px;margin-top:14px"><button class="btn sm" id="defkeys">키 초기화</button><button class="btn primary" id="close" style="flex:1">DONE</button></div></div>`);
  bindSliders(d);
  d.querySelector('#q')!.addEventListener('change', (e) => { settings().quality = (e.target as HTMLSelectElement).value as any; writeSettings(); applyQuality(); });
  d.querySelectorAll<HTMLButtonElement>('button[data-key]').forEach((b) => b.addEventListener('click', () => {
    b.textContent = '...'; input.rebinding = (code) => { settings().keys[b.dataset.key!] = code; writeSettings(); b.textContent = code; };
  }));
  click(d, '#defkeys', () => { settings().keys = { ...DEFAULT_KEYS }; writeSettings(); showSettings(back); });
  click(d, '#close', () => { input.rebinding = null; back(); });
}

// ------------------------------------------------------------------ autoplay (FR-72)
let autoQueue: string[] = [];
function startAuto() {
  autoQueue = [];
  const from = STAGE ?? 'G01-M01';
  const start = Object.keys(MISSIONS).sort().indexOf(from);
  const all = Object.keys(MISSIONS).sort();
  const count = Number(params.get('count') || 100);
  autoQueue = all.slice(Math.max(0, start), Math.max(0, start) + count);
  const list = params.get('stages'); // e.g. ?stages=G02-M10,G05-M09 to re-check specific stages
  if (list) autoQueue = list.split(',').filter((id) => MISSIONS[id]);
  autoStep();
}
function autoStep() {
  const id = autoQueue.shift();
  if (!id) { (window as any).__autoplay.done = true; console.log('[autoplay] done', autoLog.filter((x) => x.victory).length + '/' + autoLog.length); showAutoSummary(); return; }
  const m = getMission(id);
  // the bot carries the upgrades a player would have picked after each earlier galaxy boss
  const order: UpgradeId[] = ['FIRE', 'SHIELD', 'MISSILE', 'DASH', 'WINGMAN'];
  save().upgrades = {};
  for (let g = 1; g < m.galaxy; g++) { const k = order[(g - 1) % 5]; save().upgrades[k] = Math.min(UPGRADES[k].max, (save().upgrades[k] ?? 0) + 1); }
  clear(); prepareBattle(m); startBattle(m);
}
function autoNext(m: MissionData, r: BattleResult) {
  autoLog.push({ id: m.id, victory: r.victory, score: r.score?.total ?? 0, rank: r.score?.rank ?? '-', time: +r.stats.time.toFixed(1), reason: r.reason ?? '' });
  if (!r.victory && autoRetries < 2) { autoRetries++; autoQueue.unshift(m.id); } else autoRetries = 0;
  setTimeout(autoStep, 10);
}
function showAutoSummary() {
  const ok = autoLog.filter((x) => x.victory).length;
  el(`<div class="panel"><h2>AUTOPLAY ${ok}/${autoLog.length} CLEARED</h2></div>`);
}

// ------------------------------------------------------------------ main loop
let last = performance.now();
let dbgT = 0;
const perf: any = ((window as any).__perf = { fps: 0, frameMs: 0, p99: 0, drawCalls: 0, triangles: 0, heapMB: 0 });
gfx.renderer.info.autoReset = false;

let lastFrameAt = 0;
let frameNo = 0;
function frame(now: number) {
  lastFrameAt = performance.now();
  try { frameInner(now); } catch (err) { console.error('[frame]', err); (window as any).__lastError = String((err as Error)?.stack ?? err); }
  requestAnimationFrame(frame);
}
// Soak runs must not depend on rAF (browsers pause it in hidden tabs).
if (AUTO) setInterval(() => { if (performance.now() - lastFrameAt > 200) { lastFrameAt = performance.now(); try { frameInner(performance.now()); } catch (err) { (window as any).__lastError = String(err); } } }, 33);
function frameInner(now: number) {
  const dt = Math.min(AUTO ? 1 : 0.1, (now - last) / 1000); last = now;
  if (mode === 'map') {
    galaxyMap.update(dt);
    document.querySelectorAll<HTMLElement>('.glabel').forEach((n) => { galaxyMap.project(Number(n.dataset.i), window.innerWidth, window.innerHeight, lbl); n.style.left = lbl.x + 'px'; n.style.top = lbl.y + 'px'; n.style.display = lbl.ok ? '' : 'none'; });
  } else if (mode === 'title') galaxyMap.update(dt);
  else if (mode === 'hub' || mode === 'briefing') {
    hub.update(dt);
    if (mode === 'hub') document.querySelectorAll<HTMLElement>('.nodelabel').forEach((n) => { hub.project(Number(n.dataset.i), window.innerWidth, window.innerHeight, lbl); n.style.left = lbl.x + 'px'; n.style.top = lbl.y + 'px'; n.style.display = lbl.ok ? '' : 'none'; });
  } else if (mode === 'battle' && battle) {
    const c = AUTO ? controls : input.poll();
    if (c.pause && !AUTO) { if (!paused) showPause(); else { clear(); paused = false; input.enabled = true; } }
    if (!paused) {
      if (AUTO) {
        const total = dt * SPEED;
        const steps = Math.max(1, Math.ceil(total / 0.04));
        const sd = total / steps;
        for (let i = 0; i < steps && battle && battle.state !== 'defeat'; i++) { botControls(battle, controls); battle.update(sd, controls); if (!battle) break; }
        if (battle && (battle.state === 'victory' || battle.state === 'defeat')) battle.update(0.2, controls);
      } else battle.update(dt, c);
    }
    if (battle) {
      hud.update(battle);
      const s = settings();
      flashEl.style.opacity = String(Math.min(0.9, battle.feel.flash * s.flash));
      gfx.setAberration(battle.feel.aberr * s.aberration);
    }
  } else { gfx.setAberration(0); flashEl.style.opacity = '0'; }
  if (mode !== 'battle') { gfx.setAberration(0); flashEl.style.opacity = '0'; }

  // high-speed soak runs only need the simulation; draw occasionally to keep shader paths exercised
  if (!(AUTO && SPEED >= 8 && (frameNo++ % 12) !== 0)) { gfx.renderer.info.reset(); gfx.render(dt); }

  dbgT += dt;
  if (dbgT > 0.5) {
    dbgT = 0;
    const ft = gfx.frameTimes.slice().sort((a, b) => a - b);
    const avg = gfx.frameTimes.reduce((a, b) => a + b, 0) / Math.max(1, gfx.frameTimes.length);
    perf.fps = Math.round(1000 / Math.max(0.1, avg)); perf.frameMs = +avg.toFixed(2); perf.p99 = +(ft[Math.floor(ft.length * 0.99)] ?? 0).toFixed(2);
    perf.drawCalls = gfx.renderer.info.render.calls; perf.triangles = gfx.renderer.info.render.triangles;
    perf.heapMB = Math.round(((performance as any).memory?.usedJSHeapSize ?? 0) / 1048576);
    perf.renderScale = +gfx.renderScale.toFixed(2); perf.quality = gfx.quality;
    if (DEBUG) { dbg.hidden = false; dbg.textContent = `FPS ${perf.fps}  ${perf.frameMs}ms  p99 ${perf.p99}ms\ndraw ${perf.drawCalls}  tri ${perf.triangles}\nheap ${perf.heapMB}MB  scale ${perf.renderScale}  ${perf.quality}\nparticles ${battle?.fx.particles.n ?? 0}  bullets ${battle?.fx.bullets.n ?? 0}  enemies ${battle?.enemies.length ?? 0}`; }
  }
}
requestAnimationFrame(frame);

// ------------------------------------------------------------------ boot (FR-70/71/72)
function boot() {
  if (AUTO) { startAuto(); return; }
  if (STAGE && MISSIONS[STAGE]) { curGalaxy = MISSIONS[STAGE].galaxy; prepareBattle(MISSIONS[STAGE]); startBattle(MISSIONS[STAGE]); return; }
  if (!settings().warned) showWarning(); else showTitle();
}
boot();
