// Strands — © 2026 Emre Ergin (emrgn-arch) · https://github.com/emrgn-arch/bead-curtain-studio
import * as THREE from 'three';
import type { Placement } from '../core/image';
import type { Layout } from '../core/layout';

const MM = 0.001;

/**
 * The uploaded image floating in front of the curtain while it is being placed.
 * Inside the beaded area it is drawn strongly; outside it is ghosted.
 */
export class Overlay {
  readonly group = new THREE.Group();
  private texture: THREE.CanvasTexture | null = null;
  private innerMat: THREE.MeshBasicMaterial;
  private outerMat: THREE.MeshBasicMaterial;
  private inner: THREE.Mesh;
  private outer: THREE.Mesh;
  private outline: THREE.LineLoop;
  private innerPlanes = [new THREE.Plane(), new THREE.Plane(), new THREE.Plane(), new THREE.Plane()];
  private outerPlanes = [new THREE.Plane(), new THREE.Plane(), new THREE.Plane(), new THREE.Plane()];
  /** World z of the image plane (used for pointer picking). */
  z = 0.03;

  constructor() {
    const common = { transparent: true, depthTest: false, depthWrite: false, toneMapped: false, side: THREE.DoubleSide } as const;
    this.innerMat = new THREE.MeshBasicMaterial({ ...common, clippingPlanes: this.innerPlanes });
    this.outerMat = new THREE.MeshBasicMaterial({ ...common, clippingPlanes: this.outerPlanes, clipIntersection: true });
    const plane = new THREE.PlaneGeometry(1, 1);
    this.inner = new THREE.Mesh(plane, this.innerMat);
    this.outer = new THREE.Mesh(plane, this.outerMat);
    this.outer.renderOrder = 10;
    this.inner.renderOrder = 11;

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3));
    this.outline = new THREE.LineLoop(lineGeo, new THREE.LineDashedMaterial({ color: 0x111111, dashSize: 0.025, gapSize: 0.015, depthTest: false, transparent: true, toneMapped: false }));
    this.outline.renderOrder = 12;
    this.group.add(this.outer, this.inner, this.outline);
    this.group.visible = false;
  }

  setImage(canvas: HTMLCanvasElement | null): void {
    if (this.texture && this.texture.image === canvas) return;
    this.texture?.dispose();
    this.texture = null;
    if (canvas) {
      this.texture = new THREE.CanvasTexture(canvas);
      this.texture.colorSpace = THREE.SRGBColorSpace;
      this.texture.anisotropy = 4;
    }
    this.innerMat.map = this.texture;
    this.outerMat.map = this.texture;
    this.innerMat.needsUpdate = true;
    this.outerMat.needsUpdate = true;
  }

  update(layout: Layout, placement: Placement | null, opacity: number): void {
    const x0 = layout.gridLeft * MM;
    const x1 = layout.gridRight * MM;
    const y0 = layout.gridBottom * MM;
    const y1 = layout.gridTop * MM;
    this.z = (layout.beadOD / 2 + 6) * MM;

    // Keep-inside planes, and keep-outside planes (combined with clipIntersection).
    this.innerPlanes[0].set(new THREE.Vector3(1, 0, 0), -x0);
    this.innerPlanes[1].set(new THREE.Vector3(-1, 0, 0), x1);
    this.innerPlanes[2].set(new THREE.Vector3(0, 1, 0), -y0);
    this.innerPlanes[3].set(new THREE.Vector3(0, -1, 0), y1);
    this.outerPlanes[0].set(new THREE.Vector3(-1, 0, 0), x0);
    this.outerPlanes[1].set(new THREE.Vector3(1, 0, 0), -x1);
    this.outerPlanes[2].set(new THREE.Vector3(0, -1, 0), y0);
    this.outerPlanes[3].set(new THREE.Vector3(0, 1, 0), -y1);

    const pos = this.outline.geometry.getAttribute('position') as THREE.BufferAttribute;
    const z = this.z + 0.001;
    pos.setXYZ(0, x0, y0, z);
    pos.setXYZ(1, x1, y0, z);
    pos.setXYZ(2, x1, y1, z);
    pos.setXYZ(3, x0, y1, z);
    pos.needsUpdate = true;
    this.outline.computeLineDistances();

    const hasImage = placement !== null && this.texture !== null;
    this.inner.visible = this.outer.visible = hasImage;
    if (placement) {
      for (const m of [this.inner, this.outer]) {
        m.position.set(placement.cx * MM, placement.cy * MM, this.z);
        m.scale.set(placement.w * MM, placement.h * MM, 1);
      }
    }
    this.innerMat.opacity = opacity;
    this.outerMat.opacity = opacity * 0.38;
  }

  set visible(v: boolean) {
    this.group.visible = v;
  }

  get visible(): boolean {
    return this.group.visible;
  }
}
