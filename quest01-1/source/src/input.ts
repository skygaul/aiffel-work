import { settings } from './save';

export interface Controls {
  yaw: number; pitch: number; thrust: number; strafe: number; lift: number;
  fire: boolean; boost: boolean;
  missile: boolean; nova: boolean; dash: boolean; // edge-triggered, consumed by the battle
  pause: boolean;
}
export const newControls = (): Controls => ({ yaw: 0, pitch: 0, thrust: 0, strafe: 0, lift: 0, fire: false, boost: false, missile: false, nova: false, dash: false, pause: false });

/** Keyboard + mouse + gamepad (FR-63). Mouse position steers like a flight stick. */
export class Input {
  keys = new Set<string>();
  mx = 0; my = 0; mouseDown = false; rightDown = false;
  c = newControls();
  rebinding: ((code: string) => void) | null = null;
  enabled = false;
  private edge = { missile: false, nova: false, dash: false, pause: false };

  constructor(private el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (this.rebinding) { e.preventDefault(); const f = this.rebinding; this.rebinding = null; f(e.code); return; }
      if (e.repeat) return;
      this.keys.add(e.code);
      const k = settings().keys;
      if (e.code === k.missile) this.edge.missile = true;
      if (e.code === k.nova) this.edge.nova = true;
      if (e.code === k.dash) this.edge.dash = true;
      if (e.code === 'Escape' || e.code === 'KeyP') this.edge.pause = true;
      if (this.enabled && (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseDown = false; });
    window.addEventListener('mousemove', (e) => {
      this.mx = (e.clientX / window.innerWidth) * 2 - 1;
      this.my = (e.clientY / window.innerHeight) * 2 - 1;
    });
    window.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.edge.missile = true;
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseDown = false; });
    window.addEventListener('contextmenu', (e) => { if (this.enabled) e.preventDefault(); });
  }

  poll(): Controls {
    const c = this.c, k = settings().keys, ks = this.keys;
    const dz = (v: number) => (Math.abs(v) < 0.08 ? 0 : (v - Math.sign(v) * 0.08) / 0.92);
    let yaw = -dz(this.mx) * 1.0, pitch = -dz(this.my) * 1.0;
    if (ks.has('ArrowLeft')) yaw = 1; if (ks.has('ArrowRight')) yaw = -1;
    if (ks.has('ArrowUp')) pitch = 1; if (ks.has('ArrowDown')) pitch = -1;
    let thrust = (ks.has(k.forward) ? 1 : 0) - (ks.has(k.back) ? 1 : 0);
    let strafe = (ks.has(k.right) ? 1 : 0) - (ks.has(k.left) ? 1 : 0);
    let lift = (ks.has('KeyR') ? 0 : 0);
    let fire = this.mouseDown || ks.has('KeyJ');
    let boost = ks.has(k.boost) || ks.has('ShiftRight');
    const gp = navigator.getGamepads?.()[0];
    if (gp) {
      const a = (i: number) => (Math.abs(gp.axes[i] ?? 0) < 0.15 ? 0 : gp.axes[i]);
      yaw = a(2) !== 0 ? -a(2) : yaw; pitch = a(3) !== 0 ? -a(3) : pitch;
      strafe = a(0) !== 0 ? a(0) : strafe; thrust = a(1) !== 0 ? -a(1) : thrust;
      if (gp.buttons[7]?.pressed || gp.buttons[0]?.pressed) fire = true;
      if (gp.buttons[5]?.pressed || gp.buttons[6]?.pressed) boost = true;
      if (gp.buttons[2]?.pressed) this.edge.missile = true;
      if (gp.buttons[3]?.pressed) this.edge.nova = true;
      if (gp.buttons[1]?.pressed) this.edge.dash = true;
    }
    c.yaw = yaw; c.pitch = pitch; c.thrust = thrust; c.strafe = strafe; c.lift = lift; c.fire = fire; c.boost = boost;
    c.missile = this.edge.missile; c.nova = this.edge.nova; c.dash = this.edge.dash; c.pause = this.edge.pause;
    this.edge.missile = this.edge.nova = this.edge.dash = this.edge.pause = false;
    return c;
  }
}
