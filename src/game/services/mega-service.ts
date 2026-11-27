import { Prisma } from '@prisma/client';
import { getPrismaClient, withDbRetry } from '@/lib/prisma';
import { defaultCreatureCatalog } from '../catalog/creature-catalog';
import type { CreatureSpecies } from '../types';
import { trainerService, type TrainerIdentityInput } from './trainer-service';

export const MEGA_REQUIRED_LEGENDARIES = 6;
export const MEGA_SACRIFICE_COUNT = 5;

export interface MegaBaseCandidateSummary {
  readonly id: string;
  readonly speciesId: number;
  readonly speciesName: string;
  readonly isShiny: boolean;
  readonly ivPercent: number;
  readonly ivTotal: number;
}

export interface MegaProgressSummary {
  readonly totalLegendaries: number;
  readonly sacrificableLegendaries: number;
  readonly ownedMegaCount: number;
  readonly availableMegas: readonly {
    readonly megaSpecies: CreatureSpecies;
    readonly baseBestIv: number;
    readonly baseIsShiny: boolean;
  }[];
}

export type MegaPreviewOutcome =
  | {
      readonly ok: true;
      readonly megaSpecies: CreatureSpecies;
      readonly baseCreature: MegaBaseCandidateSummary;
      readonly sacrificeList: readonly MegaBaseCandidateSummary[];
      readonly totalLegendaries: number;
    }
  | {
      readonly ok: false;
      readonly message: string;
    };

export type MegaExecuteOutcome =
  | {
      readonly ok: true;
      readonly megaSpecies: CreatureSpecies;
      readonly upgradedCreature: MegaBaseCandidateSummary;
      readonly sacrificedList: readonly MegaBaseCandidateSummary[];
      readonly idempotentReplay: boolean;
    }
  | {
      readonly ok: false;
      readonly message: string;
    };

export class MegaService {
  public async getMegaProgress(userId: string): Promise<MegaProgressSummary> {
    const prisma = getPrismaClient();
    const megaForms = defaultCreatureCatalog.getMegaForms();
    const megaDexNumbers = [...new Set(megaForms.map((m) => m.dexNumber))];

    const [totalLegendaries, sacrificableLegendaries, ownedMegaCount, ownedBases] =
      await withDbRetry(() =>
        Promise.all([
          prisma.caughtCreature.count({
            where: { userId, released: false, rarity: 'legendary' },
          }),
          prisma.caughtCreature.count({
            where: {
              userId,
              released: false,
              rarity: 'legendary',
              isShiny: false,
              isFavorite: false,
            },
          }),
          prisma.caughtCreature.count({
            where: { userId, released: false, rarity: 'mega' },
          }),
          prisma.caughtCreature.findMany({
            where: {
              userId,
              released: false,
              inMarket: false,
              speciesId: { in: megaDexNumbers },
            },
            orderBy: [{ isShiny: 'desc' }, { ivTotal: 'desc' }],
            select: {
              speciesId: true,
              ivPercent: true,
              isShiny: true,
            },
          }),
        ]),
      );

    const bestBaseByDex = new Map<number, { readonly ivPercent: number; readonly isShiny: boolean }>();
    for (const row of ownedBases) {
      if (!bestBaseByDex.has(row.speciesId)) {
        bestBaseByDex.set(row.speciesId, {
          ivPercent: row.ivPercent,
          isShiny: row.isShiny,
        });
      }
    }

    const availableMegas: {
      readonly megaSpecies: CreatureSpecies;
      readonly baseBestIv: number;
      readonly baseIsShiny: boolean;
    }[] = [];

    for (const mega of megaForms) {
      const owned = bestBaseByDex.get(mega.dexNumber);
      if (owned) {
        availableMegas.push({
          megaSpecies: mega,
          baseBestIv: owned.ivPercent,
          baseIsShiny: owned.isShiny,
        });
      }
    }

    return {
      totalLegendaries,
      sacrificableLegendaries,
      ownedMegaCount,
      availableMegas,
    };
  }

  public async previewMegaEvolution(
    userMeta: TrainerIdentityInput,
    query: string,
  ): Promise<MegaPreviewOutcome> {
    await trainerService.ensureTrainer(userMeta);
    const megaSpecies = defaultCreatureCatalog.findMegaByQuery(query);
    if (!megaSpecies || megaSpecies.formType !== 'mega') {
      return {
        ok: false,
        message: `Không tìm thấy dạng Mega / Primal nào khớp với \`${query}\`. Hãy thử ví dụ: \`charizard x\`, \`rayquaza\`, \`lucario\`, \`groudon\`.`,
      };
    }

    const prisma = getPrismaClient();
    const baseSpec = defaultCreatureCatalog.getById(megaSpecies.dexNumber);
    const baseName = baseSpec?.name ?? `#${megaSpecies.dexNumber}`;

    const baseCreature = await withDbRetry(() =>
      prisma.caughtCreature.findFirst({
        where: {
          userId: userMeta.userId,
          released: false,
          inMarket: false,
          speciesId: megaSpecies.dexNumber,
        },
        orderBy: [{ isShiny: 'desc' }, { ivTotal: 'desc' }, { caughtAt: 'asc' }],
        select: {
          id: true,
          speciesId: true,
          speciesName: true,
          isShiny: true,
          ivPercent: true,
          ivTotal: true,
        },
      }),
    );

    if (!baseCreature) {
      return {
        ok: false,
        message: `Bạn cần sở hữu ít nhất 1 **${baseName}** dạng gốc trong kho để tiến hóa lên **${megaSpecies.name}**!`,
      };
    }

    const [totalLegendaries, sacrificeCandidates] = await withDbRetry(() =>
      Promise.all([
        prisma.caughtCreature.count({
          where: {
            userId: userMeta.userId,
            released: false,
            rarity: 'legendary',
          },
        }),
        prisma.caughtCreature.findMany({
          where: {
            userId: userMeta.userId,
            released: false,
            inMarket: false,
            rarity: 'legendary',
            isShiny: false,
            isFavorite: false,
            id: { not: baseCreature.id },
          },
          orderBy: [{ ivTotal: 'asc' }, { caughtAt: 'asc' }],
          take: MEGA_SACRIFICE_COUNT,
          select: {
            id: true,
            speciesId: true,
            speciesName: true,
            isShiny: true,
            ivPercent: true,
            ivTotal: true,
          },
        }),
      ]),
    );

    if (totalLegendaries < MEGA_REQUIRED_LEGENDARIES) {
      return {
        ok: false,
        message: `Bạn cần có ít nhất **${MEGA_REQUIRED_LEGENDARIES} Pokémon Legendary** để thực hiện nghi thức Mega (hiện bạn có **${totalLegendaries}/${MEGA_REQUIRED_LEGENDARIES}**).`,
      };
    }

    if (sacrificeCandidates.length < MEGA_SACRIFICE_COUNT) {
      return {
        ok: false,
        message: `Cần **${MEGA_SACRIFICE_COUNT} Pokémon Legendary** không phải Shiny/Yêu thích để hiến tế (hiện chỉ có **${sacrificeCandidates.length}/${MEGA_SACRIFICE_COUNT}** con hợp lệ; hãy bỏ khóa \`/fav\` nếu cần).`,
      };
    }

    return {
      ok: true,
      megaSpecies,
      baseCreature,
      sacrificeList: sacrificeCandidates,
      totalLegendaries,
    };
  }

  public async executeMegaEvolution(
    userMeta: TrainerIdentityInput,
    megaSpeciesId: number,
    idempotencyKey: string,
  ): Promise<MegaExecuteOutcome> {
    await trainerService.ensureTrainer(userMeta);
    const megaSpecies = defaultCreatureCatalog.getById(megaSpeciesId);
    if (!megaSpecies || megaSpecies.formType !== 'mega') {
      return {
        ok: false,
        message: 'Dạng Mega / Primal được chọn không hợp lệ.',
      };
    }

    const prisma = getPrismaClient();

    return withDbRetry(() =>
      prisma.$transaction(async (tx) => {
        const existingTx = await tx.economyTransaction.findUnique({
          where: { idempotencyKey },
        });

        const baseCreature = await tx.caughtCreature.findFirst({
          where: {
            userId: userMeta.userId,
            released: false,
            inMarket: false,
            speciesId: megaSpecies.dexNumber,
          },
          orderBy: [{ isShiny: 'desc' }, { ivTotal: 'desc' }, { caughtAt: 'asc' }],
          select: {
            id: true,
            speciesId: true,
            speciesName: true,
            isShiny: true,
            ivPercent: true,
            ivTotal: true,
          },
        });

        if (existingTx) {
          const upgraded = await tx.caughtCreature.findFirst({
            where: {
              userId: userMeta.userId,
              released: false,
              speciesId: megaSpecies.id,
            },
            orderBy: { caughtAt: 'desc' },
            select: {
              id: true,
              speciesId: true,
              speciesName: true,
              isShiny: true,
              ivPercent: true,
              ivTotal: true,
            },
          });

          if (upgraded) {
            return {
              ok: true,
              megaSpecies,
              upgradedCreature: upgraded,
              sacrificedList: [],
              idempotentReplay: true,
            };
          }
        }

        if (!baseCreature) {
          return {
            ok: false,
            message: 'Không còn tìm thấy Pokémon dạng gốc hợp lệ trong kho của bạn.',
          };
        }

        const totalLegendaries = await tx.caughtCreature.count({
          where: {
            userId: userMeta.userId,
            released: false,
            rarity: 'legendary',
          },
        });

        if (totalLegendaries < MEGA_REQUIRED_LEGENDARIES) {
          return {
            ok: false,
            message: `Bạn cần ít nhất **${MEGA_REQUIRED_LEGENDARIES} Legendary** (hiện có **${totalLegendaries}**).`,
          };
        }

        const sacrificeList = await tx.caughtCreature.findMany({
          where: {
            userId: userMeta.userId,
            released: false,
            inMarket: false,
            rarity: 'legendary',
            isShiny: false,
            isFavorite: false,
            id: { not: baseCreature.id },
          },
          orderBy: [{ ivTotal: 'asc' }, { caughtAt: 'asc' }],
          take: MEGA_SACRIFICE_COUNT,
          select: {
            id: true,
            speciesId: true,
            speciesName: true,
            isShiny: true,
            ivPercent: true,
            ivTotal: true,
          },
        });

        if (sacrificeList.length < MEGA_SACRIFICE_COUNT) {
          return {
            ok: false,
            message: `Không đủ **${MEGA_SACRIFICE_COUNT} Legendary** không phải Shiny/Yêu thích để hiến tế.`,
          };
        }

        const sacrificeIds = sacrificeList.map((c) => c.id);
        await tx.caughtCreature.updateMany({
          where: {
            id: { in: sacrificeIds },
            userId: userMeta.userId,
            released: false,
          },
          data: { released: true },
        });

        const upgraded = await tx.caughtCreature.update({
          where: { id: baseCreature.id },
          data: {
            speciesId: megaSpecies.id,
            speciesName: megaSpecies.name,
            rarity: 'mega',
            isFavorite: true,
          },
          select: {
            id: true,
            speciesId: true,
            speciesName: true,
            isShiny: true,
            ivPercent: true,
            ivTotal: true,
          },
        });

        const megaMeta: Prisma.InputJsonObject = {
          baseCreatureId: baseCreature.id,
          megaSpeciesId: megaSpecies.id,
          megaSpeciesName: megaSpecies.name,
          sacrificedIds: sacrificeIds,
        };

        await tx.economyTransaction.create({
          data: {
            idempotencyKey,
            userId: userMeta.userId,
            type: 'MEGA_EVOLVE',
            coinsDelta: 0,
            metadata: megaMeta,
          },
        });

        return {
          ok: true,
          megaSpecies,
          upgradedCreature: upgraded,
          sacrificedList: sacrificeList,
          idempotentReplay: false,
        };
      }),
    );
  }
}

export const megaService = new MegaService();
