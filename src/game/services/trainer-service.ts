import { Prisma } from '@prisma/client';
import { getPrismaClient, withDbRetry } from '@/lib/prisma';
import { BALL_CATALOG } from '../catalog/ball-catalog';
import { defaultCreatureCatalog } from '../catalog/creature-catalog';
import { resolveEquippedMoves, type MoveSpec } from '../catalog/move-catalog';
import rawEvolutionsData from '../data/evolutions.json';
import { creatureXpNeeded, MAX_CREATURE_LEVEL } from '../engine/spawn-engine';

export const OFFICIAL_GYM_BADGE_IDS: ReadonlySet<string> = new Set([
  'boulder',
  'cascade',
  'thunder',
  'rainbow',
  'soul',
  'marsh',
  'volcano',
  'earth',
]);
import type { BallId, CreatureIVs, CreatureSpecies, DailyRewardResult } from '../types';

export interface TrainerIdentityInput {
  readonly userId: string;
  readonly username: string;
  readonly displayName: string;
  readonly avatarUrl: string;
}

export interface TrainerBagSummary {
  readonly userId: string;
  readonly username: string;
  readonly displayName: string;
  readonly avatarUrl: string;
  readonly coins: number;
  readonly xp: number;
  readonly level: number;
  readonly totalCatches: number;
  readonly totalEncounters: number;
  readonly shinyCatches: number;
  readonly dailyStreak: number;
  readonly lastDailyAt: Date | null;
  readonly uniqueSpeciesCount: number;
  readonly activeCreatureCount: number;
  readonly fishingRod: string;
  readonly fishingTokens: number;
  readonly gymBadges: readonly string[];
  readonly officialGymBadgeCount: number;
  readonly battleWins: number;
  readonly buddy: {
    readonly speciesName: string;
    readonly level: number;
    readonly isShiny: boolean;
    readonly ivPercent: number;
  } | null;
  readonly balls: Readonly<Record<BallId, number>>;
  readonly topCreatures: readonly {
    readonly id: string;
    readonly speciesId: number;
    readonly speciesName: string;
    readonly rarity: string;
    readonly isShiny: boolean;
    readonly ivTotal: number;
    readonly ivPercent: number;
    readonly ballUsed: string;
    readonly caughtAt: Date;
  }[];
}

export interface ShopWalletSummary {
  readonly coins: number;
  readonly balls: Readonly<Record<BallId, number>>;
}

export type BoxSortMode =
  | 'rarity'
  | 'iv'
  | 'iv_asc'
  | 'level'
  | 'cp'
  | 'recent'
  | 'oldest'
  | 'dex'
  | 'name';

export const BOX_SORT_LABELS: Readonly<Record<BoxSortMode, string>> = {
  rarity: 'Độ hiếm (Rarity)',
  iv: 'IV cao → thấp',
  iv_asc: 'IV thấp → cao',
  level: 'Cấp độ cao → thấp',
  cp: 'Lực chiến (CP)',
  recent: 'Mới bắt nhất',
  oldest: 'Cũ nhất',
  dex: 'Số Pokédex (#Dex)',
  name: 'Tên A → Z',
};

export interface BoxItemSummary {
  readonly id: string;
  readonly speciesId: number;
  readonly speciesName: string;
  readonly rarity: string;
  readonly isShiny: boolean;
  readonly isFavorite: boolean;
  readonly inMarket: boolean;
  readonly ivTotal: number;
  readonly ivPercent: number;
  readonly level: number;
  readonly ballUsed: string;
  readonly caughtAt: Date;
}

export interface PaginatedBoxResult {
  readonly items: readonly BoxItemSummary[];
  readonly totalCount: number;
  readonly page: number;
  readonly totalPages: number;
  readonly filter: string;
  readonly sort: BoxSortMode;
  readonly buddyCreatureId: string | null;
}

export type ToggleFavoriteResult =
  | {
      readonly ok: true;
      readonly speciesId: number;
      readonly speciesName: string;
      readonly isShiny: boolean;
      readonly ivPercent: number;
      readonly isFavorite: boolean;
      readonly shortId: string;
    }
  | {
      readonly ok: false;
      readonly message: string;
    };

export interface InspectEvolutionBranch {
  readonly toSpeciesId: number;
  readonly toName: string;
  readonly requiredLevel: number;
}

export interface OwnedCreatureInspectView {
  readonly kind: 'OWNED';
  readonly creatureId: string;
  readonly shortId: string;
  readonly boxIndex: number;
  readonly totalOwned: number;
  readonly species: CreatureSpecies;
  readonly isShiny: boolean;
  readonly isFavorite: boolean;
  readonly isBuddy: boolean;
  readonly inMarket: boolean;
  readonly level: number;
  readonly xp: number;
  readonly nextLevelXp: number;
  readonly ivs: CreatureIVs;
  readonly ivTotal: number;
  readonly ivPercent: number;
  readonly ballUsed: BallId;
  readonly caughtAt: Date;
  readonly equippedMoves: readonly MoveSpec[];
  readonly unlockedMoveCount: number;
  readonly evolutions: readonly InspectEvolutionBranch[];
  readonly hasMegaForm: boolean;
}

export interface PokedexSpeciesInspectView {
  readonly kind: 'SPECIES_DEX';
  readonly species: CreatureSpecies;
  readonly referenceLevel: number;
  readonly referenceIvs: CreatureIVs;
  readonly evolutions: readonly InspectEvolutionBranch[];
  readonly hasMegaForm: boolean;
}

export type CreatureInspectResult =
  | OwnedCreatureInspectView
  | PokedexSpeciesInspectView
  | null;

export type TrainCreatureOutcome =
  | {
      readonly ok: true;
      readonly newLevel: number;
      readonly levelsGained: number;
      readonly totalCost: number;
      readonly newCoinsBalance: number;
    }
  | {
      readonly ok: false;
      readonly message: string;
    };

const INSPECT_MAX_LEVEL = 100;
const INSPECT_TRAIN_COST = 400;
const INSPECT_EVOLUTION_MAP: Readonly<Record<string, readonly InspectEvolutionBranch[]>> =
  rawEvolutionsData as Record<string, readonly InspectEvolutionBranch[]>;

function parseInspectIvs(jsonValue: Prisma.JsonValue): CreatureIVs {
  if (typeof jsonValue === 'object' && jsonValue !== null && !Array.isArray(jsonValue)) {
    const rec = jsonValue as Record<string, unknown>;
    const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    return {
      hp: num(rec['hp']),
      atk: num(rec['atk']),
      def: num(rec['def']),
      spAtk: num(rec['spAtk']),
      spDef: num(rec['spDef']),
      spd: num(rec['spd']),
    };
  }
  return { hp: 0, atk: 0, def: 0, spAtk: 0, spDef: 0, spd: 0 };
}

const STARTER_COINS = 2500;
const STARTER_BALLS: Readonly<Record<BallId, number>> = {
  pokeball: 10,
  greatball: 3,
  ultraball: 1,
  premierball: 0,
  masterball: 0,
};

const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const STREAK_GRACE_MS = 48 * 60 * 60 * 1000;
const TRAINER_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_TRAINER_CACHE_SIZE = 2_000;

interface CachedTrainerMeta {
  readonly username: string;
  readonly displayName: string;
  readonly avatarUrl: string;
  readonly syncedAt: number;
}

export function emptyBallInventory(): Record<BallId, number> {
  return {
    pokeball: 0,
    greatball: 0,
    ultraball: 0,
    premierball: 0,
    masterball: 0,
  };
}

export function isBallId(value: string): value is BallId {
  return BALL_CATALOG.some((ball) => ball.id === value);
}

const BOX_SORT_ALIASES: Readonly<Record<string, BoxSortMode>> = {
  rarity: 'rarity',
  rar: 'rarity',
  r: 'rarity',
  iv: 'iv',
  ivs: 'iv',
  best: 'iv',
  iv_asc: 'iv_asc',
  lowiv: 'iv_asc',
  worst: 'iv_asc',
  level: 'level',
  lv: 'level',
  lvl: 'level',
  cp: 'cp',
  bst: 'cp',
  power: 'cp',
  recent: 'recent',
  new: 'recent',
  latest: 'recent',
  time: 'recent',
  oldest: 'oldest',
  old: 'oldest',
  dex: 'dex',
  id: 'dex',
  num: 'dex',
  number: 'dex',
  name: 'name',
  az: 'name',
  abc: 'name',
};

const RARITY_TIER_ORDER: Readonly<Record<string, number>> = {
  mega: 6,
  legendary: 5,
  super_rare: 4,
  rare: 3,
  uncommon: 2,
  common: 1,
};

const ELEMENTAL_TYPES = new Set<string>([
  'normal',
  'fire',
  'water',
  'electric',
  'grass',
  'ice',
  'fighting',
  'poison',
  'ground',
  'flying',
  'psychic',
  'bug',
  'rock',
  'ghost',
  'dragon',
  'dark',
  'steel',
  'fairy',
]);

export function resolveBoxSortMode(raw: string): BoxSortMode | null {
  const key = raw.trim().toLowerCase();
  return BOX_SORT_ALIASES[key] ?? null;
}

export function parseBoxCommandArgs(tokens: readonly string[]): {
  readonly page: number;
  readonly sort: BoxSortMode;
  readonly filter: string;
} {
  let page = 1;
  let sort: BoxSortMode = 'rarity';
  let sortAssigned = false;
  let pageAssigned = false;
  const remaining: string[] = [];

  for (const rawTok of tokens) {
    const tok = rawTok.trim();
    if (!tok) {
      continue;
    }
    const maybeSort = resolveBoxSortMode(tok);
    if (maybeSort && !sortAssigned) {
      sort = maybeSort;
      sortAssigned = true;
      continue;
    }
    if (/^\d+$/.test(tok) && !pageAssigned) {
      page = Math.max(1, Number.parseInt(tok, 10));
      pageAssigned = true;
      continue;
    }
    remaining.push(tok);
  }

  return {
    page,
    sort,
    filter: remaining.join(' ').trim(),
  };
}

export interface SortableBoxCreature {
  readonly id: string;
  readonly speciesId: number;
  readonly speciesName: string;
  readonly rarity: string;
  readonly isShiny: boolean;
  readonly ivTotal: number;
  readonly level: number;
  readonly caughtAt: Date;
}

function getBaseTierRank(rarity: string): number {
  return RARITY_TIER_ORDER[rarity] ?? 0;
}

function getPrestigeRank(rarity: string, isShiny: boolean): number {
  const baseTier = getBaseTierRank(rarity);
  if (rarity === 'mega') {
    return 70 + (isShiny ? 5 : 0);
  }
  if (isShiny) {
    return 60 + baseTier;
  }
  return baseTier * 10;
}

function estimateCreatureCp(speciesId: number, level: number, ivTotal: number): number {
  const bst = defaultCreatureCatalog.getById(speciesId)?.baseStats.bst ?? 300;
  return bst * (1 + level / 50) + ivTotal * 2;
}

type BoxComparator = (a: SortableBoxCreature, b: SortableBoxCreature) => number;

const BOX_SORT_COMPARATORS: Readonly<Record<BoxSortMode, BoxComparator>> = {
  rarity: (a, b) =>
    getPrestigeRank(b.rarity, b.isShiny) - getPrestigeRank(a.rarity, a.isShiny) ||
    b.ivTotal - a.ivTotal ||
    b.level - a.level ||
    b.caughtAt.getTime() - a.caughtAt.getTime(),
  iv: (a, b) =>
    b.ivTotal - a.ivTotal ||
    getPrestigeRank(b.rarity, b.isShiny) - getPrestigeRank(a.rarity, a.isShiny) ||
    b.level - a.level,
  iv_asc: (a, b) =>
    a.ivTotal - b.ivTotal ||
    b.caughtAt.getTime() - a.caughtAt.getTime(),
  level: (a, b) =>
    b.level - a.level ||
    b.ivTotal - a.ivTotal ||
    getPrestigeRank(b.rarity, b.isShiny) - getPrestigeRank(a.rarity, a.isShiny),
  cp: (a, b) =>
    estimateCreatureCp(b.speciesId, b.level, b.ivTotal) -
      estimateCreatureCp(a.speciesId, a.level, a.ivTotal) ||
    b.ivTotal - a.ivTotal,
  recent: (a, b) => b.caughtAt.getTime() - a.caughtAt.getTime(),
  oldest: (a, b) => a.caughtAt.getTime() - b.caughtAt.getTime(),
  dex: (a, b) => {
    const dexA = defaultCreatureCatalog.getById(a.speciesId)?.dexNumber ?? a.speciesId;
    const dexB = defaultCreatureCatalog.getById(b.speciesId)?.dexNumber ?? b.speciesId;
    return dexA - dexB || a.speciesId - b.speciesId || b.ivTotal - a.ivTotal;
  },
  name: (a, b) =>
    a.speciesName.localeCompare(b.speciesName) || b.ivTotal - a.ivTotal,
};

export function sortBoxCreatures<T extends SortableBoxCreature>(
  items: readonly T[],
  mode: BoxSortMode,
): T[] {
  const comparator = BOX_SORT_COMPARATORS[mode];
  return [...items].sort(comparator);
}

function filterBoxItems(
  allOwned: readonly BoxItemSummary[],
  rawFilter: string,
): BoxItemSummary[] {
  const q = rawFilter.trim().toLowerCase();
  if (!q || q === 'all') {
    return [...allOwned];
  }
  if (q === 'shiny') {
    return allOwned.filter((c) => c.isShiny);
  }
  if (q === 'fav' || q === 'favorite' || q === 'favorites') {
    return allOwned.filter((c) => c.isFavorite);
  }
  if (q === 'market' || q === 'locked') {
    return allOwned.filter((c) => c.inMarket);
  }
  if (q === 'dups' || q === 'dup' || q === 'duplicates') {
    const counts = new Map<number, number>();
    for (const item of allOwned) {
      counts.set(item.speciesId, (counts.get(item.speciesId) ?? 0) + 1);
    }
    return allOwned.filter((c) => (counts.get(c.speciesId) ?? 0) >= 2);
  }
  if (q === 'superrare' || q === 'sr') {
    return allOwned.filter((c) => c.rarity === 'super_rare');
  }
  if (q === 'legend') {
    return allOwned.filter((c) => c.rarity === 'legendary');
  }
  if (
    q === 'common' ||
    q === 'uncommon' ||
    q === 'rare' ||
    q === 'super_rare' ||
    q === 'legendary' ||
    q === 'mega'
  ) {
    return allOwned.filter((c) => c.rarity === q);
  }
  if (ELEMENTAL_TYPES.has(q)) {
    return allOwned.filter((c) => {
      const species = defaultCreatureCatalog.getById(c.speciesId);
      return Boolean(species?.types.some((t) => t.toLowerCase() === q));
    });
  }

  const numericStr = q.replace(/^#/, '');
  if (/^\d+$/.test(numericStr)) {
    const num = Number.parseInt(numericStr, 10);
    if (Number.isFinite(num) && num > 0) {
      return allOwned.filter((c) => {
        const species = defaultCreatureCatalog.getById(c.speciesId);
        return c.speciesId === num || species?.dexNumber === num;
      });
    }
  }

  return allOwned.filter((c) => c.speciesName.toLowerCase().includes(q));
}

export class TrainerService {
  private readonly knownTrainerCache = new Map<string, CachedTrainerMeta>();

  private rememberTrainer(input: TrainerIdentityInput): void {
    if (
      !this.knownTrainerCache.has(input.userId) &&
      this.knownTrainerCache.size >= MAX_TRAINER_CACHE_SIZE
    ) {
      const oldestKey = this.knownTrainerCache.keys().next().value;
      if (oldestKey !== undefined) {
        this.knownTrainerCache.delete(oldestKey);
      }
    }
    this.knownTrainerCache.set(input.userId, {
      username: input.username,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl,
      syncedAt: Date.now(),
    });
  }

  public invalidateTrainerCache(userId: string): void {
    this.knownTrainerCache.delete(userId);
  }

  public async ensureTrainer(input: TrainerIdentityInput): Promise<void> {
    const cached = this.knownTrainerCache.get(input.userId);
    if (
      cached &&
      Date.now() - cached.syncedAt < TRAINER_CACHE_TTL_MS &&
      cached.username === input.username &&
      cached.displayName === input.displayName &&
      cached.avatarUrl === input.avatarUrl
    ) {
      return;
    }

    const prisma = getPrismaClient();
    const existing = await withDbRetry(() =>
      prisma.trainer.findUnique({
        where: { userId: input.userId },
      }),
    );

    if (existing) {
      if (
        existing.username !== input.username ||
        existing.displayName !== input.displayName ||
        existing.avatarUrl !== input.avatarUrl
      ) {
        await withDbRetry(() =>
          prisma.trainer.update({
            where: { userId: input.userId },
            data: {
              username: input.username,
              displayName: input.displayName,
              avatarUrl: input.avatarUrl,
            },
          }),
        );
      }
      this.rememberTrainer(input);
      return;
    }

    try {
      await withDbRetry(() =>
        prisma.$transaction(async (tx) => {
          const created = await tx.trainer.create({
            data: {
              userId: input.userId,
              username: input.username,
              displayName: input.displayName,
              avatarUrl: input.avatarUrl,
              coins: STARTER_COINS,
            },
          });

          for (const ball of BALL_CATALOG) {
            const qty = STARTER_BALLS[ball.id];
            if (qty > 0) {
              await tx.inventoryItem.create({
                data: {
                  userId: input.userId,
                  itemId: ball.id,
                  quantity: qty,
                },
              });
            }
          }

          const starterMetadata: Prisma.InputJsonObject = {
            pokeball: STARTER_BALLS.pokeball,
            greatball: STARTER_BALLS.greatball,
            ultraball: STARTER_BALLS.ultraball,
          };

          await tx.economyTransaction.create({
            data: {
              idempotencyKey: `starter:${input.userId}`,
              userId: input.userId,
              type: 'STARTER_KIT',
              coinsDelta: STARTER_COINS,
              metadata: starterMetadata,
            },
          });

          return created;
        }),
      );
      this.rememberTrainer(input);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        await prisma.trainer.findUniqueOrThrow({ where: { userId: input.userId } });
        this.rememberTrainer(input);
        return;
      }
      throw error;
    }
  }

  public async getShopWallet(userId: string): Promise<ShopWalletSummary | null> {
    const prisma = getPrismaClient();
    const trainer = await withDbRetry(() =>
      prisma.trainer.findUnique({
        where: { userId },
        select: {
          coins: true,
          inventory: {
            select: { itemId: true, quantity: true },
          },
        },
      }),
    );

    if (!trainer) {
      return null;
    }

    const balls = emptyBallInventory();
    for (const item of trainer.inventory) {
      if (isBallId(item.itemId)) {
        balls[item.itemId] = item.quantity;
      }
    }

    return {
      coins: trainer.coins,
      balls,
    };
  }

  public async getTrainerProfile(userId: string): Promise<TrainerBagSummary | null> {
    const prisma = getPrismaClient();
    const trainer = await withDbRetry(() =>
      prisma.trainer.findUnique({
        where: { userId },
        include: {
          inventory: true,
        },
      }),
    );

    if (!trainer) {
      return null;
    }

    const [activeCreatureCount, distinctSpecies, topCreatures, buddyRow] = await withDbRetry(() =>
      Promise.all([
        prisma.caughtCreature.count({
          where: { userId, released: false },
        }),
        prisma.caughtCreature.findMany({
          where: { userId, released: false },
          distinct: ['speciesId'],
          select: { speciesId: true },
        }),
        prisma.caughtCreature.findMany({
          where: { userId, released: false },
          orderBy: [{ isShiny: 'desc' }, { ivTotal: 'desc' }, { caughtAt: 'desc' }],
          take: 5,
          select: {
            id: true,
            speciesId: true,
            speciesName: true,
            rarity: true,
            isShiny: true,
            ivTotal: true,
            ivPercent: true,
            ballUsed: true,
            caughtAt: true,
          },
        }),
        trainer.buddyCreatureId
          ? prisma.caughtCreature.findFirst({
              where: {
                id: trainer.buddyCreatureId,
                userId,
                released: false,
                inMarket: false,
              },
              select: {
                speciesName: true,
                level: true,
                isShiny: true,
                ivPercent: true,
              },
            })
          : Promise.resolve(null),
      ]),
    );

    const balls = emptyBallInventory();
    for (const item of trainer.inventory) {
      if (isBallId(item.itemId)) {
        balls[item.itemId] = item.quantity;
      }
    }

    return {
      userId: trainer.userId,
      username: trainer.username,
      displayName: trainer.displayName,
      avatarUrl: trainer.avatarUrl,
      coins: trainer.coins,
      xp: trainer.xp,
      level: trainer.level,
      totalCatches: trainer.totalCatches,
      totalEncounters: trainer.totalEncounters,
      shinyCatches: trainer.shinyCatches,
      dailyStreak: trainer.dailyStreak,
      lastDailyAt: trainer.lastDailyAt,
      uniqueSpeciesCount: distinctSpecies.length,
      activeCreatureCount,
      fishingRod: trainer.fishingRod,
      fishingTokens: trainer.fishingTokens,
      gymBadges: trainer.gymBadges,
      officialGymBadgeCount: trainer.gymBadges.filter((b) => OFFICIAL_GYM_BADGE_IDS.has(b)).length,
      battleWins: trainer.battleWins,
      buddy: buddyRow,
      balls,
      topCreatures,
    };
  }

  public async getTrainerBox(
    userId: string,
    page = 1,
    pageSize = 10,
    filter = '',
    sort: BoxSortMode = 'rarity',
  ): Promise<PaginatedBoxResult> {
    const prisma = getPrismaClient();
    const safePage = Math.max(1, Math.floor(page));
    const safeSize = Math.min(20, Math.max(1, Math.floor(pageSize)));
    const normalizedFilter = filter.trim();

    const [trainer, allOwned] = await withDbRetry(() =>
      Promise.all([
        prisma.trainer.findUnique({
          where: { userId },
          select: { buddyCreatureId: true },
        }),
        prisma.caughtCreature.findMany({
          where: { userId, released: false },
          select: {
            id: true,
            speciesId: true,
            speciesName: true,
            rarity: true,
            isShiny: true,
            isFavorite: true,
            inMarket: true,
            ivTotal: true,
            ivPercent: true,
            level: true,
            ballUsed: true,
            caughtAt: true,
          },
        }),
      ]),
    );

    const filtered = filterBoxItems(allOwned, normalizedFilter);
    const sorted = sortBoxCreatures(filtered, sort);
    const totalCount = sorted.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / safeSize));
    const clampedPage = Math.min(safePage, totalPages);
    const items = sorted.slice((clampedPage - 1) * safeSize, clampedPage * safeSize);

    return {
      items,
      totalCount,
      page: clampedPage,
      totalPages,
      filter: normalizedFilter.toLowerCase(),
      sort,
      buddyCreatureId: trainer?.buddyCreatureId ?? null,
    };
  }

  public async toggleFavorite(
    userMeta: TrainerIdentityInput,
    target?: string,
  ): Promise<ToggleFavoriteResult> {
    await this.ensureTrainer(userMeta);
    const prisma = getPrismaClient();
    const clean = target?.trim().replace(/^#/, '') ?? '';

    const candidate = await withDbRetry(async () => {
      if (!clean) {
        return prisma.caughtCreature.findFirst({
          where: { userId: userMeta.userId, released: false },
          orderBy: { caughtAt: 'desc' },
        });
      }

      const byId = await prisma.caughtCreature.findFirst({
        where: {
          userId: userMeta.userId,
          released: false,
          OR: [{ id: clean }, { id: { endsWith: clean } }],
        },
        orderBy: { caughtAt: 'desc' },
      });

      if (byId) {
        return byId;
      }

      return prisma.caughtCreature.findFirst({
        where: {
          userId: userMeta.userId,
          released: false,
          speciesName: { contains: clean, mode: 'insensitive' },
        },
        orderBy: [{ isShiny: 'desc' }, { ivTotal: 'desc' }, { caughtAt: 'desc' }],
      });
    });

    if (!candidate) {
      return {
        ok: false,
        message: clean
          ? `Không tìm thấy Pokémon nào khớp với \`${clean}\` trong kho của bạn.`
          : 'Kho Pokémon của bạn đang trống, chưa thể đánh dấu yêu thích.',
      };
    }

    const updated = await withDbRetry(() =>
      prisma.caughtCreature.update({
        where: { id: candidate.id },
        data: { isFavorite: !candidate.isFavorite },
      }),
    );

    return {
      ok: true,
      speciesId: updated.speciesId,
      speciesName: updated.speciesName,
      isShiny: updated.isShiny,
      ivPercent: updated.ivPercent,
      isFavorite: updated.isFavorite,
      shortId: updated.id.slice(-6),
    };
  }

  public async claimDaily(
    userMeta: TrainerIdentityInput,
    idempotencyKey: string,
  ): Promise<DailyRewardResult> {
    await this.ensureTrainer(userMeta);
    const prisma = getPrismaClient();

    return withDbRetry(() =>
      prisma.$transaction(async (tx) => {
        const existingTx = await tx.economyTransaction.findUnique({
          where: { idempotencyKey },
        });
        const trainer = await tx.trainer.findUniqueOrThrow({
          where: { userId: userMeta.userId },
        });

        if (existingTx) {
          return {
            ok: true,
            alreadyClaimed: false,
            nextAvailableAt: new Date(
              (trainer.lastDailyAt ?? new Date()).getTime() + DAILY_COOLDOWN_MS,
            ),
            streak: trainer.dailyStreak,
            coinsEarned: existingTx.coinsDelta,
            pokeballsEarned: 3,
            greatballsEarned: 1,
            newCoinsBalance: trainer.coins,
          };
        }

        const now = new Date();
        if (trainer.lastDailyAt) {
          const elapsed = now.getTime() - trainer.lastDailyAt.getTime();
          if (elapsed < DAILY_COOLDOWN_MS) {
            return {
              ok: false,
              alreadyClaimed: true,
              nextAvailableAt: new Date(trainer.lastDailyAt.getTime() + DAILY_COOLDOWN_MS),
              streak: trainer.dailyStreak,
              coinsEarned: 0,
              pokeballsEarned: 0,
              greatballsEarned: 0,
              newCoinsBalance: trainer.coins,
            };
          }
        }

        const keepStreak =
          trainer.lastDailyAt !== null &&
          now.getTime() - trainer.lastDailyAt.getTime() <= STREAK_GRACE_MS;
        const newStreak = keepStreak ? trainer.dailyStreak + 1 : 1;
        const coinsEarned = 1000 + Math.min(newStreak, 10) * 200;
        const pokeballsEarned = 3;
        const greatballsEarned = 1;

        const updatedTrainer = await tx.trainer.update({
          where: { userId: userMeta.userId },
          data: {
            coins: { increment: coinsEarned },
            dailyStreak: newStreak,
            lastDailyAt: now,
          },
        });

        await tx.inventoryItem.upsert({
          where: {
            userId_itemId: { userId: userMeta.userId, itemId: 'pokeball' },
          },
          update: { quantity: { increment: pokeballsEarned } },
          create: {
            userId: userMeta.userId,
            itemId: 'pokeball',
            quantity: pokeballsEarned,
          },
        });

        await tx.inventoryItem.upsert({
          where: {
            userId_itemId: { userId: userMeta.userId, itemId: 'greatball' },
          },
          update: { quantity: { increment: greatballsEarned } },
          create: {
            userId: userMeta.userId,
            itemId: 'greatball',
            quantity: greatballsEarned,
          },
        });

        const meta: Prisma.InputJsonObject = {
          streak: newStreak,
          pokeballsEarned,
          greatballsEarned,
        };

        await tx.economyTransaction.create({
          data: {
            idempotencyKey,
            userId: userMeta.userId,
            type: 'DAILY_REWARD',
            coinsDelta: coinsEarned,
            metadata: meta,
          },
        });

        return {
          ok: true,
          alreadyClaimed: false,
          nextAvailableAt: new Date(now.getTime() + DAILY_COOLDOWN_MS),
          streak: newStreak,
          coinsEarned,
          pokeballsEarned,
          greatballsEarned,
          newCoinsBalance: updatedTrainer.coins,
        };
      }),
    );
  }

  private buildOwnedInspectView(
    row: {
      readonly id: string;
      readonly speciesId: number;
      readonly isShiny: boolean;
      readonly isFavorite: boolean;
      readonly inMarket: boolean;
      readonly level: number;
      readonly xp: number;
      readonly ivsJson: Prisma.JsonValue;
      readonly ivTotal: number;
      readonly ivPercent: number;
      readonly ballUsed: string;
      readonly caughtAt: Date;
      readonly unlockedMoves: readonly string[];
      readonly equippedMoves: readonly string[];
    },
    boxIndex: number,
    totalOwned: number,
    buddyCreatureId: string | null,
  ): OwnedCreatureInspectView | null {
    const species = defaultCreatureCatalog.getById(row.speciesId);
    if (!species) {
      return null;
    }
    const megaSet = new Set(defaultCreatureCatalog.getMegaForms().map((m) => m.dexNumber));
    const ballUsed: BallId = isBallId(row.ballUsed) ? row.ballUsed : 'pokeball';
    const resolvedMoves = resolveEquippedMoves(
      species,
      row.equippedMoves,
      row.unlockedMoves,
    );
    return {
      kind: 'OWNED',
      creatureId: row.id,
      shortId: row.id.slice(-6),
      boxIndex,
      totalOwned,
      species,
      isShiny: row.isShiny,
      isFavorite: row.isFavorite,
      isBuddy: buddyCreatureId === row.id,
      inMarket: row.inMarket,
      level: row.level,
      xp: row.xp,
      nextLevelXp: row.level >= MAX_CREATURE_LEVEL ? 0 : creatureXpNeeded(row.level),
      ivs: parseInspectIvs(row.ivsJson),
      ivTotal: row.ivTotal,
      ivPercent: row.ivPercent,
      ballUsed,
      caughtAt: row.caughtAt,
      equippedMoves: resolvedMoves,
      unlockedMoveCount: row.unlockedMoves.length,
      evolutions: INSPECT_EVOLUTION_MAP[String(species.id)] ?? [],
      hasMegaForm: megaSet.has(species.dexNumber),
    };
  }

  private buildSpeciesDexInspectView(species: CreatureSpecies): PokedexSpeciesInspectView {
    const megaSet = new Set(defaultCreatureCatalog.getMegaForms().map((m) => m.dexNumber));
    return {
      kind: 'SPECIES_DEX',
      species,
      referenceLevel: 50,
      referenceIvs: { hp: 15, atk: 15, def: 15, spAtk: 15, spDef: 15, spd: 15 },
      evolutions: INSPECT_EVOLUTION_MAP[String(species.id)] ?? [],
      hasMegaForm: megaSet.has(species.dexNumber),
    };
  }

  private async fetchRarityOrderedBox(userId: string) {
    const prisma = getPrismaClient();
    const [trainer, rawBox] = await withDbRetry(() =>
      Promise.all([
        prisma.trainer.findUnique({
          where: { userId },
          select: { buddyCreatureId: true },
        }),
        prisma.caughtCreature.findMany({
          where: { userId, released: false },
        }),
      ]),
    );
    return {
      buddyId: trainer?.buddyCreatureId ?? null,
      box: sortBoxCreatures(rawBox, 'rarity'),
    };
  }

  public async inspectCreature(
    userId: string,
    rawQuery?: string,
  ): Promise<CreatureInspectResult> {
    const { buddyId, box } = await this.fetchRarityOrderedBox(userId);
    const clean = rawQuery?.trim() ?? '';

    if (!clean) {
      if (box.length === 0) {
        const starterRef = defaultCreatureCatalog.getById(25);
        return starterRef ? this.buildSpeciesDexInspectView(starterRef) : null;
      }
      const buddyIdx = buddyId ? box.findIndex((c) => c.id === buddyId) : -1;
      const targetIdx = buddyIdx >= 0 ? buddyIdx : 0;
      const picked = box[targetIdx];
      return picked
        ? this.buildOwnedInspectView(picked, targetIdx + 1, box.length, buddyId)
        : null;
    }

    const noHash = clean.replace(/^#/, '');

    // 1) Số nguyên: khớp số thứ tự trong kho (;box) nếu hợp lệ, nếu lớn hơn thì tìm theo Dex ID
    if (/^\d+$/.test(noHash)) {
      const num = Number.parseInt(noHash, 10);
      if (num >= 1 && num <= box.length && !clean.startsWith('#')) {
        const picked = box[num - 1];
        if (picked) {
          return this.buildOwnedInspectView(picked, num, box.length, buddyId);
        }
      }
      const ownedByDex = box.findIndex((c) => c.speciesId === num);
      if (ownedByDex >= 0) {
        return this.buildOwnedInspectView(
          box[ownedByDex]!,
          ownedByDex + 1,
          box.length,
          buddyId,
        );
      }
      const catalogByNum = defaultCreatureCatalog.getById(num);
      if (catalogByNum) {
        return this.buildSpeciesDexInspectView(catalogByNum);
      }
    }

    // 2) Khớp mã ngắn (#abc123) hoặc full ID
    const idIdx = box.findIndex((c) => c.id === noHash || c.id.endsWith(noHash));
    if (idIdx >= 0) {
      return this.buildOwnedInspectView(box[idIdx]!, idIdx + 1, box.length, buddyId);
    }

    // 3) Khớp tên Pokémon trong kho (ưu tiên Buddy -> Shiny -> Level -> IV)
    const lowerQ = clean.toLowerCase();
    const matchingBoxIndices = box
      .map((c, idx) => ({ c, idx }))
      .filter((entry) => entry.c.speciesName.toLowerCase().includes(lowerQ));

    if (matchingBoxIndices.length > 0) {
      matchingBoxIndices.sort((a, b) => {
        const aExact = a.c.speciesName.toLowerCase() === lowerQ ? 1 : 0;
        const bExact = b.c.speciesName.toLowerCase() === lowerQ ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;
        const aBuddy = a.c.id === buddyId ? 1 : 0;
        const bBuddy = b.c.id === buddyId ? 1 : 0;
        if (aBuddy !== bBuddy) return bBuddy - aBuddy;
        if (a.c.isShiny !== b.c.isShiny) return Number(b.c.isShiny) - Number(a.c.isShiny);
        if (a.c.level !== b.c.level) return b.c.level - a.c.level;
        return b.c.ivTotal - a.c.ivTotal;
      });
      const best = matchingBoxIndices[0]!;
      return this.buildOwnedInspectView(best.c, best.idx + 1, box.length, buddyId);
    }

    // 4) Fallback tra cứu Pokédex toàn cầu (1,225 loài kể cả Mega/Gmax/Regional)
    const catalogMatches = defaultCreatureCatalog.search(clean);
    if (catalogMatches.length > 0) {
      const exactCatalog =
        catalogMatches.find((s) => s.name.toLowerCase() === lowerQ) ?? catalogMatches[0]!;
      return this.buildSpeciesDexInspectView(exactCatalog);
    }

    return null;
  }

  public async inspectOwnedByOffset(
    userId: string,
    offsetIndex: number,
  ): Promise<OwnedCreatureInspectView | null> {
    const { buddyId, box } = await this.fetchRarityOrderedBox(userId);
    if (box.length === 0) {
      return null;
    }
    const clamped = Math.max(0, Math.min(box.length - 1, offsetIndex));
    const picked = box[clamped];
    if (!picked) {
      return null;
    }
    return this.buildOwnedInspectView(picked, clamped + 1, box.length, buddyId);
  }

  public async inspectCreatureById(
    userId: string,
    creatureId: string,
  ): Promise<OwnedCreatureInspectView | null> {
    const { buddyId, box } = await this.fetchRarityOrderedBox(userId);
    const idx = box.findIndex((c) => c.id === creatureId);
    if (idx < 0) {
      return null;
    }
    return this.buildOwnedInspectView(box[idx]!, idx + 1, box.length, buddyId);
  }

  public async trainSpecificCreature(
    userMeta: TrainerIdentityInput,
    creatureId: string,
    levelsToGain: number,
    idempotencyKey: string,
  ): Promise<TrainCreatureOutcome> {
    if (!Number.isInteger(levelsToGain) || levelsToGain < 1 || levelsToGain > 50) {
      return { ok: false, message: 'Số cấp huấn luyện phải từ **1** đến **50**.' };
    }
    await this.ensureTrainer(userMeta);
    const prisma = getPrismaClient();

    return withDbRetry(() =>
      prisma.$transaction(async (tx) => {
        const existingTx = await tx.economyTransaction.findUnique({
          where: { idempotencyKey },
        });
        const trainer = await tx.trainer.findUniqueOrThrow({
          where: { userId: userMeta.userId },
        });
        const creature = await tx.caughtCreature.findFirst({
          where: { id: creatureId, userId: userMeta.userId, released: false, inMarket: false },
        });

        if (!creature) {
          return { ok: false, message: 'Không tìm thấy Pokémon khả dụng để huấn luyện.' };
        }
        if (existingTx) {
          return {
            ok: true,
            newLevel: creature.level,
            levelsGained: levelsToGain,
            totalCost: Math.abs(existingTx.coinsDelta),
            newCoinsBalance: trainer.coins,
          };
        }
        if (creature.level >= INSPECT_MAX_LEVEL) {
          return {
            ok: false,
            message: `**${creature.speciesName}** đã đạt cấp tối đa (**Lv.${INSPECT_MAX_LEVEL}**)!`,
          };
        }

        const actualLevels = Math.min(levelsToGain, INSPECT_MAX_LEVEL - creature.level);
        const totalCost = actualLevels * INSPECT_TRAIN_COST;
        const spent = await tx.trainer.updateMany({
          where: { userId: userMeta.userId, coins: { gte: totalCost } },
          data: { coins: { decrement: totalCost } },
        });

        if (spent.count === 0) {
          return {
            ok: false,
            message: `Cần **${totalCost.toLocaleString('en-US')} PC** để tăng cấp (bạn có **${trainer.coins.toLocaleString('en-US')} PC**).`,
          };
        }

        const updatedCreature = await tx.caughtCreature.update({
          where: { id: creature.id },
          data: { level: creature.level + actualLevels, xp: 0 },
        });
        const updatedTrainer = await tx.trainer.findUniqueOrThrow({
          where: { userId: userMeta.userId },
        });

        const meta: Prisma.InputJsonObject = {
          creatureId: creature.id,
          speciesName: creature.speciesName,
          levelsGained: actualLevels,
        };
        await tx.economyTransaction.create({
          data: {
            idempotencyKey,
            userId: userMeta.userId,
            type: 'CREATURE_TRAIN',
            coinsDelta: -totalCost,
            metadata: meta,
          },
        });

        return {
          ok: true,
          newLevel: updatedCreature.level,
          levelsGained: actualLevels,
          totalCost,
          newCoinsBalance: updatedTrainer.coins,
        };
      }),
    );
  }
}

export const trainerService = new TrainerService();
