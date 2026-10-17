// Strands — © 2026 Emre Ergin (emrgn-arch) · https://github.com/emrgn-arch/bead-curtain-studio
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Design } from '../core/design';
import type { Backdrop, Mood } from '../core/state';
import { Curtain } from './curtain';
import { CurtainMotion } from './motion';
import { Overlay } from './overlay';
import { Room } from './room';
import { Studio } from './studio';

const MM = 0.001;
const GRAB_PX = 24; // how close (screen px) the pointer must be to a rope to grab it

export type View = 'front' | 'angle' | 'detail';

interface LightSpec {
  key: { color: number; intensity: number; dir: [number, number, number] };
  hemi: { sky: number; ground: number; intensity: number };
  lamp: { color: number; intensity: number };
  env: number;
  bg: number;
  exposure: number;
}

/** Neutral, soft, white light for the studio backdrop. */
const STUDIO: LightSpec = {
  key: { color: 0xffffff, intensity: 2.4, dir: [-1.7, 3.4, 3.0] },
  hemi: { sky: 0xffffff, ground: 0xd6d6d6, intensity: 1.35 },
  lamp: { color: 0xffffff, intensity: 0 },
  env: 0.55,
  bg: 0xf2f2f2,
  exposure: 1.0,
};

const MOODS: Record<Mood, LightSpec> = {
  golden: {
    key: { color: 0xffb37a, intensity: 3.1, dir: [-2.4, 2.5, 3.0] },
    hemi: { sky: 0xffe4c8, ground: 0x5c3b26, intensity: 0.65 },
    lamp: { color: 0xff9a4d, intensity: 9 },
    env: 0.32,
    bg: 0x1f1611,
    exposure: 1.0,
  },
  daylight: {
    key: { color: 0xfff3e6, intensity: 3.3, dir: [1.6, 4.2, 3.2] },
    hemi: { sky: 0xeef2ff, ground: 0x8a6c55, intensity: 1.0 },
    lamp: { color: 0xffe2c0, intensity: 3 },
    env: 0.55,
    bg: 0x2a2420,
    exposure: 1.0,
  },
  evening: {
    key: { color: 0xff8c4a, intensity: 0.9, dir: [-3.2, 1.5, 2.4] },
    hemi: { sky: 0x7a5240, ground: 0x22150e, intensity: 0.4 },
    lamp: { color: 0xffa04f, intensity: 24 },
    env: 0.18,
    bg: 0x140d0a,
    exposure: 1.1,
  },
};

interface CameraAnim {
  fromPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toPos: THREE.Vector3;
  toTarget: THREE.Vector3;
  start: number;
  duration: number;
}

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 1, 0.01, 60);
  readonly controls: OrbitControls;
  readonly motion = new CurtainMotion();
  readonly curtain = new Curtain(this.motion.uniforms);
  readonly overlay = new Overlay();
  private room: Room;
  private key = new THREE.DirectionalLight();
  private hemi = new THREE.HemisphereLight();
  private lamp = new THREE.PointLight(0xffffff, 1, 0, 2);
  private dirty = true;
  private anim: CameraAnim | null = null;
  private opening = { W: 0, H: 0 };
  private view: View | null = 'front';
  private mood: Mood = 'golden';
  private backdrop: Backdrop | null = null;
  private studio = new Studio();
  private raycaster = new THREE.Raycaster();
  private breeze = false;
  private physics = false;
  private grabPointer: number | null = null;
  private lastTick = 0;

  constructor(private host: HTMLElement) {
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.localClippingEnabled = true;
    host.appendChild(r.domElement);
    this.renderer = r;

    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.room = new Room(r.capabilities.getMaxAnisotropy());
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0003;
    this.key.shadow.normalBias = 0.0025;
    this.key.shadow.radius = 3;
    this.lamp.position.set(0.9, 2.0, -1.7);
    this.scene.add(this.room.group, this.studio.group, this.curtain.group, this.overlay.group, this.key, this.key.target, this.hemi, this.lamp);

    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 0.12;
    this.controls.maxDistance = 9;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.03;
    this.controls.minAzimuthAngle = -1.35;
    this.controls.maxAzimuthAngle = 1.35;
    this.controls.addEventListener('change', () => (this.dirty = true));
    this.controls.addEventListener('start', () => {
      this.view = null;
      this.anim = null;
    });

    this.attachHands();
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    r.setAnimationLoop((t) => this.tick(t));
  }

  requestRender(): void {
    this.dirty = true;
  }

  private resize(): void {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  private tick(now: number): void {
    if (this.anim) {
      const a = this.anim;
      const t = Math.min(1, (now - a.start) / a.duration);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      this.camera.position.lerpVectors(a.fromPos, a.toPos, e);
      this.controls.target.lerpVectors(a.fromTarget, a.toTarget, e);
      if (t >= 1) this.anim = null;
      this.dirty = true;
    }
    if (this.controls.update()) this.dirty = true;
    const dt = this.lastTick ? (now - this.lastTick) / 1000 : 0;
    this.lastTick = now;
    if (this.motion.step(dt, now / 1000)) this.dirty = true;
    if (!this.dirty) return;
    this.dirty = false;
    this.renderer.render(this.scene, this.camera);
  }

  // ------------------------------------------------------------ content

  setDesign(d: Design, ropeColor: string, overlayOpacity: number): void {
    const L = d.layout;
    const W = L.W * MM;
    const H = L.H * MM;
    const changed = W !== this.opening.W || H !== this.opening.H;
    this.opening = { W, H };
    this.room.build(W, H);
    this.curtain.update(d, ropeColor);
    // In the room the doorway frame limits how far ropes can swing sideways.
    this.motion.configure(d, this.backdrop === 'room' ? W / 2 - (L.beadOD / 2) * MM : 0);
    this.overlay.update(L, d.placement, overlayOpacity);
    this.fitShadow();
    if (changed && this.view) this.setView(this.view, false);
    this.dirty = true;
  }

  setOverlayImage(canvas: HTMLCanvasElement | null): void {
    this.overlay.setImage(canvas);
    this.dirty = true;
  }

  setOverlayMode(on: boolean): void {
    if (on === this.overlay.visible) return;
    this.overlay.visible = on;
    if (on) this.releaseGrab();
    this.controls.enabled = !on;
    if (on) this.setView('front');
    this.dirty = true;
  }

  /** Breeze: gentle wind. Physics: ropes can be grabbed and swung with the pointer. */
  setMotion(breeze: boolean, physics: boolean): void {
    if (breeze === this.breeze && physics === this.physics) return;
    this.breeze = breeze;
    this.physics = physics;
    if (!physics) this.releaseGrab();
    this.motion.setModes(breeze, physics);
    this.dirty = true;
  }

  // ------------------------------------------------------------ hands

  /** Aim the raycaster at the pointer; returns its NDC position and the canvas rect. */
  private aim(e: PointerEvent): { ndc: THREE.Vector2; rect: DOMRect } {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    return { ndc, rect };
  }

  /** Grab beads with the pointer when physics is on. Runs before the orbit controls see the event. */
  private attachHands(): void {
    const canvas = this.renderer.domElement;
    const canGrab = () => this.motion.interactive && !this.overlay.visible;
    canvas.addEventListener(
      'pointerdown',
      (e) => {
        if (!canGrab() || e.button !== 0) return;
        const { ndc, rect } = this.aim(e);
        const target = this.motion.pick(this.camera, ndc, rect.width, rect.height, GRAB_PX);
        if (!target) return; // empty space: the camera orbits as usual
        this.controls.enabled = false;
        this.motion.beginGrab(target, this.raycaster.ray, this.camera);
        this.grabPointer = e.pointerId;
        canvas.setPointerCapture(e.pointerId);
        canvas.classList.add('grabbing');
      },
      { capture: true },
    );
    canvas.addEventListener('pointermove', (e) => {
      if (this.grabPointer === e.pointerId) {
        this.aim(e);
        this.motion.moveGrab(this.raycaster.ray);
        return;
      }
      if (e.buttons || !canGrab()) {
        canvas.classList.remove('can-grab');
        return;
      }
      const { ndc, rect } = this.aim(e);
      canvas.classList.toggle('can-grab', this.motion.pick(this.camera, ndc, rect.width, rect.height, GRAB_PX) !== null);
    });
    const end = (e: PointerEvent) => {
      if (this.grabPointer === e.pointerId) this.releaseGrab();
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  private releaseGrab(): void {
    if (this.grabPointer === null) return;
    this.motion.endGrab();
    this.grabPointer = null;
    this.renderer.domElement.classList.remove('grabbing');
    this.controls.enabled = !this.overlay.visible;
  }

  /** Studio (white sweep, neutral light) or room (doorway, warm moods). */
  setLook(backdrop: Backdrop, mood: Mood): void {
    if (backdrop === this.backdrop && mood === this.mood) return;
    this.backdrop = backdrop;
    this.mood = mood;
    const studio = backdrop === 'studio';
    this.studio.group.visible = studio;
    this.room.group.visible = !studio;
    this.curtain.setRailColor(studio ? '#1c1c1c' : '#8f5f39');
    // Neutral tone mapping keeps the studio white white; ACES gives the room its warmth.
    this.renderer.toneMapping = studio ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;
    const s = this.light();
    this.key.color.setHex(s.key.color);
    this.key.intensity = s.key.intensity;
    this.hemi.color.setHex(s.hemi.sky);
    this.hemi.groundColor.setHex(s.hemi.ground);
    this.hemi.intensity = s.hemi.intensity;
    this.lamp.color.setHex(s.lamp.color);
    this.lamp.intensity = s.lamp.intensity;
    this.scene.environmentIntensity = s.env;
    this.scene.background = new THREE.Color(s.bg);
    this.renderer.toneMappingExposure = s.exposure;
    this.fitShadow();
    this.dirty = true;
  }

  private light(): LightSpec {
    return this.backdrop === 'room' ? MOODS[this.mood] : STUDIO;
  }

  private fitShadow(): void {
    const { W, H } = this.opening;
    const target = new THREE.Vector3(0, H / 2, -0.4);
    const dir = new THREE.Vector3(...this.light().key.dir).normalize();
    this.key.target.position.copy(target);
    this.key.position.copy(target).addScaledVector(dir, 7);
    const half = Math.max(W, H) / 2 + 1.4;
    const cam = this.key.shadow.camera;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.near = 1;
    cam.far = 16;
    cam.updateProjectionMatrix();
  }

  // ------------------------------------------------------------ camera

  setView(v: View, animate = true): void {
    const { W, H } = this.opening;
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const d = Math.max((H * 1.16) / 2 / tan, (W * 1.6) / 2 / (tan * this.camera.aspect), 1.2);
    const cy = H / 2;
    let pos: THREE.Vector3;
    let target: THREE.Vector3;
    if (v === 'front') {
      target = new THREE.Vector3(0, cy, 0);
      pos = new THREE.Vector3(0, cy, d);
    } else if (v === 'angle') {
      const a = THREE.MathUtils.degToRad(34);
      target = new THREE.Vector3(0, cy * 0.95, 0);
      pos = new THREE.Vector3(-Math.sin(a) * d * 1.1, cy + H * 0.06, Math.cos(a) * d * 1.1);
    } else {
      target = new THREE.Vector3(-W * 0.12, H * 0.6, 0);
      pos = new THREE.Vector3(W * 0.08, H * 0.64, 0.38);
    }
    this.view = v;
    if (!animate) {
      this.anim = null;
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
      this.dirty = true;
      return;
    }
    this.anim = {
      fromPos: this.camera.position.clone(),
      fromTarget: this.controls.target.clone(),
      toPos: pos,
      toTarget: target,
      start: performance.now(),
      duration: 750,
    };
  }

  /** Point on the overlay plane under the cursor, in opening-space mm. */
  pickOverlay(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -this.overlay.z), hit)) return null;
    return { x: hit.x / MM, y: hit.y / MM };
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  /** Render once more and read the pixels synchronously (the drawing buffer is not preserved). */
  snapshot(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }
}
