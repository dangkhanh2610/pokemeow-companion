import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { CreatureBaseStats, RarityTier } from '../types';

interface ShowdownDexEntry {
  readonly num?: number;
  readonly name?: string;
  readonly forme?: string;
  readonly baseSpecies?: string;
  readonly types?: readonly string[];
  readonly baseStats?: {
    readonly hp?: number;
    readonly atk?: number;
    readonly def?: number;
    readonly spa?: number;
    readonly spd?: number;
    readonly spe?: number;
  };
  readonly tags?: readonly string[];
}

export interface CompactPokedexEntry {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly rarity: RarityTier;
  readonly types: readonly string[];
  readonly baseStats: CreatureBaseStats;
  readonly baseCatchRate: number;
  readonly baseReward: number;
  readonly hasAnimatedSprite: boolean;
}

const SHOWDOWN_DEX_URL = 'https://play.pokemonshowdown.com/data/pokedex.json';
const OUTPUT_PATH = resolve(process.cwd(), 'src/game/data/pokedex.json');
const MAX_DEX_NUM = 1025;
const GEN9_START_NUM = 906;

function classifyRarity(tags: readonly string[], bst: number): RarityTier {
  const tagSet = new Set(tags);
  if (
    tagSet.has('Restricted Legendary') ||
    tagSet.has('Sub-Legendary') ||
    tagSet.has('Mythical')
  ) {
    return 'legendary';
  }
  if (tagSet.has('Ultra Beast') || tagSet.has('Paradox') || bst >= 550) {
    return 'super_rare';
  }
  if (bst >= 485) {
    return 'rare';
  }
  if (bst >= 375) {
    return 'uncommon';
  }
  return 'common';
}

function computeBalance(
  rarity: RarityTier,
  bst: number,
): { readonly baseCatchRate: number; readonly baseReward: number } {
  const clampedBst = Math.max(180, Math.min(720, bst));

  switch (rarity) {
    case 'common': {
      const ratio = Math.max(0, Math.min(1, (clampedBst - 180) / 200));
      return {
        baseCatchRate: Number((0.76 - ratio * 0.14).toFixed(2)),
        baseReward: Math.round(110 + ratio * 65),
      };
    }
    case 'uncommon': {
      const ratio = Math.max(0, Math.min(1, (clampedBst - 375) / 110));
      return {
        baseCatchRate: Number((0.54 - ratio * 0.1).toFixed(2)),
        baseReward: Math.round(280 + ratio * 110),
      };
    }
    case 'rare': {
      const ratio = Math.max(0, Math.min(1, (clampedBst - 485) / 65));
      return {
        baseCatchRate: Number((0.36 - ratio * 0.07).toFixed(2)),
        baseReward: Math.round(720 + ratio * 220),
      };
    }
    case 'super_rare': {
      const ratio = Math.max(0, Math.min(1, (clampedBst - 520) / 160));
      return {
        baseCatchRate: Number((0.23 - ratio * 0.06).toFixed(2)),
        baseReward: Math.round(2100 + ratio * 800),
      };
    }
    case 'legendary': {
      const ratio = Math.max(0, Math.min(1, (clampedBst - 570) / 150));
      return {
        baseCatchRate: Number((0.12 - ratio * 0.04).toFixed(2)),
        baseReward: Math.round(6200 + ratio * 3300),
      };
    }
  }
}

async function checkGifExists(slug: string): Promise<boolean> {
  const url = `https://play.pokemonshowdown.com/sprites/ani/${slug}.gif`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function runSync(): Promise<void> {
  console.log(`Đang tải toàn bộ National Pokédex từ ${SHOWDOWN_DEX_URL}...`);
  const response = await fetch(SHOWDOWN_DEX_URL);
  if (!response.ok) {
    throw new Error(`Không thể tải pokedex.json: HTTP ${response.status}`);
  }

  const rawDex = (await response.json()) as Record<string, ShowdownDexEntry>;
  const byNum = new Map<number, { readonly slug: string; readonly entry: ShowdownDexEntry }>();

  for (const [slug, entry] of Object.entries(rawDex)) {
    const num = entry.num ?? 0;
    if (num < 1 || num > MAX_DEX_NUM) {
      continue;
    }
    if (entry.forme || entry.baseSpecies) {
      continue;
    }
    if (!byNum.has(num)) {
      byNum.set(num, { slug, entry });
    }
  }

  // Fallback pass in case any canonical dex number uses baseSpecies without matching above
  for (const [slug, entry] of Object.entries(rawDex)) {
    const num = entry.num ?? 0;
    if (num < 1 || num > MAX_DEX_NUM || entry.forme) {
      continue;
    }
    if (!byNum.has(num)) {
      byNum.set(num, { slug, entry });
    }
  }

  const sortedNums = [...byNum.keys()].sort((a, b) => a - b);
  console.log(`Đã lọc được ${sortedNums.length} loài Pokémon (từ #1 đến #${MAX_DEX_NUM}).`);

  const gifAvailability = new Map<number, boolean>();
  const gen9Nums = sortedNums.filter((n) => n >= GEN9_START_NUM);
  console.log(`Đang kiểm tra sprite .gif động cho ${gen9Nums.length} Pokémon Gen 9...`);

  const BATCH_SIZE = 15;
  for (let i = 0; i < gen9Nums.length; i += BATCH_SIZE) {
    const batch = gen9Nums.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (num) => {
        const record = byNum.get(num);
        if (!record) {
          return;
        }
        const ok = await checkGifExists(record.slug);
        gifAvailability.set(num, ok);
      }),
    );
  }

  const result: CompactPokedexEntry[] = [];
  const rarityCounts: Record<RarityTier, number> = {
    common: 0,
    uncommon: 0,
    rare: 0,
    super_rare: 0,
    legendary: 0,
  };

  for (const num of sortedNums) {
    const record = byNum.get(num);
    if (!record) {
      continue;
    }
    const { slug, entry } = record;
    const hp = entry.baseStats?.hp ?? 50;
    const atk = entry.baseStats?.atk ?? 50;
    const def = entry.baseStats?.def ?? 50;
    const spAtk = entry.baseStats?.spa ?? 50;
    const spDef = entry.baseStats?.spd ?? 50;
    const spd = entry.baseStats?.spe ?? 50;
    const bst = hp + atk + def + spAtk + spDef + spd;

    const tags = entry.tags ?? [];
    const rarity = classifyRarity(tags, bst);
    rarityCounts[rarity] += 1;

    const { baseCatchRate, baseReward } = computeBalance(rarity, bst);
    const hasAnimatedSprite = num < GEN9_START_NUM ? true : (gifAvailability.get(num) ?? false);

    result.push({
      id: num,
      slug,
      name: entry.name ?? slug,
      rarity,
      types: entry.types && entry.types.length > 0 ? [...entry.types] : ['Normal'],
      baseStats: { hp, atk, def, spAtk, spDef, spd, bst },
      baseCatchRate,
      baseReward,
      hasAnimatedSprite,
    });
  }

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(result), 'utf8');

  const staticFallbackCount = result.filter((r) => !r.hasAnimatedSprite).length;
  console.log(`Đã ghi ${result.length} loài vào ${OUTPUT_PATH}.`);
  console.log('Phân bố độ hiếm:', rarityCounts);
  console.log(`Số loài Gen 9 dùng artwork fallback thay cho .gif: ${staticFallbackCount}`);
}

runSync().catch((error: unknown) => {
  console.error('Lỗi đồng bộ Pokédex:', error);
  process.exit(1);
});
