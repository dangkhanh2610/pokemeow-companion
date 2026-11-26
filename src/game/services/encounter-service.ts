import { Prisma } from '@prisma/client';
import { getPrismaClient, withDbRetry } from '@/lib/prisma';
import { BALL_CATALOG } from '../catalog/ball-catalog';
import { defaultCreatureCatalog, RARITY_CONFIGS } from '../catalog/creature-catalog';
import { defaultCatchStrategyRegistry } from '../engine/catch-strategy';
import { applyXp, computeIvSummary, defaultSpawnEngine } from '../engine/spawn-engine';
import type { BallId, CreatureIVs, CreatureSpecies, EncounterRoll, ThrowBallOutcome } from '../types';
import {
  emptyBallInventory,
  isBallId,
  trainerService,
  type TrainerIdentityInput,
} from './trainer-service';

export const WILD_COOLDOWN_MS = 8_000;
export const ENCOUNTER_TTL_MS = 20_000;
const RESCUE_COOLDOWN_MS = 30 * 60 * 1000;
const RESCUE_POKEBALL_GRANT = 3;

export type SpawnEncounterOutcome =
  | {
      readonly ok: true;
      readonly encounterId: string;
      readonly roll: EncounterRoll;
      readonly expiresAt: Date;
      readonly ballInventory: Readonly<Record<BallId, number>>;
      readonly rescueGranted: boolean;
    }
  | {
      readonly ok: false;
      readonly reason: 'COOLDOWN' | 'ACTIVE_ENCOUNTER_EXISTS' | 'SPAWN_IN_FLIGHT';
      readonly remainingMs?: number;
      readonly species?: CreatureSpecies;
    };

class InsufficientBallsError extends Error {
  public readonly ballId: BallId;

  public constructor(ballId: BallId) {
    super(`Không còn ${ballId} trong túi đồ.`);
    this.ballId = ballId;
  }
}

function parseCreatureIvs(jsonValue: Prisma.JsonValue): CreatureIVs {
  if (typeof jsonValue === 'object' && jsonValue !== null && !Array.isArray(jsonValue)) {
    const record = jsonValue as Record<string, unknown>;
    const toNumber = (val: unknown): number =>
      typeof val === 'number' && Number.isFinite(val) ? val : 0;
    return {
      hp: toNumber(record['hp']),
      atk: toNumber(record['atk']),
      def: toNumber(record['def']),
      spAtk: toNumber(record['spAtk']),
      spDef: toNumber(record['spDef']),
      spd: toNumber(record['spd']),
    };
  }
  return { hp: 0, atk: 0, def: 0, spAtk: 0, spDef: 0, spd: 0 };
}

export class EncounterService {
  private readonly inFlightSpawns = new Set<string>();

  public async spawnWildEncounter(
    userMeta: TrainerIdentityInput,
    channelId: string,
  ): Promise<SpawnEncounterOutcome> {
    if (this.inFlightSpawns.has(userMeta.userId)) {
      return { ok: false, reason: 'SPAWN_IN_FLIGHT' };
    }

    this.inFlightSpawns.add(userMeta.userId);
    try {
      await trainerService.ensureTrainer(userMeta);
      const prisma = getPrismaClient();

      return await withDbRetry(() =>
        prisma.$transaction(async (tx) => {
          const now = new Date();
          const trainer = await tx.trainer.findUniqueOrThrow({
            where: { userId: userMeta.userId },
          });

          if (trainer.lastWildAt) {
            const elapsedMs = now.getTime() - trainer.lastWildAt.getTime();
            if (elapsedMs < WILD_COOLDOWN_MS) {
              return {
                ok: false,
                reason: 'COOLDOWN',
                remainingMs: WILD_COOLDOWN_MS - elapsedMs,
              };
            }
          }

          await tx.activeEncounter.updateMany({
            where: {
              userId: userMeta.userId,
              status: 'OPEN',
              expiresAt: { lte: now },
            },
            data: { status: 'EXPIRED' },
          });

          const openEncounter = await tx.activeEncounter.findFirst({
            where: {
              userId: userMeta.userId,
              status: 'OPEN',
              expiresAt: { gt: now },
            },
            orderBy: { createdAt: 'desc' },
          });

          if (openEncounter) {
            return {
              ok: false,
              reason: 'ACTIVE_ENCOUNTER_EXISTS',
              species: defaultCreatureCatalog.getById(openEncounter.speciesId),
            };
          }

          const roll = defaultSpawnEngine.rollEncounter();
          const expiresAt = new Date(now.getTime() + ENCOUNTER_TTL_MS);

          const ivsJson: Prisma.InputJsonObject = {
            hp: roll.ivs.hp,
            atk: roll.ivs.atk,
            def: roll.ivs.def,
            spAtk: roll.ivs.spAtk,
            spDef: roll.ivs.spDef,
            spd: roll.ivs.spd,
          };

          const encounter = await tx.activeEncounter.create({
            data: {
              userId: userMeta.userId,
              channelId,
              speciesId: roll.species.id,
              isShiny: roll.isShiny,
              ivsJson,
              status: 'OPEN',
              expiresAt,
            },
          });

          const items = await tx.inventoryItem.findMany({
            where: { userId: userMeta.userId },
          });

          const ballInventory = emptyBallInventory();
          for (const item of items) {
            if (isBallId(item.itemId)) {
              ballInventory[item.itemId] = item.quantity;
            }
          }

          const totalBalls = BALL_CATALOG.reduce(
            (sum, ball) => sum + ballInventory[ball.id],
            0,
          );

          const canRescue =
            totalBalls === 0 &&
            trainer.coins < 200 &&
            (!trainer.lastRescueAt ||
              now.getTime() - trainer.lastRescueAt.getTime() >= RESCUE_COOLDOWN_MS);

          let rescueGranted = false;
          if (canRescue) {
            const rescueBucket = Math.floor(now.getTime() / RESCUE_COOLDOWN_MS);
            const rescueKey = `rescue:${userMeta.userId}:${rescueBucket}`;
            const existingRescue = await tx.economyTransaction.findUnique({
              where: { idempotencyKey: rescueKey },
            });

            if (!existingRescue) {
              await tx.inventoryItem.upsert({
                where: {
                  userId_itemId: { userId: userMeta.userId, itemId: 'pokeball' },
                },
                update: { quantity: { increment: RESCUE_POKEBALL_GRANT } },
                create: {
                  userId: userMeta.userId,
                  itemId: 'pokeball',
                  quantity: RESCUE_POKEBALL_GRANT,
                },
              });

              const rescueMeta: Prisma.InputJsonObject = {
                pokeball: RESCUE_POKEBALL_GRANT,
              };

              await tx.economyTransaction.create({
                data: {
                  idempotencyKey: rescueKey,
                  userId: userMeta.userId,
                  type: 'RESCUE_GRANT',
                  coinsDelta: 0,
                  metadata: rescueMeta,
                },
              });

              ballInventory.pokeball += RESCUE_POKEBALL_GRANT;
              rescueGranted = true;
            }
          }

          await tx.trainer.update({
            where: { userId: userMeta.userId },
            data: {
              lastWildAt: now,
              ...(rescueGranted ? { lastRescueAt: now } : {}),
            },
          });

          return {
            ok: true,
            encounterId: encounter.id,
            roll,
            expiresAt,
            ballInventory,
            rescueGranted,
          };
        }),
      );
    } finally {
      this.inFlightSpawns.delete(userMeta.userId);
    }
  }

  public async throwBall(
    encounterId: string,
    userId: string,
    ballId: BallId,
    interactionId: string,
  ): Promise<ThrowBallOutcome> {
    const prisma = getPrismaClient();

    try {
      return await withDbRetry(() =>
        prisma.$transaction(async (tx) => {
          const encounter = await tx.activeEncounter.findUnique({
            where: { id: encounterId },
          });

          if (!encounter) {
            return {
              ok: false,
              reason: 'NOT_FOUND_OR_EXPIRED',
              message: 'Phiên chạm trán này không tồn tại hoặc đã hết hạn.',
            };
          }

          if (encounter.userId !== userId) {
            return {
              ok: false,
              reason: 'NOT_OWNER',
              message: 'Bạn không thể ném bóng vào Pokémon của huấn luyện viên khác!',
            };
          }

          const now = new Date();
          const claimed = await tx.activeEncounter.updateMany({
            where: {
              id: encounterId,
              userId,
              status: 'OPEN',
              expiresAt: { gt: now },
            },
            data: { status: 'RESOLVING' },
          });

          if (claimed.count === 0) {
            return {
              ok: false,
              reason: 'NOT_FOUND_OR_EXPIRED',
              message: 'Pokémon này đã được xử lý hoặc đã bỏ chạy mất rồi.',
            };
          }

          const ballSpent = await tx.inventoryItem.updateMany({
            where: {
              userId,
              itemId: ballId,
              quantity: { gte: 1 },
            },
            data: { quantity: { decrement: 1 } },
          });

          if (ballSpent.count === 0) {
            throw new InsufficientBallsError(ballId);
          }

          const trainer = await tx.trainer.findUniqueOrThrow({ where: { userId } });
          const species = defaultCreatureCatalog.getById(encounter.speciesId);

          if (!species) {
            throw new Error(`Không tìm thấy loài ID=${encounter.speciesId} trong catalog.`);
          }

          const catchChance = defaultCatchStrategyRegistry.calculateChance({
            baseCatchRate: species.baseCatchRate,
            rarity: species.rarity,
            isShiny: encounter.isShiny,
            trainerLevel: trainer.level,
            ballId,
          });

          const caught = Math.random() < catchChance;
          const ivs = parseCreatureIvs(encounter.ivsJson);
          const { ivTotal, ivPercent } = computeIvSummary(ivs);

          if (caught) {
            const coinsEarned = encounter.isShiny ? species.baseReward * 3 : species.baseReward;
            const xpEarned =
              RARITY_CONFIGS[species.rarity].xpReward * (encounter.isShiny ? 2 : 1);
            const xpNext = applyXp(trainer.xp, trainer.level, xpEarned);

            const creatureIvs: Prisma.InputJsonObject = {
              hp: ivs.hp,
              atk: ivs.atk,
              def: ivs.def,
              spAtk: ivs.spAtk,
              spDef: ivs.spDef,
              spd: ivs.spd,
            };

            await tx.caughtCreature.create({
              data: {
                userId,
                speciesId: species.id,
                speciesName: species.name,
                rarity: species.rarity,
                isShiny: encounter.isShiny,
                ivTotal,
                ivPercent,
                ivsJson: creatureIvs,
                level: 1,
                ballUsed: ballId,
              },
            });

            const updatedTrainer = await tx.trainer.update({
              where: { userId },
              data: {
                coins: { increment: coinsEarned },
                xp: xpNext.xp,
                level: xpNext.level,
                totalCatches: { increment: 1 },
                totalEncounters: { increment: 1 },
                shinyCatches: { increment: encounter.isShiny ? 1 : 0 },
              },
            });

            const catchMeta: Prisma.InputJsonObject = {
              speciesId: species.id,
              speciesName: species.name,
              rarity: species.rarity,
              isShiny: encounter.isShiny,
              ballUsed: ballId,
            };

            await tx.economyTransaction.create({
              data: {
                idempotencyKey: `catch:${encounterId}:${interactionId}`,
                userId,
                type: 'CATCH_REWARD',
                coinsDelta: coinsEarned,
                metadata: catchMeta,
              },
            });

            await tx.activeEncounter.update({
              where: { id: encounterId },
              data: { status: 'CAUGHT' },
            });

            return {
              ok: true,
              caught: true,
              species,
              isShiny: encounter.isShiny,
              ballId,
              catchChance,
              ivs,
              ivTotal,
              ivPercent,
              coinsEarned,
              xpEarned,
              newLevel: updatedTrainer.level,
              leveledUp: xpNext.leveledUp,
              newCoinsBalance: updatedTrainer.coins,
            };
          }

          await tx.trainer.update({
            where: { userId },
            data: { totalEncounters: { increment: 1 } },
          });

          await tx.activeEncounter.update({
            where: { id: encounterId },
            data: { status: 'FLED' },
          });

          return {
            ok: true,
            caught: false,
            species,
            isShiny: encounter.isShiny,
            ballId,
            catchChance,
          };
        }),
      );
    } catch (error) {
      if (error instanceof InsufficientBallsError) {
        return {
          ok: false,
          reason: 'INSUFFICIENT_BALLS',
          message: `Bạn đã hết **${error.ballId}** trong túi! Hãy chọn bóng khác hoặc vào \`/shop\` mua thêm.`,
        };
      }
      throw error;
    }
  }

  public async expireEncounterIfOpen(encounterId: string): Promise<boolean> {
    const prisma = getPrismaClient();
    const res = await withDbRetry(() =>
      prisma.activeEncounter.updateMany({
        where: { id: encounterId, status: 'OPEN' },
        data: { status: 'EXPIRED' },
      }),
    );
    return res.count > 0;
  }

  public async cleanupStaleEncounters(olderThanHours = 24): Promise<number> {
    const prisma = getPrismaClient();
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    const res = await withDbRetry(() =>
      prisma.activeEncounter.deleteMany({
        where: {
          status: { not: 'OPEN' },
          createdAt: { lt: cutoff },
        },
      }),
    );
    return res.count;
  }
}

export const encounterService = new EncounterService();
