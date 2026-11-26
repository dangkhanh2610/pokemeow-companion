import { Prisma } from '@prisma/client';
import { getPrismaClient, withDbRetry } from '@/lib/prisma';
import { getBallSpec } from '../catalog/ball-catalog';
import { defaultCreatureCatalog } from '../catalog/creature-catalog';
import type { BallId, ReleaseResult } from '../types';
import { trainerService, type TrainerIdentityInput } from './trainer-service';

export type BuyBallResult =
  | {
      readonly ok: true;
      readonly ballId: BallId;
      readonly quantityBought: number;
      readonly totalCost: number;
      readonly newBallQuantity: number;
      readonly newCoinsBalance: number;
      readonly idempotentReplay: boolean;
    }
  | {
      readonly ok: false;
      readonly reason: 'INVALID_QUANTITY' | 'INSUFFICIENT_COINS';
      readonly message: string;
    };

const RELEASE_BATCH_SIZE = 500;

export class EconomyService {
  public async buyBall(
    userMeta: TrainerIdentityInput,
    ballId: BallId,
    quantity: number,
    idempotencyKey: string,
  ): Promise<BuyBallResult> {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500) {
      return {
        ok: false,
        reason: 'INVALID_QUANTITY',
        message: 'Số lượng mua mỗi lần phải từ **1** đến **500** quả.',
      };
    }

    await trainerService.ensureTrainer(userMeta);
    const prisma = getPrismaClient();
    const spec = getBallSpec(ballId);
    const totalCost = spec.price * quantity;

    return withDbRetry(() =>
      prisma.$transaction(async (tx) => {
        const existingTx = await tx.economyTransaction.findUnique({
          where: { idempotencyKey },
        });

        if (existingTx) {
          const [trainer, item] = await Promise.all([
            tx.trainer.findUniqueOrThrow({ where: { userId: userMeta.userId } }),
            tx.inventoryItem.findUnique({
              where: { userId_itemId: { userId: userMeta.userId, itemId: ballId } },
            }),
          ]);
          return {
            ok: true,
            ballId,
            quantityBought: quantity,
            totalCost,
            newBallQuantity: item?.quantity ?? 0,
            newCoinsBalance: trainer.coins,
            idempotentReplay: true,
          };
        }

        const spent = await tx.trainer.updateMany({
          where: {
            userId: userMeta.userId,
            coins: { gte: totalCost },
          },
          data: {
            coins: { decrement: totalCost },
          },
        });

        if (spent.count === 0) {
          const current = await tx.trainer.findUniqueOrThrow({
            where: { userId: userMeta.userId },
          });
          return {
            ok: false,
            reason: 'INSUFFICIENT_COINS',
            message: `Không đủ PokéCoins! Cần **${totalCost.toLocaleString('en-US')} PC**, bạn hiện có **${current.coins.toLocaleString('en-US')} PC**.`,
          };
        }

        const updatedItem = await tx.inventoryItem.upsert({
          where: {
            userId_itemId: { userId: userMeta.userId, itemId: ballId },
          },
          update: { quantity: { increment: quantity } },
          create: {
            userId: userMeta.userId,
            itemId: ballId,
            quantity,
          },
        });

        const updatedTrainer = await tx.trainer.findUniqueOrThrow({
          where: { userId: userMeta.userId },
        });

        const purchaseMeta: Prisma.InputJsonObject = {
          ballId,
          quantity,
          unitPrice: spec.price,
        };

        await tx.economyTransaction.create({
          data: {
            idempotencyKey,
            userId: userMeta.userId,
            type: 'SHOP_BUY',
            coinsDelta: -totalCost,
            metadata: purchaseMeta,
          },
        });

        return {
          ok: true,
          ballId,
          quantityBought: quantity,
          totalCost,
          newBallQuantity: updatedItem.quantity,
          newCoinsBalance: updatedTrainer.coins,
          idempotentReplay: false,
        };
      }),
    );
  }

  public async releaseDuplicates(
    userMeta: TrainerIdentityInput,
    idempotencyKey: string,
  ): Promise<ReleaseResult> {
    await trainerService.ensureTrainer(userMeta);
    const prisma = getPrismaClient();

    return withDbRetry(() =>
      prisma.$transaction(async (tx) => {
        const existingTx = await tx.economyTransaction.findUnique({
          where: { idempotencyKey },
        });

        if (existingTx) {
          const trainer = await tx.trainer.findUniqueOrThrow({
            where: { userId: userMeta.userId },
          });
          const meta = existingTx.metadata as Record<string, unknown>;
          const releasedCount =
            typeof meta['releasedCount'] === 'number' ? meta['releasedCount'] : 0;

          return {
            releasedCount,
            coinsEarned: existingTx.coinsDelta,
            newCoinsBalance: trainer.coins,
            idempotentReplay: true,
          };
        }

        const candidates = await tx.caughtCreature.findMany({
          where: {
            userId: userMeta.userId,
            released: false,
            isShiny: false,
            isFavorite: false,
          },
          select: {
            id: true,
            speciesId: true,
          },
          orderBy: [{ ivTotal: 'desc' }, { caughtAt: 'asc' }],
        });

        const keptSpecies = new Set<number>();
        const duplicateIds: string[] = [];
        let coinsEarned = 0;

        for (const creature of candidates) {
          const species = defaultCreatureCatalog.getById(creature.speciesId);
          if (!species || species.rarity === 'legendary' || species.rarity === 'mega') {
            continue;
          }

          if (!keptSpecies.has(creature.speciesId)) {
            keptSpecies.add(creature.speciesId);
            continue;
          }

          duplicateIds.push(creature.id);
          coinsEarned += Math.round(species.baseReward * 0.3);
        }

        if (duplicateIds.length === 0) {
          const trainer = await tx.trainer.findUniqueOrThrow({
            where: { userId: userMeta.userId },
          });
          return {
            releasedCount: 0,
            coinsEarned: 0,
            newCoinsBalance: trainer.coins,
            idempotentReplay: false,
          };
        }

        for (let i = 0; i < duplicateIds.length; i += RELEASE_BATCH_SIZE) {
          const batch = duplicateIds.slice(i, i + RELEASE_BATCH_SIZE);
          await tx.caughtCreature.updateMany({
            where: {
              id: { in: batch },
              userId: userMeta.userId,
              released: false,
            },
            data: { released: true },
          });
        }

        const updatedTrainer = await tx.trainer.update({
          where: { userId: userMeta.userId },
          data: { coins: { increment: coinsEarned } },
        });

        const releaseMeta: Prisma.InputJsonObject = {
          releasedCount: duplicateIds.length,
        };

        await tx.economyTransaction.create({
          data: {
            idempotencyKey,
            userId: userMeta.userId,
            type: 'RELEASE_DUPLICATES',
            coinsDelta: coinsEarned,
            metadata: releaseMeta,
          },
        });

        return {
          releasedCount: duplicateIds.length,
          coinsEarned,
          newCoinsBalance: updatedTrainer.coins,
          idempotentReplay: false,
        };
      }),
    );
  }
}

export const economyService = new EconomyService();
