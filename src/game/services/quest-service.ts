import { Prisma } from '@prisma/client';
import { getPrismaClient, withDbRetry } from '@/lib/prisma';
import type { BallId, QuestPeriod, RarityTier } from '../types';
import { isBallId, trainerService, type TrainerIdentityInput } from './trainer-service';

export interface QuestTemplate {
  readonly code: string;
  readonly title: string;
  readonly description: string;
  readonly kind: 'catch' | 'fish_catch' | 'battle_win';
  readonly targetType?: string;
  readonly minRarity?: 'rare_plus' | 'elite';
  readonly targetValue: number;
  readonly rewardCoins: number;
  readonly rewardBall: BallId;
  readonly rewardQty: number;
}

export interface QuestProgressItem {
  readonly id: string;
  readonly period: QuestPeriod;
  readonly slotIndex: number;
  readonly questCode: string;
  readonly title: string;
  readonly description: string;
  readonly progress: number;
  readonly targetValue: number;
  readonly claimed: boolean;
  readonly completed: boolean;
  readonly rewardCoins: number;
  readonly rewardBall: BallId;
  readonly rewardQty: number;
}

export interface QuestSummary {
  readonly dailyKey: string;
  readonly weeklyKey: string;
  readonly dailyQuests: readonly QuestProgressItem[];
  readonly weeklyQuests: readonly QuestProgressItem[];
  readonly claimableCount: number;
}

export interface ClaimQuestsOutcome {
  readonly claimedCount: number;
  readonly totalCoins: number;
  readonly ballsGranted: Readonly<Partial<Record<BallId, number>>>;
  readonly newCoinsBalance: number;
}

const DAILY_POOL: readonly QuestTemplate[] = [
  {
    code: 'daily_catch_12',
    title: 'Thợ Săn Chăm Chỉ',
    description: 'Bắt 12 Pokémon hoang dã bất kỳ',
    kind: 'catch',
    targetValue: 12,
    rewardCoins: 4000,
    rewardBall: 'ultraball',
    rewardQty: 2,
  },
  {
    code: 'daily_fire_5',
    title: 'Thử Thách Hệ Lửa',
    description: 'Bắt 5 Pokémon mang hệ Fire',
    kind: 'catch',
    targetType: 'Fire',
    targetValue: 5,
    rewardCoins: 5000,
    rewardBall: 'premierball',
    rewardQty: 1,
  },
  {
    code: 'daily_water_5',
    title: 'Thử Thách Hệ Nước',
    description: 'Bắt 5 Pokémon mang hệ Water',
    kind: 'catch',
    targetType: 'Water',
    targetValue: 5,
    rewardCoins: 5000,
    rewardBall: 'premierball',
    rewardQty: 1,
  },
  {
    code: 'daily_grass_5',
    title: 'Thử Thách Hệ Cỏ',
    description: 'Bắt 5 Pokémon mang hệ Grass',
    kind: 'catch',
    targetType: 'Grass',
    targetValue: 5,
    rewardCoins: 5000,
    rewardBall: 'premierball',
    rewardQty: 1,
  },
  {
    code: 'daily_electric_5',
    title: 'Thử Thách Hệ Điện',
    description: 'Bắt 5 Pokémon mang hệ Electric',
    kind: 'catch',
    targetType: 'Electric',
    targetValue: 5,
    rewardCoins: 5000,
    rewardBall: 'premierball',
    rewardQty: 1,
  },
  {
    code: 'daily_rare_2',
    title: 'Săn Hàng Hiếm',
    description: 'Bắt 2 Pokémon Rare trở lên hoặc Shiny',
    kind: 'catch',
    minRarity: 'rare_plus',
    targetValue: 2,
    rewardCoins: 6500,
    rewardBall: 'premierball',
    rewardQty: 2,
  },
  {
    code: 'daily_fish_4',
    title: 'Cần Thủ Chuyên Nghiệp',
    description: 'Câu và bắt thành công 4 Pokémon Nước (/f)',
    kind: 'fish_catch',
    targetValue: 4,
    rewardCoins: 4500,
    rewardBall: 'premierball',
    rewardQty: 1,
  },
  {
    code: 'daily_battle_2',
    title: 'Chiến Binh Đấu Trường',
    description: 'Thắng 2 trận chiến đấu (/battle)',
    kind: 'battle_win',
    targetValue: 2,
    rewardCoins: 5500,
    rewardBall: 'premierball',
    rewardQty: 1,
  },
];

const WEEKLY_POOL: readonly QuestTemplate[] = [
  {
    code: 'weekly_catch_75',
    title: 'Bậc Thầy Thu Phục',
    description: 'Bắt 75 Pokémon trong tuần',
    kind: 'catch',
    targetValue: 75,
    rewardCoins: 30000,
    rewardBall: 'premierball',
    rewardQty: 5,
  },
  {
    code: 'weekly_elite_5',
    title: 'Thợ Săn Huyền Thoại',
    description: 'Bắt 5 Super Rare / Legendary / Shiny',
    kind: 'catch',
    minRarity: 'elite',
    targetValue: 5,
    rewardCoins: 60000,
    rewardBall: 'masterball',
    rewardQty: 1,
  },
];

const TEMPLATE_MAP = new Map<string, QuestTemplate>(
  [...DAILY_POOL, ...WEEKLY_POOL].map((q) => [q.code, q]),
);

function getDailyPeriodKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function getIsoWeekKey(now: Date): string {
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickDailyTemplates(userId: string, dailyKey: string): readonly QuestTemplate[] {
  const pool = [...DAILY_POOL];
  let seed = hashSeed(`${userId}:${dailyKey}`);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822507) >>> 0;
    const j = seed % (i + 1);
    const tmp = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = tmp;
  }
  return pool.slice(0, 3);
}

function doesEventMatchTemplate(
  tpl: QuestTemplate,
  event: {
    readonly kind: 'catch' | 'fish_catch' | 'battle_win';
    readonly types?: readonly string[];
    readonly rarity?: RarityTier;
    readonly isShiny?: boolean;
  },
): boolean {
  if (tpl.kind === 'catch') {
    if (event.kind !== 'catch' && event.kind !== 'fish_catch') {
      return false;
    }
    if (tpl.targetType) {
      const types = event.types ?? [];
      if (!types.some((t) => t.toLowerCase() === tpl.targetType?.toLowerCase())) {
        return false;
      }
    }
    if (tpl.minRarity === 'rare_plus') {
      const r = event.rarity;
      return Boolean(
        event.isShiny ||
          r === 'rare' ||
          r === 'super_rare' ||
          r === 'legendary' ||
          r === 'mega',
      );
    }
    if (tpl.minRarity === 'elite') {
      const r = event.rarity;
      return Boolean(
        event.isShiny || r === 'super_rare' || r === 'legendary' || r === 'mega',
      );
    }
    return true;
  }

  return tpl.kind === event.kind;
}

function toProgressItem(row: {
  readonly id: string;
  readonly period: string;
  readonly slotIndex: number;
  readonly questCode: string;
  readonly targetValue: number;
  readonly progress: number;
  readonly claimed: boolean;
  readonly rewardCoins: number;
  readonly rewardBall: string;
  readonly rewardQty: number;
}): QuestProgressItem {
  const tpl = TEMPLATE_MAP.get(row.questCode);
  const period: QuestPeriod = row.period === 'WEEKLY' ? 'WEEKLY' : 'DAILY';
  const rewardBall: BallId = isBallId(row.rewardBall) ? row.rewardBall : 'pokeball';
  return {
    id: row.id,
    period,
    slotIndex: row.slotIndex,
    questCode: row.questCode,
    title: tpl?.title ?? row.questCode,
    description: tpl?.description ?? 'Hoàn thành mục tiêu nhiệm vụ',
    progress: Math.min(row.progress, row.targetValue),
    targetValue: row.targetValue,
    claimed: row.claimed,
    completed: row.progress >= row.targetValue,
    rewardCoins: row.rewardCoins,
    rewardBall,
    rewardQty: row.rewardQty,
  };
}

export class QuestService {
  public async ensureActiveQuests(userId: string): Promise<{
    readonly dailyKey: string;
    readonly weeklyKey: string;
  }> {
    const now = new Date();
    const dailyKey = getDailyPeriodKey(now);
    const weeklyKey = getIsoWeekKey(now);
    const prisma = getPrismaClient();

    const [dailyCount, weeklyCount] = await withDbRetry(() =>
      Promise.all([
        prisma.trainerQuest.count({
          where: { userId, period: 'DAILY', periodKey: dailyKey },
        }),
        prisma.trainerQuest.count({
          where: { userId, period: 'WEEKLY', periodKey: weeklyKey },
        }),
      ]),
    );

    const rowsToCreate: Prisma.TrainerQuestCreateManyInput[] = [];

    if (dailyCount < 3) {
      const chosenDaily = pickDailyTemplates(userId, dailyKey);
      chosenDaily.forEach((tpl, idx) => {
        rowsToCreate.push({
          userId,
          period: 'DAILY',
          periodKey: dailyKey,
          slotIndex: idx,
          questCode: tpl.code,
          targetValue: tpl.targetValue,
          rewardCoins: tpl.rewardCoins,
          rewardBall: tpl.rewardBall,
          rewardQty: tpl.rewardQty,
        });
      });
    }

    if (weeklyCount < WEEKLY_POOL.length) {
      WEEKLY_POOL.forEach((tpl, idx) => {
        rowsToCreate.push({
          userId,
          period: 'WEEKLY',
          periodKey: weeklyKey,
          slotIndex: idx,
          questCode: tpl.code,
          targetValue: tpl.targetValue,
          rewardCoins: tpl.rewardCoins,
          rewardBall: tpl.rewardBall,
          rewardQty: tpl.rewardQty,
        });
      });
    }

    if (rowsToCreate.length > 0) {
      await withDbRetry(() =>
        prisma.trainerQuest.createMany({
          data: rowsToCreate,
          skipDuplicates: true,
        }),
      );
    }

    return { dailyKey, weeklyKey };
  }

  public async getQuestSummary(userMeta: TrainerIdentityInput): Promise<QuestSummary> {
    await trainerService.ensureTrainer(userMeta);
    const { dailyKey, weeklyKey } = await this.ensureActiveQuests(userMeta.userId);
    const prisma = getPrismaClient();

    const rows = await withDbRetry(() =>
      prisma.trainerQuest.findMany({
        where: {
          userId: userMeta.userId,
          OR: [
            { period: 'DAILY', periodKey: dailyKey },
            { period: 'WEEKLY', periodKey: weeklyKey },
          ],
        },
        orderBy: [{ slotIndex: 'asc' }],
      }),
    );

    const dailyQuests = rows
      .filter((r) => r.period === 'DAILY')
      .map(toProgressItem);
    const weeklyQuests = rows
      .filter((r) => r.period === 'WEEKLY')
      .map(toProgressItem);
    const claimableCount = [...dailyQuests, ...weeklyQuests].filter(
      (q) => q.completed && !q.claimed,
    ).length;

    return {
      dailyKey,
      weeklyKey,
      dailyQuests,
      weeklyQuests,
      claimableCount,
    };
  }

  public async recordProgress(
    userId: string,
    event: {
      readonly kind: 'catch' | 'fish_catch' | 'battle_win';
      readonly types?: readonly string[];
      readonly rarity?: RarityTier;
      readonly isShiny?: boolean;
    },
  ): Promise<void> {
    const { dailyKey, weeklyKey } = await this.ensureActiveQuests(userId);
    const prisma = getPrismaClient();

    const activeRows = await withDbRetry(() =>
      prisma.trainerQuest.findMany({
        where: {
          userId,
          claimed: false,
          OR: [
            { period: 'DAILY', periodKey: dailyKey },
            { period: 'WEEKLY', periodKey: weeklyKey },
          ],
        },
      }),
    );

    const matchedIds: string[] = [];
    for (const row of activeRows) {
      if (row.progress >= row.targetValue) {
        continue;
      }
      const tpl = TEMPLATE_MAP.get(row.questCode);
      if (tpl && doesEventMatchTemplate(tpl, event)) {
        matchedIds.push(row.id);
      }
    }

    if (matchedIds.length === 0) {
      return;
    }

    await Promise.all(
      matchedIds.map((questId) =>
        withDbRetry(() =>
          prisma.trainerQuest.update({
            where: { id: questId },
            data: { progress: { increment: 1 } },
          }),
        ),
      ),
    );
  }

  public async claimRewards(
    userMeta: TrainerIdentityInput,
    idempotencyKey: string,
  ): Promise<ClaimQuestsOutcome> {
    await trainerService.ensureTrainer(userMeta);
    const { dailyKey, weeklyKey } = await this.ensureActiveQuests(userMeta.userId);
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
          return {
            claimedCount: typeof meta['claimedCount'] === 'number' ? meta['claimedCount'] : 0,
            totalCoins: existingTx.coinsDelta,
            ballsGranted: {},
            newCoinsBalance: trainer.coins,
          };
        }

        const activeRows = await tx.trainerQuest.findMany({
          where: {
            userId: userMeta.userId,
            claimed: false,
            OR: [
              { period: 'DAILY', periodKey: dailyKey },
              { period: 'WEEKLY', periodKey: weeklyKey },
            ],
          },
        });

        const claimable = activeRows.filter((q) => q.progress >= q.targetValue);
        if (claimable.length === 0) {
          const trainer = await tx.trainer.findUniqueOrThrow({
            where: { userId: userMeta.userId },
          });
          return {
            claimedCount: 0,
            totalCoins: 0,
            ballsGranted: {},
            newCoinsBalance: trainer.coins,
          };
        }

        const claimIds = claimable.map((q) => q.id);
        const marked = await tx.trainerQuest.updateMany({
          where: { id: { in: claimIds }, claimed: false },
          data: { claimed: true },
        });

        if (marked.count === 0) {
          const trainer = await tx.trainer.findUniqueOrThrow({
            where: { userId: userMeta.userId },
          });
          return {
            claimedCount: 0,
            totalCoins: 0,
            ballsGranted: {},
            newCoinsBalance: trainer.coins,
          };
        }

        let totalCoins = 0;
        const ballsGranted: Partial<Record<BallId, number>> = {};

        for (const quest of claimable) {
          totalCoins += quest.rewardCoins;
          const ballId: BallId = isBallId(quest.rewardBall) ? quest.rewardBall : 'pokeball';
          ballsGranted[ballId] = (ballsGranted[ballId] ?? 0) + quest.rewardQty;
        }

        const updatedTrainer = await tx.trainer.update({
          where: { userId: userMeta.userId },
          data: { coins: { increment: totalCoins } },
        });

        for (const [ballId, qty] of Object.entries(ballsGranted)) {
          if (qty && qty > 0) {
            await tx.inventoryItem.upsert({
              where: {
                userId_itemId: { userId: userMeta.userId, itemId: ballId },
              },
              update: { quantity: { increment: qty } },
              create: {
                userId: userMeta.userId,
                itemId: ballId,
                quantity: qty,
              },
            });
          }
        }

        const meta: Prisma.InputJsonObject = {
          claimedCount: claimable.length,
          ballsGranted: ballsGranted as Prisma.InputJsonObject,
        };

        await tx.economyTransaction.create({
          data: {
            idempotencyKey,
            userId: userMeta.userId,
            type: 'QUEST_CLAIM',
            coinsDelta: totalCoins,
            metadata: meta,
          },
        });

        return {
          claimedCount: claimable.length,
          totalCoins,
          ballsGranted,
          newCoinsBalance: updatedTrainer.coins,
        };
      }),
    );
  }
}

export const questService = new QuestService();
