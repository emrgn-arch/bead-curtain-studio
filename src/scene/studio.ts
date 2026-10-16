import * as THREE from 'three';

/** Floor that curves up into the back wall (a photo-studio "cyclorama"), so there is no visible corner. */
function sweepGeometry(): THREE.BufferGeometry {
  const prof: [number, number][] = [[12, 0], [-1.8, 0]]; // [z, y]
  const R = 2.4;
  for (let i = 1; i <= 32; i++) {
    const a = (i / 32) * (Math.PI / 2);
    prof.push([-1.8 - R * Math.sin(a), R - R * Math.cos(a)]);
  }
  prof.push([-1.8 - R, 10]);

  const half = 16;
  const pos: number[] = [];
  for (const [z, y] of prof) pos.push(-half, y, z, half, y, z);
  const idx: number[] = [];
  for (let i = 0; i < prof.length - 1; i++) {
    const a = 2 * i;
    idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** White studio backdrop with a slim black display frame the curtain hangs in. */
export class Studio {
  readonly group = new THREE.Group();
  private frame = new THREE.Group();
  private frameMat = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.5, metalness: 0.15 });
  private key = '';

  constructor() {
    const sweep = new THREE.Mesh(sweepGeometry(), new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.96 }));
    sweep.receiveShadow = true;
    this.group.add(sweep, this.frame);
  }

  /** Frame around an opening W × H (m): two posts with feet and a top beam. */
  build(W: number, H: number): void {
    const key = `${W}|${H}`;
    if (key === this.key) return;
    this.key = key;
    for (const child of [...this.frame.children]) {
      this.frame.remove(child);
      (child as THREE.Mesh).geometry.dispose();
    }
    const s = 0.022; // profile size
    const box = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.frameMat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      this.frame.add(m);
    };
    const px = W / 2 + s / 2 + 0.006;
    for (const x of [-px, px]) {
      box(s, H + s, s, x, (H + s) / 2, 0);
      box(s, s * 0.6, 0.42, x, s * 0.3, 0); // foot
    }
    box(2 * px + s, s, s, 0, H + s / 2, 0);
  }
}
