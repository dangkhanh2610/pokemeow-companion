import { Prisma } from '@prisma/client';
import { getPrismaClient, withDbRetry } from '@/lib/prisma';
import { defaultCreatureCatalog } from '../catalog/creature-catalog';
import { resolveEquippedMoves, type MoveSpec } from '../catalog/move-catalog';
import { computeComputedStats, type ComputedCreatureStats } from '../engine/battle-engine';
import { creatureXpNeeded, MAX_CREATURE_LEVEL } from '../engine/spawn-engine';
import type { CreatureIVs, CreatureSpecies } from '../types';
import { sortBoxCreatures, trainerService, type TrainerIdentityInput } from './trainer-service';

export const MAX_TEAM_SIZE = 3;

export interface TeamMemberView {
  readonly slot: 1 | 2 | 3;
  readonly creatureId: string;
  readonly shortId: string;
  readonly boxIndex: number;
  readonly species: CreatureSpecies;
  readonly isShiny: boolean;
  readonly isBuddy: boolean;
  readonly isFavorite: boolean;
  readonly level: number;
  readonly xp: number;
  readonly nextLevelXp: number;
  readonly ivs: CreatureIVs;
  readonly ivPercent: number;
  readonly stats: ComputedCreatureStats;
  readonly equippedMoves: readonly MoveSpec[];
}

export interface TeamView {
  readonly slots: readonly (TeamMemberView | null)[];
  readonly members: readonly TeamMemberView[];
  readonly totalCp: number;
}

export type TeamActionOutcome =
  | { readonly ok: true; readonly team: TeamView; readonly message: string }
  | { readonly ok: false; readonly message: string };

interface TeamCandidateRow {
  readonly id: string;
  readonly speciesId: number;
  readonly speciesName: string;
  readonly rarity: string;
  readonly isShiny: boolean;
  readonly isFavorite: boolean;
  readonly ivTotal: number;
  readonly ivPercent: number;
  readonly ivsJson: Prisma.JsonValue;
  readonly level: number;
  readonly xp: number;
  readonly caughtAt: Date;
  readonly unlockedMoves: readonly string[];
  readonly equippedMoves: readonly string[];
}

function parseTeamIvs(jsonValue: Prisma.JsonValue): CreatureIVs {
  if (typeof jsonValue === 'object' && jsonValue !== null && !Array.isArray(jsonValue)) {
    const rec = jsonValue as Record<string, unknown>;
    const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 15);
    return {
      hp: num(rec['hp']),
      atk: num(rec['atk']),
      def: num(rec['def']),
      spAtk: num(rec['spAtk']),
      spDef: num(rec['spDef']),
      spd: num(rec['spd']),
    };
  }
  return { hp: 15, atk: 15, def: 15, spAtk: 15, spDef: 15, spd: 15 };
}

function scoreCreatureForAutoTeam(
  row: TeamCandidateRow,
  buddyId: string | null,
): number {
  const species = defaultCreatureCatalog.getById(row.speciesId);
  const ivs = parseTeamIvs(row.ivsJson);
  const cp = species
    ? computeComputedStats(species, ivs, row.level, row.isShiny).combatPower
    : row.level * 10;
  const buddyBoost = row.id === buddyId ? 1_000_000 : 0;
  return buddyBoost + row.level * 1000 + cp;
}

function toMemberView(
  row: TeamCandidateRow,
  slot: 1 | 2 | 3,
  boxIndex: number,
  buddyId: string | null,
): TeamMemberView | null {
  const species = defaultCreatureCatalog.getById(row.speciesId);
  if (!species) {
    return null;
  }
  const ivs = parseTeamIvs(row.ivsJson);
  const stats = computeComputedStats(species, ivs, row.level, row.isShiny);
  const equippedMoves = resolveEquippedMoves(species, row.equippedMoves, row.unlockedMoves);

  return {
    slot,
    creatureId: row.id,
    shortId: row.id.slice(-6),
    boxIndex,
    species,
    isShiny: row.isShiny,
    isBuddy: row.id === buddyId,
    isFavorite: row.isFavorite,
    level: row.level,
    xp: row.xp,
    nextLevelXp: row.level >= MAX_CREATURE_LEVEL ? 0 : creatureXpNeeded(row.level),
    ivs,
    ivPercent: row.ivPercent,
    stats,
    equippedMoves,
  };
}

function resolveOwnedCreatureFromList(
  sortedBox: readonly TeamCandidateRow[],
  buddyId: string | null,
  rawQuery: string,
): TeamCandidateRow | null {
  const clean = rawQuery.trim();
  if (!clean) {
    return null;
  }
  const noHash = clean.replace(/^#/, '');

  if (/^\d+$/.test(noHash) && !clean.startsWith('#')) {
    const idx = Number.parseInt(noHash, 10) - 1;
    if (idx >= 0 && idx < sortedBox.length) {
      return sortedBox[idx] ?? null;
    }
  }

  const byId = sortedBox.find((c) => c.id === noHash || c.id.endsWith(noHash));
  if (byId) {
    return byId;
  }

  const lower = clean.toLowerCase();
  const matches = sortedBox.filter((c) => c.speciesName.toLowerCase().includes(lower));
  if (matches.length === 0) {
    return null;
  }

  matches.sort((a, b) => {
    const aExact = a.speciesName.toLowerCase() === lower ? 1 : 0;
    const bExact = b.speciesName.toLowerCase() === lower ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;
    const aBuddy = a.id === buddyId ? 1 : 0;
    const bBuddy = b.id === buddyId ? 1 : 0;
    if (aBuddy !== bBuddy) return bBuddy - aBuddy;
    if (a.level !== b.level) return b.level - a.level;
    return b.ivTotal - a.ivTotal;
  });
  return matches[0] ?? null;
}

export class TeamService {
  private async fetchTeamState(userId: string): Promise<{
    readonly buddyId: string | null;
    readonly storedIds: readonly string[];
    readonly availableRows: readonly TeamCandidateRow[];
    readonly sortedBox: readonly TeamCandidateRow[];
  }> {
    const prisma = getPrismaClient();
    const [trainer, availableRows] = await withDbRetry(() =>
      Promise.all([
        prisma.trainer.findUnique({
          where: { userId },
          select: { buddyCreatureId: true, teamCreatureIds: true },
        }),
        prisma.caughtCreature.findMany({
          where: { userId, released: false, inMarket: false },
          select: {
            id: true,
            speciesId: true,
            speciesName: true,
            rarity: true,
            isShiny: true,
            isFavorite: true,
            ivTotal: true,
            ivPercent: true,
            ivsJson: true,
            level: true,
            xp: true,
            caughtAt: true,
            unlockedMoves: true,
            equippedMoves: true,
          },
        }),
      ]),
    );

    const buddyId = trainer?.buddyCreatureId ?? null;
    const storedIds = trainer?.teamCreatureIds ?? [];
    const sortedBox = sortBoxCreatures(availableRows, 'rarity');
    return { buddyId, storedIds, availableRows, sortedBox };
  }

  private buildTeamView(
    teamIds: readonly string[],
    buddyId: string | null,
    sortedBox: readonly TeamCandidateRow[],
  ): TeamView {
    const rowById = new Map(sortedBox.map((r, idx) => [r.id, { row: r, boxIndex: idx + 1 }]));
    const slots: (TeamMemberView | null)[] = [null, null, null];
    const members: TeamMemberView[] = [];

    for (let i = 0; i < MAX_TEAM_SIZE; i += 1) {
      const id = teamIds[i];
      if (!id) continue;
      const entry = rowById.get(id);
      if (!entry) continue;
      const slotNum = (i + 1) as 1 | 2 | 3;
      const view = toMemberView(entry.row, slotNum, entry.boxIndex, buddyId);
      if (view) {
        slots[i] = view;
        members.push(view);
      }
    }

    const totalCp = members.reduce((sum, m) => sum + m.stats.combatPower, 0);
    return { slots, members, totalCp };
  }

  private pickBestThreeIds(
    availableRows: readonly TeamCandidateRow[],
    buddyId: string | null,
  ): string[] {
    const ranked = [...availableRows].sort(
      (a, b) => scoreCreatureForAutoTeam(b, buddyId) - scoreCreatureForAutoTeam(a, buddyId),
    );
    return ranked.slice(0, MAX_TEAM_SIZE).map((r) => r.id);
  }

  public async getTeamView(userId: string): Promise<TeamView> {
    const { buddyId, storedIds, availableRows, sortedBox } = await this.fetchTeamState(userId);
    const availableSet = new Set(availableRows.map((r) => r.id));

    let validIds = storedIds.filter((id, idx) => availableSet.has(id) && storedIds.indexOf(id) === idx).slice(0, MAX_TEAM_SIZE);

    if (validIds.length === 0 && availableRows.length > 0) {
      validIds = this.pickBestThreeIds(availableRows, buddyId);
      const prisma = getPrismaClient();
      await withDbRetry(() =>
        prisma.trainer.update({
          where: { userId },
          data: { teamCreatureIds: validIds },
        }),
      );
    } else if (validIds.length !== storedIds.length) {
      const prisma = getPrismaClient();
      await withDbRetry(() =>
        prisma.trainer.update({
          where: { userId },
          data: { teamCreatureIds: validIds },
        }),
      );
    }

    return this.buildTeamView(validIds, buddyId, sortedBox);
  }

  public async getBattleParty(userId: string): Promise<readonly TeamMemberView[]> {
    const view = await this.getTeamView(userId);
    return view.members;
  }

  public async setTeamSlot(
    userMeta: TrainerIdentityInput,
    pokemonQuery: string,
    requestedSlot?: number,
  ): Promise<TeamActionOutcome> {
    await trainerService.ensureTrainer(userMeta);
    const { buddyId, storedIds, availableRows, sortedBox } = await this.fetchTeamState(
      userMeta.userId,
    );

    if (availableRows.length === 0) {
      return {
        ok: false,
        message: 'Bạn chưa có Pokémon nào khả dụng trong kho! Hãy dùng `;p` bắt Pokémon trước.',
      };
    }

    const picked = resolveOwnedCreatureFromList(sortedBox, buddyId, pokemonQuery);
    if (!picked) {
      return {
        ok: false,
        message: `Không tìm thấy Pokémon khả dụng khớp với \`${pokemonQuery}\` trong kho (lưu ý Pokémon đang khóa Chợ/Trade không thể vào team).`,
      };
    }

    const availableSet = new Set(availableRows.map((r) => r.id));
    let currentIds = storedIds
      .filter((id, idx) => availableSet.has(id) && storedIds.indexOf(id) === idx)
      .slice(0, MAX_TEAM_SIZE);

    if (currentIds.length === 0) {
      currentIds = this.pickBestThreeIds(availableRows, buddyId);
    }

    const existingIdx = currentIds.indexOf(picked.id);
    let assignedSlot: number;

    if (requestedSlot !== undefined) {
      if (!Number.isInteger(requestedSlot) || requestedSlot < 1 || requestedSlot > MAX_TEAM_SIZE) {
        return { ok: false, message: 'Vị trí trong đội hình chỉ từ **1** đến **3**.' };
      }
      const targetIdx = requestedSlot - 1;
      if (existingIdx === targetIdx) {
        return {
          ok: true,
          team: this.buildTeamView(currentIds, buddyId, sortedBox),
          message: `**${picked.speciesName}** hiện đã nằm ở **Ô #${requestedSlot}** rồi!`,
        };
      }
      if (existingIdx >= 0) {
        if (targetIdx < currentIds.length) {
          const temp = currentIds[targetIdx]!;
          currentIds[targetIdx] = picked.id;
          currentIds[existingIdx] = temp;
          assignedSlot = requestedSlot;
        } else {
          currentIds.splice(existingIdx, 1);
          currentIds.push(picked.id);
          assignedSlot = currentIds.length;
        }
      } else if (targetIdx < currentIds.length) {
        currentIds[targetIdx] = picked.id;
        assignedSlot = requestedSlot;
      } else {
        currentIds.push(picked.id);
        assignedSlot = currentIds.length;
      }
    } else {
      if (existingIdx >= 0) {
        return {
          ok: false,
          message: `**${picked.speciesName}** (\`#${picked.id.slice(-6)}\`) đã nằm ở **Ô #${existingIdx + 1}** trong đội hình rồi! Dùng \`;team set <1-3> <tên>\` nếu muốn đổi vị trí.`,
        };
      }
      if (currentIds.length < MAX_TEAM_SIZE) {
        currentIds.push(picked.id);
        assignedSlot = currentIds.length;
      } else {
        return {
          ok: false,
          message:
            'Đội hình đã đủ **3/3 Pokémon**! Hãy chỉ định ô muốn thay: `;team set <1|2|3> <tên_pokemon>` hoặc `/team set`.',
        };
      }
    }

    const prisma = getPrismaClient();
    await withDbRetry(() =>
      prisma.trainer.update({
        where: { userId: userMeta.userId },
        data: { teamCreatureIds: currentIds },
      }),
    );

    return {
      ok: true,
      team: this.buildTeamView(currentIds, buddyId, sortedBox),
      message: `Đã xếp **${picked.speciesName}** (\`Lv.${picked.level}\` · \`#${picked.id.slice(-6)}\`) vào **Ô #${assignedSlot}** của đội hình!`,
    };
  }

  public async swapTeamSlots(
    userMeta: TrainerIdentityInput,
    slotA: number,
    slotB: number,
  ): Promise<TeamActionOutcome> {
    await trainerService.ensureTrainer(userMeta);
    if (
      !Number.isInteger(slotA) ||
      !Number.isInteger(slotB) ||
      slotA < 1 ||
      slotA > MAX_TEAM_SIZE ||
      slotB < 1 ||
      slotB > MAX_TEAM_SIZE
    ) {
      return { ok: false, message: 'Vị trí đổi chỗ phải từ **1** đến **3**.' };
    }
    if (slotA === slotB) {
      return { ok: false, message: 'Hai vị trí cần đổi phải khác nhau!' };
    }

    const view = await this.getTeamView(userMeta.userId);
    const ids = view.members.map((m) => m.creatureId);
    if (slotA > ids.length || slotB > ids.length) {
      return {
        ok: false,
        message: `Đội hình hiện mới có **${ids.length}/3 Pokémon** nên không thể đổi với ô trống.`,
      };
    }

    const idxA = slotA - 1;
    const idxB = slotB - 1;
    const temp = ids[idxA]!;
    ids[idxA] = ids[idxB]!;
    ids[idxB] = temp;

    const prisma = getPrismaClient();
    await withDbRetry(() =>
      prisma.trainer.update({
        where: { userId: userMeta.userId },
        data: { teamCreatureIds: ids },
      }),
    );

    const refreshed = await this.getTeamView(userMeta.userId);
    return {
      ok: true,
      team: refreshed,
      message: `Đã đổi vị trí **Ô #${slotA}** ↔ **Ô #${slotB}** trong đội hình!`,
    };
  }

  public async removeTeamSlot(
    userMeta: TrainerIdentityInput,
    target: number | 'all',
  ): Promise<TeamActionOutcome> {
    await trainerService.ensureTrainer(userMeta);
    const { buddyId, storedIds, availableRows, sortedBox } = await this.fetchTeamState(
      userMeta.userId,
    );
    const availableSet = new Set(availableRows.map((r) => r.id));
    const currentIds = storedIds
      .filter((id, idx) => availableSet.has(id) && storedIds.indexOf(id) === idx)
      .slice(0, MAX_TEAM_SIZE);

    if (currentIds.length === 0) {
      return { ok: false, message: 'Đội hình của bạn hiện đang trống.' };
    }

    if (target === 'all') {
      const prisma = getPrismaClient();
      await withDbRetry(() =>
        prisma.trainer.update({
          where: { userId: userMeta.userId },
          data: { teamCreatureIds: [] },
        }),
      );
      return {
        ok: true,
        team: { slots: [null, null, null], members: [], totalCp: 0 },
        message: 'Đã xóa toàn bộ đội hình! Dùng `;team add` hoặc `;team auto` để xếp lại.',
      };
    }

    if (!Number.isInteger(target) || target < 1 || target > currentIds.length) {
      return {
        ok: false,
        message: `Không có Pokémon nào ở **Ô #${target}** (hiện có ${currentIds.length}/3 Pokémon).`,
      };
    }

    const removedId = currentIds[target - 1]!;
    const removedRow = sortedBox.find((r) => r.id === removedId);
    const nextIds = currentIds.filter((id) => id !== removedId);

    const prisma = getPrismaClient();
    await withDbRetry(() =>
      prisma.trainer.update({
        where: { userId: userMeta.userId },
        data: { teamCreatureIds: nextIds },
      }),
    );

    return {
      ok: true,
      team: this.buildTeamView(nextIds, buddyId, sortedBox),
      message: `Đã gỡ **${removedRow?.speciesName ?? 'Pokémon'}** khỏi **Ô #${target}**.`,
    };
  }

  public async autoBuildTeam(userMeta: TrainerIdentityInput): Promise<TeamActionOutcome> {
    await trainerService.ensureTrainer(userMeta);
    const { buddyId, availableRows, sortedBox } = await this.fetchTeamState(userMeta.userId);
    if (availableRows.length === 0) {
      return {
        ok: false,
        message: 'Bạn chưa có Pokémon nào trong kho! Hãy dùng `;p` bắt Pokémon trước.',
      };
    }

    const bestIds = this.pickBestThreeIds(availableRows, buddyId);
    const prisma = getPrismaClient();
    await withDbRetry(() =>
      prisma.trainer.update({
        where: { userId: userMeta.userId },
        data: { teamCreatureIds: bestIds },
      }),
    );

    return {
      ok: true,
      team: this.buildTeamView(bestIds, buddyId, sortedBox),
      message: `Đã tự động xếp **${bestIds.length} Pokémon** mạnh nhất (ưu tiên Buddy & CP) vào đội hình!`,
    };
  }
}

export const teamService = new TeamService();
