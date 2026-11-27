import { defaultCreatureCatalog } from '../catalog/creature-catalog';
import type { BaitId, CreatureSpecies, RarityTier, RodId } from '../types';

export interface RodSpec {
  readonly id: RodId;
  readonly tier: number;
  readonly shopIndex: number;
  readonly name: string;
  readonly shortCode: string;
  readonly aliases: readonly string[];
  readonly price: number;
  readonly shinyDenominator: number;
  readonly weights: Readonly<Record<Exclude<RarityTier, 'mega'>, number>>;
  readonly description: string;
}

export interface BaitSpec {
  readonly id: BaitId;
  readonly shopIndex: number;
  readonly name: string;
  readonly shortCode: string;
  readonly aliases: readonly string[];
  readonly price: number;
  readonly description: string;
}

export const ROD_CATALOG: readonly RodSpec[] = [
  {
    id: 'old_rod',
    tier: 1,
    shopIndex: 1,
    name: 'Old Rod',
    shortCode: 'old',
    aliases: ['old', 'old_rod', 'oldrod', '1'],
    price: 0,
    shinyDenominator: 8192,
    weights: { common: 68, uncommon: 30, rare: 2, super_rare: 0, legendary: 0 },
    description: 'Cần câu gỗ cơ bản miễn phí cho người mới bắt đầu.',
  },
  {
    id: 'good_rod',
    tier: 2,
    shopIndex: 2,
    name: 'Good Rod',
    shortCode: 'good',
    aliases: ['good', 'good_rod', 'goodrod', '2'],
    price: 15000,
    shinyDenominator: 6144,
    weights: { common: 50, uncommon: 34, rare: 14.5, super_rare: 1.5, legendary: 0 },
    description: 'Mở khóa Pokémon Nước Super Rare và tăng tỉ lệ Shiny (1/6,144).',
  },
  {
    id: 'super_rod',
    tier: 3,
    shopIndex: 3,
    name: 'Super Rod',
    shortCode: 'super',
    aliases: ['super', 'super_rod', 'superrod', '3'],
    price: 65000,
    shinyDenominator: 4096,
    weights: { common: 36, uncommon: 36, rare: 22, super_rare: 6, legendary: 0 },
    description: 'Tăng mạnh tỉ lệ Rare/Super Rare và Shiny (1/4,096).',
  },
  {
    id: 'master_rod',
    tier: 4,
    shopIndex: 4,
    name: 'Master Rod',
    shortCode: 'mrod',
    aliases: ['masterrod', 'master_rod', 'mrod', '4'],
    price: 250000,
    shinyDenominator: 2500,
    weights: { common: 25, uncommon: 35, rare: 28, super_rare: 11.7, legendary: 0.3 },
    description: 'Cần câu huyền thoại — cơ hội câu được Legendary Nước & Shiny 1/2,500.',
  },
];

export const BAIT_CATALOG: readonly BaitSpec[] = [
  {
    id: 'bait_lure',
    shopIndex: 5,
    name: 'Mồi Dụ Hiếm (Lure Bait)',
    shortCode: 'lure',
    aliases: ['lure', 'bait_lure', 'moi', 'b1', '5'],
    price: 800,
    description: 'Tăng 1.8x trọng số gặp Pokémon Nước Rare, Super Rare & Legendary.',
  },
  {
    id: 'bait_gold',
    shopIndex: 6,
    name: 'Mồi Hoàng Kim (Gold Bait)',
    shortCode: 'gold',
    aliases: ['gold', 'bait_gold', 'goldbait', 'vang', 'b2', '6'],
    price: 3500,
    description: 'Tăng gấp 2 lần tỉ lệ gặp Shiny Nước trong lượt câu tiếp theo.',
  },
];

const ROD_MAP = new Map<RodId, RodSpec>(ROD_CATALOG.map((r) => [r.id, r]));
const BAIT_MAP = new Map<BaitId, BaitSpec>(BAIT_CATALOG.map((b) => [b.id, b]));

export function isRodId(value: string): value is RodId {
  return ROD_MAP.has(value as RodId);
}

export function isBaitId(value: string): value is BaitId {
  return BAIT_MAP.has(value as BaitId);
}

export function getRodSpec(rodId: string): RodSpec {
  const found = isRodId(rodId) ? ROD_MAP.get(rodId) : undefined;
  return found ?? ROD_CATALOG[0]!;
}

export function getBaitSpec(baitId: BaitId): BaitSpec {
  const found = BAIT_MAP.get(baitId);
  if (!found) {
    throw new Error(`Không tìm thấy thông số mồi câu: ${baitId}`);
  }
  return found;
}

export function resolveRodId(input: string): RodId | null {
  const clean = input.trim().toLowerCase();
  if (!clean) {
    return null;
  }
  for (const rod of ROD_CATALOG) {
    if (
      rod.id === clean ||
      rod.shortCode === clean ||
      rod.aliases.includes(clean)
    ) {
      return rod.id;
    }
  }
  return null;
}

export function resolveBaitId(input: string): BaitId | null {
  const clean = input.trim().toLowerCase();
  if (!clean) {
    return null;
  }
  for (const bait of BAIT_CATALOG) {
    if (
      bait.id === clean ||
      bait.shortCode === clean ||
      bait.aliases.includes(clean)
    ) {
      return bait.id;
    }
  }
  return null;
}

let cachedWaterPools: Readonly<Record<Exclude<RarityTier, 'mega'>, readonly CreatureSpecies[]>> | null =
  null;

export function getWaterPools(): Readonly<
  Record<Exclude<RarityTier, 'mega'>, readonly CreatureSpecies[]>
> {
  if (cachedWaterPools) {
    return cachedWaterPools;
  }

  const buckets: Record<Exclude<RarityTier, 'mega'>, CreatureSpecies[]> = {
    common: [],
    uncommon: [],
    rare: [],
    super_rare: [],
    legendary: [],
  };

  for (const species of defaultCreatureCatalog.getAll()) {
    if (species.formType === 'mega') {
      continue;
    }
    if (!species.types.some((t) => t.toLowerCase() === 'water')) {
      continue;
    }
    if (species.rarity !== 'mega') {
      buckets[species.rarity].push(species);
    }
  }

  cachedWaterPools = buckets;
  return cachedWaterPools;
}
