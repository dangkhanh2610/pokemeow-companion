import { Prisma } from '@prisma/client';
import { getPrismaClient, withDbRetry } from '@/lib/prisma';
import { BALL_CATALOG } from '../catalog/ball-catalog';
import type { BallId, DailyRewardResult } from '../types';

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

export interface PaginatedDexResult {
  readonly items: readonly {
    readonly id: string;
    readonly speciesId: number;
    readonly speciesName: string;
    readonly rarity: string;
    readonly isShiny: boolean;
    readonly isFavorite: boolean;
    readonly ivTotal: number;
    readonly ivPercent: number;
    readonly level: number;
    readonly ballUsed: string;
    readonly caughtAt: Date;
  }[];
  readonly totalCount: number;
  readonly page: number;
  readonly totalPages: number;
  readonly filter: string;
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

function buildDexWhereClause(userId: string, rawFilter: string): Prisma.CaughtCreatureWhereInput {
  const where: Prisma.CaughtCreatureWhereInput = { userId, released: false };
  const normalized = rawFilter.trim().toLowerCase();

  if (!normalized || normalized === 'all') {
    return where;
  }
  if (normalized === 'shiny') {
    return { ...where, isShiny: true };
  }
  if (normalized === 'fav' || normalized === 'favorite' || normalized === 'favorites') {
    return { ...where, isFavorite: true };
  }
  if (
    normalized === 'common' ||
    normalized === 'uncommon' ||
    normalized === 'rare' ||
    normalized === 'super_rare' ||
    normalized === 'legendary' ||
    normalized === 'mega'
  ) {
    return { ...where, rarity: normalized };
  }
  if (normalized === 'superrare' || normalized === 'sr') {
    return { ...where, rarity: 'super_rare' };
  }

  const numericStr = normalized.replace(/^#/, '');
  if (/^\d+$/.test(numericStr)) {
    const parsedNum = Number.parseInt(numericStr, 10);
    if (Number.isFinite(parsedNum) && parsedNum > 0) {
      return { ...where, speciesId: parsedNum };
    }
  }

  return {
    ...where,
    speciesName: { contains: rawFilter.trim(), mode: 'insensitive' },
  };
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

    const [activeCreatureCount, distinctSpecies, topCreatures] = await withDbRetry(() =>
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
      balls,
      topCreatures,
    };
  }

  public async getTrainerDex(
    userId: string,
    page = 1,
    pageSize = 10,
    filter = '',
  ): Promise<PaginatedDexResult> {
    const prisma = getPrismaClient();
    const safePage = Math.max(1, Math.floor(page));
    const safeSize = Math.min(20, Math.max(1, Math.floor(pageSize)));
    const normalizedFilter = filter.trim();
    const where = buildDexWhereClause(userId, normalizedFilter);

    const totalCount = await withDbRetry(() => prisma.caughtCreature.count({ where }));
    const totalPages = Math.max(1, Math.ceil(totalCount / safeSize));
    const clampedPage = Math.min(safePage, totalPages);

    const items = await withDbRetry(() =>
      prisma.caughtCreature.findMany({
        where,
        orderBy: [{ caughtAt: 'desc' }],
        skip: (clampedPage - 1) * safeSize,
        take: safeSize,
        select: {
          id: true,
          speciesId: true,
          speciesName: true,
          rarity: true,
          isShiny: true,
          isFavorite: true,
          ivTotal: true,
          ivPercent: true,
          level: true,
          ballUsed: true,
          caughtAt: true,
        },
      }),
    );

    return {
      items,
      totalCount,
      page: clampedPage,
      totalPages,
      filter: normalizedFilter.toLowerCase(),
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
}

export const trainerService = new TrainerService();
