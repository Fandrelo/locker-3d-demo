import { copyFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(scriptDir, '..');
const repoDir = path.resolve(webDir, '..');
const outputDir = path.join(webDir, 'public', 'models');

const models = [
  ['blueprints/room_4x3-lockers.glb', 'room.glb'],
  ['blueprints/hardware/luggage/samsonite_spinner.glb', 'luggage.glb'],
];

await mkdir(outputDir, { recursive: true });

for (const [source, target] of models) {
  const sourcePath = path.join(repoDir, source);
  const targetPath = path.join(outputDir, target);

  if (!existsSync(sourcePath)) {
    throw new Error(`Missing model: ${sourcePath}`);
  }

  await copyFile(sourcePath, targetPath);
  console.log(`Synced ${source} -> public/models/${target}`);
}
