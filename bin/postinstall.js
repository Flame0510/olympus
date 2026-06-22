#!/usr/bin/env node
/**
 * Post-install hook: build Next.js app if .next doesn't exist.
 */
const { existsSync } = require('fs');
const { join } = require('path');

const ROOT = join(__dirname, '..');
const NEXT_DIR = join(ROOT, '.next');

if (!existsSync(NEXT_DIR)) {
  try {
    const { execSync } = require('child_process');
    console.log('[olympus] Building dashboard… (one-time, may take a minute)');
    execSync('npx next build', { cwd: ROOT, stdio: 'inherit' });
    console.log('[olympus] Build complete.');
  } catch (e) {
    console.error('[olympus] Build failed. Run "olympus build" to retry.');
  }
}
