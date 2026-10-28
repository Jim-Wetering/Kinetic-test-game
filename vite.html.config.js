import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// standalone browser build: inlines all JS, CSS and fonts into one dist-html/index.html
// kept separate from vite.config.js so the desktop app build is unaffected
export default defineConfig({
  plugins: [viteSingleFile()],
  build: { outDir: 'dist-html', chunkSizeWarningLimit: 2000 },
});
