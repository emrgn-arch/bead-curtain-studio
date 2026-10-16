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

/** White studio backdrop; the curtain hangs freely from its rail in front of it. */
export class Studio {
  readonly group = new THREE.Group();

  constructor() {
    const sweep = new THREE.Mesh(sweepGeometry(), new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.96 }));
    sweep.receiveShadow = true;
    this.group.add(sweep);
  }
}
