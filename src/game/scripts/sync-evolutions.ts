import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { CreatureFormType } from '../types';

interface LocalPokedexEntry {
  readonly id: number;
  readonly dexNumber: number;
  readonly slug: string;
  readonly name: string;
  readonly formType: CreatureFormType;
}

interface ShowdownDexEntry {
  readonly num?: number;
  readonly name?: string;
  readonly evos?: readonly string[];
  readonly evoLevel?: number;
  readonly evoType?: string;
  readonly evoItem?: string;
}

export interface EvolutionBranch {
  readonly toSpeciesId: number;
  readonly toName: string;
  readonly requiredLevel: number;
}

const SHOWDOWN_DEX_URL = 'https://play.pokemonshowdown.com/data/pokedex.json';
const LOCAL_DEX_PATH = resolve(process.cwd(), 'src/game/data/pokedex.json');
const OUTPUT_PATH = resolve(process.cwd(), 'src/game/data/evolutions.json');

const EARLY_LEVEL_20_SOURCES = new Set<string>([
  'eevee',
  'magikarp',
  'feebas',
  'pichu',
  'cleffa',
  'igglybuff',
  'togepi',
  'tyrogue',
  'smoochum',
  'elekid',
  'magby',
  'azurill',
  'wynaut',
  'budew',
  'chingling',
  'bonsly',
  'mime jr.',
  'happiny',
  'munchlax',
  'riolu',
  'mantyke',
  'toxel',
]);

function normalizeKey(value: string): string {
  return value.toLowerCase().trim();
}

function resolveRequiredLevel(
  sourceName: string,
  targetShowdown: ShowdownDexEntry | undefined,
): number {
  if (
    targetShowdown?.evoLevel !== undefined &&
    Number.isFinite(targetShowdown.evoLevel) &&
    targetShowdown.evoLevel > 0
  ) {
    return targetShowdown.evoLevel;
  }
  if (EARLY_LEVEL_20_SOURCES.has(normalizeKey(sourceName))) {
    return 20;
  }
  return 26;
}

async function runSync(): Promise<void> {
  const localRaw = await readFile(LOCAL_DEX_PATH, 'utf8');
  const localEntries = JSON.parse(localRaw) as readonly LocalPokedexEntry[];

  const localByName = new Map<string, LocalPokedexEntry>();
  for (const entry of localEntries) {
    if (entry.formType === 'base' || entry.formType === 'regional') {
      localByName.set(normalizeKey(entry.name), entry);
    }
  }

  console.log(`Đang tải dữ liệu tiến hóa từ ${SHOWDOWN_DEX_URL}...`);
  const response = await fetch(SHOWDOWN_DEX_URL);
  if (!response.ok) {
    throw new Error(`Không thể tải pokedex.json từ Showdown: HTTP ${response.status}`);
  }

  const showdownRaw = (await response.json()) as Record<string, ShowdownDexEntry>;
  const showdownByName = new Map<string, ShowdownDexEntry>();
  for (const entry of Object.values(showdownRaw)) {
    if (entry.name) {
      showdownByName.set(normalizeKey(entry.name), entry);
    }
  }

  const evolutionMap: Record<string, readonly EvolutionBranch[]> = {};
  let totalBranches = 0;

  for (const source of localEntries) {
    if (source.formType !== 'base' && source.formType !== 'regional') {
      continue;
    }
    const sdSource = showdownByName.get(normalizeKey(source.name));
    if (!sdSource?.evos || sdSource.evos.length === 0) {
      continue;
    }

    const branches: EvolutionBranch[] = [];
    for (const evoName of sdSource.evos) {
      const targetLocal = localByName.get(normalizeKey(evoName));
      if (!targetLocal || targetLocal.id === source.id) {
        continue;
      }
      const sdTarget = showdownByName.get(normalizeKey(evoName));
      branches.push({
        toSpeciesId: targetLocal.id,
        toName: targetLocal.name,
        requiredLevel: resolveRequiredLevel(source.name, sdTarget),
      });
    }

    if (branches.length > 0) {
      evolutionMap[String(source.id)] = branches;
      totalBranches += branches.length;
    }
  }

  await writeFile(OUTPUT_PATH, JSON.stringify(evolutionMap), 'utf8');
  console.log(
    `Hoàn tất: ${Object.keys(evolutionMap).length} loài có thể tiến hóa (${totalBranches} nhánh) -> ${OUTPUT_PATH}`,
  );
}

runSync().catch((error: unknown) => {
  console.error('Lỗi đồng bộ evolutions.json:', error);
  process.exit(1);
});
