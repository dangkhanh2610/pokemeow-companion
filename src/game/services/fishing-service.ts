import { Prisma } from '@prisma/client';
import { getPrismaClient, withDbRetry } from '@/lib/prisma';
import {
  getBaitSpec,
  getRodSpec,
  getWaterPools,
  resolveBaitId,
  resolveRodId,
  type RodSpec,
} from '../catalog/fishing-catalog';
import { RARITY_CONFIGS, defaultCreatureCatalog } from '../catalog/creature-catalog';
import { defaultCatchStrategyRegistry } from '../engine/catch-strategy';
import { applyXp, computeIvSummary, defaultSpawnEngine } from '../engine/spawn-engine';
import type {
  BaitId,
  BallId,
  CreatureIVs,
  CreatureSpecies,
  RarityTier,
  ThrowBallOutcome,
} from '../types';
import { captchaService, type CaptchaView } from './captcha-service';
import { awardBuddyCatchXpInTx } from './evolution-service';
import { questService } from './quest-service';
import {
  emptyBallInventory,
  isBallId,
  trainerService,
  type TrainerIdentityInput,
} from './trainer-service';

export const FISHING_COOLDOWN_MS = 10_000;
export const FISHING_BITE_TTL_MS = 11_000;
export const FISHING_CATCH_TTL_MS = 13_500;

export type CastRodOutcome =
  | {
      readonly ok: true;
      readonly encounterId: string;
      readonly rod: RodSpec;
      readonly baitUsed: BaitId | null;
      readonly expiresAt: Date;
    }
  | {
      readonly ok: false;
      readonly reason: 'COOLDOWN' | 'ACTIVE_FISHING' | 'CAPTCHA_REQUIRED';
      readonly remainingMs?: number;
      readonly captcha?: CaptchaView;
    };

export type PullHookOutcome =
  | {
      readonly ok: true;
      readonly encounterId: string;
      readonly rod: RodSpec;
      readonly baitUsed: BaitId | null;
      readonly species: CreatureSpecies;
      readonly isShiny: boolean;
      readonly ivs: CreatureIVs;
      readonly ivTotal: number;
      readonly ivPercent: number;
      readonly expiresAt: Date;
      readonly ballInventory: Readonly<Record<BallId, number>>;
    }
  | {
      readonly ok: false;
      readonly message: string;
    };

export type FishingGearStatus = {
  readonly rod: RodSpec;
  readonly coins: number;
  readonly baits: Readonly<Record<BaitId, number>>;
};

export type BuyFishingItemOutcome =
  | {
      readonly ok: true;
      readonly kind: 'ROD' | 'BAIT';
      readonly itemName: string;
      readonly quantityBought: number;
      readonly totalCost: number;
      readonly newCoinsBalance: number;
    }
  | {
      readonly ok: false;
      readonly message: string;
    };

function parseIvsJson(jsonValue: Prisma.JsonValue): CreatureIVs {
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

function rollWaterEncounter(rod: RodSpec, baitUsed: BaitId | null): {
  readonly species: CreatureSpecies;
  readonly isShiny: boolean;
  readonly ivs: CreatureIVs;
} {
  const pools = getWaterPools();
  const tiers: readonly Exclude<RarityTier, 'mega'>[] = [
    'common',
    'uncommon',
    'rare',
    'super_rare',
    'legendary',
  ];

  const adjustedWeights = tiers.map((tier) => {
    let w = rod.weights[tier];
    if (pools[tier].length === 0) {
      w = 0;
    }
    if (
      baitUsed === 'bait_lure' &&
      (tier === 'rare' || tier === 'super_rare' || tier === 'legendary')
    ) {
      w *= 1.8;
    }
    return { tier, w };
  });

  const totalWeight = adjustedWeights.reduce((acc, item) => acc + item.w, 0);
  let threshold = Math.random() * Math.max(0.01, totalWeight);
  let chosenTier: Exclude<RarityTier, 'mega'> = 'common';

  for (const item of adjustedWeights) {
    threshold -= item.w;
    if (threshold <= 0 && item.w > 0) {
      chosenTier = item.tier;
      break;
    }
  }

  const pool = pools[chosenTier].length > 0 ? pools[chosenTier] : pools.common;
  const species = pool[Math.floor(Math.random() * pool.length)] ?? pool[0];
  if (!species) {
    throw new Error('Không tìm thấy dữ liệu Pokémon hệ Water trong catalog.');
  }

  const shinyMultiplier = baitUsed === 'bait_gold' ? 2 : 1;
  const shinyChance = shinyMultiplier / Math.max(1, rod.shinyDenominator);
  const isShiny = Math.random() < shinyChance;
  const ivs = defaultSpawnEngine.generateIVs();

  return { species, isShiny, ivs };
}

export class FishingService {
  public async getFishingGear(userMeta: TrainerIdentityInput): Promise<FishingGearStatus> {
    await trainerService.ensureTrainer(userMeta);
    const prisma = getPrismaClient();
    const trainer = await withDbRetry(() =>
      prisma.trainer.findUniqueOrThrow({
        where: { userId: userMeta.userId },
        select: {
          coins: true,
          fishingRod: true,
          inventory: { select: { itemId: true, quantity: true } },
        },
      }),
    );

    const baits: Record<BaitId, number> = { bait_lure: 0, bait_gold: 0 };
    for (const item of trainer.inventory) {
      if (item.itemId === 'bait_lure' || item.itemId === 'bait_gold') {
        baits[item.itemId] = item.quantity;
      }
    }

    return {
      rod: getRodSpec(trainer.fishingRod),
      coins: trainer.coins,
      baits,
    };
  }

  public async castRod(
    userMeta: TrainerIdentityInput,
    channelId: string,
  ): Promise<CastRodOutcome> {
    await trainerService.ensureTrainer(userMeta);

    const pendingCaptcha = await captchaService.checkSpawnGate(userMeta.userId);
    if (pendingCaptcha) {
      return {
        ok: false,
        reason: 'CAPTCHA_REQUIRED',
        captcha: pendingCaptcha,
      };
    }

    const prisma = getPrismaClient();
    return withDbRetry(() =>
      prisma.$transaction(async (tx) => {
        const now = new Date();
        const trainer = await tx.trainer.findUniqueOrThrow({
          where: { userId: userMeta.userId },
          include: { inventory: true },
        });

        if (trainer.lastFishAt) {
          const elapsed = now.getTime() - trainer.lastFishAt.getTime();
          if (elapsed < FISHING_COOLDOWN_MS) {
            return {
              ok: false,
              reason: 'COOLDOWN',
              remainingMs: FISHING_COOLDOWN_MS - elapsed,
            };
          }
        }

        const activeFish = await tx.fishingEncounter.findFirst({
          where: {
            userId: userMeta.userId,
            status: { in: ['BITING', 'HOOKED'] },
            expiresAt: { gt: now },
          },
          orderBy: { createdAt: 'desc' },
        });

        if (activeFish) {
          return { ok: false, reason: 'ACTIVE_FISHING' };
        }

        const rod = getRodSpec(trainer.fishingRod);
        const invMap = new Map(trainer.inventory.map((i) => [i.itemId, i.quantity]));
        let baitUsed: BaitId | null = null;
        if ((invMap.get('bait_gold') ?? 0) > 0) {
          baitUsed = 'bait_gold';
        } else if ((invMap.get('bait_lure') ?? 0) > 0) {
          baitUsed = 'bait_lure';
        }

        if (baitUsed) {
          const spentBait = await tx.inventoryItem.updateMany({
            where: { userId: userMeta.userId, itemId: baitUsed, quantity: { gte: 1 } },
            data: { quantity: { decrement: 1 } },
          });
          if (spentBait.count === 0) {
            baitUsed = null;
          }
        }

        const roll = rollWaterEncounter(rod, baitUsed);
        const expiresAt = new Date(now.getTime() + FISHING_BITE_TTL_MS);

        const ivsJson: Prisma.InputJsonObject = {
          hp: roll.ivs.hp,
          atk: roll.ivs.atk,
          def: roll.ivs.def,
          spAtk: roll.ivs.spAtk,
          spDef: roll.ivs.spDef,
          spd: roll.ivs.spd,
        };

        const encounter = await tx.fishingEncounter.create({
          data: {
            userId: userMeta.userId,
            channelId,
            rodId: rod.id,
            baitId: baitUsed,
            speciesId: roll.species.id,
            isShiny: roll.isShiny,
            ivsJson,
            status: 'BITING',
            expiresAt,
          },
        });

        await tx.trainer.update({
          where: { userId: userMeta.userId },
          data: {
            lastFishAt: now,
            actionsSinceVerify: { increment: 1 },
          },
        });

        return {
          ok: true,
          encounterId: encounter.id,
          rod,
          baitUsed,
          expiresAt,
        };
      }),
    );
  }

  public async pullHook(encounterId: string, userId: string): Promise<PullHookOutcome> {
    const prisma = getPrismaClient();

    return withDbRetry(() =>
      prisma.$transaction(async (tx) => {
        const enc = await tx.fishingEncounter.findUnique({ where: { id: encounterId } });
        if (!enc) {
          return { ok: false, message: 'Lượt câu cá này không tồn tại hoặc đã kết thúc.' };
        }
        if (enc.userId !== userId) {
          return { ok: false, message: 'Bạn không thể giật cần câu của huấn luyện viên khác!' };
        }

        const now = new Date();
        const expiresAt = new Date(now.getTime() + FISHING_CATCH_TTL_MS + 3500);
        const claimed = await tx.fishingEncounter.updateMany({
          where: {
            id: encounterId,
            userId,
            status: 'BITING',
            expiresAt: { gt: now },
          },
          data: {
            status: 'HOOKED',
            expiresAt,
          },
        });

        if (claimed.count === 0) {
          return {
            ok: false,
            message: 'Cá đã tuột khỏi lưỡi câu hoặc bạn đã giật cần trước đó rồi!',
          };
        }

        const species = defaultCreatureCatalog.getById(enc.speciesId);
        if (!species) {
          return { ok: false, message: 'Không tìm thấy dữ liệu Pokémon.' };
        }

        const items = await tx.inventoryItem.findMany({ where: { userId } });
        const ballInventory = emptyBallInventory();
        for (const item of items) {
          if (isBallId(item.itemId)) {
            ballInventory[item.itemId] = item.quantity;
          }
        }

        const ivs = parseIvsJson(enc.ivsJson);
        const { ivTotal, ivPercent } = computeIvSummary(ivs);
        const baitUsed: BaitId | null =
          enc.baitId === 'bait_lure' || enc.baitId === 'bait_gold' ? enc.baitId : null;

        return {
          ok: true,
          encounterId: enc.id,
          rod: getRodSpec(enc.rodId),
          baitUsed,
          species,
          isShiny: enc.isShiny,
          ivs,
          ivTotal,
          ivPercent,
          expiresAt: new Date(now.getTime() + FISHING_CATCH_TTL_MS),
          ballInventory,
        };
      }),
    );
  }

  public async catchHookedFish(
    encounterId: string,
    userId: string,
    ballId: BallId,
    interactionId: string,
  ): Promise<ThrowBallOutcome> {
    const prisma = getPrismaClient();

    const outcome: ThrowBallOutcome = await withDbRetry(() =>
      prisma.$transaction(async (tx) => {
        const enc = await tx.fishingEncounter.findUnique({ where: { id: encounterId } });
        if (!enc) {
          return {
            ok: false,
            reason: 'NOT_FOUND_OR_EXPIRED',
            message: 'Phiên câu cá này không tồn tại hoặc đã hết hạn.',
          };
        }
        if (enc.userId !== userId) {
          return {
            ok: false,
            reason: 'NOT_OWNER',
            message: 'Bạn không thể ném bóng vào Pokémon của cần thủ khác!',
          };
        }

        const now = new Date();
        const claimed = await tx.fishingEncounter.updateMany({
          where: {
            id: encounterId,
            userId,
            status: 'HOOKED',
            expiresAt: { gt: now },
          },
          data: { status: 'RESOLVING' },
        });

        if (claimed.count === 0) {
          return {
            ok: false,
            reason: 'NOT_FOUND_OR_EXPIRED',
            message: 'Pokémon Nước đã bơi mất trước khi bạn kịp ném bóng.',
          };
        }

        const spent = await tx.inventoryItem.updateMany({
          where: { userId, itemId: ballId, quantity: { gte: 1 } },
          data: { quantity: { decrement: 1 } },
        });

        if (spent.count === 0) {
          await tx.fishingEncounter.update({
            where: { id: encounterId },
            data: { status: 'HOOKED' },
          });
          return {
            ok: false,
            reason: 'INSUFFICIENT_BALLS',
            message: `Bạn đã hết **${ballId}** trong túi! Hãy chọn bóng khác hoặc vào \`/shop\` mua thêm.`,
          };
        }

        const trainer = await tx.trainer.findUniqueOrThrow({ where: { userId } });
        const species = defaultCreatureCatalog.getById(enc.speciesId);
        if (!species) {
          throw new Error(`Không tìm thấy loài ID=${enc.speciesId} trong catalog.`);
        }

        const buddy = trainer.buddyCreatureId
          ? await tx.caughtCreature.findFirst({
              where: {
                id: trainer.buddyCreatureId,
                userId,
                released: false,
                inMarket: false,
              },
              select: {
                id: true,
                speciesId: true,
                speciesName: true,
                isShiny: true,
                xp: true,
                level: true,
              },
            })
          : null;

        const catchChance = defaultCatchStrategyRegistry.calculateChance({
          baseCatchRate: species.baseCatchRate,
          rarity: species.rarity,
          isShiny: enc.isShiny,
          trainerLevel: trainer.level,
          ballId,
          hasBuddyBonus: Boolean(buddy),
        });

        const caught = Math.random() < catchChance;
        const ivs = parseIvsJson(enc.ivsJson);
        const { ivTotal, ivPercent } = computeIvSummary(ivs);

        if (caught) {
          const coinsEarned = Math.round(
            (enc.isShiny ? species.baseReward * 3 : species.baseReward) * 1.2,
          );
          const rawXp = RARITY_CONFIGS[species.rarity].xpReward * (enc.isShiny ? 2 : 1);
          const xpEarned = Math.round(rawXp * (buddy ? 1.15 : 1));
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
              isShiny: enc.isShiny,
              ivTotal,
              ivPercent,
              ivsJson: creatureIvs,
              level: 1,
              ballUsed: ballId,
            },
          });

          const buddyXpSummary = buddy
            ? await awardBuddyCatchXpInTx(
                tx,
                buddy,
                species.rarity,
                enc.isShiny,
                'fishing',
              )
            : undefined;

          const updatedTrainer = await tx.trainer.update({
            where: { userId },
            data: {
              coins: { increment: coinsEarned },
              xp: xpNext.xp,
              level: xpNext.level,
              totalCatches: { increment: 1 },
              totalEncounters: { increment: 1 },
              shinyCatches: { increment: enc.isShiny ? 1 : 0 },
            },
          });

          const fishMeta: Prisma.InputJsonObject = {
            speciesId: species.id,
            speciesName: species.name,
            rarity: species.rarity,
            isShiny: enc.isShiny,
            ballUsed: ballId,
          };

          await tx.economyTransaction.create({
            data: {
              idempotencyKey: `fish-catch:${encounterId}:${interactionId}`,
              userId,
              type: 'FISHING_CATCH',
              coinsDelta: coinsEarned,
              metadata: fishMeta,
            },
          });

          await tx.fishingEncounter.update({
            where: { id: encounterId },
            data: { status: 'CAUGHT' },
          });

          const items = await tx.inventoryItem.findMany({ where: { userId } });
          const remainingBalls = emptyBallInventory();
          for (const item of items) {
            if (isBallId(item.itemId)) {
              remainingBalls[item.itemId] = item.quantity;
            }
          }

          return {
            ok: true,
            caught: true,
            species,
            isShiny: enc.isShiny,
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
            buddyXp: buddyXpSummary,
            remainingBalls,
          };
        }

        await tx.trainer.update({
          where: { userId },
          data: { totalEncounters: { increment: 1 } },
        });

        await tx.fishingEncounter.update({
          where: { id: encounterId },
          data: { status: 'FLED' },
        });

        const items = await tx.inventoryItem.findMany({ where: { userId } });
        const remainingBalls = emptyBallInventory();
        for (const item of items) {
          if (isBallId(item.itemId)) {
            remainingBalls[item.itemId] = item.quantity;
          }
        }

        return {
          ok: true,
          caught: false,
          species,
          isShiny: enc.isShiny,
          ballId,
          catchChance,
          remainingBalls,
        };
      }),
    );

    if (outcome.ok && outcome.caught) {
      await questService
        .recordProgress(userId, {
          kind: 'fish_catch',
          types: outcome.species.types,
          rarity: outcome.species.rarity,
          isShiny: outcome.isShiny,
        })
        .catch(() => undefined);
    }

    return outcome;
  }

  public async expireFishingIfActive(encounterId: string): Promise<boolean> {
    const prisma = getPrismaClient();
    const res = await withDbRetry(() =>
      prisma.fishingEncounter.updateMany({
        where: {
          id: encounterId,
          status: { in: ['BITING', 'HOOKED'] },
        },
        data: { status: 'EXPIRED' },
      }),
    );
    return res.count > 0;
  }

  public async buyFishingItem(
    userMeta: TrainerIdentityInput,
    rawItem: string,
    quantity: number,
    idempotencyKey: string,
  ): Promise<BuyFishingItemOutcome> {
    await trainerService.ensureTrainer(userMeta);
    const rodId = resolveRodId(rawItem);
    const baitId = resolveBaitId(rawItem);

    if (!rodId && !baitId) {
      return {
        ok: false,
        message: `Không tìm thấy cần câu hoặc mồi \`${rawItem}\`. Mã hợp lệ: \`good\`, \`super\`, \`mrod\`, \`lure\`, \`gold\` (hoặc \`2\`–\`6\`).`,
      };
    }

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
            kind: rodId ? 'ROD' : 'BAIT',
            itemName: rawItem,
            quantityBought: rodId ? 1 : quantity,
            totalCost: Math.abs(existingTx.coinsDelta),
            newCoinsBalance: trainer.coins,
          };
        }

        if (rodId) {
          const targetRod = getRodSpec(rodId);
          const currentRod = getRodSpec(trainer.fishingRod);
          if (targetRod.tier <= currentRod.tier) {
            return {
              ok: false,
              message: `Bạn đang dùng **${currentRod.name}** (Cấp ${currentRod.tier}) nên không thể mua lại **${targetRod.name}**!`,
            };
          }

          const spent = await tx.trainer.updateMany({
            where: { userId: userMeta.userId, coins: { gte: targetRod.price } },
            data: { coins: { decrement: targetRod.price } },
          });

          if (spent.count === 0) {
            return {
              ok: false,
              message: `Cần **${targetRod.price.toLocaleString('en-US')} PC** để mua **${targetRod.name}** (bạn có **${trainer.coins.toLocaleString('en-US')} PC**).`,
            };
          }

          const updatedTrainer = await tx.trainer.update({
            where: { userId: userMeta.userId },
            data: { fishingRod: targetRod.id },
          });

          const meta: Prisma.InputJsonObject = { rodId: targetRod.id };
          await tx.economyTransaction.create({
            data: {
              idempotencyKey,
              userId: userMeta.userId,
              type: 'FISHING_SHOP',
              coinsDelta: -targetRod.price,
              metadata: meta,
            },
          });

          return {
            ok: true,
            kind: 'ROD',
            itemName: targetRod.name,
            quantityBought: 1,
            totalCost: targetRod.price,
            newCoinsBalance: updatedTrainer.coins,
          };
        }

        const safeBaitId = baitId!;
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 200) {
          return { ok: false, message: 'Số lượng mồi câu mua mỗi lần phải từ **1** đến **200**.' };
        }

        const bait = getBaitSpec(safeBaitId);
        const totalCost = bait.price * quantity;
        const spent = await tx.trainer.updateMany({
          where: { userId: userMeta.userId, coins: { gte: totalCost } },
          data: { coins: { decrement: totalCost } },
        });

        if (spent.count === 0) {
          return {
            ok: false,
            message: `Không đủ PokéCoins! Mua **${quantity}x ${bait.name}** cần **${totalCost.toLocaleString('en-US')} PC** (bạn có **${trainer.coins.toLocaleString('en-US')} PC**).`,
          };
        }

        await tx.inventoryItem.upsert({
          where: { userId_itemId: { userId: userMeta.userId, itemId: safeBaitId } },
          update: { quantity: { increment: quantity } },
          create: { userId: userMeta.userId, itemId: safeBaitId, quantity },
        });

        const updatedTrainer = await tx.trainer.findUniqueOrThrow({
          where: { userId: userMeta.userId },
        });

        const meta: Prisma.InputJsonObject = { baitId: safeBaitId, quantity };
        await tx.economyTransaction.create({
          data: {
            idempotencyKey,
            userId: userMeta.userId,
            type: 'FISHING_SHOP',
            coinsDelta: -totalCost,
            metadata: meta,
          },
        });

        return {
          ok: true,
          kind: 'BAIT',
          itemName: bait.name,
          quantityBought: quantity,
          totalCost,
          newCoinsBalance: updatedTrainer.coins,
        };
      }),
    );
  }
}

export const fishingService = new FishingService();
