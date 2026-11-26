import type {
  BallId,
  BallSpec,
  BuffConfig,
  EconomyConfig,
  FishingSetup,
  LureId,
  LureSpec,
  RarityEconomyValue,
  RarityId,
  RaritySpec,
  RodId,
  RodSpec,
} from '../types';

export const BALL_ORDER: readonly BallId[] = ['pb', 'gb', 'ub', 'db', 'prb', 'mb'];

export const RARITY_ORDER: readonly RarityId[] = [
  'common',
  'uncommon',
  'rare',
  'super_rare',
  'legendary',
  'shiny_full',
  'shiny_event',
  'golden',
];

export const ROD_ORDER: readonly RodId[] = ['old', 'good', 'super'];

export const LURE_ORDER: readonly LureId[] = ['none', 'pokelure', 'misty'];

export const BALL_SPECS: Readonly<Record<BallId, BallSpec>> = {
  pb: {
    id: 'pb',
    name: 'Pokéball',
    shortCode: 'pb',
    catchBonus: 0.1,
    fixedBaseRate: null,
    fishingOnly: false,
    shopBuyable: true,
    defaultPrice: 200,
    accentColor: '#ef4444',
  },
  gb: {
    id: 'gb',
    name: 'Greatball',
    shortCode: 'gb',
    catchBonus: 0.25,
    fixedBaseRate: null,
    fishingOnly: false,
    shopBuyable: true,
    defaultPrice: 500,
    accentColor: '#3b82f6',
  },
  ub: {
    id: 'ub',
    name: 'Ultraball',
    shortCode: 'ub',
    catchBonus: 0.35,
    fixedBaseRate: null,
    fishingOnly: false,
    shopBuyable: true,
    defaultPrice: 1500,
    accentColor: '#eab308',
  },
  prb: {
    id: 'prb',
    name: 'Premierball',
    shortCode: 'prb',
    catchBonus: 0.5,
    fixedBaseRate: null,
    fishingOnly: false,
    shopBuyable: false,
    defaultPrice: 10000,
    accentColor: '#f8fafc',
  },
  mb: {
    id: 'mb',
    name: 'Masterball',
    shortCode: 'mb',
    catchBonus: null,
    fixedBaseRate: 1.0,
    fishingOnly: false,
    shopBuyable: true,
    defaultPrice: 100000,
    accentColor: '#a855f7',
  },
  db: {
    id: 'db',
    name: 'Diveball',
    shortCode: 'db',
    catchBonus: null,
    fixedBaseRate: 0.85,
    fishingOnly: true,
    shopBuyable: true,
    defaultPrice: 1200,
    accentColor: '#06b6d4',
  },
};

export const RARITY_SPECS: Readonly<Record<RarityId, RaritySpec>> = {
  common: {
    id: 'common',
    label: 'Common',
    shortLabel: 'C',
    colorClass: 'text-sky-300 border-sky-500/30 bg-sky-500/10',
    hexColor: '#38bdf8',
    baseRateGen1_5_8: 0.7,
    baseRateGen6_7: 0.4,
    defaultCatchCoins: 150,
    defaultReleaseValue: 150,
    defaultMarketValue: 100,
    encounterWeightLabel: '~40%',
    availableInFishing: true,
  },
  uncommon: {
    id: 'uncommon',
    label: 'Uncommon',
    shortLabel: 'U',
    colorClass: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
    hexColor: '#34d399',
    baseRateGen1_5_8: 0.6,
    baseRateGen6_7: 0.35,
    defaultCatchCoins: 250,
    defaultReleaseValue: 300,
    defaultMarketValue: 200,
    encounterWeightLabel: '~30%',
    availableInFishing: true,
  },
  rare: {
    id: 'rare',
    label: 'Rare',
    shortLabel: 'R',
    colorClass: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
    hexColor: '#fbbf24',
    baseRateGen1_5_8: 0.37,
    baseRateGen6_7: 0.32,
    defaultCatchCoins: 500,
    defaultReleaseValue: 500,
    defaultMarketValue: 500,
    encounterWeightLabel: '~27%',
    availableInFishing: true,
  },
  super_rare: {
    id: 'super_rare',
    label: 'Super Rare',
    shortLabel: 'SR',
    colorClass: 'text-orange-300 border-orange-500/30 bg-orange-500/10',
    hexColor: '#fb923c',
    baseRateGen1_5_8: 0.2,
    baseRateGen6_7: 0.2,
    defaultCatchCoins: 1000,
    defaultReleaseValue: 1000,
    defaultMarketValue: 2500,
    encounterWeightLabel: '~2%',
    availableInFishing: true,
  },
  legendary: {
    id: 'legendary',
    label: 'Legendary',
    shortLabel: 'L',
    colorClass: 'text-purple-300 border-purple-500/30 bg-purple-500/10',
    hexColor: '#c084fc',
    baseRateGen1_5_8: 0.05,
    baseRateGen6_7: 0.05,
    defaultCatchCoins: 5000,
    defaultReleaseValue: 10000,
    defaultMarketValue: 200000,
    encounterWeightLabel: '<1%',
    availableInFishing: true,
  },
  shiny_full: {
    id: 'shiny_full',
    label: 'Shiny (Full-odds)',
    shortLabel: 'S',
    colorClass: 'text-yellow-200 border-yellow-400/40 bg-yellow-400/15',
    hexColor: '#fde047',
    baseRateGen1_5_8: 0.64,
    baseRateGen6_7: 0.64,
    defaultCatchCoins: 5000,
    defaultReleaseValue: 25000,
    defaultMarketValue: 350000,
    encounterWeightLabel: '<0.1%',
    availableInFishing: true,
  },
  shiny_event: {
    id: 'shiny_event',
    label: 'Shiny (Event)',
    shortLabel: 'SE',
    colorClass: 'text-rose-300 border-rose-500/35 bg-rose-500/10',
    hexColor: '#fb7185',
    baseRateGen1_5_8: 0.0,
    baseRateGen6_7: 0.0,
    defaultCatchCoins: 5000,
    defaultReleaseValue: 25000,
    defaultMarketValue: 250000,
    encounterWeightLabel: 'Event',
    availableInFishing: false,
  },
  golden: {
    id: 'golden',
    label: 'Golden',
    shortLabel: 'G',
    colorClass: 'text-amber-200 border-amber-300/45 bg-amber-300/15',
    hexColor: '#f59e0b',
    baseRateGen1_5_8: 0.05,
    baseRateGen6_7: 0.05,
    defaultCatchCoins: 10000,
    defaultReleaseValue: 50000,
    defaultMarketValue: 1000000,
    encounterWeightLabel: 'Golden Hour / Event',
    availableInFishing: true,
  },
};

export const ROD_SPECS: Readonly<Record<RodId, RodSpec>> = {
  old: {
    id: 'old',
    name: 'Old Rod',
    tokenCost: 0,
    spawnRate: 0.5,
    shinyDenominator: 16284,
  },
  good: {
    id: 'good',
    name: 'Good Rod',
    tokenCost: 1000,
    spawnRate: 0.7,
    shinyDenominator: 8192,
  },
  super: {
    id: 'super',
    name: 'Super Rod',
    tokenCost: 2500,
    spawnRate: 0.85,
    shinyDenominator: 4096,
  },
};

export const LURE_SPECS: Readonly<Record<LureId, LureSpec>> = {
  none: {
    id: 'none',
    name: 'Không dùng mồi',
    tokenCost: 0,
    uses: 0,
    catchBonus: 0,
    spawnBonus: 0,
    description: 'Tiết kiệm Fishing Tokens, không tăng tỉ lệ bắt hay spawn.',
  },
  pokelure: {
    id: 'pokelure',
    name: 'PokéLure',
    tokenCost: 50,
    uses: 50,
    catchBonus: 0.05,
    spawnBonus: 0,
    description: '+5% tỉ lệ bắt cá và làm chậm nhịp kéo cần (50 lần dùng).',
  },
  misty: {
    id: 'misty',
    name: "Misty's Lure",
    tokenCost: 150,
    uses: 50,
    catchBonus: 0,
    spawnBonus: 0.1,
    description: '+10% tỉ lệ gặp cá và mở rộng cửa sổ phản xạ (50 lần dùng).',
  },
};

export const DEFAULT_BUFF_CONFIG: BuffConfig = {
  amuletCoins: 0,
  clanCatchRatePct: 0,
  patreonNinja: false,
  quickHandsSavePct: 0,
  eventCatchBoostPct: 0,
  charmCatchBoostPct: 0,
  shinyCharmOwned: false,
  includePremierBall: true,
  valuationMode: 'market',
  wildCooldownSec: 8,
  fishCooldownSec: 20,
  soundEnabled: true,
};

export function createDefaultEconomyConfig(): EconomyConfig {
  const ballPrices: Record<BallId, number> = {
    pb: BALL_SPECS.pb.defaultPrice,
    gb: BALL_SPECS.gb.defaultPrice,
    ub: BALL_SPECS.ub.defaultPrice,
    prb: BALL_SPECS.prb.defaultPrice,
    mb: BALL_SPECS.mb.defaultPrice,
    db: BALL_SPECS.db.defaultPrice,
  };

  const rarityValues = {} as Record<RarityId, RarityEconomyValue>;
  for (const rarityId of RARITY_ORDER) {
    const spec = RARITY_SPECS[rarityId];
    rarityValues[rarityId] = {
      catchCoins: spec.defaultCatchCoins,
      releaseValue: spec.defaultReleaseValue,
      marketValue: spec.defaultMarketValue,
    };
  }

  return { ballPrices, rarityValues };
}

export const DEFAULT_ECONOMY_CONFIG: EconomyConfig = createDefaultEconomyConfig();

export const DEFAULT_FISHING_SETUP: FishingSetup = {
  rod: 'super',
  lure: 'none',
  goldenHour: false,
  tokenToCoinRate: 200,
};
