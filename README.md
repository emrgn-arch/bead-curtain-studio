# Strands — Bead Curtain Studio

Design a 3D-printed bead curtain for a doorway or window from any picture. Ropes
are spread evenly across the opening, the picture is sampled onto them, and each
rope gets a column of cylindrical beads in matching colours and lengths. The app
works out a bill of materials and a per-rope stringing guide. It also exports
print-ready trays for Bambu Studio. The interface is available in English and
Turkish (switch at the top right).

## For customers (no installation)

1. Unzip `strands-bead-curtain.zip`.
2. Double-click **`index.html`**. It opens in Chrome, Edge, Firefox or Safari.

That's it. No Node, no server, and no internet connection needed. Settings, the
last uploaded picture and your filament list are saved in the browser
automatically. Under **Colours → My filaments** you can export the filament list
to a file, then import it on another computer.

## For developers

You need [Node.js](https://nodejs.org) 20 or newer. You only need it to *build*
the app, not to run it.

```bash
npm install        # once
npm run dev        # live-reloading dev server at http://localhost:5173
npm run build      # writes the customer folder to dist/ (index.html, app.js, app.css)
npm run package    # build + zip it to release/strands-bead-curtain.zip
```

The build is a classic (non-module) script with the fonts inlined, so `dist/`
opens straight from disk. Browsers block ES modules on `file://`, which is why
there is a build step.

## How it works

| Step | File | What happens |
| --- | --- | --- |
| Layout | `src/core/layout.ts` | Ropes are placed on a pitch grid and centred. Bead Ø = pitch − bead gap, and hole Ø = rope Ø + clearance. The shortest bead (5–100 mm) is also the vertical sample size. |
| Sampling | `src/core/image.ts` | The placed image is supersampled onto the rope × row grid and averaged in linear light. |
| Colours | `src/core/quantize.ts` | Colours are matched in OKLab. **Ideal colours** (the default) runs k-means on the image. **My filaments** picks the best ≤ N colours from the user's own filament list (greedy selection plus swap refinement). Floyd–Steinberg dithering is optional. |
| Lengths | `src/core/lengths.ts` | "Number of lengths" values are spread evenly between the shortest and the longest bead, each a whole multiple of the shortest. Same-colour runs on a rope are built from those lengths by a DP table with the fewest beads, so every run fits exactly. |
| Pipeline | `src/core/design.ts` | Chains the stages, memoising each one so dragging the image only recomputes what changed. |
| 3D | `src/scene/*` | three.js: one InstancedMesh per bead length, chamfered tube geometry with a real bore, and a warm room with three lighting moods. The optional rope sway runs in the vertex shader, including the shadow pass. |
| Print trays | `src/core/trays.ts`, `src/core/zip.ts` | Beads are hex-packed upright on Bambu Lab plates (X1/P1/A1, A1 mini, H2D), one colour per tray. Each tray is a 3MF with one watertight mesh per length, placed as components. The zip also holds one bead per length and a README. |
| Language | `src/i18n.ts` | English and Turkish string tables (TypeScript checks that both have every key). Switching rebuilds the UI live. |
| UI | `src/ui/*`, `src/styles.css` | Plain TypeScript and DOM, with no framework. |

All dimensions are in millimetres. The filament estimate assumes solid beads in
PLA (1.24 g/cm³).
