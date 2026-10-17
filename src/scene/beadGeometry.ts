// Strands — © 2026 Emre Ergin (emrgn-arch) · https://github.com/emrgn-arch/bead-curtain-studio
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { chamferSize } from '../core/layout';

function flipInward(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const index = g.getIndex()!;
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i + 1);
    index.setX(i + 1, index.getX(i + 2));
    index.setX(i + 2, a);
  }
  const n = g.getAttribute('normal');
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return g;
}

/**
 * A printed tube bead: outer wall with chamfered (bevelled) edges, flat annular
 * ends and an inner bore. Built from separate parts so every edge keeps a crisp
 * normal. Dimensions in metres; the bead is centred on the origin, axis along +Y.
 */
export function makeBeadGeometry(length: number, outerR: number, innerR: number, segments: number, chamfer: number): THREE.BufferGeometry {
  const { w, h } = chamferSize(chamfer, length, outerR - innerR);
  const half = length / 2;
  const parts: THREE.BufferGeometry[] = [];

  const wall = new THREE.CylinderGeometry(outerR, outerR, Math.max(1e-5, length - 2 * h), segments, 1, true);
  parts.push(wall);

  if (w > 1e-5) {
    const topCh = new THREE.CylinderGeometry(outerR - w, outerR, h, segments, 1, true);
    topCh.translate(0, half - h / 2, 0);
    const botCh = new THREE.CylinderGeometry(outerR, outerR - w, h, segments, 1, true);
    botCh.translate(0, -half + h / 2, 0);
    parts.push(topCh, botCh);
  }

  const topFace = new THREE.RingGeometry(innerR, outerR - w, segments, 1);
  topFace.rotateX(-Math.PI / 2);
  topFace.translate(0, half, 0);
  const botFace = new THREE.RingGeometry(innerR, outerR - w, segments, 1);
  botFace.rotateX(Math.PI / 2);
  botFace.translate(0, -half, 0);
  parts.push(topFace, botFace);

  parts.push(flipInward(new THREE.CylinderGeometry(innerR, innerR, length, Math.max(6, segments >> 1), 1, true)));

  // RingGeometry and CylinderGeometry share position/normal/uv, so they merge cleanly.
  const merged = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return merged;
}
