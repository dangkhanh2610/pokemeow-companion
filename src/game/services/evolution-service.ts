import { Prisma } from '@prisma/client';
import { getPrismaClient, withDbRetry } from '@/lib/prisma';
import { defaultCreatureCatalog } from '../catalog/creature-catalog';
import rawEvolutionsData from '../data/evolutions.json';
import {
  addCreatureXp,
  BUDDY_CATCH_XP_BY_RARITY,
  calculateBuddyCatchXp,
  creatureXpNeeded,
  MAX_CREATURE_LEVEL,
} from '../engine/spawn-engine';
import type { BuddyCatchXpSummary, CreatureSpecies, RarityTier } from '../types';
import { trainerService, type TrainerIdentityInput } from './trainer-service';

export {
  addCreatureXp,
  BUDDY_CATCH_XP_BY_RARITY,
  calculateBuddyCatchXp,
  creatureXpNeeded,
  MAX_CREATURE_LEVEL,
};

export interface EvolutionBranch {
  readonly toSpeciesId: number;
  readonly toName: string;
  readonly requiredLevel: number;
}

export interface BuddyView {
  readonly id: string;
  readonly speciesId: number;
  readonly speciesName: string;
  readonly rarity: string;
  readonly isShiny: boolean;
  readonly level: number;
  readonly xp: number;
  readonly nextLevelXp: number;
  readonly ivPercent: number;
  readonly ivTotal: number;
  readonly spriteUrl: string;
  readonly evolutions: readonly EvolutionBranch[];
}

export interface EvolutionCandidateView {
  readonly creatureId: string;
  readonly shortId: string;
  readonly speciesId: number;
  readonly speciesName: string;
  readonly isShiny: boolean;
  readonly level: number;
  readonly ivPercent: number;
  readonly branches: readonly EvolutionBranch[];
  readonly ready: boolean;
}

export type SetBuddyOutcome =
  | { readonly ok: true; readonly buddy: BuddyView }
  | { readonly ok: false; readonly message: string };

export type TrainBuddyOutcome =
  | {
      readonly ok: true;
      readonly buddy: BuddyView;
      readonly levelsGained: number;
      readonly totalCost: number;
      readonly newCoinsBalance: number;
    }
  | { readonly ok: false; readonly message: string };

export type EvolveOutcome =
  | {
      readonly ok: true;
      readonly fromSpecies: CreatureSpecies;
      readonly toSpecies: CreatureSpecies;
      readonly isShiny: boolean;
      readonly level: number;
      readonly ivPercent: number;
      readonly shortId: string;
    }
  | { readonly ok: false; readonly message: string };

export const TRAIN_COST_PER_LEVEL = 400;

const EVOLUTION_MAP: Readonly<Record<string, readonly EvolutionBranch[]>> =
  rawEvolutionsData as Record<string, readonly EvolutionBranch[]>;

export function getEvolutionBranches(speciesId: number): readonly EvolutionBranch[] {
  return EVOLUTION_MAP[String(speciesId)] ?? [];
}

export async function awardBuddyCatchXpInTx(
  tx: Prisma.TransactionClient,
  buddy: {
    readonly id: string;
    readonly speciesId: number;
    readonly speciesName: string;
    readonly isShiny: boolean;
    readonly xp: number;
    readonly level: number;
  },
  caughtRarity: RarityTier,
  caughtIsShiny: boolean,
  source: 'wild' | 'fishing',
  teamCreatureIds: readonly string[] = [],
): Promise<BuddyCatchXpSummary> {
  const xpGained = calculateBuddyCatchXp(caughtRarity, caughtIsShiny, source);

  // EXP Share: các thành viên khác trong đội hình (;team) nhận 50% EXP khi bắt Pokémon
  const benchIds = teamCreatureIds.filter((id, idx) => id !== buddy.id && teamCreatureIds.indexOf(id) === idx);
  if (benchIds.length > 0 && xpGained > 0) {
    const shareXp = Math.max(10, Math.round(xpGained * 0.5));
    const benchCreatures = await tx.caughtCreature.findMany({
      where: { id: { in: benchIds }, released: false, inMarket: false },
      select: { id: true, xp: true, level: true },
    });
    await Promise.all(
      benchCreatures
        .filter((c) => c.level < MAX_CREATURE_LEVEL)
        .map((c) => {
          const nextBench = addCreatureXp(c.xp, c.level, shareXp);
          return tx.caughtCreature.update({
            where: { id: c.id },
            data: { xp: nextBench.xp, level: nextBench.level },
          });
        }),
    );
  }

  if (buddy.level >= MAX_CREATURE_LEVEL) {
    return {
      buddyName: buddy.speciesName,
      isShiny: buddy.isShiny,
      xpGained: 0,
      newLevel: MAX_CREATURE_LEVEL,
      newXp: 0,
      nextLevelXp: 0,
      levelsGained: 0,
      canEvolve: false,
    };
  }

  const next = addCreatureXp(buddy.xp, buddy.level, xpGained);
  await tx.caughtCreature.update({
    where: { id: buddy.id },
    data: { xp: next.xp, level: next.level },
  });

  const canEvolve =
    next.leveledUp &&
    getEvolutionBranches(buddy.speciesId).some((b) => next.level >= b.requiredLevel);

  return {
    buddyName: buddy.speciesName,
    isShiny: buddy.isShiny,
    xpGained,
    newLevel: next.level,
    newXp: next.xp,
    nextLevelXp: next.level >= MAX_CREATURE_LEVEL ? 0 : creatureXpNeeded(next.level),
    levelsGained: next.levelsGained,
    canEvolve,
  };
}

function toBuddyView(creature: {
  readonly id: string;
  readonly speciesId: number;
  readonly speciesName: string;
  readonly rarity: string;
  readonly isShiny: boolean;
  readonly level: number;
  readonly xp: number;
  readonly ivPercent: number;
  readonly ivTotal: number;
}): BuddyView {
  const species = defaultCreatureCatalog.getById(creature.speciesId);
  const spriteUrl = creature.isShiny
    ? (species?.shinyAnimatedSpriteUrl ?? '')
    : (species?.animatedSpriteUrl ?? '');
  return {
    id: creature.id,
    speciesId: creature.speciesId,
    speciesName: creature.speciesName,
    rarity: creature.rarity,
    isShiny: creature.isShiny,
    level: creature.level,
    xp: creature.xp,
    nextLevelXp: creature.level >= MAX_CREATURE_LEVEL ? 0 : creatureXpNeeded(creature.level),
    ivPercent: creature.ivPercent,
    ivTotal: creature.ivTotal,
    spriteUrl,
    evolutions: getEvolutionBranches(creature.speciesId),
  };
}

export class EvolutionService {
  public async getBuddyView(userId: string): Promise<BuddyView | null> {
    const prisma = getPrismaClient();
    const trainer = await withDbRetry(() =>
      prisma.trainer.findUnique({
        where: { userId },
        select: { buddyCreatureId: true },
      }),
    );

    const buddyId = trainer?.buddyCreatureId;
    if (!buddyId) {
      return null;
    }

    const creature = await withDbRetry(() =>
      prisma.caughtCreature.findFirst({
        where: {
          id: buddyId,
          userId,
          released: false,
          inMarket: false,
        },
        select: {
          id: true,
          speciesId: true,
          speciesName: true,
          rarity: true,
          isShiny: true,
          level: true,
          xp: true,
          ivPercent: true,
          ivTotal: true,
        },
      }),
    );

    return creature ? toBuddyView(creature) : null;
  }

  public async setBuddy(
    userMeta: TrainerIdentityInput,
    targetQuery?: string,
  ): Promise<SetBuddyOutcome> {
    await trainerService.ensureTrainer(userMeta);
    const prisma = getPrismaClient();
    const clean = targetQuery?.trim().replace(/^#/, '') ?? '';

    const candidate = await withDbRetry(async () => {
      if (!clean) {
        return prisma.caughtCreature.findFirst({
          where: { userId: userMeta.userId, released: false, inMarket: false },
          orderBy: [{ isShiny: 'desc' }, { ivTotal: 'desc' }, { caughtAt: 'desc' }],
        });
      }

      const byId = await prisma.caughtCreature.findFirst({
        where: {
          userId: userMeta.userId,
          released: false,
          inMarket: false,
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
          inMarket: false,
          speciesName: { contains: clean, mode: 'insensitive' },
        },
        orderBy: [{ isShiny: 'desc' }, { level: 'desc' }, { ivTotal: 'desc' }],
      });
    });

    if (!candidate) {
      return {
        ok: false,
        message: clean
          ? `Không tìm thấy Pokémon khả dụng khớp với \`${clean}\` trong kho (lưu ý Pokémon đang rao chợ hoặc giao dịch không thể làm Buddy).`
          : 'Kho Pokémon của bạn đang trống, hãy bắt Pokémon trước khi chọn Buddy!',
      };
    }

    await withDbRetry(() =>
      prisma.trainer.update({
        where: { userId: userMeta.userId },
        data: { buddyCreatureId: candidate.id },
      }),
    );

    return { ok: true, buddy: toBuddyView(candidate) };
  }

  public async trainBuddy(
    userMeta: TrainerIdentityInput,
    levelsToGain: number,
    idempotencyKey: string,
  ): Promise<TrainBuddyOutcome> {
    if (!Number.isInteger(levelsToGain) || levelsToGain < 1 || levelsToGain > 50) {
      return {
        ok: false,
        message: 'Số cấp huấn luyện mỗi lần phải từ **1** đến **50**.',
      };
    }

    await trainerService.ensureTrainer(userMeta);
    const prisma = getPrismaClient();

    return withDbRetry(() =>
      prisma.$transaction(async (tx) => {
        const existingTx = await tx.economyTransaction.findUnique({
          where: { idempotencyKey },
        });
        const trainer = await tx.trainer.findUniqueOrThrow({
          where: { userId: userMeta.userId },
        });

        if (!trainer.buddyCreatureId) {
          return {
            ok: false,
            message: 'Bạn chưa chọn Pokémon Buddy! Dùng `/buddy set` hoặc `;bd set <tên>` trước nhé.',
          };
        }

        const buddy = await tx.caughtCreature.findFirst({
          where: {
            id: trainer.buddyCreatureId,
            userId: userMeta.userId,
            released: false,
            inMarket: false,
          },
        });

        if (!buddy) {
          return {
            ok: false,
            message: 'Không tìm thấy Buddy hiện tại trong kho của bạn.',
          };
        }

        if (existingTx) {
          return {
            ok: true,
            buddy: toBuddyView(buddy),
            levelsGained: levelsToGain,
            totalCost: Math.abs(existingTx.coinsDelta),
            newCoinsBalance: trainer.coins,
          };
        }

        if (buddy.level >= MAX_CREATURE_LEVEL) {
          return {
            ok: false,
            message: `**${buddy.speciesName}** đã đạt cấp tối đa (**Lv.${MAX_CREATURE_LEVEL}**)!`,
          };
        }

        const actualLevels = Math.min(levelsToGain, MAX_CREATURE_LEVEL - buddy.level);
        const totalCost = actualLevels * TRAIN_COST_PER_LEVEL;

        const spent = await tx.trainer.updateMany({
          where: {
            userId: userMeta.userId,
            coins: { gte: totalCost },
          },
          data: { coins: { decrement: totalCost } },
        });

        if (spent.count === 0) {
          return {
            ok: false,
            message: `Không đủ PokéCoins! Huấn luyện **+${actualLevels} cấp** cần **${totalCost.toLocaleString('en-US')} PC**, bạn hiện có **${trainer.coins.toLocaleString('en-US')} PC**.`,
          };
        }

        const updatedBuddy = await tx.caughtCreature.update({
          where: { id: buddy.id },
          data: {
            level: buddy.level + actualLevels,
            xp: 0,
          },
        });

        const updatedTrainer = await tx.trainer.findUniqueOrThrow({
          where: { userId: userMeta.userId },
        });

        const meta: Prisma.InputJsonObject = {
          creatureId: buddy.id,
          speciesName: buddy.speciesName,
          levelsGained: actualLevels,
        };

        await tx.economyTransaction.create({
          data: {
            idempotencyKey,
            userId: userMeta.userId,
            type: 'BUDDY_TRAIN',
            coinsDelta: -totalCost,
            metadata: meta,
          },
        });

        return {
          ok: true,
          buddy: toBuddyView(updatedBuddy),
          levelsGained: actualLevels,
          totalCost,
          newCoinsBalance: updatedTrainer.coins,
        };
      }),
    );
  }

  public async getEvolutionCandidates(userId: string): Promise<readonly EvolutionCandidateView[]> {
    const prisma = getPrismaClient();
    const creatures = await withDbRetry(() =>
      prisma.caughtCreature.findMany({
        where: { userId, released: false, inMarket: false },
        orderBy: [{ level: 'desc' }, { isShiny: 'desc' }, { ivTotal: 'desc' }],
        take: 120,
        select: {
          id: true,
          speciesId: true,
          speciesName: true,
          isShiny: true,
          level: true,
          ivPercent: true,
        },
      }),
    );

    const list: EvolutionCandidateView[] = [];
    for (const c of creatures) {
      const branches = getEvolutionBranches(c.speciesId);
      if (branches.length === 0) {
        continue;
      }
      const ready = branches.some((b) => c.level >= b.requiredLevel);
      list.push({
        creatureId: c.id,
        shortId: c.id.slice(-6),
        speciesId: c.speciesId,
        speciesName: c.speciesName,
        isShiny: c.isShiny,
        level: c.level,
        ivPercent: c.ivPercent,
        branches,
        ready,
      });
    }

    return list.sort((a, b) => Number(b.ready) - Number(a.ready) || b.level - a.level);
  }

  public async evolveCreature(
    userMeta: TrainerIdentityInput,
    targetQuery: string,
    intoQuery: string | undefined,
    idempotencyKey: string,
  ): Promise<EvolveOutcome> {
    await trainerService.ensureTrainer(userMeta);
    const prisma = getPrismaClient();
    const cleanTarget = targetQuery.trim().replace(/^#/, '');

    return withDbRetry(() =>
      prisma.$transaction(async (tx) => {
        const candidate = await (async () => {
          if (!cleanTarget) {
            const trainer = await tx.trainer.findUniqueOrThrow({
              where: { userId: userMeta.userId },
              select: { buddyCreatureId: true },
            });
            if (!trainer.buddyCreatureId) {
              return null;
            }
            return tx.caughtCreature.findFirst({
              where: {
                id: trainer.buddyCreatureId,
                userId: userMeta.userId,
                released: false,
                inMarket: false,
              },
            });
          }

          const byId = await tx.caughtCreature.findFirst({
            where: {
              userId: userMeta.userId,
              released: false,
              inMarket: false,
              OR: [{ id: cleanTarget }, { id: { endsWith: cleanTarget } }],
            },
            orderBy: { caughtAt: 'desc' },
          });
          if (byId) {
            return byId;
          }

          return tx.caughtCreature.findFirst({
            where: {
              userId: userMeta.userId,
              released: false,
              inMarket: false,
              speciesName: { contains: cleanTarget, mode: 'insensitive' },
            },
            orderBy: [{ level: 'desc' }, { isShiny: 'desc' }, { ivTotal: 'desc' }],
          });
        })();

        if (!candidate) {
          return {
            ok: false,
            message: cleanTarget
              ? `Không tìm thấy Pokémon khả dụng khớp với \`${cleanTarget}\`.`
              : 'Bạn chưa chọn Buddy hoặc chưa chỉ định tên Pokémon cần tiến hóa.',
          };
        }

        const branches = getEvolutionBranches(candidate.speciesId);
        if (branches.length === 0) {
          return {
            ok: false,
            message: `**${candidate.speciesName}** đã ở dạng tiến hóa cuối hoặc chưa hỗ trợ tiến hóa thường (dùng \`/mega\` cho dạng Mega).`,
          };
        }

        let selectedBranch: EvolutionBranch | undefined = branches[0];
        if (intoQuery && intoQuery.trim().length > 0) {
          const cleanInto = intoQuery.trim().toLowerCase();
          selectedBranch = branches.find((b) =>
            b.toName.toLowerCase().includes(cleanInto),
          );
          if (!selectedBranch) {
            const validNames = branches.map((b) => `\`${b.toName}\``).join(', ');
            return {
              ok: false,
              message: `**${candidate.speciesName}** không có nhánh tiến hóa \`${intoQuery}\`. Nhánh hợp lệ: ${validNames}.`,
            };
          }
        } else if (branches.length > 1) {
          const branchList = branches
            .map((b) => `**${b.toName}** (Lv.${b.requiredLevel})`)
            .join(', ');
          return {
            ok: false,
            message: `**${candidate.speciesName}** có nhiều nhánh tiến hóa: ${branchList}. Hãy chọn rõ nhánh muốn tiến hóa (vd: \`/evolve pokemon:eevee into:vaporeon\`).`,
          };
        }

        if (!selectedBranch) {
          return { ok: false, message: 'Không tìm thấy nhánh tiến hóa hợp lệ.' };
        }

        if (candidate.level < selectedBranch.requiredLevel) {
          return {
            ok: false,
            message: `**${candidate.speciesName}** hiện mới **Lv.${candidate.level}**, cần đạt **Lv.${selectedBranch.requiredLevel}** để tiến hóa thành **${selectedBranch.toName}**! Hãy đặt làm \`/buddy\` rồi đi bắt/chiến đấu hoặc \`/buddy train\` để lên cấp.`,
          };
        }

        const fromSpecies = defaultCreatureCatalog.getById(candidate.speciesId);
        const toSpecies = defaultCreatureCatalog.getById(selectedBranch.toSpeciesId);
        if (!fromSpecies || !toSpecies) {
          return { ok: false, message: 'Không tìm thấy thông số loài tiến hóa trong catalog.' };
        }

        const existingTx = await tx.economyTransaction.findUnique({
          where: { idempotencyKey },
        });
        if (existingTx) {
          return {
            ok: true,
            fromSpecies,
            toSpecies,
            isShiny: candidate.isShiny,
            level: candidate.level,
            ivPercent: candidate.ivPercent,
            shortId: candidate.id.slice(-6),
          };
        }

        await tx.caughtCreature.update({
          where: { id: candidate.id },
          data: {
            speciesId: toSpecies.id,
            speciesName: toSpecies.name,
            rarity: toSpecies.rarity,
          },
        });

        const evoMeta: Prisma.InputJsonObject = {
          creatureId: candidate.id,
          fromSpeciesId: fromSpecies.id,
          toSpeciesId: toSpecies.id,
        };

        await tx.economyTransaction.create({
          data: {
            idempotencyKey,
            userId: userMeta.userId,
            type: 'EVOLVE',
            coinsDelta: 0,
            metadata: evoMeta,
          },
        });

        return {
          ok: true,
          fromSpecies,
          toSpecies,
          isShiny: candidate.isShiny,
          level: candidate.level,
          ivPercent: candidate.ivPercent,
          shortId: candidate.id.slice(-6),
        };
      }),
    );
  }
}

export const evolutionService = new EvolutionService();
