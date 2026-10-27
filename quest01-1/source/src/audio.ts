import { settings } from './save';

/** Fully procedural audio (no external assets -> no license risk, NFR-09). */
class AudioSys {
  ctx: AudioContext | null = null;
  master!: GainNode; bgmGain!: GainNode; sfxGain!: GainNode;
  calm!: GainNode; combat!: GainNode;
  voices = 0;
  readonly MAX_VOICES = 32;
  private noiseBuf!: AudioBuffer;
  private bgmTimer = 0;
  private step = 0;
  private root = 55;
  private scale = [0, 3, 5, 7, 10];
  private intensity = 0;
  private bgmOn = false;
  private boss = false;

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new AudioContext();
    } catch { return; }
    const c = this.ctx;
    this.master = c.createGain(); this.bgmGain = c.createGain(); this.sfxGain = c.createGain();
    this.calm = c.createGain(); this.combat = c.createGain();
    this.calm.connect(this.bgmGain); this.combat.connect(this.bgmGain);
    this.bgmGain.connect(this.master); this.sfxGain.connect(this.master);
    const comp = c.createDynamicsCompressor();
    this.master.connect(comp); comp.connect(c.destination);
    this.noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
  }
  applyVolumes() {
    if (!this.ctx) return;
    const s = settings();
    this.master.gain.value = s.master; this.bgmGain.gain.value = s.bgm * 0.5; this.sfxGain.gain.value = s.sfx;
  }

  private voice(dur: number, build: (c: AudioContext, t: number, out: GainNode) => void, vol = 0.3) {
    const c = this.ctx; if (!c || this.voices >= this.MAX_VOICES) return;
    this.voices++;
    const g = c.createGain();
    g.connect(this.sfxGain);
    const t = c.currentTime;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    build(c, t, g);
    setTimeout(() => { this.voices--; g.disconnect(); }, dur * 1000 + 60);
  }
  private osc(c: AudioContext, t: number, out: AudioNode, type: OscillatorType, f0: number, f1: number, dur: number) {
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    o.connect(out); o.start(t); o.stop(t + dur + 0.02);
  }
  private noise(c: AudioContext, t: number, out: AudioNode, dur: number, f0: number, f1: number) {
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    s.connect(f); f.connect(out); s.start(t); s.stop(t + dur + 0.02);
  }

  laser() { this.voice(0.09, (c, t, o) => this.osc(c, t, o, 'sawtooth', 1400, 380, 0.08), 0.05); }
  enemyLaser() { this.voice(0.1, (c, t, o) => this.osc(c, t, o, 'square', 600, 220, 0.09), 0.03); }
  missile() { this.voice(0.5, (c, t, o) => { this.noise(c, t, o, 0.5, 3000, 300); this.osc(c, t, o, 'sawtooth', 200, 700, 0.4); }, 0.18); }
  explosion(big = false) {
    const d = big ? 1.1 : 0.45;
    this.voice(d, (c, t, o) => { this.noise(c, t, o, d, big ? 2400 : 3500, 60); this.osc(c, t, o, 'sine', big ? 120 : 160, 30, d); }, big ? 0.55 : 0.25);
  }
  hit() { this.voice(0.12, (c, t, o) => this.osc(c, t, o, 'square', 180, 60, 0.1), 0.12); }
  playerHit() { this.voice(0.35, (c, t, o) => { this.noise(c, t, o, 0.35, 1500, 120); this.osc(c, t, o, 'sawtooth', 120, 40, 0.3); }, 0.4); }
  shield() { this.voice(0.3, (c, t, o) => this.osc(c, t, o, 'triangle', 900, 300, 0.28), 0.2); }
  dash() { this.voice(0.3, (c, t, o) => { this.noise(c, t, o, 0.3, 6000, 500); }, 0.2); }
  nova() { this.voice(1.6, (c, t, o) => { this.osc(c, t, o, 'sawtooth', 60, 900, 0.7); this.noise(c, t, o, 1.6, 5000, 80); this.osc(c, t, o, 'sine', 90, 25, 1.5); }, 0.6); }
  ui() { this.voice(0.08, (c, t, o) => this.osc(c, t, o, 'triangle', 800, 1200, 0.07), 0.15); }
  stamp() { this.voice(0.5, (c, t, o) => { this.osc(c, t, o, 'sine', 140, 40, 0.4); this.noise(c, t, o, 0.2, 800, 100); }, 0.6); }
  tick() { this.voice(0.04, (c, t, o) => this.osc(c, t, o, 'square', 1500, 1500, 0.03), 0.04); }
  warning() { this.voice(0.8, (c, t, o) => { this.osc(c, t, o, 'square', 440, 330, 0.4); this.osc(c, t + 0.4, o, 'square', 440, 330, 0.4); }, 0.2); }
  warp() { this.voice(1.8, (c, t, o) => { this.osc(c, t, o, 'sawtooth', 50, 1400, 1.6); this.noise(c, t, o, 1.8, 400, 6000); }, 0.35); }

  /** FR-50: generative galaxy BGM with a combat layer that crossfades. */
  startBgm(galaxy: number, boss = false) {
    this.init();
    if (!this.ctx) return;
    this.boss = boss;
    this.root = 41.2 * Math.pow(2, ((galaxy * 5) % 12) / 12);
    this.scale = galaxy % 2 ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];
    if (boss) this.scale = [0, 1, 5, 7, 8];
    if (this.bgmOn) return;
    this.bgmOn = true;
    this.step = 0;
    const tick = () => {
      if (!this.bgmOn || !this.ctx) return;
      this.playStep();
      this.bgmTimer = window.setTimeout(tick, (this.boss ? 150 : 210));
    };
    tick();
  }
  stopBgm() { this.bgmOn = false; clearTimeout(this.bgmTimer); }
  setIntensity(x: number) {
    this.intensity = x;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.calm.gain.setTargetAtTime(1 - x * 0.7, t, 0.4);
    this.combat.gain.setTargetAtTime(x, t, 0.4);
  }
  private playStep() {
    const c = this.ctx!; const t = c.currentTime;
    const s = this.step++;
    const note = (f: number, dur: number, type: OscillatorType, vol: number, dest: AudioNode) => {
      const o = c.createOscillator(); o.type = type; o.frequency.value = f;
      const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
    };
    const deg = this.scale[(s * 3 + ((s >> 3) % 3)) % this.scale.length];
    if (s % 2 === 0) note(this.root * 4 * Math.pow(2, deg / 12), 0.9, 'triangle', 0.18, this.calm);
    if (s % 8 === 0) note(this.root * Math.pow(2, this.scale[(s >> 3) % this.scale.length] / 12), 1.7, 'sine', 0.3, this.calm);
    // combat layer: bass pulse + hats + lead
    if (s % 2 === 0) note(this.root * 2, 0.18, 'sawtooth', 0.12, this.combat);
    if (s % 4 === 2) {
      const src = c.createBufferSource(); src.buffer = this.noiseBuf; const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
      const g = c.createGain(); g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      src.connect(f); f.connect(g); g.connect(this.combat); src.start(t); src.stop(t + 0.07);
    }
    if (s % 4 === 0) note(this.root * 8 * Math.pow(2, this.scale[(s * 5) % this.scale.length] / 12), 0.25, 'square', 0.05, this.combat);
  }
}
export const audio = new AudioSys();
