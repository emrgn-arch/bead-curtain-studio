import * as THREE from 'three';

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

/** Soft limewash plaster: low-contrast blotches, tiles seamlessly enough at wall scale. */
export function plasterTexture(): THREE.CanvasTexture {
  const size = 512;
  const [c, g] = canvas(size);
  const r = rng(7);
  g.fillStyle = '#f2f2f2';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i++) {
    const x = r() * size;
    const y = r() * size;
    const rad = 8 + r() * 60;
    const v = r() < 0.5 ? 255 : 205;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, `rgba(${v},${v},${v},${0.05 + r() * 0.06})`);
    grad.addColorStop(1, `rgba(${v},${v},${v},0)`);
    g.fillStyle = grad;
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
      g.save();
      g.translate(dx, dy);
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      g.restore();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Oiled oak planks running towards the doorway. One texture tile = 2 m × 2 m. */
export function floorTexture(): THREE.CanvasTexture {
  const size = 1024;
  const [c, g] = canvas(size);
  const r = rng(42);
  const plankW = size / 12;
  for (let p = 0; p < 12; p++) {
    const x0 = p * plankW;
    let y = -r() * size;
    while (y < size) {
      const len = size * (0.45 + r() * 0.6);
      const hue = 26 + r() * 8;
      const light = 47 + r() * 12;
      g.fillStyle = `hsl(${hue}, ${38 + r() * 12}%, ${light}%)`;
      g.fillRect(x0, y, plankW, len);
      // grain
      for (let k = 0; k < 26; k++) {
        const gx = x0 + r() * plankW;
        g.strokeStyle = `hsla(${hue - 4}, 40%, ${light - 14 - r() * 10}%, ${0.08 + r() * 0.14})`;
        g.lineWidth = 0.6 + r() * 1.6;
        g.beginPath();
        g.moveTo(gx, y);
        g.bezierCurveTo(gx + (r() - 0.5) * 8, y + len * 0.33, gx + (r() - 0.5) * 8, y + len * 0.66, gx + (r() - 0.5) * 6, y + len);
        g.stroke();
      }
      g.fillStyle = 'rgba(40,22,10,0.55)';
      g.fillRect(x0, y + len - 1.5, plankW, 1.5);
      y += len;
    }
    g.fillStyle = 'rgba(40,22,10,0.6)';
    g.fillRect(x0, 0, 1.5, size);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
