import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { CreatureBaseStats, CreatureFormType, RarityTier } from '../types';

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

export type SpriteMode = 'ani' | 'dex' | 'artwork';
export type ShinySpriteMode = 'ani' | 'dex' | 'artwork' | 'normal';

export interface CompactPokedexEntry {
  readonly id: number;
  readonly dexNumber: number;
  readonly slug: string;
  readonly name: string;
  readonly rarity: RarityTier;
  readonly formType: CreatureFormType;
  readonly types: readonly string[];
  readonly baseStats: CreatureBaseStats;
  readonly baseCatchRate: number;
  readonly baseReward: number;
  readonly spriteMode: SpriteMode;
  readonly shinySpriteMode: ShinySpriteMode;
  readonly isStaticSprite: boolean;
}

const SHOWDOWN_DEX_URL = 'https://play.pokemonshowdown.com/data/pokedex.json';
const OUTPUT_PATH = resolve(process.cwd(), 'src/game/data/pokedex.json');
const MAX_DEX_NUM = 1025;
const GEN9_START_NUM = 906;
const ALT_FORM_ID_START = 10001;

const MEGA_FORMES = new Set(['Mega', 'Mega-X', 'Mega-Y', 'Mega-Z', 'Primal']);
const REGIONAL_FORMES = new Set([
  'Alola',
  'Galar',
  'Hisui',
  'Paldea',
  'Paldea-Combat',
  'Paldea-Blaze',
  'Paldea-Aqua',
]);
const SPECIAL_FORMES = new Set([
  'Origin',
  'Therian',
  'Crowned',
  'Ultra',
  'Black',
  'White',
  'Ice',
  'Shadow',
  'Unbound',
  'Complete',
  '10%',
  'Dusk-Mane',
  'Dawn-Wings',
  'Attack',
  'Defense',
  'Speed',
  'Sky',
  'Resolute',
  'Pirouette',
  'Ash',
  'Rapid-Strike',
  'Bloodmoon',
  'Terastal',
  'Stellar',
  'Wellspring',
  'Hearthflame',
  'Cornerstone',
]);

function classifyFormType(forme: string | undefined): CreatureFormType | null {
  if (!forme) {
    return 'base';
  }
  if (MEGA_FORMES.has(forme)) {
    return 'mega';
  }
  if (forme === 'Gmax') {
    return 'gmax';
  }
  if (REGIONAL_FORMES.has(forme)) {
    return 'regional';
  }
  if (SPECIAL_FORMES.has(forme)) {
    return 'special';
  }
  return null;
}

function classifyRarity(
  tags: readonly string[],
  bst: number,
  formType: CreatureFormType,
): RarityTier {
  if (formType === 'mega') {
    return 'mega';
  }
  const tagSet = new Set(tags);
  if (
    tagSet.has('Restricted Legendary') ||
    tagSet.has('Sub-Legendary') ||
    tagSet.has('Mythical')
  ) {
    return 'legendary';
  }
  if (formType === 'gmax' || tagSet.has('Ultra Beast') || tagSet.has('Paradox') || bst >= 550) {
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
  const clampedBst = Math.max(180, Math.min(780, bst));

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
      const ratio = Math.max(0, Math.min(1, (clampedBst - 570) / 180));
      return {
        baseCatchRate: Number((0.12 - ratio * 0.04).toFixed(2)),
        baseReward: Math.round(6200 + ratio * 3300),
      };
    }
    case 'mega': {
      const ratio = Math.max(0, Math.min(1, (clampedBst - 580) / 200));
      return {
        baseCatchRate: Number((0.1 - ratio * 0.03).toFixed(2)),
        baseReward: Math.round(8500 + ratio * 4000),
      };
    }
  }
}

function toShowdownSpriteSlug(key: string, entry: ShowdownDexEntry): string {
  if (!entry.forme || !entry.baseSpecies) {
    return key;
  }
  const baseSlug = entry.baseSpecies.toLowerCase().replace(/[^a-z0-9]/g, '');
  const formeSlug = entry.forme.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${baseSlug}-${formeSlug}`;
}

async function headOk(url: string): Promise<boolean> {
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

function countGifFrames(buf: Buffer): number {
  let frames = 0;
  for (let i = 0; i < buf.length - 3; i += 1) {
    if (buf[i] === 0x21 && buf[i + 1] === 0xf9 && buf[i + 2] === 0x04) {
      frames += 1;
    }
  }
  return frames;
}

async function resolveAltSpriteInfo(
  spriteSlug: string,
): Promise<{ readonly mode: SpriteMode; readonly isStaticSprite: boolean } | null> {
  const aniUrl = `https://play.pokemonshowdown.com/sprites/ani/${spriteSlug}.gif`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(aniUrl, { signal: controller.signal });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      return {
        mode: 'ani',
        isStaticSprite: countGifFrames(buf) <= 1,
      };
    }
  } catch {
    // fallback below
  } finally {
    clearTimeout(timer);
  }

  if (await headOk(`https://play.pokemonshowdown.com/sprites/dex/${spriteSlug}.png`)) {
    return { mode: 'dex', isStaticSprite: true };
  }
  return null;
}

async function resolveShinySpriteMode(
  slug: string,
  dexNumber: number,
  normalMode: SpriteMode,
): Promise<ShinySpriteMode> {
  if (normalMode === 'ani') {
    if (await headOk(`https://play.pokemonshowdown.com/sprites/ani-shiny/${slug}.gif`)) {
      return 'ani';
    }
    if (await headOk(`https://play.pokemonshowdown.com/sprites/dex-shiny/${slug}.png`)) {
      return 'dex';
    }
    return 'normal';
  }

  if (normalMode === 'dex') {
    if (await headOk(`https://play.pokemonshowdown.com/sprites/dex-shiny/${slug}.png`)) {
      return 'dex';
    }
    return 'normal';
  }

  if (
    await headOk(
      `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/shiny/${dexNumber}.png`,
    )
  ) {
    return 'artwork';
  }
  return 'normal';
}

async function runSync(): Promise<void> {
  console.log(`Đang tải toàn bộ National Pokédex + Forms từ ${SHOWDOWN_DEX_URL}...`);
  const response = await fetch(SHOWDOWN_DEX_URL);
  if (!response.ok) {
    throw new Error(`Không thể tải pokedex.json: HTTP ${response.status}`);
  }

  const rawDex = (await response.json()) as Record<string, ShowdownDexEntry>;
  const baseByNum = new Map<number, { readonly slug: string; readonly entry: ShowdownDexEntry }>();
  const altCandidates: {
    readonly key: string;
    readonly spriteSlug: string;
    readonly formType: CreatureFormType;
    readonly entry: ShowdownDexEntry;
  }[] = [];

  for (const [key, entry] of Object.entries(rawDex)) {
    const num = entry.num ?? 0;
    if (num < 1 || num > MAX_DEX_NUM) {
      continue;
    }

    if (!entry.forme && !entry.baseSpecies) {
      if (!baseByNum.has(num)) {
        baseByNum.set(num, { slug: key, entry });
      }
      continue;
    }

    const formType = classifyFormType(entry.forme);
    if (formType && formType !== 'base') {
      altCandidates.push({
        key,
        spriteSlug: toShowdownSpriteSlug(key, entry),
        formType,
        entry,
      });
    }
  }

  for (const [key, entry] of Object.entries(rawDex)) {
    const num = entry.num ?? 0;
    if (num >= 1 && num <= MAX_DEX_NUM && !entry.forme && !baseByNum.has(num)) {
      baseByNum.set(num, { slug: key, entry });
    }
  }

  const sortedNums = [...baseByNum.keys()].sort((a, b) => a - b);
  console.log(
    `Tìm thấy ${sortedNums.length} loài gốc và ${altCandidates.length} dạng biến thể (Mega/Gmax/Regional/Special).`,
  );

  // Check Gen 9 base GIFs + shiny sprites
  const gen9SpriteMode = new Map<number, SpriteMode>();
  const gen9ShinyMode = new Map<number, ShinySpriteMode>();
  const gen9Nums = sortedNums.filter((n) => n >= GEN9_START_NUM);
  const base899PlusNums = sortedNums.filter((n) => n >= 899 && n < GEN9_START_NUM);
  const BATCH_SIZE = 25;

  console.log(`Đang kiểm tra sprite .gif và Shiny cho ${gen9Nums.length} loài gốc Gen 9...`);
  for (let i = 0; i < gen9Nums.length; i += BATCH_SIZE) {
    const batch = gen9Nums.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (num) => {
        const record = baseByNum.get(num);
        if (!record) {
          return;
        }
        const ok = await headOk(`https://play.pokemonshowdown.com/sprites/ani/${record.slug}.gif`);
        const mode: SpriteMode = ok ? 'ani' : 'artwork';
        gen9SpriteMode.set(num, mode);
        gen9ShinyMode.set(num, await resolveShinySpriteMode(record.slug, num, mode));
      }),
    );
  }

  for (let i = 0; i < base899PlusNums.length; i += BATCH_SIZE) {
    const batch = base899PlusNums.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (num) => {
        const record = baseByNum.get(num);
        if (!record) {
          return;
        }
        gen9ShinyMode.set(num, await resolveShinySpriteMode(record.slug, num, 'ani'));
      }),
    );
  }

  // Check alternate forms sprites + shiny sprites
  console.log(`Đang kiểm tra sprite thường & Shiny cho ${altCandidates.length} dạng biến thể...`);
  const altSpriteInfo = new Map<
    string,
    {
      readonly mode: SpriteMode;
      readonly shinyMode: ShinySpriteMode;
      readonly isStaticSprite: boolean;
    } | null
  >();
  for (let i = 0; i < altCandidates.length; i += BATCH_SIZE) {
    const batch = altCandidates.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (item) => {
        const info = await resolveAltSpriteInfo(item.spriteSlug);
        if (!info) {
          altSpriteInfo.set(item.key, null);
          return;
        }
        const shinyMode = await resolveShinySpriteMode(
          item.spriteSlug,
          item.entry.num ?? 1,
          info.mode,
        );
        altSpriteInfo.set(item.key, {
          mode: info.mode,
          shinyMode,
          isStaticSprite: info.isStaticSprite,
        });
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
    mega: 0,
  };
  const formCounts: Record<CreatureFormType, number> = {
    base: 0,
    mega: 0,
    gmax: 0,
    regional: 0,
    special: 0,
  };

  for (const num of sortedNums) {
    const record = baseByNum.get(num);
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

    const rarity = classifyRarity(tags, bst, 'base');
    rarityCounts[rarity] += 1;
    formCounts.base += 1;

    const { baseCatchRate, baseReward } = computeBalance(rarity, bst);
    const spriteMode: SpriteMode =
      num < GEN9_START_NUM ? 'ani' : (gen9SpriteMode.get(num) ?? 'artwork');
    const shinySpriteMode: ShinySpriteMode =
      num < 899 ? 'ani' : (gen9ShinyMode.get(num) ?? spriteMode);

    result.push({
      id: num,
      dexNumber: num,
      slug,
      name: entry.name ?? slug,
      rarity,
      formType: 'base',
      types: entry.types && entry.types.length > 0 ? [...entry.types] : ['Normal'],
      baseStats: { hp, atk, def, spAtk, spDef, spd, bst },
      baseCatchRate,
      baseReward,
      spriteMode,
      shinySpriteMode,
      isStaticSprite: spriteMode !== 'ani',
    });
  }

  const sortedAlt = [...altCandidates].sort((a, b) => {
    const numDiff = (a.entry.num ?? 0) - (b.entry.num ?? 0);
    if (numDiff !== 0) {
      return numDiff;
    }
    return (a.entry.name ?? a.key).localeCompare(b.entry.name ?? b.key);
  });

  let nextAltId = ALT_FORM_ID_START;
  let skippedNoSprite = 0;

  for (const alt of sortedAlt) {
    const spriteInfo = altSpriteInfo.get(alt.key) ?? null;
    if (!spriteInfo) {
      skippedNoSprite += 1;
      continue;
    }

    const dexNumber = alt.entry.num ?? 1;
    const baseRecord = baseByNum.get(dexNumber);
    const baseTags = baseRecord?.entry.tags ?? [];
    const combinedTags = [...baseTags, ...(alt.entry.tags ?? [])];

    const hp = alt.entry.baseStats?.hp ?? 50;
    const atk = alt.entry.baseStats?.atk ?? 50;
    const def = alt.entry.baseStats?.def ?? 50;
    const spAtk = alt.entry.baseStats?.spa ?? 50;
    const spDef = alt.entry.baseStats?.spd ?? 50;
    const spd = alt.entry.baseStats?.spe ?? 50;
    const bst = hp + atk + def + spAtk + spDef + spd;

    const rarity = classifyRarity(combinedTags, bst, alt.formType);
    rarityCounts[rarity] += 1;
    formCounts[alt.formType] += 1;

    const { baseCatchRate, baseReward } = computeBalance(rarity, bst);

    result.push({
      id: nextAltId,
      dexNumber,
      slug: alt.spriteSlug,
      name: alt.entry.name ?? alt.spriteSlug,
      rarity,
      formType: alt.formType,
      types: alt.entry.types && alt.entry.types.length > 0 ? [...alt.entry.types] : ['Normal'],
      baseStats: { hp, atk, def, spAtk, spDef, spd, bst },
      baseCatchRate,
      baseReward,
      spriteMode: spriteInfo.mode,
      shinySpriteMode: spriteInfo.shinyMode,
      isStaticSprite: spriteInfo.isStaticSprite,
    });
    nextAltId += 1;
  }

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(result), 'utf8');

  const shinyDexFallbackCount = result.filter((r) => r.shinySpriteMode === 'dex').length;
  const shinyNormalFallbackCount = result.filter((r) => r.shinySpriteMode === 'normal').length;
  console.log(`Đã ghi tổng cộng ${result.length} Pokémon & Biến thể vào ${OUTPUT_PATH}.`);
  console.log('Phân bố độ hiếm:', rarityCounts);
  console.log('Phân bố theo dạng:', formCounts);
  console.log(
    `Shiny fallback: ${shinyDexFallbackCount} dùng dex-shiny PNG, ${shinyNormalFallbackCount} dùng ảnh gốc do Showdown chưa có Shiny.`,
  );
  console.log(`Đã bỏ qua ${skippedNoSprite} biến thể chưa có sprite trên Showdown.`);
}

runSync().catch((error: unknown) => {
  console.error('Lỗi đồng bộ Pokédex:', error);
  process.exit(1);
});
