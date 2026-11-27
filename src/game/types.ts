export type RarityTier = 'common' | 'uncommon' | 'rare' | 'super_rare' | 'legendary' | 'mega';

export type CreatureFormType = 'base' | 'mega' | 'gmax' | 'regional' | 'special';

export type BallId = 'pokeball' | 'greatball' | 'ultraball' | 'premierball' | 'masterball';

export type RodId = 'old_rod' | 'good_rod' | 'super_rod' | 'master_rod';

export type BaitId = 'bait_lure' | 'bait_gold';

export type FishingPackId = 'fish_ultra_pack' | 'fish_premier_pack';

export type QuestPeriod = 'DAILY' | 'WEEKLY';

export interface CreatureIVs {
  readonly hp: number;
  readonly atk: number;
  readonly def: number;
  readonly spAtk: number;
  readonly spDef: number;
  readonly spd: number;
}

export interface CreatureBaseStats {
  readonly hp: number;
  readonly atk: number;
  readonly def: number;
  readonly spAtk: number;
  readonly spDef: number;
  readonly spd: number;
  readonly bst: number;
}

export interface CreatureSpecies {
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
  readonly artworkUrl: string;
  readonly shinyArtworkUrl: string;
  readonly animatedSpriteUrl: string;
  readonly shinyAnimatedSpriteUrl: string;
  readonly isStaticSprite: boolean;
}

export interface RarityConfig {
  readonly tier: RarityTier;
  readonly label: string;
  readonly weight: number;
  readonly colorHex: number;
  readonly badgeCss: string;
  readonly xpReward: number;
}

export interface BallSpec {
  readonly id: BallId;
  readonly shopIndex: number;
  readonly category: 'standard' | 'special';
  readonly name: string;
  readonly shortCode: string;
  readonly aliases: readonly string[];
  readonly price: number;
  readonly multiplier: number;
  readonly emoji: string;
  readonly iconUrl: string;
  readonly description: string;
}

export interface EncounterRoll {
  readonly species: CreatureSpecies;
  readonly isShiny: boolean;
  readonly ivs: CreatureIVs;
  readonly ivTotal: number;
  readonly ivPercent: number;
}

export interface BuddyCatchXpSummary {
  readonly buddyName: string;
  readonly isShiny: boolean;
  readonly xpGained: number;
  readonly newLevel: number;
  readonly newXp: number;
  readonly nextLevelXp: number;
  readonly levelsGained: number;
  readonly canEvolve: boolean;
}

export type ThrowBallOutcome =
  | {
      readonly ok: true;
      readonly caught: true;
      readonly species: CreatureSpecies;
      readonly isShiny: boolean;
      readonly ballId: BallId;
      readonly catchChance: number;
      readonly ivs: CreatureIVs;
      readonly ivTotal: number;
      readonly ivPercent: number;
      readonly coinsEarned: number;
      readonly xpEarned: number;
      readonly newLevel: number;
      readonly leveledUp: boolean;
      readonly newCoinsBalance: number;
      readonly fishingTokensEarned?: number;
      readonly newFishingTokensBalance?: number;
      readonly buddyXp?: BuddyCatchXpSummary;
      readonly remainingBalls?: Readonly<Record<BallId, number>>;
    }
  | {
      readonly ok: true;
      readonly caught: false;
      readonly species: CreatureSpecies;
      readonly isShiny: boolean;
      readonly ballId: BallId;
      readonly catchChance: number;
      readonly remainingBalls?: Readonly<Record<BallId, number>>;
    }
  | {
      readonly ok: false;
      readonly reason: 'NOT_FOUND_OR_EXPIRED' | 'NOT_OWNER' | 'INSUFFICIENT_BALLS';
      readonly message: string;
    };

export interface ReleaseResult {
  readonly releasedCount: number;
  readonly coinsEarned: number;
  readonly newCoinsBalance: number;
  readonly idempotentReplay: boolean;
}

export interface DailyRewardResult {
  readonly ok: boolean;
  readonly alreadyClaimed: boolean;
  readonly nextAvailableAt: Date;
  readonly streak: number;
  readonly coinsEarned: number;
  readonly pokeballsEarned: number;
  readonly greatballsEarned: number;
  readonly newCoinsBalance: number;
}

export type LeaderboardMetric = 'catches' | 'coins' | 'shinies' | 'level';

export interface LeaderboardEntry {
  readonly rank: number;
  readonly userId: string;
  readonly username: string;
  readonly displayName: string;
  readonly avatarUrl: string;
  readonly level: number;
  readonly coins: number;
  readonly totalCatches: number;
  readonly shinyCatches: number;
}

export interface CommunityCatchFeedItem {
  readonly id: string;
  readonly userId: string;
  readonly trainerName: string;
  readonly speciesId: number;
  readonly speciesName: string;
  readonly rarity: RarityTier;
  readonly isShiny: boolean;
  readonly ivPercent: number;
  readonly ballUsed: BallId;
  readonly artworkUrl: string;
  readonly caughtAt: string;
}

export interface CommunityOverview {
  readonly totalTrainers: number;
  readonly totalCatches: number;
  readonly totalShinies: number;
  readonly recentHighlights: readonly CommunityCatchFeedItem[];
}
