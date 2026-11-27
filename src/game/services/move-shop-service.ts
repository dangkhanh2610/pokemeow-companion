import { Prisma } from '@prisma/client';
import { getPrismaClient, withDbRetry } from '@/lib/prisma';
import { defaultCreatureCatalog } from '../catalog/creature-catalog';
import {
  getSpeciesMovePool,
  resolveEquippedMoves,
  type MoveSpec,
} from '../catalog/move-catalog';
import type { CreatureSpecies } from '../types';
import { sortBoxCreatures, trainerService, type TrainerIdentityInput } from './trainer-service';

export interface MoveShopEntryView {
  readonly index: number;
  readonly move: MoveSpec;
  readonly unlocked: boolean;
  readonly equippedSlot: number | null;
}

export interface PokemonMoveShopView {
  readonly creatureId: string;
  readonly shortId: string;
  readonly boxIndex: number;
  readonly species: CreatureSpecies;
  readonly level: number;
  readonly isShiny: boolean;
  readonly isBuddy: boolean;
  readonly ivPercent: number;
  readonly trainerCoins: number;
  readonly starterMoves: readonly [MoveSpec, MoveSpec];
  readonly equippedMoves: readonly MoveSpec[];
  readonly unlockedMoveIds: readonly string[];
  readonly shopEntries: readonly MoveShopEntryView[];
}

export type MoveShopViewOutcome =
  | { readonly ok: true; readonly view: PokemonMoveShopView }
  | { readonly ok: false; readonly message: string };

export type BuyMoveOutcome =
  | {
      readonly ok: true;
      readonly view: PokemonMoveShopView;
      readonly boughtMove: MoveSpec;
      readonly equippedSlot: number | null;
      readonly spentCoins: number;
    }
  | { readonly ok: false; readonly message: string };

export type EquipMoveOutcome =
  | {
      readonly ok: true;
      readonly view: PokemonMoveShopView;
      readonly equippedMove: MoveSpec;
      readonly slot: number;
    }
  | { readonly ok: false; readonly message: string };

interface CreatureMoveRow {
  readonly id: string;
  readonly speciesId: number;
  readonly speciesName: string;
  readonly rarity: string;
  readonly isShiny: boolean;
  readonly ivTotal: number;
  readonly ivPercent: number;
  readonly level: number;
  readonly inMarket: boolean;
  readonly caughtAt: Date;
  readonly unlockedMoves: readonly string[];
  readonly equippedMoves: readonly string[];
}

function buildViewFromRow(
  row: CreatureMoveRow,
  boxIndex: number,
  isBuddy: boolean,
  trainerCoins: number,
): PokemonMoveShopView | null {
  const species = defaultCreatureCatalog.getById(row.speciesId);
  if (!species) {
    return null;
  }

  const pool = getSpeciesMovePool(species);
  const unlockedSet = new Set<string>(row.unlockedMoves);
  const equippedMoves = resolveEquippedMoves(species, row.equippedMoves, row.unlockedMoves);

  const shopEntries: MoveShopEntryView[] = pool.shopMoves.map((move, idx) => {
    const slotIdx = equippedMoves.findIndex((em) => em.id === move.id);
    return {
      index: idx + 1,
      move,
      unlocked: unlockedSet.has(move.id),
      equippedSlot: slotIdx >= 0 ? slotIdx + 1 : null,
    };
  });

  return {
    creatureId: row.id,
    shortId: row.id.slice(-6),
    boxIndex,
    species,
    level: row.level,
    isShiny: row.isShiny,
    isBuddy,
    ivPercent: row.ivPercent,
    trainerCoins,
    starterMoves: pool.starterMoves,
    equippedMoves,
    unlockedMoveIds: [...row.unlockedMoves],
    shopEntries,
  };
}

function findMoveMatch(
  candidates: readonly MoveSpec[],
  rawQuery: string,
): MoveSpec | undefined {
  const clean = rawQuery.trim().toLowerCase();
  if (!clean) {
    return undefined;
  }
  if (/^\d+$/.test(clean)) {
    const idx = Number.parseInt(clean, 10) - 1;
    return candidates[idx];
  }
  return (
    candidates.find((c) => c.id.toLowerCase() === clean) ??
    candidates.find((c) => c.name.toLowerCase() === clean) ??
    candidates.find((c) => c.name.toLowerCase().includes(clean))
  );
}

export class MoveShopService {
  private async findTargetCreatureRow(
    userId: string,
    pokemonQuery?: string,
  ): Promise<{
    readonly row: CreatureMoveRow;
    readonly boxIndex: number;
    readonly isBuddy: boolean;
    readonly trainerCoins: number;
  } | null> {
    const prisma = getPrismaClient();
    const [trainer, rawBox] = await withDbRetry(() =>
      Promise.all([
        prisma.trainer.findUnique({
          where: { userId },
          select: { buddyCreatureId: true, coins: true },
        }),
        prisma.caughtCreature.findMany({
          where: { userId, released: false },
          select: {
            id: true,
            speciesId: true,
            speciesName: true,
            rarity: true,
            isShiny: true,
            ivTotal: true,
            ivPercent: true,
            level: true,
            inMarket: true,
            caughtAt: true,
            unlockedMoves: true,
            equippedMoves: true,
          },
        }),
      ]),
    );

    if (!trainer || rawBox.length === 0) {
      return null;
    }

    const sortedBox = sortBoxCreatures(rawBox, 'rarity');
    const buddyId = trainer.buddyCreatureId;
    const clean = pokemonQuery?.trim() ?? '';

    let pickedIdx = -1;
    if (!clean) {
      pickedIdx = buddyId ? sortedBox.findIndex((c) => c.id === buddyId) : -1;
      if (pickedIdx < 0) {
        pickedIdx = 0;
      }
    } else {
      const noHash = clean.replace(/^#/, '');
      if (/^\d+$/.test(noHash) && !clean.startsWith('#')) {
        const boxNum = Number.parseInt(noHash, 10);
        if (boxNum >= 1 && boxNum <= sortedBox.length) {
          pickedIdx = boxNum - 1;
        }
      }
      if (pickedIdx < 0) {
        pickedIdx = sortedBox.findIndex((c) => c.id === noHash || c.id.endsWith(noHash));
      }
      if (pickedIdx < 0) {
        const lower = clean.toLowerCase();
        const matches = sortedBox
          .map((c, idx) => ({ c, idx }))
          .filter((entry) => entry.c.speciesName.toLowerCase().includes(lower));
        if (matches.length > 0) {
          matches.sort((a, b) => {
            const aExact = a.c.speciesName.toLowerCase() === lower ? 1 : 0;
            const bExact = b.c.speciesName.toLowerCase() === lower ? 1 : 0;
            if (aExact !== bExact) return bExact - aExact;
            const aBuddy = a.c.id === buddyId ? 1 : 0;
            const bBuddy = b.c.id === buddyId ? 1 : 0;
            if (aBuddy !== bBuddy) return bBuddy - aBuddy;
            if (a.c.level !== b.c.level) return b.c.level - a.c.level;
            return b.c.ivTotal - a.c.ivTotal;
          });
          pickedIdx = matches[0]!.idx;
        }
      }
    }

    if (pickedIdx < 0 || !sortedBox[pickedIdx]) {
      return null;
    }
    const row = sortedBox[pickedIdx]!;
    return {
      row,
      boxIndex: pickedIdx + 1,
      isBuddy: buddyId === row.id,
      trainerCoins: trainer.coins,
    };
  }

  public async getMoveShop(
    userId: string,
    pokemonQuery?: string,
  ): Promise<MoveShopViewOutcome> {
    const found = await this.findTargetCreatureRow(userId, pokemonQuery);
    if (!found) {
      return {
        ok: false,
        message: pokemonQuery
          ? `Không tìm thấy Pokémon nào trong kho khớp với \`${pokemonQuery}\`.`
          : 'Bạn chưa có Pokémon nào trong kho! Hãy dùng `/p` bắt ít nhất 1 Pokémon trước.',
      };
    }

    const view = buildViewFromRow(
      found.row,
      found.boxIndex,
      found.isBuddy,
      found.trainerCoins,
    );
    if (!view) {
      return { ok: false, message: 'Không tải được dữ liệu loài Pokémon này.' };
    }
    return { ok: true, view };
  }

  public async getMoveShopByCreatureId(
    userId: string,
    creatureId: string,
  ): Promise<MoveShopViewOutcome> {
    return this.getMoveShop(userId, `#${creatureId}`);
  }

  public async buyMoveByCreatureId(
    userMeta: TrainerIdentityInput,
    creatureId: string,
    moveQuery: string,
    targetSlot: number | undefined,
    idempotencyKey: string,
  ): Promise<BuyMoveOutcome> {
    await trainerService.ensureTrainer(userMeta);
    const prisma = getPrismaClient();

    return withDbRetry(async () => {
      const outcome = await prisma.$transaction(async (tx) => {
        const existingTx = await tx.economyTransaction.findUnique({
          where: { idempotencyKey },
        });
        const trainer = await tx.trainer.findUniqueOrThrow({
          where: { userId: userMeta.userId },
          select: { coins: true, buddyCreatureId: true },
        });
        const creature = await tx.caughtCreature.findFirst({
          where: { id: creatureId, userId: userMeta.userId, released: false },
          select: {
            id: true,
            speciesId: true,
            speciesName: true,
            rarity: true,
            isShiny: true,
            ivTotal: true,
            ivPercent: true,
            level: true,
            inMarket: true,
            caughtAt: true,
            unlockedMoves: true,
            equippedMoves: true,
          },
        });

        if (!creature) {
          return { ok: false as const, message: 'Không tìm thấy Pokémon này trong kho của bạn.' };
        }
        if (creature.inMarket) {
          return {
            ok: false as const,
            message: `**${creature.speciesName}** đang khóa trên Chợ/Trade, hãy gỡ về trước khi học kỹ năng.`,
          };
        }

        const species = defaultCreatureCatalog.getById(creature.speciesId);
        if (!species) {
          return { ok: false as const, message: 'Không tìm thấy dữ liệu loài Pokémon.' };
        }

        const pool = getSpeciesMovePool(species);
        const moveSpec = findMoveMatch(pool.shopMoves, moveQuery);
        if (!moveSpec) {
          return {
            ok: false as const,
            message: `**${species.name}** không học được chiêu \`${moveQuery}\`. Hãy xem danh sách chiêu riêng trong Shop Kỹ Năng!`,
          };
        }

        if (existingTx) {
          return {
            ok: true as const,
            alreadyProcessed: true,
            moveSpec,
            spentCoins: Math.abs(existingTx.coinsDelta),
            equippedSlot: null,
          };
        }

        if (creature.unlockedMoves.includes(moveSpec.id)) {
          return {
            ok: false as const,
            message: `**${creature.speciesName}** đã mở khóa chiêu **${moveSpec.name}** rồi! Dùng \`/moves equip\` để lắp vào ô chiến đấu.`,
          };
        }

        const spent = await tx.trainer.updateMany({
          where: { userId: userMeta.userId, coins: { gte: moveSpec.price } },
          data: { coins: { decrement: moveSpec.price } },
        });

        if (spent.count === 0) {
          return {
            ok: false as const,
            message: `Không đủ PokéCoins! Cần **${moveSpec.price.toLocaleString('en-US')} PC** để học **${moveSpec.name}** (bạn đang có **${trainer.coins.toLocaleString('en-US')} PC**).`,
          };
        }

        const nextUnlocked = [...creature.unlockedMoves, moveSpec.id];
        const currentEquipped = resolveEquippedMoves(
          species,
          creature.equippedMoves,
          creature.unlockedMoves,
        ).map((m) => m.id);

        let equippedSlot: number | null = null;
        if (targetSlot !== undefined && targetSlot >= 1 && targetSlot <= 4) {
          const idx = Math.min(currentEquipped.length, targetSlot - 1);
          if (idx === currentEquipped.length && currentEquipped.length < 4) {
            currentEquipped.push(moveSpec.id);
            equippedSlot = currentEquipped.length;
          } else {
            currentEquipped[idx] = moveSpec.id;
            equippedSlot = idx + 1;
          }
        } else if (currentEquipped.length < 4) {
          currentEquipped.push(moveSpec.id);
          equippedSlot = currentEquipped.length;
        }

        await tx.caughtCreature.update({
          where: { id: creature.id },
          data: {
            unlockedMoves: nextUnlocked,
            equippedMoves: currentEquipped,
          },
        });

        const meta: Prisma.InputJsonObject = {
          creatureId: creature.id,
          speciesName: creature.speciesName,
          moveId: moveSpec.id,
          moveName: moveSpec.name,
        };

        await tx.economyTransaction.create({
          data: {
            idempotencyKey,
            userId: userMeta.userId,
            type: 'MOVE_SHOP_BUY',
            coinsDelta: -moveSpec.price,
            metadata: meta,
          },
        });

        return {
          ok: true as const,
          alreadyProcessed: false,
          moveSpec,
          spentCoins: moveSpec.price,
          equippedSlot,
        };
      });

      if (!outcome.ok) {
        return outcome;
      }

      const refreshed = await this.getMoveShopByCreatureId(userMeta.userId, creatureId);
      if (!refreshed.ok) {
        return { ok: false, message: refreshed.message };
      }

      const slotAfter =
        outcome.equippedSlot ??
        (refreshed.view.equippedMoves.findIndex((m) => m.id === outcome.moveSpec.id) + 1 || null);

      return {
        ok: true,
        view: refreshed.view,
        boughtMove: outcome.moveSpec,
        equippedSlot: slotAfter,
        spentCoins: outcome.spentCoins,
      };
    });
  }

  public async buyMove(
    userMeta: TrainerIdentityInput,
    pokemonQuery: string | undefined,
    moveQuery: string,
    targetSlot: number | undefined,
    idempotencyKey: string,
  ): Promise<BuyMoveOutcome> {
    await trainerService.ensureTrainer(userMeta);
    const found = await this.findTargetCreatureRow(userMeta.userId, pokemonQuery);
    if (!found) {
      return {
        ok: false,
        message: pokemonQuery
          ? `Không tìm thấy Pokémon \`${pokemonQuery}\` trong kho của bạn.`
          : 'Bạn chưa có Pokémon nào trong kho!',
      };
    }
    return this.buyMoveByCreatureId(
      userMeta,
      found.row.id,
      moveQuery,
      targetSlot,
      idempotencyKey,
    );
  }

  public async equipMoveByCreatureId(
    userMeta: TrainerIdentityInput,
    creatureId: string,
    moveQuery: string,
    requestedSlot?: number,
  ): Promise<EquipMoveOutcome> {
    await trainerService.ensureTrainer(userMeta);
    const prisma = getPrismaClient();

    const creature = await withDbRetry(() =>
      prisma.caughtCreature.findFirst({
        where: { id: creatureId, userId: userMeta.userId, released: false },
        select: {
          id: true,
          speciesId: true,
          speciesName: true,
          inMarket: true,
          unlockedMoves: true,
          equippedMoves: true,
        },
      }),
    );

    if (!creature) {
      return { ok: false, message: 'Không tìm thấy Pokémon này trong kho.' };
    }
    if (creature.inMarket) {
      return {
        ok: false,
        message: `**${creature.speciesName}** đang trên Chợ/Trade, hãy gỡ về trước khi đổi chiêu.`,
      };
    }

    const species = defaultCreatureCatalog.getById(creature.speciesId);
    if (!species) {
      return { ok: false, message: 'Không tìm thấy dữ liệu loài Pokémon.' };
    }

    const pool = getSpeciesMovePool(species);
    const unlockedSet = new Set<string>([
      pool.starterMoves[0].id,
      pool.starterMoves[1].id,
      ...creature.unlockedMoves,
    ]);
    const availablePool = [
      ...pool.starterMoves,
      ...pool.shopMoves.filter((m) => unlockedSet.has(m.id)),
    ];

    // Cho phép chọn bằng số thứ tự shop (1..8) hoặc tên/id
    let targetMove: MoveSpec | undefined;
    if (/^\d+$/.test(moveQuery.trim())) {
      const shopEntry = pool.shopMoves[Number.parseInt(moveQuery.trim(), 10) - 1];
      if (shopEntry && unlockedSet.has(shopEntry.id)) {
        targetMove = shopEntry;
      }
    }
    if (!targetMove) {
      targetMove = findMoveMatch(availablePool, moveQuery);
    }

    if (!targetMove) {
      return {
        ok: false,
        message: `**${creature.speciesName}** chưa mở khóa chiêu \`${moveQuery}\`. Hãy mua trong Shop Kỹ Năng trước!`,
      };
    }

    const currentIds = resolveEquippedMoves(
      species,
      creature.equippedMoves,
      creature.unlockedMoves,
    ).map((m) => m.id);

    const existingIdx = currentIds.indexOf(targetMove.id);
    let finalSlot: number;

    if (requestedSlot === undefined) {
      if (existingIdx >= 0) {
        finalSlot = existingIdx + 1;
      } else if (currentIds.length < 4) {
        currentIds.push(targetMove.id);
        finalSlot = currentIds.length;
      } else {
        // Khi đã đủ 4/4, mặc định thay vào ô 4 nếu chưa chỉ định ô
        currentIds[3] = targetMove.id;
        finalSlot = 4;
      }
    } else {
      const clampedSlot = Math.max(1, Math.min(4, requestedSlot));
      const targetIdx = clampedSlot - 1;
      if (targetIdx >= currentIds.length) {
        if (existingIdx >= 0) {
          finalSlot = existingIdx + 1;
        } else {
          currentIds.push(targetMove.id);
          finalSlot = currentIds.length;
        }
      } else if (existingIdx >= 0) {
        const temp = currentIds[targetIdx]!;
        currentIds[targetIdx] = targetMove.id;
        currentIds[existingIdx] = temp;
        finalSlot = clampedSlot;
      } else {
        currentIds[targetIdx] = targetMove.id;
        finalSlot = clampedSlot;
      }
    }

    await withDbRetry(() =>
      prisma.caughtCreature.update({
        where: { id: creature.id },
        data: { equippedMoves: currentIds },
      }),
    );

    const refreshed = await this.getMoveShopByCreatureId(userMeta.userId, creature.id);
    if (!refreshed.ok) {
      return { ok: false, message: refreshed.message };
    }

    return {
      ok: true,
      view: refreshed.view,
      equippedMove: targetMove,
      slot: finalSlot,
    };
  }

  public async equipMove(
    userMeta: TrainerIdentityInput,
    pokemonQuery: string | undefined,
    moveQuery: string,
    requestedSlot: number,
  ): Promise<EquipMoveOutcome> {
    await trainerService.ensureTrainer(userMeta);
    const found = await this.findTargetCreatureRow(userMeta.userId, pokemonQuery);
    if (!found) {
      return {
        ok: false,
        message: pokemonQuery
          ? `Không tìm thấy Pokémon \`${pokemonQuery}\` trong kho của bạn.`
          : 'Bạn chưa có Pokémon nào trong kho!',
      };
    }
    return this.equipMoveByCreatureId(userMeta, found.row.id, moveQuery, requestedSlot);
  }
}

export const moveShopService = new MoveShopService();
