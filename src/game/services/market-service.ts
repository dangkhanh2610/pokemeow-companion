import { Prisma } from '@prisma/client';
import { getPrismaClient, withDbRetry } from '@/lib/prisma';
import { trainerService, type TrainerIdentityInput } from './trainer-service';

const MARKET_MIN_PRICE = 100;
const MARKET_MAX_PRICE = 50_000_000;
const MAX_ACTIVE_LISTINGS = 10;
const MARKET_FEE_RATE = 0.05;
const TRADE_TTL_MS = 5 * 60 * 1000;

export interface MarketListingItem {
  readonly id: string;
  readonly listingNo: number;
  readonly sellerId: string;
  readonly sellerName: string;
  readonly creatureId: string;
  readonly speciesId: number;
  readonly speciesName: string;
  readonly rarity: string;
  readonly isShiny: boolean;
  readonly ivPercent: number;
  readonly level: number;
  readonly price: number;
  readonly createdAt: Date;
}

export interface PaginatedMarketResult {
  readonly items: readonly MarketListingItem[];
  readonly totalCount: number;
  readonly page: number;
  readonly totalPages: number;
  readonly filter: string;
}

export interface TradeCreatureSummary {
  readonly id: string;
  readonly shortId: string;
  readonly speciesId: number;
  readonly speciesName: string;
  readonly rarity: string;
  readonly isShiny: boolean;
  readonly ivPercent: number;
  readonly level: number;
}

export interface TradeSessionView {
  readonly id: string;
  readonly initiatorId: string;
  readonly initiatorName: string;
  readonly targetId: string;
  readonly targetName: string;
  readonly initiatorCreature: TradeCreatureSummary | null;
  readonly initiatorCoins: number;
  readonly targetCreature: TradeCreatureSummary | null;
  readonly targetCoins: number;
  readonly initiatorConfirmed: boolean;
  readonly targetConfirmed: boolean;
  readonly status: 'PENDING' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
  readonly expiresAt: Date;
}

export type MarketActionOutcome =
  | {
      readonly ok: true;
      readonly listing: MarketListingItem;
      readonly sellerPayout?: number;
      readonly newBuyerCoins?: number;
    }
  | { readonly ok: false; readonly message: string };

export type TradeActionOutcome =
  | {
      readonly ok: true;
      readonly trade: TradeSessionView;
      readonly completedNow?: boolean;
    }
  | { readonly ok: false; readonly message: string };

class TransactionAbortError extends Error {
  public constructor(message: string) {
    super(message);
  }
}

function buildMarketWhere(rawFilter: string): Prisma.MarketListingWhereInput {
  const base: Prisma.MarketListingWhereInput = { status: 'ACTIVE' };
  const q = rawFilter.trim().toLowerCase();
  if (!q || q === 'all') {
    return base;
  }
  if (q === 'shiny') {
    return { ...base, isShiny: true };
  }
  if (q === 'rare' || q === 'super_rare' || q === 'legendary' || q === 'mega') {
    return { ...base, rarity: q };
  }
  if (q === 'sr' || q === 'superrare') {
    return { ...base, rarity: 'super_rare' };
  }
  if (q === 'legend') {
    return { ...base, rarity: 'legendary' };
  }
  return {
    ...base,
    speciesName: { contains: rawFilter.trim(), mode: 'insensitive' },
  };
}

async function resolveOwnedCreatureForLock(
  tx: Prisma.TransactionClient,
  userId: string,
  rawQuery: string,
  excludeFavorite: boolean,
) {
  const clean = rawQuery.trim().replace(/^#/, '');
  if (!clean) {
    return null;
  }

  const baseWhere: Prisma.CaughtCreatureWhereInput = {
    userId,
    released: false,
    inMarket: false,
    ...(excludeFavorite ? { isFavorite: false } : {}),
  };

  const byId = await tx.caughtCreature.findFirst({
    where: {
      ...baseWhere,
      OR: [{ id: clean }, { id: { endsWith: clean } }],
    },
    orderBy: { caughtAt: 'desc' },
  });
  if (byId) {
    return byId;
  }

  return tx.caughtCreature.findFirst({
    where: {
      ...baseWhere,
      speciesName: { contains: clean, mode: 'insensitive' },
    },
    orderBy: [{ isShiny: 'desc' }, { level: 'desc' }, { ivTotal: 'desc' }],
  });
}

async function buildTradeView(
  tx: Prisma.TransactionClient | ReturnType<typeof getPrismaClient>,
  session: {
    readonly id: string;
    readonly initiatorId: string;
    readonly initiatorName: string;
    readonly targetId: string;
    readonly targetName: string;
    readonly initiatorCreature: string | null;
    readonly initiatorCoins: number;
    readonly targetCreature: string | null;
    readonly targetCoins: number;
    readonly initiatorConfirmed: boolean;
    readonly targetConfirmed: boolean;
    readonly status: string;
    readonly expiresAt: Date;
  },
): Promise<TradeSessionView> {
  const creatureIds = [session.initiatorCreature, session.targetCreature].filter(
    (id): id is string => Boolean(id),
  );

  const creatures =
    creatureIds.length > 0
      ? await tx.caughtCreature.findMany({
          where: { id: { in: creatureIds } },
          select: {
            id: true,
            speciesId: true,
            speciesName: true,
            rarity: true,
            isShiny: true,
            ivPercent: true,
            level: true,
          },
        })
      : [];

  const byId = new Map(creatures.map((c) => [c.id, c]));
  const mapCreature = (id: string | null): TradeCreatureSummary | null => {
    if (!id) {
      return null;
    }
    const c = byId.get(id);
    if (!c) {
      return null;
    }
    return {
      id: c.id,
      shortId: c.id.slice(-6),
      speciesId: c.speciesId,
      speciesName: c.speciesName,
      rarity: c.rarity,
      isShiny: c.isShiny,
      ivPercent: c.ivPercent,
      level: c.level,
    };
  };

  const validStatus: TradeSessionView['status'] =
    session.status === 'COMPLETED' ||
    session.status === 'CANCELLED' ||
    session.status === 'EXPIRED'
      ? session.status
      : 'PENDING';

  return {
    id: session.id,
    initiatorId: session.initiatorId,
    initiatorName: session.initiatorName,
    targetId: session.targetId,
    targetName: session.targetName,
    initiatorCreature: mapCreature(session.initiatorCreature),
    initiatorCoins: session.initiatorCoins,
    targetCreature: mapCreature(session.targetCreature),
    targetCoins: session.targetCoins,
    initiatorConfirmed: session.initiatorConfirmed,
    targetConfirmed: session.targetConfirmed,
    status: validStatus,
    expiresAt: session.expiresAt,
  };
}

export class MarketService {
  public async browseMarket(page = 1, filter = ''): Promise<PaginatedMarketResult> {
    const prisma = getPrismaClient();
    const safePage = Math.max(1, Math.floor(page));
    const pageSize = 8;
    const where = buildMarketWhere(filter);

    const totalCount = await withDbRetry(() => prisma.marketListing.count({ where }));
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const clampedPage = Math.min(safePage, totalPages);

    const rows = await withDbRetry(() =>
      prisma.marketListing.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (clampedPage - 1) * pageSize,
        take: pageSize,
      }),
    );

    return {
      items: rows,
      totalCount,
      page: clampedPage,
      totalPages,
      filter: filter.trim().toLowerCase(),
    };
  }

  public async getListingPreview(listingNo: number): Promise<MarketListingItem | null> {
    if (!Number.isInteger(listingNo) || listingNo <= 0) {
      return null;
    }
    const prisma = getPrismaClient();
    const row = await withDbRetry(() =>
      prisma.marketListing.findUnique({ where: { listingNo } }),
    );
    if (!row || row.status !== 'ACTIVE') {
      return null;
    }
    return row;
  }

  public async listCreature(
    sellerMeta: TrainerIdentityInput,
    targetQuery: string,
    price: number,
  ): Promise<MarketActionOutcome> {
    if (!Number.isInteger(price) || price < MARKET_MIN_PRICE || price > MARKET_MAX_PRICE) {
      return {
        ok: false,
        message: `Giá niêm yết phải từ **${MARKET_MIN_PRICE.toLocaleString('en-US')} PC** đến **${MARKET_MAX_PRICE.toLocaleString('en-US')} PC**.`,
      };
    }

    await trainerService.ensureTrainer(sellerMeta);
    const prisma = getPrismaClient();

    return withDbRetry(() =>
      prisma.$transaction(async (tx) => {
        const activeCount = await tx.marketListing.count({
          where: { sellerId: sellerMeta.userId, status: 'ACTIVE' },
        });
        if (activeCount >= MAX_ACTIVE_LISTINGS) {
          return {
            ok: false,
            message: `Bạn chỉ có thể rao bán tối đa **${MAX_ACTIVE_LISTINGS} Pokémon** cùng lúc. Hãy gỡ bớt trước khi đăng thêm!`,
          };
        }

        const creature = await resolveOwnedCreatureForLock(
          tx,
          sellerMeta.userId,
          targetQuery,
          true,
        );

        if (!creature) {
          return {
            ok: false,
            message: `Không tìm thấy Pokémon hợp lệ khớp với \`${targetQuery}\` (lưu ý Pokémon khóa Yêu thích \`/fav\` hoặc đang rao chợ/trade không thể đăng bán).`,
          };
        }

        const locked = await tx.caughtCreature.updateMany({
          where: {
            id: creature.id,
            userId: sellerMeta.userId,
            released: false,
            inMarket: false,
          },
          data: { inMarket: true },
        });

        if (locked.count === 0) {
          return { ok: false, message: 'Pokémon này vừa được sử dụng trong giao dịch khác.' };
        }

        const seller = await tx.trainer.findUniqueOrThrow({
          where: { userId: sellerMeta.userId },
          select: { buddyCreatureId: true },
        });
        if (seller.buddyCreatureId === creature.id) {
          await tx.trainer.update({
            where: { userId: sellerMeta.userId },
            data: { buddyCreatureId: null },
          });
        }

        const listing = await tx.marketListing.create({
          data: {
            sellerId: sellerMeta.userId,
            sellerName: sellerMeta.displayName,
            creatureId: creature.id,
            speciesId: creature.speciesId,
            speciesName: creature.speciesName,
            rarity: creature.rarity,
            isShiny: creature.isShiny,
            ivPercent: creature.ivPercent,
            level: creature.level,
            price,
            status: 'ACTIVE',
          },
        });

        return { ok: true, listing };
      }),
    );
  }

  public async buyListing(
    buyerMeta: TrainerIdentityInput,
    listingNo: number,
    idempotencyKey: string,
  ): Promise<MarketActionOutcome> {
    await trainerService.ensureTrainer(buyerMeta);
    const prisma = getPrismaClient();

    try {
      return await withDbRetry(() =>
        prisma.$transaction(async (tx) => {
          const existingTx = await tx.economyTransaction.findUnique({
            where: { idempotencyKey },
          });
          const listing = await tx.marketListing.findUnique({
            where: { listingNo },
          });

          if (!listing) {
            return { ok: false, message: `Không tìm thấy đơn hàng chợ \`#${listingNo}\`.` };
          }

          if (existingTx) {
            const buyer = await tx.trainer.findUniqueOrThrow({
              where: { userId: buyerMeta.userId },
            });
            return {
              ok: true,
              listing,
              newBuyerCoins: buyer.coins,
            };
          }

          if (listing.status !== 'ACTIVE') {
            return {
              ok: false,
              message: `Đơn hàng \`#${listingNo}\` đã được mua hoặc người bán vừa gỡ xuống.`,
            };
          }

          if (listing.sellerId === buyerMeta.userId) {
            return {
              ok: false,
              message: `Bạn không thể tự mua Pokémon của chính mình (dùng \`/market cancel ${listingNo}\` để gỡ).`,
            };
          }

          const claimed = await tx.marketListing.updateMany({
            where: { listingNo, status: 'ACTIVE' },
            data: {
              status: 'SOLD',
              buyerId: buyerMeta.userId,
              soldAt: new Date(),
            },
          });

          if (claimed.count === 0) {
            return {
              ok: false,
              message: `Đơn hàng \`#${listingNo}\` vừa được người khác mua mất rồi!`,
            };
          }

          const buyerSpent = await tx.trainer.updateMany({
            where: { userId: buyerMeta.userId, coins: { gte: listing.price } },
            data: { coins: { decrement: listing.price } },
          });

          if (buyerSpent.count === 0) {
            const buyer = await tx.trainer.findUniqueOrThrow({
              where: { userId: buyerMeta.userId },
            });
            throw new TransactionAbortError(
              `Không đủ PokéCoins! Đơn \`#${listingNo}\` giá **${listing.price.toLocaleString('en-US')} PC**, bạn hiện có **${buyer.coins.toLocaleString('en-US')} PC**.`,
            );
          }

          const sellerPayout = Math.max(1, Math.floor(listing.price * (1 - MARKET_FEE_RATE)));
          await tx.trainer.update({
            where: { userId: listing.sellerId },
            data: { coins: { increment: sellerPayout } },
          });

          await tx.caughtCreature.update({
            where: { id: listing.creatureId },
            data: {
              userId: buyerMeta.userId,
              inMarket: false,
              isFavorite: false,
            },
          });

          const updatedBuyer = await tx.trainer.findUniqueOrThrow({
            where: { userId: buyerMeta.userId },
          });

          const txMeta: Prisma.InputJsonObject = {
            listingNo,
            sellerId: listing.sellerId,
            creatureId: listing.creatureId,
            sellerPayout,
          };

          await tx.economyTransaction.create({
            data: {
              idempotencyKey,
              userId: buyerMeta.userId,
              type: 'MARKET_BUY',
              coinsDelta: -listing.price,
              metadata: txMeta,
            },
          });

          return {
            ok: true,
            listing,
            sellerPayout,
            newBuyerCoins: updatedBuyer.coins,
          };
        }),
      );
    } catch (error) {
      if (error instanceof TransactionAbortError) {
        return { ok: false, message: error.message };
      }
      throw error;
    }
  }

  public async cancelListing(
    sellerMeta: TrainerIdentityInput,
    listingNo: number,
  ): Promise<MarketActionOutcome> {
    await trainerService.ensureTrainer(sellerMeta);
    const prisma = getPrismaClient();

    return withDbRetry(() =>
      prisma.$transaction(async (tx) => {
        const listing = await tx.marketListing.findUnique({ where: { listingNo } });
        if (!listing || listing.status !== 'ACTIVE') {
          return {
            ok: false,
            message: `Không tìm thấy đơn hàng đang bán có mã \`#${listingNo}\`.`,
          };
        }
        if (listing.sellerId !== sellerMeta.userId) {
          return {
            ok: false,
            message: 'Bạn không thể gỡ đơn hàng của huấn luyện viên khác!',
          };
        }

        const cancelled = await tx.marketListing.updateMany({
          where: { listingNo, sellerId: sellerMeta.userId, status: 'ACTIVE' },
          data: { status: 'CANCELLED' },
        });
        if (cancelled.count === 0) {
          return { ok: false, message: 'Đơn hàng đã thay đổi trạng thái trước đó.' };
        }

        await tx.caughtCreature.update({
          where: { id: listing.creatureId },
          data: { inMarket: false },
        });

        return { ok: true, listing };
      }),
    );
  }

  private async cleanupExpiredTradesForUser(
    tx: Prisma.TransactionClient,
    userId: string,
    now: Date,
  ): Promise<void> {
    const expired = await tx.tradeSession.findMany({
      where: {
        status: 'PENDING',
        expiresAt: { lte: now },
        OR: [{ initiatorId: userId }, { targetId: userId }],
      },
    });

    if (expired.length === 0) {
      return;
    }

    const creatureIdsToUnlock: string[] = [];
    for (const s of expired) {
      if (s.initiatorCreature) {
        creatureIdsToUnlock.push(s.initiatorCreature);
      }
      if (s.targetCreature) {
        creatureIdsToUnlock.push(s.targetCreature);
      }
    }

    await tx.tradeSession.updateMany({
      where: { id: { in: expired.map((s) => s.id) }, status: 'PENDING' },
      data: { status: 'EXPIRED' },
    });

    if (creatureIdsToUnlock.length > 0) {
      await tx.caughtCreature.updateMany({
        where: { id: { in: creatureIdsToUnlock } },
        data: { inMarket: false },
      });
    }
  }

  public async getActiveTrade(userId: string): Promise<TradeSessionView | null> {
    const prisma = getPrismaClient();
    return withDbRetry(() =>
      prisma.$transaction(async (tx) => {
        const now = new Date();
        await this.cleanupExpiredTradesForUser(tx, userId, now);
        const session = await tx.tradeSession.findFirst({
          where: {
            status: 'PENDING',
            expiresAt: { gt: now },
            OR: [{ initiatorId: userId }, { targetId: userId }],
          },
          orderBy: { createdAt: 'desc' },
        });
        return session ? buildTradeView(tx, session) : null;
      }),
    );
  }

  public async startTrade(
    initiatorMeta: TrainerIdentityInput,
    targetMeta: TrainerIdentityInput,
    creatureQuery?: string,
    coins = 0,
  ): Promise<TradeActionOutcome> {
    if (initiatorMeta.userId === targetMeta.userId) {
      return { ok: false, message: 'Bạn không thể tự tạo giao dịch với chính mình!' };
    }
    if (!Number.isInteger(coins) || coins < 0 || coins > 50_000_000) {
      return { ok: false, message: 'Số PokéCoins đưa vào giao dịch phải từ `0` đến `50,000,000`.' };
    }

    await trainerService.ensureTrainer(initiatorMeta);
    await trainerService.ensureTrainer(targetMeta);
    const prisma = getPrismaClient();

    return withDbRetry(() =>
      prisma.$transaction(async (tx) => {
        const now = new Date();
        await this.cleanupExpiredTradesForUser(tx, initiatorMeta.userId, now);
        await this.cleanupExpiredTradesForUser(tx, targetMeta.userId, now);

        const existing = await tx.tradeSession.findFirst({
          where: {
            status: 'PENDING',
            expiresAt: { gt: now },
            OR: [
              { initiatorId: initiatorMeta.userId },
              { targetId: initiatorMeta.userId },
              { initiatorId: targetMeta.userId },
              { targetId: targetMeta.userId },
            ],
          },
        });

        if (existing) {
          return {
            ok: false,
            message:
              'Bạn hoặc đối phương đang có một phiên giao dịch chưa hoàn tất. Hãy dùng `/trade cancel` trước nếu muốn hủy!',
          };
        }

        const initiatorTrainer = await tx.trainer.findUniqueOrThrow({
          where: { userId: initiatorMeta.userId },
        });
        if (coins > initiatorTrainer.coins) {
          return {
            ok: false,
            message: `Bạn chỉ có **${initiatorTrainer.coins.toLocaleString('en-US')} PC**, không đủ đưa **${coins.toLocaleString('en-US')} PC** vào giao dịch.`,
          };
        }

        let lockedCreatureId: string | null = null;
        if (creatureQuery && creatureQuery.trim().length > 0) {
          const found = await resolveOwnedCreatureForLock(
            tx,
            initiatorMeta.userId,
            creatureQuery,
            false,
          );
          if (!found) {
            return {
              ok: false,
              message: `Không tìm thấy Pokémon khả dụng khớp với \`${creatureQuery}\`.`,
            };
          }
          await tx.caughtCreature.update({
            where: { id: found.id },
            data: { inMarket: true },
          });
          if (initiatorTrainer.buddyCreatureId === found.id) {
            await tx.trainer.update({
              where: { userId: initiatorMeta.userId },
              data: { buddyCreatureId: null },
            });
          }
          lockedCreatureId = found.id;
        }

        const session = await tx.tradeSession.create({
          data: {
            initiatorId: initiatorMeta.userId,
            initiatorName: initiatorMeta.displayName,
            targetId: targetMeta.userId,
            targetName: targetMeta.displayName,
            initiatorCreature: lockedCreatureId,
            initiatorCoins: coins,
            expiresAt: new Date(now.getTime() + TRADE_TTL_MS),
          },
        });

        return { ok: true, trade: await buildTradeView(tx, session) };
      }),
    );
  }

  public async setTradeOffer(
    actorMeta: TrainerIdentityInput,
    creatureQuery?: string,
    coins = 0,
  ): Promise<TradeActionOutcome> {
    if (!Number.isInteger(coins) || coins < 0 || coins > 50_000_000) {
      return { ok: false, message: 'Số PokéCoins đưa vào giao dịch phải từ `0` đến `50,000,000`.' };
    }

    await trainerService.ensureTrainer(actorMeta);
    const prisma = getPrismaClient();

    return withDbRetry(() =>
      prisma.$transaction(async (tx) => {
        const now = new Date();
        await this.cleanupExpiredTradesForUser(tx, actorMeta.userId, now);

        const session = await tx.tradeSession.findFirst({
          where: {
            status: 'PENDING',
            expiresAt: { gt: now },
            OR: [{ initiatorId: actorMeta.userId }, { targetId: actorMeta.userId }],
          },
          orderBy: { createdAt: 'desc' },
        });

        if (!session) {
          return {
            ok: false,
            message: 'Bạn hiện không có phiên `/trade` nào đang mở.',
          };
        }

        const actor = await tx.trainer.findUniqueOrThrow({
          where: { userId: actorMeta.userId },
        });
        if (coins > actor.coins) {
          return {
            ok: false,
            message: `Bạn chỉ có **${actor.coins.toLocaleString('en-US')} PC**, không đủ đưa **${coins.toLocaleString('en-US')} PC** vào giao dịch.`,
          };
        }

        const isInitiator = session.initiatorId === actorMeta.userId;
        const previousCreatureId = isInitiator
          ? session.initiatorCreature
          : session.targetCreature;

        if (previousCreatureId) {
          await tx.caughtCreature.updateMany({
            where: { id: previousCreatureId, userId: actorMeta.userId },
            data: { inMarket: false },
          });
        }

        let nextCreatureId: string | null = null;
        if (creatureQuery && creatureQuery.trim().length > 0) {
          const found = await resolveOwnedCreatureForLock(
            tx,
            actorMeta.userId,
            creatureQuery,
            false,
          );
          if (!found) {
            if (previousCreatureId) {
              await tx.caughtCreature.updateMany({
                where: { id: previousCreatureId, userId: actorMeta.userId },
                data: { inMarket: true },
              });
            }
            return {
              ok: false,
              message: `Không tìm thấy Pokémon khả dụng khớp với \`${creatureQuery}\`.`,
            };
          }
          await tx.caughtCreature.update({
            where: { id: found.id },
            data: { inMarket: true },
          });
          if (actor.buddyCreatureId === found.id) {
            await tx.trainer.update({
              where: { userId: actorMeta.userId },
              data: { buddyCreatureId: null },
            });
          }
          nextCreatureId = found.id;
        }

        // Đặt lại xác nhận cả 2 bên khi có thay đổi vật phẩm/tiền (chống scam)
        const updated = await tx.tradeSession.update({
          where: { id: session.id },
          data: {
            ...(isInitiator
              ? { initiatorCreature: nextCreatureId, initiatorCoins: coins }
              : { targetCreature: nextCreatureId, targetCoins: coins }),
            initiatorConfirmed: false,
            targetConfirmed: false,
          },
        });

        return { ok: true, trade: await buildTradeView(tx, updated) };
      }),
    );
  }

  public async confirmTrade(
    actorMeta: TrainerIdentityInput,
    tradeId: string | undefined,
    idempotencyKey: string,
  ): Promise<TradeActionOutcome> {
    await trainerService.ensureTrainer(actorMeta);
    const prisma = getPrismaClient();

    try {
      return await withDbRetry(() =>
        prisma.$transaction(async (tx) => {
          const now = new Date();
          await this.cleanupExpiredTradesForUser(tx, actorMeta.userId, now);

          const session = await (tradeId
            ? tx.tradeSession.findUnique({ where: { id: tradeId } })
            : tx.tradeSession.findFirst({
                where: {
                  status: 'PENDING',
                  expiresAt: { gt: now },
                  OR: [{ initiatorId: actorMeta.userId }, { targetId: actorMeta.userId }],
                },
                orderBy: { createdAt: 'desc' },
              }));

          if (!session) {
            return { ok: false, message: 'Phiên giao dịch không tồn tại hoặc đã hết hạn.' };
          }

          if (session.status !== 'PENDING') {
            return {
              ok: false,
              message: `Phiên giao dịch đã chuyển sang trạng thái \`${session.status}\`.`,
            };
          }

          if (
            session.initiatorId !== actorMeta.userId &&
            session.targetId !== actorMeta.userId
          ) {
            return {
              ok: false,
              message: 'Bạn không phải thành viên của phiên giao dịch này!',
            };
          }

          if (session.expiresAt <= now) {
            await this.cleanupExpiredTradesForUser(tx, actorMeta.userId, now);
            return { ok: false, message: 'Phiên giao dịch đã hết hạn (5 phút).' };
          }

          const hasAnyAsset = Boolean(
            session.initiatorCreature ||
              session.targetCreature ||
              session.initiatorCoins > 0 ||
              session.targetCoins > 0,
          );
          if (!hasAnyAsset) {
            return {
              ok: false,
              message: 'Chưa có Pokémon hoặc PokéCoins nào trong giao dịch! Hãy dùng `/trade offer` trước.',
            };
          }

          const isInitiator = session.initiatorId === actorMeta.userId;
          const nextInitiatorConfirmed = isInitiator ? true : session.initiatorConfirmed;
          const nextTargetConfirmed = !isInitiator ? true : session.targetConfirmed;

          if (!nextInitiatorConfirmed || !nextTargetConfirmed) {
            const updatedPending = await tx.tradeSession.update({
              where: { id: session.id },
              data: {
                initiatorConfirmed: nextInitiatorConfirmed,
                targetConfirmed: nextTargetConfirmed,
              },
            });
            return {
              ok: true,
              trade: await buildTradeView(tx, updatedPending),
              completedNow: false,
            };
          }

          // Cả 2 bên đã xác nhận (2-step verified) -> khóa và hoán đổi nguyên tử
          const existingTx = await tx.economyTransaction.findUnique({
            where: { idempotencyKey },
          });
          if (existingTx) {
            return {
              ok: true,
              trade: await buildTradeView(tx, session),
              completedNow: false,
            };
          }

          const claimed = await tx.tradeSession.updateMany({
            where: { id: session.id, status: 'PENDING', expiresAt: { gt: now } },
            data: {
              status: 'COMPLETED',
              initiatorConfirmed: true,
              targetConfirmed: true,
            },
          });

          if (claimed.count === 0) {
            return { ok: false, message: 'Phiên giao dịch đã được xử lý trước đó.' };
          }

          if (session.initiatorCoins > 0) {
            const debited = await tx.trainer.updateMany({
              where: { userId: session.initiatorId, coins: { gte: session.initiatorCoins } },
              data: { coins: { decrement: session.initiatorCoins } },
            });
            if (debited.count === 0) {
              throw new TransactionAbortError(
                `${session.initiatorName} không còn đủ PokéCoins để hoàn tất giao dịch.`,
              );
            }
            await tx.trainer.update({
              where: { userId: session.targetId },
              data: { coins: { increment: session.initiatorCoins } },
            });
          }

          if (session.targetCoins > 0) {
            const debited = await tx.trainer.updateMany({
              where: { userId: session.targetId, coins: { gte: session.targetCoins } },
              data: { coins: { decrement: session.targetCoins } },
            });
            if (debited.count === 0) {
              throw new TransactionAbortError(
                `${session.targetName} không còn đủ PokéCoins để hoàn tất giao dịch.`,
              );
            }
            await tx.trainer.update({
              where: { userId: session.initiatorId },
              data: { coins: { increment: session.targetCoins } },
            });
          }

          if (session.initiatorCreature) {
            const moved = await tx.caughtCreature.updateMany({
              where: {
                id: session.initiatorCreature,
                userId: session.initiatorId,
                released: false,
              },
              data: {
                userId: session.targetId,
                inMarket: false,
                isFavorite: false,
              },
            });
            if (moved.count === 0) {
              throw new TransactionAbortError('Pokémon của người mời không còn hợp lệ.');
            }
          }

          if (session.targetCreature) {
            const moved = await tx.caughtCreature.updateMany({
              where: {
                id: session.targetCreature,
                userId: session.targetId,
                released: false,
              },
              data: {
                userId: session.initiatorId,
                inMarket: false,
                isFavorite: false,
              },
            });
            if (moved.count === 0) {
              throw new TransactionAbortError('Pokémon của người nhận không còn hợp lệ.');
            }
          }

          const completed = await tx.tradeSession.findUniqueOrThrow({
            where: { id: session.id },
          });

          const tradeMeta: Prisma.InputJsonObject = {
            tradeId: session.id,
            targetId: session.targetId,
            initiatorCoins: session.initiatorCoins,
            targetCoins: session.targetCoins,
          };

          await tx.economyTransaction.create({
            data: {
              idempotencyKey,
              userId: session.initiatorId,
              type: 'PLAYER_TRADE',
              coinsDelta: session.targetCoins - session.initiatorCoins,
              metadata: tradeMeta,
            },
          });

          return {
            ok: true,
            trade: await buildTradeView(tx, completed),
            completedNow: true,
          };
        }),
      );
    } catch (error) {
      if (error instanceof TransactionAbortError) {
        return { ok: false, message: error.message };
      }
      throw error;
    }
  }

  public async cancelTrade(
    actorUserId: string,
    tradeId?: string,
  ): Promise<TradeActionOutcome> {
    const prisma = getPrismaClient();

    return withDbRetry(() =>
      prisma.$transaction(async (tx) => {
        const now = new Date();
        await this.cleanupExpiredTradesForUser(tx, actorUserId, now);

        const session = await (tradeId
          ? tx.tradeSession.findUnique({ where: { id: tradeId } })
          : tx.tradeSession.findFirst({
              where: {
                status: 'PENDING',
                OR: [{ initiatorId: actorUserId }, { targetId: actorUserId }],
              },
              orderBy: { createdAt: 'desc' },
            }));

        if (!session || session.status !== 'PENDING') {
          return { ok: false, message: 'Không tìm thấy phiên giao dịch đang mở để hủy.' };
        }

        if (session.initiatorId !== actorUserId && session.targetId !== actorUserId) {
          return { ok: false, message: 'Bạn không thể hủy giao dịch của người khác!' };
        }

        await tx.tradeSession.update({
          where: { id: session.id },
          data: { status: 'CANCELLED' },
        });

        const toUnlock = [session.initiatorCreature, session.targetCreature].filter(
          (id): id is string => Boolean(id),
        );
        if (toUnlock.length > 0) {
          await tx.caughtCreature.updateMany({
            where: { id: { in: toUnlock } },
            data: { inMarket: false },
          });
        }

        const updated = await tx.tradeSession.findUniqueOrThrow({
          where: { id: session.id },
        });
        return { ok: true, trade: await buildTradeView(tx, updated) };
      }),
    );
  }
}

export const marketService = new MarketService();
