import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { QUALITY, type QualityName } from './tuning';

const NOISE = /* glsl */ `
float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){
  vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm(vec3 p){ float a=.5,s=0.; for(int i=0;i<5;i++){ s+=a*vnoise(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=.5; } return s; }
`;

export class Gfx {
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  renderPass: RenderPass;
  bloom: UnrealBloomPass;
  aberr: ShaderPass;
  quality: QualityName = 'HIGH';
  renderScale = 1;
  w = 1; h = 1;
  frameTimes: number[] = [];
  private scaleTimer = 0;
  dynamicScale = true;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x02030a, 1);
    const dummy = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(70, 1, 0.5, 4000);
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(dummy, cam);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.9, 0.45, 1.0);
    this.aberr = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, amount: { value: 0.0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float amount; varying vec2 vUv;
        void main(){ vec2 d=(vUv-.5)*amount; vec4 c=texture2D(tDiffuse,vUv);
          c.r=texture2D(tDiffuse,vUv+d).r; c.b=texture2D(tDiffuse,vUv-d).b; gl_FragColor=c; }`,
    });
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.aberr);
    this.composer.addPass(new OutputPass());
    window.addEventListener('resize', () => this.resize());
  }

  autoQuality(): QualityName {
    const cores = navigator.hardwareConcurrency ?? 4;
    const mem = (navigator as any).deviceMemory ?? 4;
    // ULTRA is opt-in: core count says nothing about the GPU.
    if (cores <= 2 || mem <= 2) return 'LOW';
    return 'HIGH';
  }
  setQuality(q: QualityName) {
    this.quality = q;
    const c = QUALITY[q];
    this.bloom.enabled = c.bloom;
    this.bloom.strength = c.bloomStrength;
    this.resize();
  }
  setAberration(x: number) { this.aberr.uniforms.amount.value = x; }
  use(scene: THREE.Scene, camera: THREE.Camera) { this.renderPass.scene = scene; this.renderPass.camera = camera; }

  resize() {
    this.w = window.innerWidth; this.h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, QUALITY[this.quality].pixelRatio) * this.renderScale;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(this.w, this.h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(this.w, this.h);
    this.pointScale = (this.h * pr) / 2;
  }
  pointScale = 400;

  /** FR-62: dynamic render scale 0.6-1.0 */
  render(dt: number) {
    this.composer.render(dt);
    this.frameTimes.push(dt * 1000);
    if (this.frameTimes.length > 240) this.frameTimes.shift();
    this.scaleTimer += dt;
    if (this.dynamicScale && this.scaleTimer > 0.5 && this.frameTimes.length >= 6) {
      this.scaleTimer = 0;
      const n = Math.min(24, this.frameTimes.length);
      const avg = this.frameTimes.slice(-n).reduce((a, b) => a + b, 0) / n;
      let s = this.renderScale;
      if (avg > 19.5 && s > 0.6) s = Math.max(0.6, s - (avg > 45 ? 0.2 : 0.1));
      else if (avg < 12 && s < 1) s = Math.min(1, s + 0.05);
      if (s !== this.renderScale) { this.renderScale = s; this.resize(); }
    }
  }
}

export const col = (hex: string) => new THREE.Color(hex);

export function makeStarfield(count: number, radius: number, palette: THREE.Color[]): THREE.Points {
  const pos = new Float32Array(count * 3), colr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    pos[i * 3] = r * Math.cos(t) * radius; pos[i * 3 + 1] = u * radius; pos[i * 3 + 2] = r * Math.sin(t) * radius;
    const c = palette[(Math.random() * palette.length) | 0].clone().lerp(new THREE.Color(1, 1, 1), 0.6 + Math.random() * 0.4);
    const b = 0.4 + Math.random() * 1.2;
    colr[i * 3] = c.r * b; colr[i * 3 + 1] = c.g * b; colr[i * 3 + 2] = c.b * b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  const m = new THREE.PointsMaterial({ size: 2.2, vertexColors: true, sizeAttenuation: false, depthWrite: false, transparent: true, opacity: 0.95 });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return p;
}

/** FR-43: FBM nebula skybox using galaxy palette */
export function makeNebula(palette: THREE.Color[], seed: number): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { c1: { value: palette[0] }, c2: { value: palette[1] }, c3: { value: palette[2] }, seed: { value: seed * 7.31 } },
    vertexShader: 'varying vec3 vD; void main(){ vD=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `${NOISE} uniform vec3 c1,c2,c3; uniform float seed; varying vec3 vD;
      void main(){
        vec3 p=vD*2.2+seed;
        float n=fbm(p); float m=fbm(p*1.7+5.3); float d=fbm(p*0.6-3.1);
        vec3 c=mix(c1,c2,smoothstep(.3,.7,n))*smoothstep(.35,.85,n)*0.55;
        c+=c3*pow(smoothstep(.45,.9,m),2.0)*0.45;
        c+=c1*pow(d,3.0)*0.12;
        gl_FragColor=vec4(c*0.45+vec3(.004,.006,.014),1.);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(2500, 32, 20), mat);
  mesh.frustumCulled = false;
  return mesh;
}

/** FR-42: procedural planet, same seed = same planet */
export function makePlanet(seed: number, palette: THREE.Color[], radius: number, lightDir: THREE.Vector3) {
  const g = new THREE.Group();
  const s = (seed * 9301 + 49297) % 233280 / 233280;
  const landA = palette[seed % 3].clone().multiplyScalar(0.9);
  const landB = palette[(seed + 1) % 3].clone().multiplyScalar(0.7);
  const deep = palette[(seed + 2) % 3].clone().multiplyScalar(0.18);
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 48, 32),
    new THREE.ShaderMaterial({
      uniforms: { a: { value: landA }, b: { value: landB }, d: { value: deep }, L: { value: lightDir }, off: { value: seed * 3.77 }, freq: { value: 1.6 + s * 2.2 }, ice: { value: s > 0.6 ? 1 : 0 } },
      vertexShader: 'varying vec3 vP; varying vec3 vN; void main(){ vP=position; vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `${NOISE} uniform vec3 a,b,d,L; uniform float off,freq,ice; varying vec3 vP; varying vec3 vN;
        void main(){
          vec3 q=normalize(vP)*freq+off; float h=fbm(q*2.0); float det=fbm(q*9.0);
          vec3 c=mix(d,a,smoothstep(.35,.5,h)); c=mix(c,b,smoothstep(.55,.75,h)); c*=0.75+det*0.5;
          float pole=smoothstep(.72,.95,abs(normalize(vP).y)); c=mix(c,vec3(.9,.95,1.),pole*ice);
          float l=max(dot(normalize(vN),normalize(L)),0.); c*=0.06+l*1.25;
          gl_FragColor=vec4(c,1.);
        }`,
    }),
  );
  g.add(body);
  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.025, 40, 28),
    new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { L: { value: lightDir }, off: { value: seed * 1.31 } },
      vertexShader: 'varying vec3 vP; varying vec3 vN; void main(){ vP=position; vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `${NOISE} uniform vec3 L; uniform float off; varying vec3 vP; varying vec3 vN;
        void main(){ float n=fbm(normalize(vP)*3.2+off); float a=smoothstep(.5,.75,n)*.8; float l=max(dot(normalize(vN),normalize(L)),0.)*1.1+.05; gl_FragColor=vec4(vec3(l),a); }`,
    }),
  );
  g.add(clouds);
  const atmoCol = palette[(seed + 2) % 3].clone().lerp(new THREE.Color(0.5, 0.8, 1), 0.5);
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.12, 40, 28),
    new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
      uniforms: { c: { value: atmoCol } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 c; varying vec3 vN; varying vec3 vV; void main(){ float f=pow(clamp(dot(-vN,vV),0.,1.),2.2); gl_FragColor=vec4(c*f*1.6,f); }',
    }),
  );
  g.add(atmo);
  if (seed % 3 === 0) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * 1.45, radius * 2.3, 96, 1),
      new THREE.ShaderMaterial({
        transparent: true, side: THREE.DoubleSide, depthWrite: false,
        uniforms: { c: { value: landA.clone().lerp(new THREE.Color(1, 1, 1), 0.4) }, r0: { value: radius * 1.45 }, r1: { value: radius * 2.3 } },
        vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
        fragmentShader: 'uniform vec3 c; uniform float r0,r1; varying vec3 vP; void main(){ float r=(length(vP.xy)-r0)/(r1-r0); float b=.5+.5*sin(r*60.)*sin(r*17.); gl_FragColor=vec4(c*(0.5+b), (0.25+0.5*b)*smoothstep(0.,.08,r)*smoothstep(1.,.85,r)); }',
      }),
    );
    ring.rotation.x = Math.PI / 2 - 0.4;
    g.add(ring);
  }
  return { group: g, clouds };
}

export function glowTexture(inner = 0.0): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const gr = x.createRadialGradient(64, 64, inner * 64, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
export function ringTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const gr = x.createRadialGradient(64, 64, 40, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.72, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.85, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
