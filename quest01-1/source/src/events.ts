type Fn = (p: any) => void;
export class EventBus {
  private m = new Map<string, Fn[]>();
  on(ev: string, f: Fn) { (this.m.get(ev) ?? this.m.set(ev, []).get(ev)!).push(f); }
  off(ev: string, f: Fn) { const a = this.m.get(ev); if (a) { const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); } }
  emit(ev: string, p?: any) { const a = this.m.get(ev); if (a) for (let i = 0; i < a.length; i++) a[i](p); }
  clear() { this.m.clear(); }
}
export const bus = new EventBus();
