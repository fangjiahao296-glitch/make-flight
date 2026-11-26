// Sunset Red Canyon — the hand-in program (Node 22, standard library
// only). It takes the game and the screenshots from beside this file,
// puts them under the output directory, and writes the dossier the
// judge reads, using the vendored make.fun library. Run it as:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Inside the grader the output directory is /output. The program writes
// the same bytes on every run: it only copies files and builds the
// dossier from them, so two runs are byte-identical.
//
// v2 is a polish pass on the v1 game: the dam, the bridge, the sky and
// the title silhouette are richer, and the screenshots are re-taken.
// The mechanics, the route, the HUD and the shot presets are unchanged.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function handIn() {
  mkdirSync(outDir, { recursive: true });

  // The playable game, plain static files.
  cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });

  // The screenshots, real renders of the game in a browser.
  const shotsIn = join(repoRoot, 'screenshots');
  const shotsOut = join(outDir, 'screenshots');
  mkdirSync(shotsOut, { recursive: true });
  if (existsSync(shotsIn)) {
    cpSync(shotsIn, shotsOut, { recursive: true });
  }

  // The dossier, exactly as the scorer's own caps describe it.
  const dossier = buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  });
  writeFileSync(join(outDir, 'dossier.json'), dossier);

  // A one-line summary of the hand-in, for the build log.
  const shotNames = existsSync(shotsOut) ? readdirSync(shotsOut).sort() : [];
  const dossierBytes = statSync(join(outDir, 'dossier.json')).size;
  console.log(`sunset-red-canyon v2: game + ${shotNames.length} screenshots (${shotNames.join(', ')}) + dossier.json (${dossierBytes} bytes) -> ${outDir}`);
}

handIn();
