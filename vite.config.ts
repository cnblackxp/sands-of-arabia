import { defineConfig } from 'vite';

// The generated assets/ folder is served as the public root, so
// assets/characters/person.glb is fetched as /characters/person.glb.
export default defineConfig({
  // Relative base so the build works on GitHub Pages under /sands-of-arabia/.
  base: './',
  publicDir: 'assets',
  server: { port: 5173, strictPort: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 3000 },
});
