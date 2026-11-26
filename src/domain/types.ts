export type BallId = 'pb' | 'gb' | 'ub' | 'prb' | 'mb' | 'db';

export type RarityId =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'super_rare'
  | 'legendary'
  | 'shiny_full'
  | 'shiny_event'
  | 'golden';

export type GenerationGroup = 'gen1_5_8' | 'gen6_7';

export type RodId = 'old' | 'good' | 'super';

export type LureId = 'none' | 'pokelure' | 'misty';

export type EncounterSource = 'wild' | 'fishing';

export type ValuationMode = 'market' | 'release';

export interface BallSpec {
  readonly id: BallId;
  readonly name: string;
  readonly shortCode: string;
  readonly catchBonus: number | null;
  readonly fixedBaseRate: number | null;
  readonly fishingOnly: boolean;
  readonly shopBuyable: boolean;
  readonly defaultPrice: number;
  readonly accentColor: string;
}

export interface RaritySpec {
  readonly id: RarityId;
  readonly label: string;
  readonly shortLabel: string;
  readonly colorClass: string;
  readonly hexColor: string;
  readonly baseRateGen1_5_8: number;
  readonly baseRateGen6_7: number;
  readonly defaultCatchCoins: number;
  readonly defaultReleaseValue: number;
  readonly defaultMarketValue: number;
  readonly encounterWeightLabel: string;
  readonly availableInFishing: boolean;
}

export interface RodSpec {
  readonly id: RodId;
  readonly name: string;
  readonly tokenCost: number;
  readonly spawnRate: number;
  readonly shinyDenominator: number;
}

export interface LureSpec {
  readonly id: LureId;
  readonly name: string;
  readonly tokenCost: number;
  readonly uses: number;
  readonly catchBonus: number;
  readonly spawnBonus: number;
  readonly description: string;
}

export interface BuffConfig {
  readonly amuletCoins: number;
  readonly clanCatchRatePct: number;
  readonly patreonNinja: boolean;
  readonly quickHandsSavePct: number;
  readonly eventCatchBoostPct: number;
  readonly charmCatchBoostPct: number;
  readonly shinyCharmOwned: boolean;
  readonly includePremierBall: boolean;
  readonly valuationMode: ValuationMode;
  readonly wildCooldownSec: number;
  readonly fishCooldownSec: number;
  readonly soundEnabled: boolean;
}

export interface RarityEconomyValue {
  readonly catchCoins: number;
  readonly releaseValue: number;
  readonly marketValue: number;
}

export interface EconomyConfig {
  readonly ballPrices: Readonly<Record<BallId, number>>;
  readonly rarityValues: Readonly<Record<RarityId, RarityEconomyValue>>;
}

export interface FishingSetup {
  readonly rod: RodId;
  readonly lure: LureId;
  readonly goldenHour: boolean;
  readonly tokenToCoinRate: number;
}

export type RecommendationTag = 'optimal' | 'safe' | 'budget' | 'overkill' | null;

export interface BallEvaluation {
  readonly ballId: BallId;
  readonly catchRate: number;
  readonly effectiveBallCost: number;
  readonly expectedReward: number;
  readonly expectedValue: number;
  readonly roiPct: number;
  readonly isBestEv: boolean;
  readonly recommendationTag: RecommendationTag;
}

export interface RarityOptimizationResult {
  readonly rarityId: RarityId;
  readonly bestBall: BallEvaluation;
  readonly evaluations: readonly BallEvaluation[];
}

export interface FishingMetrics {
  readonly effectiveSpawnRate: number;
  readonly shinyOddsDenominator: number;
  readonly lureCostPerCastCoins: number;
}

export interface CatchLogEntry {
  readonly id: string;
  readonly timestamp: number;
  readonly source: EncounterSource;
  readonly rarityId: RarityId;
  readonly ballId: BallId;
  readonly caught: boolean;
  readonly pokemonName: string;
  readonly ballCost: number;
  readonly coinsEarned: number;
  readonly netProfit: number;
}

export interface RarityStatBucket {
  readonly seen: number;
  readonly caught: number;
  readonly netProfit: number;
}

export interface BallStatBucket {
  readonly used: number;
  readonly caught: number;
  readonly netProfit: number;
}

export interface SessionStats {
  readonly totalEncounters: number;
  readonly totalCaught: number;
  readonly catchSuccessRate: number;
  readonly totalSpent: number;
  readonly totalEarned: number;
  readonly netProfit: number;
  readonly rareHighlights: {
    readonly legendary: number;
    readonly shiny: number;
    readonly golden: number;
  };
  readonly byRarity: Readonly<Record<RarityId, RarityStatBucket>>;
  readonly byBall: Readonly<Record<BallId, BallStatBucket>>;
}

export interface QuickProfitReport {
  readonly totalEncounters: number;
  readonly totalCaught: number;
  readonly catchSuccessRate: number;
  readonly totalBallSpent: number;
  readonly releaseGrossEarned: number;
  readonly releaseNetProfit: number;
  readonly marketGrossEarned: number;
  readonly marketNetProfit: number;
  readonly durationMinutes: number;
  readonly catchesPerHour: number;
  readonly releaseCoinsPerHour: number;
  readonly byBall: Readonly<
    Record<BallId, { readonly used: number; readonly caught: number; readonly releaseNet: number }>
  >;
}

export interface PityStats {
  readonly encountersSinceSuperRarePlus: number;
  readonly encountersSinceLegendaryOrShiny: number;
  readonly lastRareCatchName: string | null;
  readonly lastRareCatchRarity: RarityId | null;
}

export type QuestTargetKind = 'any_catch' | 'fishing' | 'rarity' | 'other';

export interface QuestEntry {
  readonly index: number;
  readonly description: string;
  readonly kind: QuestTargetKind;
  readonly rarityFilter: RarityId | null;
  readonly current: number;
  readonly goal: number;
}

export interface HallOfFameEntry {
  readonly id: string;
  readonly userId: string;
  readonly displayName: string;
  readonly pokemonName: string;
  readonly rarityId: RarityId;
  readonly ballId: BallId;
  readonly timestamp: number;
}
