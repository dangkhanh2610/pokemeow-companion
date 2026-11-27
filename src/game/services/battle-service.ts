import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { getPrismaClient, withDbRetry } from '@/lib/prisma';
import { defaultCreatureCatalog } from '../catalog/creature-catalog';
import { resolveAiMoves } from '../catalog/move-catalog';
import { applyXp, MAX_CREATURE_LEVEL } from '../engine/spawn-engine';
import {
  applyEndOfRoundStatus,
  buildCombatant,
  executeMove,
  getEffectiveSpeed,
  getTypeEffectiveness,
  type CombatantState,
} from '../engine/battle-engine';
import type { BallId, CreatureIVs, CreatureSpecies } from '../types';
import { addCreatureXp } from './evolution-service';
import { questService } from './quest-service';
import { teamService, type TeamMemberView } from './team-service';
import { OFFICIAL_GYM_BADGE_IDS, trainerService, type TrainerIdentityInput } from './trainer-service';

export type ChallengerTier = 'gym' | 'elite';

export interface ChallengerLineupSlot {
  readonly speciesId: number;
  readonly level: number;
}

export interface ChallengerSpec {
  readonly stage: number;
  readonly tier: ChallengerTier;
  readonly badgeId: string;
  readonly badgeName: string;
  readonly isGymBadge: boolean;
  readonly leaderName: string;
  readonly title: string;
  readonly speciesId: number; // Ace Pokémon (đứng cuối đội hình 3 con)
  readonly level: number;
  readonly lineup: readonly ChallengerLineupSlot[];
  readonly rewardCoins: number;
  readonly rewardBall: BallId;
  readonly rewardQty: number;
}

export type ChallengerOverviewItem = ChallengerSpec & {
  readonly cleared: boolean;
  readonly unlocked: boolean;
  readonly speciesName: string;
  readonly speciesTypes: readonly string[];
  readonly lineupNames: readonly string[];
};

// Thứ tự 13 Challenger chuẩn PokéMeow: 8 Kanto Gym Leaders -> Elite Four -> Champion Blue (mỗi người đội hình 3 Pokémon)
export const CHALLENGER_ROSTER: readonly ChallengerSpec[] = [
  {
    stage: 1,
    tier: 'gym',
    badgeId: 'boulder',
    badgeName: 'Boulder Badge',
    isGymBadge: true,
    leaderName: 'Brock',
    title: 'Gym 1 Pewter · Thủ Lĩnh Đá',
    speciesId: 95,
    level: 13,
    lineup: [
      { speciesId: 74, level: 10 }, // Geodude
      { speciesId: 140, level: 11 }, // Kabuto
      { speciesId: 95, level: 13 }, // Onix
    ],
    rewardCoins: 2500,
    rewardBall: 'greatball',
    rewardQty: 3,
  },
  {
    stage: 2,
    tier: 'gym',
    badgeId: 'cascade',
    badgeName: 'Cascade Badge',
    isGymBadge: true,
    leaderName: 'Misty',
    title: 'Gym 2 Cerulean · Thủ Lĩnh Nước',
    speciesId: 121,
    level: 21,
    lineup: [
      { speciesId: 118, level: 18 }, // Goldeen
      { speciesId: 120, level: 19 }, // Staryu
      { speciesId: 121, level: 21 }, // Starmie
    ],
    rewardCoins: 4000,
    rewardBall: 'ultraball',
    rewardQty: 3,
  },
  {
    stage: 3,
    tier: 'gym',
    badgeId: 'thunder',
    badgeName: 'Thunder Badge',
    isGymBadge: true,
    leaderName: 'Lt. Surge',
    title: 'Gym 3 Vermilion · Thủ Lĩnh Sấm',
    speciesId: 26,
    level: 28,
    lineup: [
      { speciesId: 100, level: 24 }, // Voltorb
      { speciesId: 25, level: 26 }, // Pikachu
      { speciesId: 26, level: 28 }, // Raichu
    ],
    rewardCoins: 6000,
    rewardBall: 'premierball',
    rewardQty: 1,
  },
  {
    stage: 4,
    tier: 'gym',
    badgeId: 'rainbow',
    badgeName: 'Rainbow Badge',
    isGymBadge: true,
    leaderName: 'Erika',
    title: 'Gym 4 Celadon · Thủ Lĩnh Thảo',
    speciesId: 45,
    level: 35,
    lineup: [
      { speciesId: 71, level: 32 }, // Victreebel
      { speciesId: 114, level: 33 }, // Tangela
      { speciesId: 45, level: 35 }, // Vileplume
    ],
    rewardCoins: 8500,
    rewardBall: 'premierball',
    rewardQty: 2,
  },
  {
    stage: 5,
    tier: 'gym',
    badgeId: 'soul',
    badgeName: 'Soul Badge',
    isGymBadge: true,
    leaderName: 'Koga',
    title: 'Gym 5 Fuchsia · Ninja Độc',
    speciesId: 110,
    level: 43,
    lineup: [
      { speciesId: 109, level: 39 }, // Koffing
      { speciesId: 89, level: 41 }, // Muk
      { speciesId: 110, level: 43 }, // Weezing
    ],
    rewardCoins: 11500,
    rewardBall: 'premierball',
    rewardQty: 2,
  },
  {
    stage: 6,
    tier: 'gym',
    badgeId: 'marsh',
    badgeName: 'Marsh Badge',
    isGymBadge: true,
    leaderName: 'Sabrina',
    title: 'Gym 6 Saffron · Ngoại Cảm',
    speciesId: 65,
    level: 50,
    lineup: [
      { speciesId: 64, level: 47 }, // Kadabra
      { speciesId: 122, level: 48 }, // Mr. Mime
      { speciesId: 65, level: 50 }, // Alakazam
    ],
    rewardCoins: 15000,
    rewardBall: 'premierball',
    rewardQty: 3,
  },
  {
    stage: 7,
    tier: 'gym',
    badgeId: 'volcano',
    badgeName: 'Volcano Badge',
    isGymBadge: true,
    leaderName: 'Blaine',
    title: 'Gym 7 Cinnabar · Hỏa Diệm',
    speciesId: 59,
    level: 58,
    lineup: [
      { speciesId: 58, level: 54 }, // Growlithe
      { speciesId: 78, level: 56 }, // Rapidash
      { speciesId: 59, level: 58 }, // Arcanine
    ],
    rewardCoins: 19000,
    rewardBall: 'premierball',
    rewardQty: 3,
  },
  {
    stage: 8,
    tier: 'gym',
    badgeId: 'earth',
    badgeName: 'Earth Badge',
    isGymBadge: true,
    leaderName: 'Giovanni',
    title: 'Gym 8 Viridian · Trùm Cuối',
    speciesId: 112,
    level: 66,
    lineup: [
      { speciesId: 51, level: 62 }, // Dugtrio
      { speciesId: 34, level: 64 }, // Nidoking
      { speciesId: 112, level: 66 }, // Rhydon
    ],
    rewardCoins: 25000,
    rewardBall: 'masterball',
    rewardQty: 1,
  },
  {
    stage: 9,
    tier: 'elite',
    badgeId: 'e4_lorelei',
    badgeName: 'Thiên Vương Băng',
    isGymBadge: false,
    leaderName: 'Lorelei',
    title: 'Tứ Thiên Vương 1 · Băng Giá',
    speciesId: 131,
    level: 73,
    lineup: [
      { speciesId: 87, level: 70 }, // Dewgong
      { speciesId: 91, level: 71 }, // Cloyster
      { speciesId: 131, level: 73 }, // Lapras
    ],
    rewardCoins: 30000,
    rewardBall: 'premierball',
    rewardQty: 3,
  },
  {
    stage: 10,
    tier: 'elite',
    badgeId: 'e4_bruno',
    badgeName: 'Thiên Vương Võ',
    isGymBadge: false,
    leaderName: 'Bruno',
    title: 'Tứ Thiên Vương 2 · Võ Thuật',
    speciesId: 68,
    level: 76,
    lineup: [
      { speciesId: 95, level: 73 }, // Onix
      { speciesId: 107, level: 74 }, // Hitmonchan
      { speciesId: 68, level: 76 }, // Machamp
    ],
    rewardCoins: 34000,
    rewardBall: 'premierball',
    rewardQty: 3,
  },
  {
    stage: 11,
    tier: 'elite',
    badgeId: 'e4_agatha',
    badgeName: 'Thiên Vương Ma',
    isGymBadge: false,
    leaderName: 'Agatha',
    title: 'Tứ Thiên Vương 3 · Bóng Ma',
    speciesId: 94,
    level: 79,
    lineup: [
      { speciesId: 93, level: 76 }, // Haunter
      { speciesId: 24, level: 77 }, // Arbok
      { speciesId: 94, level: 79 }, // Gengar
    ],
    rewardCoins: 38000,
    rewardBall: 'premierball',
    rewardQty: 4,
  },
  {
    stage: 12,
    tier: 'elite',
    badgeId: 'e4_lance',
    badgeName: 'Bậc Thầy Rồng',
    isGymBadge: false,
    leaderName: 'Lance',
    title: 'Tứ Thiên Vương 4 · Rồng Thần',
    speciesId: 149,
    level: 83,
    lineup: [
      { speciesId: 130, level: 80 }, // Gyarados
      { speciesId: 142, level: 81 }, // Aerodactyl
      { speciesId: 149, level: 83 }, // Dragonite
    ],
    rewardCoins: 45000,
    rewardBall: 'premierball',
    rewardQty: 5,
  },
  {
    stage: 13,
    tier: 'elite',
    badgeId: 'champ_blue',
    badgeName: 'Vô Địch Liên Đoàn',
    isGymBadge: false,
    leaderName: 'Champion Blue',
    title: 'Nhà Vô Địch Liên Đoàn Kanto',
    speciesId: 6,
    level: 90,
    lineup: [
      { speciesId: 18, level: 86 }, // Pidgeot
      { speciesId: 65, level: 88 }, // Alakazam
      { speciesId: 6, level: 90 }, // Charizard
    ],
    rewardCoins: 60000,
    rewardBall: 'masterball',
    rewardQty: 2,
  },
];

export type BattleMode = 'PVE' | 'GYM' | 'PVP';

export type BattleTurnAction =
  | { readonly kind: 'slot'; readonly slotIndex: number }
  | { readonly kind: 'switch'; readonly teamIndex: number }
  | { readonly kind: 'forfeit' };

export interface BattleRewardSummary {
  readonly coinsEarned: number;
  readonly trainerXpEarned: number;
  readonly buddyXpEarned: number;
  readonly firstClearBadgeName?: string;
  readonly bonusBallId?: BallId;
  readonly bonusBallQty?: number;
}

export interface BattleSessionView {
  readonly battleId: string;
  readonly mode: BattleMode;
  readonly status: 'CHALLENGED' | 'ACTIVE' | 'FINISHED';
  readonly turnNumber: number;
  readonly activeTurnOwnerId: string;
  readonly gymSpec?: ChallengerSpec;
  readonly teamA: readonly CombatantState[];
  readonly activeIndexA: number;
  readonly teamB: readonly CombatantState[];
  readonly activeIndexB: number;
  readonly fighterA: CombatantState;
  readonly fighterB: CombatantState;
  readonly winnerOwnerId: string | null;
  readonly recentLogs: readonly string[];
  readonly reward?: BattleRewardSummary;
}

interface InternalBattleSession {
  readonly battleId: string;
  readonly mode: BattleMode;
  status: 'CHALLENGED' | 'ACTIVE' | 'FINISHED';
  turnNumber: number;
  activeTurnOwnerId: string;
  readonly gymSpec?: ChallengerSpec;
  readonly teamACreatureIds: readonly string[];
  readonly teamBCreatureIds: readonly string[];
  readonly teamA: CombatantState[];
  activeIndexA: number;
  readonly teamB: CombatantState[];
  activeIndexB: number;
  winnerOwnerId: string | null;
  recentLogs: string[];
  reward?: BattleRewardSummary;
  updatedAt: number;
}

export type BattleActionOutcome =
  | { readonly ok: true; readonly battle: BattleSessionView }
  | { readonly ok: false; readonly message: string };

const BATTLE_IDLE_TTL_MS = 5 * 60 * 1000;
const PERFECT_ENEMY_IVS: CreatureIVs = { hp: 24, atk: 24, def: 24, spAtk: 24, spDef: 24, spd: 24 };

function cloneCombatant(c: CombatantState): CombatantState {
  return { ...c, cooldowns: { ...c.cooldowns } };
}

function toView(s: InternalBattleSession): BattleSessionView {
  const clonedA = s.teamA.map(cloneCombatant);
  const clonedB = s.teamB.map(cloneCombatant);
  return {
    battleId: s.battleId,
    mode: s.mode,
    status: s.status,
    turnNumber: s.turnNumber,
    activeTurnOwnerId: s.activeTurnOwnerId,
    gymSpec: s.gymSpec,
    teamA: clonedA,
    activeIndexA: s.activeIndexA,
    teamB: clonedB,
    activeIndexB: s.activeIndexB,
    fighterA: clonedA[s.activeIndexA] ?? clonedA[0]!,
    fighterB: clonedB[s.activeIndexB] ?? clonedB[0]!,
    winnerOwnerId: s.winnerOwnerId,
    recentLogs: [...s.recentLogs],
    reward: s.reward,
  };
}

function teamMembersToCombatants(
  members: readonly TeamMemberView[],
  ownerId: string,
  ownerName: string,
): CombatantState[] {
  return members.map((m) =>
    buildCombatant(
      m.species,
      m.ivs,
      m.level,
      m.isShiny,
      ownerId,
      ownerName,
      m.equippedMoves,
    ),
  );
}

function pickAiSlot(ai: CombatantState, opponent: CombatantState): number {
  const usable = ai.moves
    .map((move, idx) => ({ move, idx }))
    .filter(
      ({ move }) =>
        (ai.cooldowns[move.id] ?? 0) === 0 &&
        !(move.specialEffect === 'heal_38' && ai.healUsesLeft <= 0),
    );

  if (usable.length === 0) {
    return 0;
  }

  if (ai.hp < ai.maxHp * 0.35) {
    const healSlot = usable.find((u) => u.move.specialEffect === 'heal_38');
    if (healSlot && Math.random() < 0.72) {
      return healSlot.idx;
    }
  }

  const attackSlots = usable.filter((u) => u.move.category !== 'status');
  if (attackSlots.length === 0) {
    return usable[0]!.idx;
  }

  const scored = attackSlots.map(({ move, idx }) => {
    const eff = getTypeEffectiveness(move.type, opponent.species.types);
    const stab = ai.species.types.includes(move.type) ? 1.5 : 1.0;
    const score = move.power * eff * stab * (0.9 + Math.random() * 0.25);
    return { idx, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]!.idx;
}

function advanceTeamIfFainted(
  team: CombatantState[],
  currentIdx: number,
  logs: string[],
): { readonly alive: boolean; readonly nextIdx: number } {
  const current = team[currentIdx];
  if (current && current.hp > 0) {
    return { alive: true, nextIdx: currentIdx };
  }
  if (current) {
    logs.push(`**${current.species.name}** (${current.ownerName}) đã gục ngã!`);
  }
  const nextIdx = team.findIndex((c) => c.hp > 0);
  if (nextIdx < 0) {
    return { alive: false, nextIdx: currentIdx };
  }
  const next = team[nextIdx]!;
  next.flinched = false;
  next.steelGuardTurns = 0;
  logs.push(
    `→ **${next.ownerName}** tung [TYPE:${next.species.types[0] ?? 'Normal'}] **${next.species.name} (Lv.${next.level})** vào sân!`,
  );
  return { alive: true, nextIdx };
}

export class BattleService {
  private readonly activeBattles = new Map<string, InternalBattleSession>();

  private pruneStaleBattles(): void {
    const cutoff = Date.now() - BATTLE_IDLE_TTL_MS;
    for (const [id, session] of this.activeBattles.entries()) {
      if (session.updatedAt < cutoff || session.status === 'FINISHED') {
        this.activeBattles.delete(id);
      }
    }
  }

  private findActiveBattleForUser(userId: string): InternalBattleSession | undefined {
    this.pruneStaleBattles();
    for (const session of this.activeBattles.values()) {
      const leadA = session.teamA[0];
      const leadB = session.teamB[0];
      if (
        session.status !== 'FINISHED' &&
        (leadA?.ownerId === userId || leadB?.ownerId === userId)
      ) {
        return session;
      }
    }
    return undefined;
  }

  public async startPve(playerMeta: TrainerIdentityInput): Promise<BattleActionOutcome> {
    await trainerService.ensureTrainer(playerMeta);
    const existing = this.findActiveBattleForUser(playerMeta.userId);
    if (existing) {
      return {
        ok: false,
        message: 'Bạn đang có một trận đấu chưa kết thúc! Hãy đánh tiếp hoặc bấm đầu hàng.',
      };
    }

    const partyA = await teamService.getBattleParty(playerMeta.userId);
    if (partyA.length === 0) {
      return {
        ok: false,
        message: 'Bạn chưa có Pokémon nào trong kho! Hãy dùng `/p` bắt ít nhất 1 Pokémon trước.',
      };
    }

    const teamA = teamMembersToCombatants(partyA, playerMeta.userId, playerMeta.displayName);
    const avgLv = Math.round(partyA.reduce((s, m) => s + m.level, 0) / partyA.length);
    const enemyPool = defaultCreatureCatalog
      .getAll()
      .filter((s) => s.formType === 'base' && s.rarity !== 'legendary');

    const teamB: CombatantState[] = partyA.map((_, idx) => {
      const enemyLv = Math.max(3, avgLv + idx + Math.floor(Math.random() * 3) - 1);
      const enemySpecies =
        enemyPool[Math.floor(Math.random() * enemyPool.length)] ?? enemyPool[0]!;
      const aiMoveCount: 2 | 3 | 4 = enemyLv >= 35 ? 4 : enemyLv >= 15 ? 3 : 2;
      return buildCombatant(
        enemySpecies,
        PERFECT_ENEMY_IVS,
        enemyLv,
        false,
        'ai:pve',
        'Đội Hoang Dã',
        resolveAiMoves(enemySpecies, aiMoveCount),
      );
    });

    const leadA = teamA[0]!;
    const leadB = teamB[0]!;
    const battleId = randomUUID().slice(0, 12);
    const session: InternalBattleSession = {
      battleId,
      mode: 'PVE',
      status: 'ACTIVE',
      turnNumber: 1,
      activeTurnOwnerId: playerMeta.userId,
      teamACreatureIds: partyA.map((m) => m.creatureId),
      teamBCreatureIds: [],
      teamA,
      activeIndexA: 0,
      teamB,
      activeIndexB: 0,
      winnerOwnerId: null,
      recentLogs: [
        `Trận **${teamA.length}v${teamB.length} PvE** bắt đầu! **${leadA.species.name} (Lv.${leadA.level})** đối đầu **${leadB.species.name} (Lv.${leadB.level})**.`,
      ],
      updatedAt: Date.now(),
    };

    this.activeBattles.set(battleId, session);
    return { ok: true, battle: toView(session) };
  }

  public async startGym(
    playerMeta: TrainerIdentityInput,
    requestedStage?: number,
  ): Promise<BattleActionOutcome> {
    await trainerService.ensureTrainer(playerMeta);
    const existing = this.findActiveBattleForUser(playerMeta.userId);
    if (existing) {
      return {
        ok: false,
        message: 'Bạn đang có một trận đấu chưa kết thúc! Hãy hoàn tất hoặc đầu hàng trước.',
      };
    }

    const partyA = await teamService.getBattleParty(playerMeta.userId);
    if (partyA.length === 0) {
      return {
        ok: false,
        message: 'Bạn chưa có Pokémon nào trong kho để khiêu chiến Challenger!',
      };
    }

    const prisma = getPrismaClient();
    const trainer = await withDbRetry(() =>
      prisma.trainer.findUniqueOrThrow({
        where: { userId: playerMeta.userId },
        select: { gymBadges: true },
      }),
    );

    const overview = this.getChallengerOverview(trainer.gymBadges);
    let gymSpec: ChallengerSpec | undefined;

    if (requestedStage !== undefined) {
      const matched = overview.find((g) => g.stage === requestedStage);
      if (!matched) {
        return {
          ok: false,
          message: `Challenger chỉ có từ số **1** đến **${CHALLENGER_ROSTER.length}**.`,
        };
      }
      if (!matched.unlocked) {
        const prev = overview.find((g) => g.stage === requestedStage - 1);
        return {
          ok: false,
          message: `Bạn cần đánh bại **#${requestedStage - 1} · ${prev?.leaderName ?? 'đối thủ trước'}** trước khi mở khóa **${matched.leaderName}**!`,
        };
      }
      gymSpec = matched;
    } else {
      gymSpec =
        overview.find((g) => g.unlocked && !g.cleared) ?? overview[overview.length - 1];
    }

    if (!gymSpec) {
      return { ok: false, message: 'Không tìm thấy Challenger phù hợp.' };
    }

    const aiMoveCount: 2 | 3 | 4 =
      gymSpec.stage <= 2 ? 2 : gymSpec.stage <= 6 ? 3 : 4;
    const enemyIv = gymSpec.stage >= 9 ? 29 : 26;
    const bossIvs: CreatureIVs = {
      hp: enemyIv,
      atk: enemyIv,
      def: enemyIv,
      spAtk: enemyIv,
      spDef: enemyIv,
      spd: enemyIv,
    };

    const teamB: CombatantState[] = [];
    for (const slot of gymSpec.lineup) {
      const sp: CreatureSpecies | undefined = defaultCreatureCatalog.getById(slot.speciesId);
      if (!sp) continue;
      teamB.push(
        buildCombatant(
          sp,
          bossIvs,
          slot.level,
          false,
          `ai:gym:${gymSpec.stage}`,
          gymSpec.leaderName,
          resolveAiMoves(sp, aiMoveCount),
        ),
      );
    }

    if (teamB.length === 0) {
      return { ok: false, message: 'Không tìm thấy đội hình Pokémon của Challenger.' };
    }

    const teamA = teamMembersToCombatants(partyA, playerMeta.userId, playerMeta.displayName);
    const battleId = randomUUID().slice(0, 12);
    const session: InternalBattleSession = {
      battleId,
      mode: 'GYM',
      status: 'ACTIVE',
      turnNumber: 1,
      activeTurnOwnerId: playerMeta.userId,
      gymSpec,
      teamACreatureIds: partyA.map((m) => m.creatureId),
      teamBCreatureIds: [],
      teamA,
      activeIndexA: 0,
      teamB,
      activeIndexB: 0,
      winnerOwnerId: null,
      recentLogs: [
        `Khiêu chiến **#${gymSpec.stage} · ${gymSpec.leaderName}** (*${gymSpec.title}*) · **${teamA.length}v${teamB.length}**!`,
      ],
      updatedAt: Date.now(),
    };

    this.activeBattles.set(battleId, session);
    return { ok: true, battle: toView(session) };
  }

  public async challengePvp(
    initiatorMeta: TrainerIdentityInput,
    targetMeta: TrainerIdentityInput,
  ): Promise<BattleActionOutcome> {
    if (initiatorMeta.userId === targetMeta.userId) {
      return { ok: false, message: 'Bạn không thể tự thách đấu PvP với chính mình!' };
    }

    await trainerService.ensureTrainer(initiatorMeta);
    await trainerService.ensureTrainer(targetMeta);

    if (
      this.findActiveBattleForUser(initiatorMeta.userId) ||
      this.findActiveBattleForUser(targetMeta.userId)
    ) {
      return {
        ok: false,
        message: 'Bạn hoặc đối phương hiện đang bận trong một trận chiến đấu khác.',
      };
    }

    const [partyA, partyB] = await Promise.all([
      teamService.getBattleParty(initiatorMeta.userId),
      teamService.getBattleParty(targetMeta.userId),
    ]);

    if (partyA.length === 0) {
      return { ok: false, message: 'Bạn chưa có Pokémon nào để xuất trận!' };
    }
    if (partyB.length === 0) {
      return { ok: false, message: `${targetMeta.displayName} chưa có Pokémon nào để thi đấu!` };
    }

    const teamA = teamMembersToCombatants(partyA, initiatorMeta.userId, initiatorMeta.displayName);
    const teamB = teamMembersToCombatants(partyB, targetMeta.userId, targetMeta.displayName);

    const battleId = randomUUID().slice(0, 12);
    const firstTurnId =
      teamB[0]!.spd > teamA[0]!.spd ? targetMeta.userId : initiatorMeta.userId;

    const session: InternalBattleSession = {
      battleId,
      mode: 'PVP',
      status: 'CHALLENGED',
      turnNumber: 1,
      activeTurnOwnerId: firstTurnId,
      teamACreatureIds: partyA.map((m) => m.creatureId),
      teamBCreatureIds: partyB.map((m) => m.creatureId),
      teamA,
      activeIndexA: 0,
      teamB,
      activeIndexB: 0,
      winnerOwnerId: null,
      recentLogs: [
        `**${initiatorMeta.displayName}** (${teamA.length} Pokémon) gửi lời thách đấu PvP tới **${targetMeta.displayName}** (${teamB.length} Pokémon)!`,
      ],
      updatedAt: Date.now(),
    };

    this.activeBattles.set(battleId, session);
    return { ok: true, battle: toView(session) };
  }

  public respondPvpChallenge(
    battleId: string,
    actorUserId: string,
    accept: boolean,
  ): BattleActionOutcome {
    const session = this.activeBattles.get(battleId);
    if (!session || session.mode !== 'PVP' || session.status !== 'CHALLENGED') {
      return { ok: false, message: 'Lời thách đấu PvP này không còn hiệu lực.' };
    }
    const leadB = session.teamB[0]!;
    const leadA = session.teamA[0]!;
    if (leadB.ownerId !== actorUserId) {
      return { ok: false, message: 'Chỉ người được thách đấu mới có thể chấp nhận hoặc từ chối!' };
    }

    if (!accept) {
      session.status = 'FINISHED';
      session.recentLogs.push(`**${leadB.ownerName}** đã từ chối lời thách đấu.`);
      const view = toView(session);
      this.activeBattles.delete(battleId);
      return { ok: true, battle: view };
    }

    session.status = 'ACTIVE';
    session.updatedAt = Date.now();
    session.recentLogs = [
      `Trận PvP **${session.teamA.length}v${session.teamB.length}** bắt đầu! **${session.activeTurnOwnerId === leadA.ownerId ? leadA.species.name : leadB.species.name}** có tốc độ cao hơn nên đi trước!`,
    ];
    return { ok: true, battle: toView(session) };
  }

  private async finalizeSessionWinner(
    session: InternalBattleSession,
    winnerOwnerId: string,
    interactionId: string,
  ): Promise<BattleSessionView> {
    session.status = 'FINISHED';
    session.winnerOwnerId = winnerOwnerId;

    const isHumanWinner = !winnerOwnerId.startsWith('ai:');
    if (isHumanWinner) {
      const winnerTeamIds =
        winnerOwnerId === session.teamA[0]?.ownerId
          ? session.teamACreatureIds
          : session.teamBCreatureIds;
      session.reward = await this.awardVictory(
        session,
        winnerOwnerId,
        winnerTeamIds,
        interactionId,
      );
    }

    const view = toView(session);
    this.activeBattles.delete(session.battleId);
    return view;
  }

  public async takeTurn(
    battleId: string,
    actorUserId: string,
    action: BattleTurnAction,
    interactionId: string,
  ): Promise<BattleActionOutcome> {
    const session = this.activeBattles.get(battleId);
    if (!session || session.status !== 'ACTIVE') {
      return { ok: false, message: 'Trận đấu này đã kết thúc hoặc hết hạn.' };
    }

    const ownerA = session.teamA[0]!.ownerId;
    const ownerB = session.teamB[0]!.ownerId;
    const isPlayerA = ownerA === actorUserId;
    const isPlayerB = ownerB === actorUserId;
    if (!isPlayerA && !isPlayerB) {
      return { ok: false, message: 'Bạn không phải người tham gia trận đấu này!' };
    }

    if (action.kind === 'forfeit') {
      const opponentId = isPlayerA ? ownerB : ownerA;
      const actorName = isPlayerA ? session.teamA[0]!.ownerName : session.teamB[0]!.ownerName;
      session.recentLogs.push(`**${actorName}** đã đầu hàng!`);
      const view = await this.finalizeSessionWinner(session, opponentId, interactionId);
      return { ok: true, battle: view };
    }

    if (session.activeTurnOwnerId !== actorUserId) {
      return { ok: false, message: 'Chưa tới lượt của bạn!' };
    }

    session.updatedAt = Date.now();

    if (session.mode === 'PVP') {
      const actorTeam = isPlayerA ? session.teamA : session.teamB;
      const enemyTeam = isPlayerA ? session.teamB : session.teamA;
      const actorActiveIdx = isPlayerA ? session.activeIndexA : session.activeIndexB;
      const enemyActiveIdx = isPlayerA ? session.activeIndexB : session.activeIndexA;

      if (action.kind === 'switch') {
        const nextMate = actorTeam[action.teamIndex];
        if (!nextMate || nextMate.hp <= 0 || action.teamIndex === actorActiveIdx) {
          return { ok: false, message: 'Không thể đổi sang Pokémon này!' };
        }
        const prevMate = actorTeam[actorActiveIdx]!;
        if (isPlayerA) session.activeIndexA = action.teamIndex;
        else session.activeIndexB = action.teamIndex;
        session.recentLogs.push(
          `→ **${nextMate.ownerName}** rút **${prevMate.species.name}** về, tung [TYPE:${nextMate.species.types[0] ?? 'Normal'}] **${nextMate.species.name} (Lv.${nextMate.level})** vào sân!`,
        );
        session.turnNumber += 1;
        session.activeTurnOwnerId = isPlayerA ? ownerB : ownerA;
        session.recentLogs = session.recentLogs.slice(-5);
        return { ok: true, battle: toView(session) };
      }

      const attacker = actorTeam[actorActiveIdx]!;
      const defender = enemyTeam[enemyActiveIdx]!;
      const isFaster =
        getEffectiveSpeed(attacker, action.slotIndex) >= getEffectiveSpeed(defender);
      const res = executeMove(attacker, defender, action.slotIndex, isFaster);
      session.recentLogs.push(res.logLine);

      const dotLog = applyEndOfRoundStatus(attacker);
      if (dotLog) session.recentLogs.push(dotLog);

      const advEnemy = advanceTeamIfFainted(enemyTeam, enemyActiveIdx, session.recentLogs);
      if (isPlayerA) session.activeIndexB = advEnemy.nextIdx;
      else session.activeIndexA = advEnemy.nextIdx;
      if (!advEnemy.alive) {
        return {
          ok: true,
          battle: await this.finalizeSessionWinner(session, actorUserId, interactionId),
        };
      }

      const advActor = advanceTeamIfFainted(actorTeam, actorActiveIdx, session.recentLogs);
      if (isPlayerA) session.activeIndexA = advActor.nextIdx;
      else session.activeIndexB = advActor.nextIdx;
      if (!advActor.alive) {
        return {
          ok: true,
          battle: await this.finalizeSessionWinner(
            session,
            isPlayerA ? ownerB : ownerA,
            interactionId,
          ),
        };
      }

      session.turnNumber += 1;
      session.activeTurnOwnerId = isPlayerA ? ownerB : ownerA;
      session.recentLogs = session.recentLogs.slice(-5);
      return { ok: true, battle: toView(session) };
    }

    // PvE / Challenger 3v3
    const roundLogs: string[] = [];

    if (action.kind === 'switch') {
      const nextMate = session.teamA[action.teamIndex];
      if (!nextMate || nextMate.hp <= 0 || action.teamIndex === session.activeIndexA) {
        return { ok: false, message: 'Không thể đổi sang Pokémon này!' };
      }
      const prevMate = session.teamA[session.activeIndexA]!;
      session.activeIndexA = action.teamIndex;
      roundLogs.push(
        `→ **${nextMate.ownerName}** rút **${prevMate.species.name}** về, tung [TYPE:${nextMate.species.types[0] ?? 'Normal'}] **${nextMate.species.name} (Lv.${nextMate.level})** vào sân!`,
      );

      const fighterA = session.teamA[session.activeIndexA]!;
      const fighterB = session.teamB[session.activeIndexB]!;
      const aiSlot = pickAiSlot(fighterB, fighterA);
      const aiRes = executeMove(fighterB, fighterA, aiSlot, true);
      roundLogs.push(aiRes.logLine);

      const dotA = applyEndOfRoundStatus(fighterA);
      if (dotA) roundLogs.push(dotA);
      const dotB = applyEndOfRoundStatus(fighterB);
      if (dotB) roundLogs.push(dotB);

      const advB = advanceTeamIfFainted(session.teamB, session.activeIndexB, roundLogs);
      session.activeIndexB = advB.nextIdx;
      const advA = advanceTeamIfFainted(session.teamA, session.activeIndexA, roundLogs);
      session.activeIndexA = advA.nextIdx;

      session.recentLogs = roundLogs;
      if (!advB.alive) {
        return {
          ok: true,
          battle: await this.finalizeSessionWinner(session, ownerA, interactionId),
        };
      }
      if (!advA.alive) {
        return {
          ok: true,
          battle: await this.finalizeSessionWinner(session, ownerB, interactionId),
        };
      }
      session.turnNumber += 1;
      return { ok: true, battle: toView(session) };
    }

    // Đòn tấn công bình thường
    let fighterA = session.teamA[session.activeIndexA]!;
    let fighterB = session.teamB[session.activeIndexB]!;
    const aiSlot = pickAiSlot(fighterB, fighterA);
    const playerSpeed = getEffectiveSpeed(fighterA, action.slotIndex);
    const aiSpeed = getEffectiveSpeed(fighterB, aiSlot);
    const playerGoesFirst = playerSpeed >= aiSpeed;

    if (playerGoesFirst) {
      const pRes = executeMove(fighterA, fighterB, action.slotIndex, true);
      roundLogs.push(pRes.logLine);
      if (fighterB.hp > 0 && fighterA.hp > 0) {
        const aiRes = executeMove(fighterB, fighterA, aiSlot, false);
        roundLogs.push(aiRes.logLine);
      }
    } else {
      const aiRes = executeMove(fighterB, fighterA, aiSlot, true);
      roundLogs.push(aiRes.logLine);
      if (fighterA.hp > 0 && fighterB.hp > 0) {
        const pRes = executeMove(fighterA, fighterB, action.slotIndex, false);
        roundLogs.push(pRes.logLine);
      }
    }

    if (fighterA.hp > 0 && fighterB.hp > 0) {
      const dotA = applyEndOfRoundStatus(fighterA);
      if (dotA) roundLogs.push(dotA);
      const dotB = applyEndOfRoundStatus(fighterB);
      if (dotB) roundLogs.push(dotB);
    }

    const advB = advanceTeamIfFainted(session.teamB, session.activeIndexB, roundLogs);
    session.activeIndexB = advB.nextIdx;
    const advA = advanceTeamIfFainted(session.teamA, session.activeIndexA, roundLogs);
    session.activeIndexA = advA.nextIdx;

    fighterA = session.teamA[session.activeIndexA]!;
    fighterB = session.teamB[session.activeIndexB]!;
    session.recentLogs = roundLogs;

    if (!advB.alive) {
      return {
        ok: true,
        battle: await this.finalizeSessionWinner(session, ownerA, interactionId),
      };
    }

    if (!advA.alive) {
      return {
        ok: true,
        battle: await this.finalizeSessionWinner(session, ownerB, interactionId),
      };
    }

    session.turnNumber += 1;
    return { ok: true, battle: toView(session) };
  }

  private async awardVictory(
    session: InternalBattleSession,
    winnerUserId: string,
    winnerCreatureIds: readonly string[],
    interactionId: string,
  ): Promise<BattleRewardSummary> {
    const prisma = getPrismaClient();
    const idempotencyKey = `battle:${session.battleId}:${interactionId}`;
    const aceEnemy = session.teamB[session.teamB.length - 1] ?? session.teamB[0]!;

    const summary = await withDbRetry(() =>
      prisma.$transaction(async (tx) => {
        const existingTx = await tx.economyTransaction.findUnique({
          where: { idempotencyKey },
        });
        if (existingTx) {
          return {
            coinsEarned: existingTx.coinsDelta,
            trainerXpEarned: 0,
            buddyXpEarned: 0,
          };
        }

        const trainer = await tx.trainer.findUniqueOrThrow({
          where: { userId: winnerUserId },
        });

        let coinsEarned = 400 + aceEnemy.level * 25;
        let trainerXpEarned = 75 + aceEnemy.level * 4;
        let buddyXpEarned = 45 + aceEnemy.level * 7;
        let firstClearBadgeName: string | undefined;
        let bonusBallId: BallId | undefined;
        let bonusBallQty: number | undefined;
        const nextBadges = [...trainer.gymBadges];

        if (session.mode === 'GYM' && session.gymSpec) {
          const isFirstClear = !nextBadges.includes(session.gymSpec.badgeId);
          if (isFirstClear) {
            nextBadges.push(session.gymSpec.badgeId);
            coinsEarned = session.gymSpec.rewardCoins;
            trainerXpEarned = 180 + session.gymSpec.stage * 70;
            buddyXpEarned = 120 + session.gymSpec.stage * 45;
            firstClearBadgeName = session.gymSpec.badgeName;
            bonusBallId = session.gymSpec.rewardBall;
            bonusBallQty = session.gymSpec.rewardQty;

            await tx.inventoryItem.upsert({
              where: {
                userId_itemId: { userId: winnerUserId, itemId: session.gymSpec.rewardBall },
              },
              update: { quantity: { increment: session.gymSpec.rewardQty } },
              create: {
                userId: winnerUserId,
                itemId: session.gymSpec.rewardBall,
                quantity: session.gymSpec.rewardQty,
              },
            });
          } else {
            coinsEarned = Math.round(session.gymSpec.rewardCoins * 0.25);
            trainerXpEarned = 100 + session.gymSpec.stage * 20;
            buddyXpEarned = 55 + aceEnemy.level * 5;
          }
        } else if (session.mode === 'PVP') {
          coinsEarned = 800;
          trainerXpEarned = 120;
          buddyXpEarned = 160;
        }

        const xpNext = applyXp(trainer.xp, trainer.level, trainerXpEarned);

        await tx.trainer.update({
          where: { userId: winnerUserId },
          data: {
            coins: { increment: coinsEarned },
            xp: xpNext.xp,
            level: xpNext.level,
            battleWins: { increment: 1 },
            gymBadges: nextBadges,
          },
        });

        const uniqueTeamIds = winnerCreatureIds.filter(
          (id, idx) => winnerCreatureIds.indexOf(id) === idx,
        );
        if (uniqueTeamIds.length > 0) {
          const teamRows = await tx.caughtCreature.findMany({
            where: { id: { in: uniqueTeamIds }, released: false },
            select: { id: true, xp: true, level: true },
          });
          await Promise.all(
            teamRows
              .filter((r) => r.level < MAX_CREATURE_LEVEL)
              .map((r) => {
                const cNext = addCreatureXp(r.xp, r.level, buddyXpEarned);
                return tx.caughtCreature.update({
                  where: { id: r.id },
                  data: { xp: cNext.xp, level: cNext.level },
                });
              }),
          );
        }

        const meta: Prisma.InputJsonObject = {
          battleId: session.battleId,
          mode: session.mode,
          ...(session.gymSpec ? { challengerStage: session.gymSpec.stage } : {}),
        };

        await tx.economyTransaction.create({
          data: {
            idempotencyKey,
            userId: winnerUserId,
            type: 'BATTLE_WIN',
            coinsDelta: coinsEarned,
            metadata: meta,
          },
        });

        return {
          coinsEarned,
          trainerXpEarned,
          buddyXpEarned,
          firstClearBadgeName,
          bonusBallId,
          bonusBallQty,
        };
      }),
    );

    await questService
      .recordProgress(winnerUserId, { kind: 'battle_win' })
      .catch(() => undefined);

    return summary;
  }

  public getChallengerOverview(
    ownedBadges: readonly string[],
  ): readonly ChallengerOverviewItem[] {
    const ownedSet = new Set(ownedBadges);
    return CHALLENGER_ROSTER.map((spec, idx) => {
      const species = defaultCreatureCatalog.getById(spec.speciesId);
      const lineupNames = spec.lineup.map(
        (slot) => defaultCreatureCatalog.getById(slot.speciesId)?.name ?? `#${slot.speciesId}`,
      );
      const cleared = ownedSet.has(spec.badgeId);
      const prevSpec = idx > 0 ? CHALLENGER_ROSTER[idx - 1] : undefined;
      const unlocked =
        spec.stage === 1 || cleared || Boolean(prevSpec && ownedSet.has(prevSpec.badgeId));

      return {
        ...spec,
        cleared,
        unlocked,
        speciesName: species?.name ?? `Pokémon #${spec.speciesId}`,
        speciesTypes: species?.types ?? ['Normal'],
        lineupNames,
      };
    });
  }

  public countOfficialGymBadges(ownedBadges: readonly string[]): number {
    return ownedBadges.filter((id) => OFFICIAL_GYM_BADGE_IDS.has(id)).length;
  }
}

export const battleService = new BattleService();
