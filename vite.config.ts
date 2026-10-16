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

export default defineConfig({
  base: './',
  plugins: [classicScript()],
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
