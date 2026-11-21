import { defineConfig } from 'vite';
import { resolve } from 'path';
import { execSync } from 'child_process';

let version;
try {
  // Exactly on a tag: use the clean tag name (e.g. "0.3.1").
  version = execSync('git describe --tags --exact-match')
    .toString()
    .trim()
    .replace(/^v/, '');
} catch {
  try {
    // Between tags: tag + commit count + hash (e.g. "0.3.1-2-gabc1234").
    version = execSync('git describe --tags --long --always')
      .toString()
      .trim()
      .replace(/^v/, '');
  } catch {
    version = '0.0.0-development';
  }
}

// Restarts the dev server when pnpm-lock.yaml changes. A dependency bump moves
// gtfs-zone-web-common to a new store path, and cached transforms (mainly the
// shared stylesheet's CSS @import) keep serving the old copy until a restart.
const restartOnLockfile = {
  name: 'restart-on-lockfile',
  apply: 'serve',
  configureServer(server) {
    const lockfile = resolve(__dirname, 'pnpm-lock.yaml');
    server.watcher.add(lockfile);
    server.watcher.on('change', (file) => {
      if (file === lockfile) {
        server.config.logger.info(
          '[restart-on-lockfile] pnpm-lock.yaml changed, restarting'
        );
        void server.restart();
      }
    });
  },
};

export default defineConfig({
  plugins: [restartOnLockfile],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  root: 'src',
  publicDir: '../public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/index.html'),
    },
  },
  server: {
    port: 8090,
    open: true,
    host: true,
  },
  css: {
    postcss: './postcss.config.js',
  },
  resolve: {
    alias: {
      'gtfs-zone-web-common': resolve(
        __dirname,
        'node_modules/gtfs-zone-web-common/src'
      ),
    },
  },
  worker: {
    format: 'es',
  },
  test: {
    root: '.',
    include: ['tests/**/*.test.ts'],
  },
  optimizeDeps: {
    include: ['maplibre-gl', 'jszip', 'papaparse', 'uplot'],
    // gtfs-zone-web-common ships raw .ts; let vite transform it as source
    exclude: ['gtfs-zone-web-common'],
  },
});
