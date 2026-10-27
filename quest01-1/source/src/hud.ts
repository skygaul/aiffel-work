import * as THREE from 'three';
import type { Battle } from './battle';
import { PLAYER } from './tuning';

const V = new THREE.Vector3(), Q = new THREE.Quaternion();
const OBJ: Record<string, string> = {
  ANNIHILATE: '모든 적 함대를 섬멸하라', ASSAULT: '제한 시간 내에 적 거점을 돌파하라', ESCORT: '수송선을 지켜 모든 적을 격퇴하라',
  SIEGE: '적 요새를 파괴하라', PURSUIT: '도주하는 목표를 격추하라', DEFENSE: '방어 거점을 사수하라',
  INFILTRATE: '체크포인트를 순서대로 통과하라', BOSS: '보스를 격파하라',
};
export const OBJECTIVES = OBJ;

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export class Hud {
  private el: HTMLElement;
  private ctx: CanvasRenderingContext2D;
  private r: Record<string, HTMLElement> = {};
  private last: Record<string, string> = {};
  visible = false;

  constructor(root: HTMLElement, private canvas: HTMLCanvasElement) {
    this.el = root;
    this.ctx = canvas.getContext('2d')!;
    root.innerHTML = `
      <div class="hud-tl"><div id="h-stage"></div><div id="h-obj"></div></div>
      <div class="hud-tr"><div id="h-time"></div><div id="h-score"></div><div id="h-wave"></div></div>
      <div id="h-boss" class="hidden"><div id="h-bossname"></div><div class="bar boss"><i id="h-bossbar"></i></div><div id="h-pips"></div></div>
      <div class="hud-bl">
        <div class="bar sh"><i id="h-shield"></i></div><div class="bar hu"><i id="h-hull"></i></div><div class="bar bo"><i id="h-boost"></i></div>
      </div>
      <div class="hud-bc">
        <div class="wpn"><b>E</b><span>MISSILE</span><div class="bar sm"><i id="h-msl"></i></div></div>
        <div class="wpn"><b>SPACE</b><span>DASH</span><div class="bar sm"><i id="h-dash"></i></div></div>
        <div class="wpn nova" id="h-novaw"><b>Q</b><span>NOVA BURST</span><div class="bar sm"><i id="h-nova"></i></div></div>
      </div>
      <div class="hud-r"><div id="h-combo"></div><div id="h-combolbl">COMBO</div><div class="bar sm"><i id="h-combot"></i></div></div>
      <div id="h-banner"></div><div id="h-warn" class="hidden">WARNING</div>`;
    for (const id of ['h-stage', 'h-obj', 'h-time', 'h-score', 'h-wave', 'h-boss', 'h-bossname', 'h-bossbar', 'h-pips', 'h-shield', 'h-hull', 'h-boost', 'h-msl', 'h-dash', 'h-nova', 'h-novaw', 'h-combo', 'h-combolbl', 'h-combot', 'h-banner', 'h-warn']) this.r[id] = root.querySelector('#' + id)!;
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }
  resize() {
    const d = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = window.innerWidth * d; this.canvas.height = window.innerHeight * d;
    this.canvas.style.width = '100%'; this.canvas.style.height = '100%';
    this.ctx.setTransform(d, 0, 0, d, 0, 0);
  }
  show(v: boolean) {
    this.visible = v;
    this.el.style.display = v ? 'block' : 'none';
    this.canvas.style.display = v ? 'block' : 'none';
    if (!v) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
  private set(id: string, text: string) { if (this.last[id] !== text) { this.last[id] = text; this.r[id].textContent = text; } }
  private w(id: string, frac: number) { const t = (Math.max(0, Math.min(1, frac)) * 100).toFixed(1) + '%'; if (this.last['w' + id] !== t) { this.last['w' + id] = t; this.r[id].style.width = t; } }

  update(b: Battle) {
    const s = b.stats, p = b.p, m = b.mission;
    this.set('h-stage', `${m.id} · ${m.name} · ${m.type}`);
    let obj = OBJ[m.type];
    if (b.objective) obj += ` — 내구도 ${Math.round((b.objective.hp / b.objective.maxHp) * 100)}%`;
    if (m.type === 'INFILTRATE') obj += ` (${b.ringIdx}/${b.rings.length})`;
    this.set('h-obj', obj);
    const remain = b.timeLimit > 0 ? Math.max(0, b.timeLimit - s.time) : -1;
    this.set('h-time', remain >= 0 ? `⏱ ${fmt(remain)}` : `⏱ ${fmt(s.time)} / PAR ${fmt(m.parTime)}`);
    this.r['h-time'].classList.toggle('danger', remain >= 0 && remain < 15);
    this.set('h-score', `EST ${b.predictScore().total.toLocaleString()}`);
    this.set('h-wave', `WAVE ${Math.max(1, b.waveIdx + 1)}/${b.waveTotal}  ·  KILLS ${s.kills}`);
    this.w('h-shield', p.shield / p.maxShield); this.w('h-hull', p.hull / p.maxHull); this.w('h-boost', p.boost / 100);
    this.w('h-msl', 1 - p.missileCd / PLAYER.missileCooldown);
    this.w('h-dash', 1 - p.dashCd / PLAYER.dashCooldown);
    this.w('h-nova', p.nova / 100);
    this.r['h-novaw'].classList.toggle('ready', p.nova >= 100);
    this.set('h-combo', s.combo > 1 ? `x${s.combo}` : '');
    this.set('h-combolbl', s.combo > 1 ? 'COMBO' : '');
    this.w('h-combot', s.comboT / 2);
    const bs = b.boss;
    this.r['h-boss'].classList.toggle('hidden', !bs || !bs.alive);
    if (bs && bs.alive) {
      this.set('h-bossname', `${m.boss!.name}  ·  PHASE ${bs.phase + 1}/${m.boss!.phases}`);
      this.w('h-bossbar', bs.hp / bs.maxHp);
      this.set('h-pips', `PARTS ${b.partsAlive()}`);
    }
    this.set('h-banner', b.bannerT > 0 ? b.banner : '');
    this.r['h-banner'].style.opacity = b.bannerT > 0 ? String(Math.min(1, b.bannerT * 2)) : '0';
    this.r['h-warn'].classList.toggle('hidden', b.warnT <= 0);
    this.draw2d(b);
  }

  private draw2d(b: Battle) {
    const g = this.ctx, W = window.innerWidth, H = window.innerHeight, cam = b.camera, p = b.p;
    g.clearRect(0, 0, W, H);
    // crosshair
    V.set(0, 0, 260).applyQuaternion(p.quat).add(p.pos).project(cam);
    const cx = (V.x * 0.5 + 0.5) * W, cy = (-V.y * 0.5 + 0.5) * H;
    g.strokeStyle = 'rgba(120,255,255,0.9)'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(cx, cy, 14, 0, 6.283); g.moveTo(cx - 22, cy); g.lineTo(cx - 8, cy); g.moveTo(cx + 8, cy); g.lineTo(cx + 22, cy); g.moveTo(cx, cy - 22); g.lineTo(cx, cy - 8); g.moveTo(cx, cy + 8); g.lineTo(cx, cy + 22); g.stroke();
    // enemy brackets / edge arrows
    const list = b.enemies.filter((e) => e.alive && (!e.isPart || true) && e.cloak < 0.8).sort((a, c) => a.pos.distanceToSquared(p.pos) - c.pos.distanceToSquared(p.pos)).slice(0, 36);
    for (const e of list) {
      V.copy(e.pos).project(cam);
      const behind = V.z > 1;
      let x = (V.x * 0.5 + 0.5) * W, y = (-V.y * 0.5 + 0.5) * H;
      const col = e.isBoss || e.isFortress || e.isTarget ? '#ffd24a' : '#' + e.color.getHexString();
      if (!behind && x > 0 && x < W && y > 0 && y < H) {
        const sz = Math.max(10, Math.min(60, (e.radius * 900) / Math.max(40, e.pos.distanceTo(p.pos)) * 0.5));
        g.strokeStyle = col; g.lineWidth = e.isBoss ? 2.5 : 1.2; g.globalAlpha = 0.85;
        const k = sz * 0.35;
        g.beginPath();
        g.moveTo(x - sz, y - sz + k); g.lineTo(x - sz, y - sz); g.lineTo(x - sz + k, y - sz);
        g.moveTo(x + sz - k, y - sz); g.lineTo(x + sz, y - sz); g.lineTo(x + sz, y - sz + k);
        g.moveTo(x + sz, y + sz - k); g.lineTo(x + sz, y + sz); g.lineTo(x + sz - k, y + sz);
        g.moveTo(x - sz + k, y + sz); g.lineTo(x - sz, y + sz); g.lineTo(x - sz, y + sz - k);
        g.stroke();
        if (e.kind !== 'fighter' || e.isTarget) {
          g.fillStyle = col; g.fillRect(x - sz, y + sz + 4, sz * 2 * Math.max(0, e.hp / e.maxHp), 3);
        }
        g.globalAlpha = 1;
      } else if (e.isBoss || e.isFortress || e.isTarget || list.indexOf(e) < 8) {
        if (behind) { x = W - x; y = H - y; }
        const ang = Math.atan2(y - H / 2, x - W / 2);
        const rr = Math.min(W, H) * 0.42;
        const ax = W / 2 + Math.cos(ang) * rr, ay = H / 2 + Math.sin(ang) * rr;
        g.save(); g.translate(ax, ay); g.rotate(ang); g.fillStyle = col; g.globalAlpha = 0.8;
        g.beginPath(); g.moveTo(10, 0); g.lineTo(-7, 7); g.lineTo(-7, -7); g.closePath(); g.fill(); g.restore(); g.globalAlpha = 1;
      }
    }
    // objectives
    const mark = (pos: THREE.Vector3, label: string, color: string) => {
      V.copy(pos).project(cam);
      const behind = V.z > 1;
      let x = (V.x * 0.5 + 0.5) * W, y = (-V.y * 0.5 + 0.5) * H;
      g.fillStyle = color; g.strokeStyle = color; g.font = '12px monospace'; g.textAlign = 'center';
      if (!behind && x > 40 && x < W - 40 && y > 40 && y < H - 40) {
        g.beginPath(); g.moveTo(x, y - 34); g.lineTo(x - 7, y - 46); g.lineTo(x + 7, y - 46); g.closePath(); g.fill();
        g.fillText(`${label} ${Math.round(pos.distanceTo(p.pos))}m`, x, y - 52);
      } else {
        if (behind) { x = W - x; y = H - y; }
        const ang = Math.atan2(y - H / 2, x - W / 2), rr = Math.min(W, H) * 0.4;
        const ax = W / 2 + Math.cos(ang) * rr, ay = H / 2 + Math.sin(ang) * rr;
        g.save(); g.translate(ax, ay); g.rotate(ang); g.beginPath(); g.moveTo(12, 0); g.lineTo(-8, 9); g.lineTo(-8, -9); g.closePath(); g.fill(); g.restore();
        g.fillText(label, ax, ay - 14);
      }
    };
    if (b.objective) mark(b.objective.pos, b.objective.kind === 'beacon' ? 'BASE' : 'FREIGHTER', '#4dffb0');
    if (b.mission.type === 'INFILTRATE' && b.rings[b.ringIdx]) mark(b.rings[b.ringIdx].pos, `GATE ${b.ringIdx + 1}`, '#4dd8ff');
    // damage numbers
    g.textAlign = 'center';
    for (const n of b.feel.numbers) {
      V.set(n.x, n.y, n.z).project(cam);
      if (V.z > 1) continue;
      const x = (V.x * 0.5 + 0.5) * W, y = (-V.y * 0.5 + 0.5) * H;
      g.globalAlpha = Math.max(0, 1 - n.t / 0.8);
      g.fillStyle = n.color; g.font = `${n.crit ? 'bold 18' : '13'}px monospace`;
      g.fillText(n.text, x, y);
    }
    g.globalAlpha = 1;
    // radar
    const R = 62, rx = W - R - 26, ry = H - R - 26;
    g.fillStyle = 'rgba(0,20,30,0.45)'; g.strokeStyle = 'rgba(100,255,255,0.5)'; g.lineWidth = 1;
    g.beginPath(); g.arc(rx, ry, R, 0, 6.283); g.fill(); g.stroke();
    g.beginPath(); g.arc(rx, ry, R / 2, 0, 6.283); g.stroke();
    g.beginPath(); g.moveTo(rx, ry - 6); g.lineTo(rx - 4, ry + 4); g.lineTo(rx + 4, ry + 4); g.closePath(); g.fillStyle = '#7ff'; g.fill();
    Q.copy(p.quat).invert();
    const range = 520;
    for (const e of b.enemies) {
      if (!e.alive || e.cloak > 0.8 || e.isPart) continue;
      V.copy(e.pos).sub(p.pos).applyQuaternion(Q);
      let dx = -V.x / range * R, dy = -V.z / range * R;
      const l = Math.hypot(dx, dy); if (l > R - 3) { dx *= (R - 3) / l; dy *= (R - 3) / l; }
      g.fillStyle = e.isBoss || e.isFortress || e.isTarget ? '#ffd24a' : '#' + e.color.getHexString();
      const sz = e.isBoss ? 4 : e.kind === 'fighter' ? 1.8 : 3;
      g.fillRect(rx + dx - sz / 2, ry + dy - sz / 2 - V.y * 0.02, sz, sz);
    }
    if (b.objective) {
      V.copy(b.objective.pos).sub(p.pos).applyQuaternion(Q);
      let dx = -V.x / range * R, dy = -V.z / range * R; const l = Math.hypot(dx, dy); if (l > R - 3) { dx *= (R - 3) / l; dy *= (R - 3) / l; }
      g.fillStyle = '#4dffb0'; g.fillRect(rx + dx - 3, ry + dy - 3, 6, 6);
    }
  }
}
