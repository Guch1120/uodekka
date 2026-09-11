import { cpSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
mkdirSync(resolve(root, 'dist'), { recursive: true });
for (const entry of ['index.html', 'manifest.webmanifest', 'backend', 'frontend', 'css', 'music']) {
  cpSync(resolve(root, entry), resolve(root, 'dist', entry), { recursive: true });
}
