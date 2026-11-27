import { defaultCreatureCatalog } from '../catalog/creature-catalog';
import type { BaitId, CreatureSpecies, FishingPackId, RarityTier, RodId } from '../types';

export interface RodSpec {
  readonly id: RodId;
  readonly tier: number;
  readonly shopIndex: number;
  readonly name: string;
  readonly shortCode: string;
  readonly aliases: readonly string[];
  readonly price: number; // Giá nâng cấp bằng Fishing Tokens (FT)
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
  readonly price: number; // Giá bằng Fishing Tokens (FT)
  readonly description: string;
}

export interface FishingPackSpec {
  readonly id: FishingPackId;
  readonly shopIndex: number;
  readonly name: string;
  readonly shortCode: string;
  readonly aliases: readonly string[];
  readonly price: number; // Giá bằng Fishing Tokens (FT)
  readonly rewardBall: 'ultraball' | 'premierball';
  readonly rewardQty: number;
  readonly description: string;
}

export const FISHING_TOKEN_REWARDS: Readonly<Record<Exclude<RarityTier, 'mega'>, number>> = {
  common: 1,
  uncommon: 3,
  rare: 10,
  super_rare: 30,
  legendary: 120,
};

export function calculateFishingTokens(rarity: RarityTier, isShiny: boolean): number {
  const base = rarity === 'mega' ? 150 : FISHING_TOKEN_REWARDS[rarity];
  return isShiny ? Math.max(50, base * 3) : base;
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
    price: 250,
    shinyDenominator: 6144,
    weights: { common: 50, uncommon: 34, rare: 14.5, super_rare: 1.5, legendary: 0 },
    description: 'Mở khóa Super Rare Nước & Shiny 1/6,144 (Cần kiếm đủ 250 FT).',
  },
  {
    id: 'super_rod',
    tier: 3,
    shopIndex: 3,
    name: 'Super Rod',
    shortCode: 'super',
    aliases: ['super', 'super_rod', 'superrod', '3'],
    price: 1200,
    shinyDenominator: 4096,
    weights: { common: 36, uncommon: 36, rare: 22, super_rare: 6, legendary: 0 },
    description: 'Tăng mạnh Rare/Super Rare & Shiny 1/4,096 (Yêu cầu Good Rod).',
  },
  {
    id: 'master_rod',
    tier: 4,
    shopIndex: 4,
    name: 'Master Rod',
    shortCode: 'mrod',
    aliases: ['masterrod', 'master_rod', 'mrod', '4'],
    price: 5000,
    shinyDenominator: 2500,
    weights: { common: 25, uncommon: 35, rare: 28, super_rare: 11.7, legendary: 0.3 },
    description: 'Cần câu tối thượng — câu Legendary Nước & Shiny 1/2,500 (Yêu cầu Super Rod).',
  },
];

export const BAIT_CATALOG: readonly BaitSpec[] = [
  {
    id: 'bait_lure',
    shopIndex: 5,
    name: 'Mồi Dụ Hiếm (Lure Bait)',
    shortCode: 'lure',
    aliases: ['lure', 'bait_lure', 'moi', 'b1', '5'],
    price: 18,
    description: 'Tăng 1.8x tỉ lệ gặp Pokémon Nước Rare, Super Rare & Legendary.',
  },
  {
    id: 'bait_gold',
    shopIndex: 6,
    name: 'Mồi Hoàng Kim (Gold Bait)',
    shortCode: 'gold',
    aliases: ['gold', 'bait_gold', 'goldbait', 'vang', 'b2', '6'],
    price: 75,
    description: 'Tăng gấp đôi tỉ lệ gặp Shiny Nước trong lượt câu tiếp theo.',
  },
];

export const FISHING_PACK_CATALOG: readonly FishingPackSpec[] = [
  {
    id: 'fish_ultra_pack',
    shopIndex: 7,
    name: 'Túi 3x Ultra Ball',
    shortCode: 'ultrapack',
    aliases: ['ultrapack', 'upack', 'ultra', '7'],
    price: 60,
    rewardBall: 'ultraball',
    rewardQty: 3,
    description: 'Đổi 60 FT lấy 3x Ultra Ball vào túi đồ.',
  },
  {
    id: 'fish_premier_pack',
    shopIndex: 8,
    name: 'Túi 1x Premier Ball',
    shortCode: 'premierpack',
    aliases: ['premierpack', 'ppack', 'premier', '8'],
    price: 150,
    rewardBall: 'premierball',
    rewardQty: 1,
    description: 'Đổi 150 FT lấy 1x Premier Ball săn hiếm & Legendary.',
  },
];

const ROD_MAP = new Map<RodId, RodSpec>(ROD_CATALOG.map((r) => [r.id, r]));
const BAIT_MAP = new Map<BaitId, BaitSpec>(BAIT_CATALOG.map((b) => [b.id, b]));
const PACK_MAP = new Map<FishingPackId, FishingPackSpec>(
  FISHING_PACK_CATALOG.map((p) => [p.id, p]),
);

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

export function getFishingPackSpec(packId: FishingPackId): FishingPackSpec {
  const found = PACK_MAP.get(packId);
  if (!found) {
    throw new Error(`Không tìm thấy gói quà câu cá: ${packId}`);
  }
  return found;
}

export function resolveFishingPackId(input: string): FishingPackId | null {
  const clean = input.trim().toLowerCase();
  if (!clean) {
    return null;
  }
  for (const pack of FISHING_PACK_CATALOG) {
    if (
      pack.id === clean ||
      pack.shortCode === clean ||
      pack.aliases.includes(clean)
    ) {
      return pack.id;
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
