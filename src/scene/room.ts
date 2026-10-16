import * as THREE from 'three';
import { floorTexture, plasterTexture } from './textures';

export const WALL_T = 0.14; // wall thickness, m

/** The wall with the opening, door casing, floor and a softly lit room behind. */
export class Room {
  readonly group = new THREE.Group();
  private built = new THREE.Group();
  private wallMat: THREE.MeshStandardMaterial;
  private backMat: THREE.MeshStandardMaterial;
  private casingMat: THREE.MeshStandardMaterial;
  private floorMat: THREE.MeshStandardMaterial;
  /** Invisible, but casts shadows — keeps the key light out of the back room. */
  private shadowOnly = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  private key = '';

  constructor(anisotropy: number) {
    const plaster = plasterTexture();
    plaster.repeat.set(1.5, 1.5);
    this.wallMat = new THREE.MeshStandardMaterial({ color: '#e4d2bc', map: plaster, roughness: 0.94 });
    const backPlaster = plaster.clone();
    backPlaster.needsUpdate = true;
    this.backMat = new THREE.MeshStandardMaterial({ color: '#c99c78', map: backPlaster, roughness: 0.95, side: THREE.BackSide });
    this.casingMat = new THREE.MeshStandardMaterial({ color: '#8a5a36', roughness: 0.55 });

    const floor = floorTexture();
    floor.anisotropy = anisotropy;
    floor.repeat.set(7, 7);
    this.floorMat = new THREE.MeshStandardMaterial({ map: floor, roughness: 0.62 });

    const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), this.floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    this.group.add(floorMesh, this.built);
  }

  /** Rebuild wall geometry for a doorway W × H (m). */
  build(W: number, H: number): void {
    const key = `${W}|${H}`;
    if (key === this.key) return;
    this.key = key;
    for (const child of [...this.built.children]) {
      this.built.remove(child);
      (child as THREE.Mesh).geometry.dispose();
    }

    const wallH = Math.max(2.8, H + 0.6);
    const side = 3.2;
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, cast = true) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = cast;
      m.receiveShadow = true;
      this.built.add(m);
      return m;
    };

    // Wall around the opening.
    box(side, wallH, WALL_T, -W / 2 - side / 2, wallH / 2, 0, this.wallMat);
    box(side, wallH, WALL_T, W / 2 + side / 2, wallH / 2, 0, this.wallMat);
    box(W, wallH - H, WALL_T, 0, H + (wallH - H) / 2, 0, this.wallMat);

    // Casing (architrave) on the front face.
    const cw = 0.07;
    const cd = 0.02;
    const zc = WALL_T / 2 + cd / 2;
    box(cw, H + cw, cd, -W / 2 - cw / 2, (H + cw) / 2, zc, this.casingMat);
    box(cw, H + cw, cd, W / 2 + cw / 2, (H + cw) / 2, zc, this.casingMat);
    box(W + 2 * cw, cw, cd, 0, H + cw / 2, zc, this.casingMat);

    // Skirting board either side.
    const sk = 0.09;
    const skz = WALL_T / 2 + 0.008;
    const skW = side - cw;
    box(skW, sk, 0.016, -W / 2 - cw - skW / 2, sk / 2, skz, this.casingMat, false);
    box(skW, sk, 0.016, W / 2 + cw + skW / 2, sk / 2, skz, this.casingMat, false);

    // Room behind the opening (inside-out box, seen through the doorway).
    const depth = 3.6;
    const backW = Math.max(4.5, W + 3);
    const back = new THREE.Mesh(new THREE.BoxGeometry(backW, wallH, depth), this.backMat);
    back.position.set(0, wallH / 2 - 0.002, -WALL_T / 2 - depth / 2 - 0.001);
    back.receiveShadow = true;
    this.built.add(back);
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(backW + 1, 0.1, depth + WALL_T), this.shadowOnly);
    ceiling.position.set(0, wallH + 0.05, -depth / 2);
    ceiling.castShadow = true;
    this.built.add(ceiling);
  }
}
