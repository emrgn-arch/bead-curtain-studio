// Strands — © 2026 Emre Ergin (emrgn-arch) · https://github.com/emrgn-arch/bead-curtain-studio
import * as THREE from 'three';
import type { Design } from '../core/design';

// A light rope simulation. Each rope is a chain of nodes hanging from the rail
// (Verlet integration, fixed-length segments, gravity, damping and a soft pull
// back to rest). The node offsets from rest go to the GPU as a small float
// texture; the curtain's vertex shaders bend ropes and tilt beads along it.

const MM = 0.001;
export const NODES = 17; // per rope: 16 segments
const STEP = 1 / 180; // fixed physics step, s
const MAX_STEPS = 6; // per frame
const ITERATIONS = 20; // constraint passes per step: enough that ropes do not stretch
const GRAVITY = 9.81;
const DAMPING = 0.95; // velocity kept per step: heavy beads settle with almost no bounce
const HOME = 6; // faint pull back to rest; gravity does the real work, like a hanging strand
const WIND = 0.22; // breeze acceleration, m/s²
const HAND_REACH = 0.3; // radius of the pointer's influence, m (at least 6 rope spacings)
const SLEEP_SPEED = 2e-5; // m per step (about 4 mm/s): below this the curtain snaps to rest
const STRETCH = 0.1; // how much longer a pulled rope may get (0.1 = 10%): its beads spread apart
const STRETCH_RECOVERY = 6; // 1/s: how quickly a released rope draws its beads back together

export interface MotionUniforms {
  uDisp: { value: THREE.DataTexture };
  uRopes: { value: number };
  uNodes: { value: number };
  uX0: { value: number };
  uPitch: { value: number };
  uRailY: { value: number };
  uDrop: { value: number };
  uActive: { value: number };
}

export interface GrabTarget {
  rope: number;
  node: number;
  point: THREE.Vector3;
}

interface Held {
  index: number; // node index into the arrays
  weight: number;
  start: THREE.Vector3;
}

function emptyTexture(w: number, h: number): THREE.DataTexture {
  const t = new THREE.DataTexture(new Float32Array(w * h * 4), w, h, THREE.RGBAFormat, THREE.FloatType);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

export class CurtainMotion {
  readonly uniforms: MotionUniforms = {
    uDisp: { value: emptyTexture(1, 1) },
    uRopes: { value: 1 },
    uNodes: { value: NODES },
    uX0: { value: 0 },
    uPitch: { value: 1 },
    uRailY: { value: 2 },
    uDrop: { value: 2 },
    uActive: { value: 0 },
  };

  private key = '';
  private n = 0;
  private seg = 0.1;
  private rest = new Float32Array(0);
  private pos = new Float32Array(0);
  private prev = new Float32Array(0);
  private halfWidth = 0; // keep ropes inside the doorway (0 = no limit)
  /** Per rope: current length factor (1 = natural) for the segments above its held point. */
  private stretch = new Float32Array(0);
  private stretchTo = new Int16Array(0);

  private breeze = false;
  private physics = false;
  private awake = false;
  private stillFrames = 0;
  private acc = 0;
  private held: Held[] = [];
  private delta = new THREE.Vector3();
  private dragPlane = new THREE.Plane();
  private dragStart = new THREE.Vector3();
  private maxReach = 0.5;

  /** Rebuild the ropes when the layout changes; keeps the current motion otherwise. */
  configure(d: Design, halfWidth: number): void {
    const L = d.layout;
    this.halfWidth = halfWidth;
    let lowest = L.zoneTop;
    for (let i = 0; i < L.n; i++) lowest = Math.min(lowest, d.ropeBottom[i]);
    const drop = Math.max(0.2, (L.railY - lowest) * MM);
    const key = `${L.n}|${L.pitch}|${L.railY}|${drop.toFixed(3)}`;
    if (key === this.key) return;
    this.key = key;

    const n = L.n;
    this.n = n;
    this.seg = drop / (NODES - 1);
    this.maxReach = Math.min(0.6, drop * 0.45);
    this.rest = new Float32Array(n * NODES * 3);
    for (let r = 0; r < n; r++) {
      for (let k = 0; k < NODES; k++) {
        const o = (r * NODES + k) * 3;
        this.rest[o] = L.ropeX[r] * MM;
        this.rest[o + 1] = L.railY * MM - k * this.seg;
        this.rest[o + 2] = 0;
      }
    }
    this.pos = Float32Array.from(this.rest);
    this.prev = Float32Array.from(this.rest);
    this.stretch = new Float32Array(n).fill(1);
    this.stretchTo = new Int16Array(n);
    this.held = [];
    this.awake = this.breeze;

    const u = this.uniforms;
    u.uDisp.value.dispose();
    u.uDisp.value = emptyTexture(NODES, n);
    u.uRopes.value = n;
    u.uX0.value = L.ropeX[0] * MM;
    u.uPitch.value = Math.max(1e-4, L.pitch * MM);
    u.uRailY.value = L.railY * MM;
    u.uDrop.value = drop;
    u.uActive.value = 0;
  }

  setModes(breeze: boolean, physics: boolean): void {
    this.breeze = breeze;
    this.physics = physics;
    if (!physics) this.held = [];
    if (breeze) this.awake = true;
  }

  get interactive(): boolean {
    return this.physics && this.n > 0;
  }

  get dragging(): boolean {
    return this.held.length > 0;
  }

  /** Advance the simulation. Returns true when the curtain moved and needs a redraw. */
  step(dt: number, time: number): boolean {
    if (!this.awake || this.n === 0) return false;
    this.acc = Math.min(this.acc + Math.min(dt, 1 / 20), STEP * MAX_STEPS);
    let moved = 0;
    const recover = Math.exp(-STRETCH_RECOVERY * STEP);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      moved = Math.max(moved, this.integrate(time));
      for (let r = 0; r < this.n; r++) this.stretch[r] = 1 + (this.stretch[r] - 1) * recover;
      this.applyHands();
      for (let i = 0; i < ITERATIONS; i++) this.solve();
    }

    if (!this.breeze && !this.dragging && moved < SLEEP_SPEED) {
      if (++this.stillFrames > 30) {
        this.pos.set(this.rest);
        this.prev.set(this.rest);
        this.awake = false;
        this.uniforms.uActive.value = 0;
        return true;
      }
    } else {
      this.stillFrames = 0;
    }
    this.upload();
    return true;
  }

  private integrate(time: number): number {
    const { pos, prev, rest, n } = this;
    const dt2 = STEP * STEP;
    let maxMove = 0;
    for (let r = 0; r < n; r++) {
      const x = rest[r * NODES * 3];
      // Breeze: slow gusts that drift across the curtain.
      const wx = this.breeze ? WIND * (Math.sin(time * 0.9 + x * 3.1) * 0.65 + Math.sin(time * 0.53 + x * 7.3 + 1.7) * 0.35) : 0;
      const wz = this.breeze ? WIND * 0.7 * Math.sin(time * 0.71 + x * 4.7 + 0.6) : 0;
      for (let k = 1; k < NODES; k++) {
        const o = (r * NODES + k) * 3;
        for (let c = 0; c < 3; c++) {
          const p = pos[o + c];
          const v = (p - prev[o + c]) * DAMPING;
          const a = -HOME * (p - rest[o + c]) + (c === 0 ? wx : c === 1 ? -GRAVITY : wz);
          prev[o + c] = p;
          pos[o + c] = p + v + a * dt2;
          maxMove = Math.max(maxMove, Math.abs(v));
        }
        if (pos[o + 1] < 0.004) pos[o + 1] = 0.004; // floor
        if (this.halfWidth > 0) pos[o] = Math.max(-this.halfWidth, Math.min(this.halfWidth, pos[o]));
      }
    }
    return maxMove;
  }

  /** Held nodes follow the pointer; nearby ropes follow with less weight. A pulled rope may stretch a little. */
  private applyHands(): void {
    const d = this.delta;
    const target = new THREE.Vector3();
    for (const h of this.held) {
      target.copy(h.start).addScaledVector(d, h.weight);
      // Keep the target within the rope's reach from the rail, allowing a little stretch.
      const rope = Math.floor(h.index / NODES);
      const node = h.index - rope * NODES;
      const a = rope * NODES * 3;
      const ax = this.rest[a];
      const ay = this.rest[a + 1];
      const az = this.rest[a + 2];
      const length = node * this.seg;
      const reach = length * (1 + STRETCH) * 0.999;
      let dist = Math.hypot(target.x - ax, target.y - ay, target.z - az);
      if (dist > reach) {
        target.set(ax + ((target.x - ax) * reach) / dist, ay + ((target.y - ay) * reach) / dist, az + ((target.z - az) * reach) / dist);
        dist = reach;
      }
      target.y = Math.max(0.004, target.y); // floor
      dist = Math.hypot(target.x - ax, target.y - ay, target.z - az);
      // Segments above the hand lengthen just enough to reach it, so those beads spread evenly.
      if (dist > length) {
        this.stretch[rope] = Math.max(this.stretch[rope], dist / length);
        this.stretchTo[rope] = node;
      }

      const o = h.index * 3;
      const w = h.weight >= 0.999 ? 1 : h.weight * 0.6;
      this.pos[o] += (target.x - this.pos[o]) * w;
      this.pos[o + 1] += (target.y - this.pos[o + 1]) * w;
      this.pos[o + 2] += (target.z - this.pos[o + 2]) * w;
    }
  }

  /** Keep every segment at its length; the top node stays on the rail and a held node stays in the hand. */
  private solve(): void {
    const { pos, rest, n, seg } = this;
    const pinned = this.held.length && this.held[0].weight >= 0.999 ? this.held[0].index : -1;
    for (let r = 0; r < n; r++) {
      const base = r * NODES;
      const stretched = seg * this.stretch[r];
      const stretchTo = this.stretchTo[r];
      pos[base * 3] = rest[base * 3];
      pos[base * 3 + 1] = rest[base * 3 + 1];
      pos[base * 3 + 2] = rest[base * 3 + 2];
      for (let k = 0; k < NODES - 1; k++) {
        const i = base + k;
        const j = i + 1;
        const a = i * 3;
        const b = j * 3;
        const dx = pos[b] - pos[a];
        const dy = pos[b + 1] - pos[a + 1];
        const dz = pos[b + 2] - pos[a + 2];
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
        const diff = (len - (k < stretchTo ? stretched : seg)) / len;
        const fixA = k === 0 || i === pinned;
        const fixB = j === pinned;
        if (fixA && fixB) continue;
        const wa = fixA ? 0 : fixB ? 1 : 0.5;
        const wb = fixB ? 0 : fixA ? 1 : 0.5;
        pos[a] += dx * diff * wa;
        pos[a + 1] += dy * diff * wa;
        pos[a + 2] += dz * diff * wa;
        pos[b] -= dx * diff * wb;
        pos[b + 1] -= dy * diff * wb;
        pos[b + 2] -= dz * diff * wb;
      }
    }
  }

  private upload(): void {
    const tex = this.uniforms.uDisp.value;
    const data = tex.image.data as Float32Array;
    const { pos, rest } = this;
    const count = this.n * NODES;
    for (let i = 0; i < count; i++) {
      data[i * 4] = pos[i * 3] - rest[i * 3];
      data[i * 4 + 1] = pos[i * 3 + 1] - rest[i * 3 + 1];
      data[i * 4 + 2] = pos[i * 3 + 2] - rest[i * 3 + 2];
    }
    tex.needsUpdate = true;
    this.uniforms.uActive.value = 1;
  }

  // ------------------------------------------------------------ hands

  /** Rope point closest to the pointer (in screen pixels), if within reach. */
  pick(camera: THREE.Camera, ndc: THREE.Vector2, width: number, height: number, maxPx: number): GrabTarget | null {
    if (!this.interactive) return null;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const px = ((ndc.x + 1) / 2) * width;
    const py = ((1 - ndc.y) / 2) * height;
    let best: GrabTarget | null = null;
    let bestD = maxPx;
    for (let r = 0; r < this.n; r++) {
      let prevX = 0;
      let prevY = 0;
      let prevOk = false;
      for (let k = 0; k < NODES; k++) {
        const o = (r * NODES + k) * 3;
        a.set(this.pos[o], this.pos[o + 1], this.pos[o + 2]).project(camera);
        const x = ((a.x + 1) / 2) * width;
        const y = ((1 - a.y) / 2) * height;
        const ok = a.z < 1;
        if (k > 0 && ok && prevOk) {
          // distance from the pointer to this segment on screen
          const sx = x - prevX;
          const sy = y - prevY;
          const t = Math.max(0, Math.min(1, ((px - prevX) * sx + (py - prevY) * sy) / (sx * sx + sy * sy || 1)));
          const dx = prevX + sx * t - px;
          const dy = prevY + sy * t - py;
          const dist = Math.hypot(dx, dy);
          if (dist < bestD) {
            bestD = dist;
            const node = Math.max(1, t < 0.5 ? k - 1 : k);
            const q = (r * NODES + node) * 3;
            b.set(this.pos[q], this.pos[q + 1], this.pos[q + 2]);
            best = { rope: r, node, point: b.clone() };
          }
        }
        prevX = x;
        prevY = y;
        prevOk = ok;
      }
    }
    return best;
  }

  /**
   * Grab a rope at a node. Every rope within the hand's reach comes along at its
   * point nearest the cursor, pulled less the further that point is from the
   * cursor (smooth radial falloff). One point per rope keeps each rope a single
   * smooth curve and gives each rope one place where it can stretch.
   */
  beginGrab(target: GrabTarget, ray: THREE.Ray, camera: THREE.Camera): void {
    const viewDir = new THREE.Vector3();
    camera.getWorldDirection(viewDir);
    this.dragPlane.setFromNormalAndCoplanarPoint(viewDir, target.point);
    if (!ray.intersectPlane(this.dragPlane, this.dragStart)) this.dragStart.copy(target.point);
    this.delta.set(0, 0, 0);

    const reach = Math.max(HAND_REACH, this.uniforms.uPitch.value * 6.6);
    const grabbed = target.rope * NODES + target.node;
    const p = target.point;
    this.held = [];
    for (let r = 0; r < this.n; r++) {
      let index = -1;
      let dist = Infinity;
      if (r === target.rope) {
        index = grabbed;
        dist = 0;
      } else {
        for (let k = 1; k < NODES; k++) {
          const o = (r * NODES + k) * 3;
          const d = Math.hypot(this.pos[o] - p.x, this.pos[o + 1] - p.y, this.pos[o + 2] - p.z);
          if (d < dist) {
            dist = d;
            index = r * NODES + k;
          }
        }
        if (dist > reach) continue;
      }
      const o = index * 3;
      const f = 1 - (dist / reach) ** 2;
      this.held.push({ index, weight: index === grabbed ? 1 : f * f, start: new THREE.Vector3(this.pos[o], this.pos[o + 1], this.pos[o + 2]) });
    }
    this.held.sort((a, b) => b.weight - a.weight); // the grabbed point first
    this.awake = true;
  }

  moveGrab(ray: THREE.Ray): void {
    if (!this.dragging) return;
    const hit = new THREE.Vector3();
    if (!ray.intersectPlane(this.dragPlane, hit)) return;
    this.delta.subVectors(hit, this.dragStart);
    if (this.delta.length() > this.maxReach) this.delta.setLength(this.maxReach);
  }

  endGrab(): void {
    this.held = [];
  }
}
