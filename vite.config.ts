// Strands — © 2026 Emre Ergin (emrgn-arch) · https://github.com/emrgn-arch/bead-curtain-studio
import { defineConfig, type Plugin } from 'vite';

/**
 * Browsers refuse to load ES modules from file://, so the production build is a
 * classic script. That way the dist folder opens with a plain double-click —
 * no Node, no server, no internet.
 */
function classicScript(): Plugin {
  return {
    name: 'classic-script',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: (html) =>
        html
          .replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/g, '<script defer src="$1"></script>')
          .replace(/<link rel="stylesheet" crossorigin /g, '<link rel="stylesheet" '),
    },
  };
}

/** Copyright banner at the top of the built app.js and app.css (survives minification). */
function banner(): Plugin {
  const text = '/*! Strands - (c) 2026 Emre Ergin (emrgn-arch) - https://github.com/emrgn-arch/bead-curtain-studio - All rights reserved. */\n';
  return {
    name: 'banner',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === 'chunk') file.code = text + file.code;
        else if (file.fileName.endsWith('.css') && typeof file.source === 'string') file.source = text + file.source;
      }
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [classicScript(), banner()],
  server: { port: 5173 },
  build: {
    target: 'es2022',
    modulePreload: false,
    cssCodeSplit: false,
    // Inline fonts into app.css so the folder stays three files.
    assetsInlineLimit: 10_000_000,
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      output: {
        format: 'iife',
        entryFileNames: 'app.js',
        assetFileNames: 'app[extname]',
      },
    },
  },
});
