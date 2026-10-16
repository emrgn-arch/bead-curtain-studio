import * as THREE from 'three';
import { hexToLinear } from '../core/color';
import type { Design } from '../core/design';
import { makeBeadGeometry } from './beadGeometry';

const MM = 0.001;

/** Uniforms shared by every swaying material. Amplitude is in metres at the bottom of the curtain. */
export interface SwayUniforms {
  uTime: { value: number };
  uAmp: { value: number };
  uRailY: { value: number };
  uDrop: { value: number };
}

// Each rope swings like a pendulum from the rail: the offset grows linearly with
// depth, so beads stay on their (straight) rope. Phase follows the rope's x so
// neighbours move almost together, like a soft breeze passing through.
const SWAY_VERTEX = /* glsl */ `
vec4 mvPosition = vec4( transformed, 1.0 );
float swayX = 0.0;
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
  swayX = instanceMatrix[3].x;
#endif
float swayDepth = clamp( ( uRailY - mvPosition.y ) / uDrop, 0.0, 1.2 );
float swayA = sin( uTime * 1.15 + swayX * 3.1 ) * 0.65 + sin( uTime * 0.67 + swayX * 7.3 + 1.7 ) * 0.35;
float swayB = sin( uTime * 0.83 + swayX * 4.7 + 0.6 );
mvPosition.x += uAmp * swayDepth * swayA;
mvPosition.z += uAmp * 0.7 * swayDepth * swayB;
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;
`;

function withSway<M extends THREE.Material>(mat: M, u: SwayUniforms): M {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uTime;
uniform float uAmp;
uniform float uRailY;
uniform float uDrop;`)
      .replace('#include <project_vertex>', SWAY_VERTEX);
  };
  mat.customProgramCacheKey = () => 'sway';
  return mat;
}

interface BeadBatch {
  key: string;
  geometry: THREE.BufferGeometry;
  mesh: THREE.InstancedMesh;
  cap: number;
}

function writeTranslation(arr: Float32Array | ArrayLike<number>, i: number, x: number, y: number, z: number, sy = 1): void {
  const a = arr as Float32Array;
  const o = i * 16;
  a[o] = 1; a[o + 1] = 0; a[o + 2] = 0; a[o + 3] = 0;
  a[o + 4] = 0; a[o + 5] = sy; a[o + 6] = 0; a[o + 7] = 0;
  a[o + 8] = 0; a[o + 9] = 0; a[o + 10] = 1; a[o + 11] = 0;
  a[o + 12] = x; a[o + 13] = y; a[o + 14] = z; a[o + 15] = 1;
}

/** Rail, ropes, knots and beads — beads are one InstancedMesh per bead length. */
export class Curtain {
  readonly group = new THREE.Group();
  readonly sway: SwayUniforms = { uTime: { value: 0 }, uAmp: { value: 0 }, uRailY: { value: 2 }, uDrop: { value: 2 } };
  private beadMat = withSway(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0 }), this.sway);
  private ropeMat = withSway(new THREE.MeshStandardMaterial({ color: '#d9c7a5', roughness: 0.95 }), this.sway);
  /** Shadow pass material that sways the same way, so shadows follow the ropes. */
  private depthMat = withSway(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), this.sway);
  private railMat = new THREE.MeshStandardMaterial({ color: '#8f5f39', roughness: 0.42 });
  private batches: BeadBatch[] = [];
  private ropes: { mesh: THREE.InstancedMesh; cap: number; r: number } | null = null;
  private knots: { mesh: THREE.InstancedMesh; cap: number; r: number } | null = null;
  private rail: THREE.Mesh | null = null;
  private railKey = '';

  setRailColor(hex: string): void {
    this.railMat.color.set(hex);
  }

  update(d: Design, ropeColor: string): void {
    const L = d.layout;
    this.ropeMat.color.set(ropeColor);
    this.sway.uRailY.value = L.railY * MM;
    this.sway.uDrop.value = Math.max(0.2, (L.railY - L.zoneBottom) * MM);
    this.updateRail(L.W, L.railY);
    this.updateBeads(d);
    this.updateRopes(d);
  }

  private updateRail(W: number, railY: number): void {
    const key = `${W}|${railY}`;
    if (key === this.railKey) return;
    this.railKey = key;
    if (this.rail) {
      this.group.remove(this.rail);
      this.rail.geometry.dispose();
    }
    const g = new THREE.CylinderGeometry(0.011, 0.011, W * MM - 0.002, 32);
    g.rotateZ(Math.PI / 2);
    this.rail = new THREE.Mesh(g, this.railMat);
    this.rail.position.set(0, railY * MM, 0);
    this.rail.castShadow = true;
    this.rail.receiveShadow = true;
    this.group.add(this.rail);
  }

  private updateBeads(d: Design): void {
    const L = d.layout;
    const n = d.beadCount;
    const seg = n > 90_000 ? 10 : n > 45_000 ? 14 : n > 18_000 ? 18 : 24;
    const R = (L.beadOD / 2) * MM;
    const r = (L.hole / 2) * MM;

    const counts = new Array(d.lengths.length).fill(0);
    for (let k = 0; k < n; k++) counts[d.bLen[k]]++;

    // Make sure there is one batch per length with enough capacity.
    d.lengths.forEach((len, li) => {
      const key = `${len}|${R}|${r}|${seg}`;
      let b = this.batches[li];
      if (b && b.key !== key) {
        this.group.remove(b.mesh);
        b.mesh.dispose();
        b.geometry.dispose();
        b = undefined as unknown as BeadBatch;
      }
      if (!b || b.cap < counts[li]) {
        const geometry = b ? b.geometry : makeBeadGeometry(len * MM, R, r, seg);
        if (b) {
          this.group.remove(b.mesh);
          b.mesh.dispose();
        }
        const cap = Math.ceil(counts[li] * 1.3) + 64;
        const mesh = new THREE.InstancedMesh(geometry, this.beadMat, cap);
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        mesh.customDepthMaterial = this.depthMat;
        this.group.add(mesh);
        b = { key, geometry, mesh, cap };
      }
      this.batches[li] = b;
    });
    for (const extra of this.batches.splice(d.lengths.length)) {
      this.group.remove(extra.mesh);
      extra.mesh.dispose();
      extra.geometry.dispose();
    }

    const palette = d.palette.map((p) => hexToLinear(p.hex));
    const cursor = new Int32Array(d.lengths.length);
    for (let k = 0; k < n; k++) {
      const li = d.bLen[k];
      const b = this.batches[li];
      const i = cursor[li]++;
      writeTranslation(b.mesh.instanceMatrix.array, i, d.layout.ropeX[d.bRope[k]] * MM, d.bY[k] * MM, 0);
      const c = palette[d.bColor[k]];
      const ca = b.mesh.instanceColor!.array as Float32Array;
      ca[i * 3] = c[0];
      ca[i * 3 + 1] = c[1];
      ca[i * 3 + 2] = c[2];
    }
    this.batches.forEach((b, li) => {
      b.mesh.count = counts[li];
      b.mesh.instanceMatrix.needsUpdate = true;
      b.mesh.instanceColor!.needsUpdate = true;
    });
  }

  private ensure(slot: 'ropes' | 'knots', count: number, r: number, make: (r: number) => THREE.BufferGeometry) {
    let s = this[slot];
    if (!s || s.cap < count || s.r !== r) {
      if (s) {
        this.group.remove(s.mesh);
        s.mesh.geometry.dispose();
        s.mesh.dispose();
      }
      const cap = Math.ceil(count * 1.3) + 16;
      const mesh = new THREE.InstancedMesh(make(r), this.ropeMat, cap);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.customDepthMaterial = this.depthMat;
      this.group.add(mesh);
      s = { mesh, cap, r };
      this[slot] = s;
    }
    s.mesh.count = count;
    return s.mesh;
  }

  private updateRopes(d: Design): void {
    const L = d.layout;
    const rr = (L.ropeD / 2) * MM;
    const ropes = this.ensure('ropes', L.n, rr, (r) => new THREE.CylinderGeometry(r, r, 1, 8, 1, true));
    const top = (L.railY + 8) * MM; // loops over the rail
    for (let i = 0; i < L.n; i++) {
      const bottom = d.ropeBottom[i] * MM;
      writeTranslation(ropes.instanceMatrix.array, i, L.ropeX[i] * MM, (top + bottom) / 2, 0, Math.max(0.001, top - bottom));
    }
    ropes.instanceMatrix.needsUpdate = true;

    const knots = this.ensure('knots', d.knotCount, rr * 1.35, (r) => new THREE.SphereGeometry(r, 10, 8));
    for (let k = 0; k < d.knotCount; k++) {
      writeTranslation(knots.instanceMatrix.array, k, L.ropeX[d.knotRope[k]] * MM, d.knotY[k] * MM, 0);
    }
    knots.instanceMatrix.needsUpdate = true;
  }
}
