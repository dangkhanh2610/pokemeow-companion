import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { getPrismaClient, withDbRetry } from '@/lib/prisma';
import { defaultCreatureCatalog } from '../catalog/creature-catalog';
import { resolveAiMoves, resolveEquippedMoves, type MoveSpec } from '../catalog/move-catalog';
import { applyXp } from '../engine/spawn-engine';
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
import { OFFICIAL_GYM_BADGE_IDS, trainerService, type TrainerIdentityInput } from './trainer-service';

export type ChallengerTier = 'rookie' | 'gym' | 'elite';

export interface ChallengerSpec {
  readonly stage: number;
  readonly tier: ChallengerTier;
  readonly badgeId: string;
  readonly badgeName: string;
  readonly isGymBadge: boolean;
  readonly leaderName: string;
  readonly title: string;
  readonly speciesId: number;
  readonly level: number;
  readonly rewardCoins: number;
  readonly rewardBall: BallId;
  readonly rewardQty: number;
}

export type ChallengerOverviewItem = ChallengerSpec & {
  readonly cleared: boolean;
  readonly unlocked: boolean;
  readonly speciesName: string;
  readonly speciesTypes: readonly string[];
};

export const CHALLENGER_ROSTER: readonly ChallengerSpec[] = [
  {
    stage: 1,
    tier: 'rookie',
    badgeId: 'rookie_joey',
    badgeName: 'Chứng Nhận Tân Thủ',
    isGymBadge: false,
    leaderName: 'Youngster Joey',
    title: 'Tân Thủ Đường Số 1',
    speciesId: 19, // Rattata
    level: 6,
    rewardCoins: 1000,
    rewardBall: 'pokeball',
    rewardQty: 3,
  },
  {
    stage: 2,
    tier: 'rookie',
    badgeId: 'rival_blue',
    badgeName: 'Chứng Nhận Đối Thủ',
    isGymBadge: false,
    leaderName: 'Rival Blue',
    title: 'Đối Thủ Khởi Đầu',
    speciesId: 17, // Pidgeotto
    level: 10,
    rewardCoins: 1500,
    rewardBall: 'greatball',
    rewardQty: 3,
  },
  {
    stage: 3,
    tier: 'gym',
    badgeId: 'boulder',
    badgeName: 'Boulder Badge',
    isGymBadge: true,
    leaderName: 'Brock',
    title: 'Gym 1 Pewter · Thủ Lĩnh Đá',
    speciesId: 95, // Onix
    level: 15,
    rewardCoins: 2500,
    rewardBall: 'greatball',
    rewardQty: 3,
  },
  {
    stage: 4,
    tier: 'gym',
    badgeId: 'cascade',
    badgeName: 'Cascade Badge',
    isGymBadge: true,
    leaderName: 'Misty',
    title: 'Gym 2 Cerulean · Thủ Lĩnh Nước',
    speciesId: 121, // Starmie
    level: 22,
    rewardCoins: 4000,
    rewardBall: 'ultraball',
    rewardQty: 3,
  },
  {
    stage: 5,
    tier: 'gym',
    badgeId: 'thunder',
    badgeName: 'Thunder Badge',
    isGymBadge: true,
    leaderName: 'Lt. Surge',
    title: 'Gym 3 Vermilion · Thủ Lĩnh Sấm',
    speciesId: 26, // Raichu
    level: 28,
    rewardCoins: 6000,
    rewardBall: 'premierball',
    rewardQty: 1,
  },
  {
    stage: 6,
    tier: 'gym',
    badgeId: 'rainbow',
    badgeName: 'Rainbow Badge',
    isGymBadge: true,
    leaderName: 'Erika',
    title: 'Gym 4 Celadon · Thủ Lĩnh Thảo',
    speciesId: 45, // Vileplume
    level: 35,
    rewardCoins: 8000,
    rewardBall: 'premierball',
    rewardQty: 2,
  },
  {
    stage: 7,
    tier: 'gym',
    badgeId: 'soul',
    badgeName: 'Soul Badge',
    isGymBadge: true,
    leaderName: 'Koga',
    title: 'Gym 5 Fuchsia · Ninja Độc',
    speciesId: 89, // Muk
    level: 42,
    rewardCoins: 11000,
    rewardBall: 'premierball',
    rewardQty: 2,
  },
  {
    stage: 8,
    tier: 'gym',
    badgeId: 'marsh',
    badgeName: 'Marsh Badge',
    isGymBadge: true,
    leaderName: 'Sabrina',
    title: 'Gym 6 Saffron · Ngoại Cảm',
    speciesId: 65, // Alakazam
    level: 50,
    rewardCoins: 14500,
    rewardBall: 'premierball',
    rewardQty: 3,
  },
  {
    stage: 9,
    tier: 'gym',
    badgeId: 'volcano',
    badgeName: 'Volcano Badge',
    isGymBadge: true,
    leaderName: 'Blaine',
    title: 'Gym 7 Cinnabar · Hỏa Diệm',
    speciesId: 59, // Arcanine
    level: 58,
    rewardCoins: 18500,
    rewardBall: 'premierball',
    rewardQty: 3,
  },
  {
    stage: 10,
    tier: 'gym',
    badgeId: 'earth',
    badgeName: 'Earth Badge',
    isGymBadge: true,
    leaderName: 'Giovanni',
    title: 'Gym 8 Viridian · Trùm Cuối',
    speciesId: 112, // Rhydon
    level: 66,
    rewardCoins: 25000,
    rewardBall: 'masterball',
    rewardQty: 1,
  },
  {
    stage: 11,
    tier: 'elite',
    badgeId: 'elite_lance',
    badgeName: 'Danh Hiệu Bậc Thầy Rồng',
    isGymBadge: false,
    leaderName: 'Lance',
    title: 'Tứ Thiên Vương · Bậc Thầy Rồng',
    speciesId: 149, // Dragonite
    level: 76,
    rewardCoins: 35000,
    rewardBall: 'premierball',
    rewardQty: 4,
  },
  {
    stage: 12,
    tier: 'elite',
    badgeId: 'champ_red',
    badgeName: 'Huyền Thoại Mt. Silver',
    isGymBadge: false,
    leaderName: 'Champion Red',
    title: 'Nhà Vô Địch Huyền Thoại',
    speciesId: 150, // Mewtwo
    level: 85,
    rewardCoins: 50000,
    rewardBall: 'masterball',
    rewardQty: 1,
  },
];

export type BattleMode = 'PVE' | 'GYM' | 'PVP';

export type BattleTurnAction =
  | { readonly kind: 'slot'; readonly slotIndex: number }
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
  readonly fighterACreatureId: string;
  readonly fighterBCreatureId?: string;
  readonly fighterA: CombatantState;
  readonly fighterB: CombatantState;
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

function parseCreatureIvs(jsonValue: Prisma.JsonValue): CreatureIVs {
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

function toView(s: InternalBattleSession): BattleSessionView {
  return {
    battleId: s.battleId,
    mode: s.mode,
    status: s.status,
    turnNumber: s.turnNumber,
    activeTurnOwnerId: s.activeTurnOwnerId,
    gymSpec: s.gymSpec,
    fighterA: { ...s.fighterA, cooldowns: { ...s.fighterA.cooldowns } },
    fighterB: { ...s.fighterB, cooldowns: { ...s.fighterB.cooldowns } },
    winnerOwnerId: s.winnerOwnerId,
    recentLogs: [...s.recentLogs],
    reward: s.reward,
  };
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

  // Ưu tiên hồi phục nếu máu dưới 35%
  if (ai.hp < ai.maxHp * 0.35) {
    const healSlot = usable.find((u) => u.move.specialEffect === 'heal_38');
    if (healSlot && Math.random() < 0.72) {
      return healSlot.idx;
    }
  }

  // Chấm điểm chiến thuật từng chiêu theo khắc hệ + STAB + Power
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
      if (
        session.status !== 'FINISHED' &&
        (session.fighterA.ownerId === userId || session.fighterB.ownerId === userId)
      ) {
        return session;
      }
    }
    return undefined;
  }

  private async pickPlayerFighter(userId: string): Promise<{
    readonly id: string;
    readonly species: CreatureSpecies;
    readonly ivs: CreatureIVs;
    readonly level: number;
    readonly isShiny: boolean;
    readonly equippedMoves: readonly MoveSpec[];
  } | null> {
    const prisma = getPrismaClient();
    const trainer = await withDbRetry(() =>
      prisma.trainer.findUnique({
        where: { userId },
        select: { buddyCreatureId: true },
      }),
    );

    const creature = await withDbRetry(async () => {
      if (trainer?.buddyCreatureId) {
        const buddy = await prisma.caughtCreature.findFirst({
          where: {
            id: trainer.buddyCreatureId,
            userId,
            released: false,
            inMarket: false,
          },
        });
        if (buddy) {
          return buddy;
        }
      }

      return prisma.caughtCreature.findFirst({
        where: { userId, released: false, inMarket: false },
        orderBy: [{ level: 'desc' }, { isShiny: 'desc' }, { ivTotal: 'desc' }],
      });
    });

    if (!creature) {
      return null;
    }
    const species = defaultCreatureCatalog.getById(creature.speciesId);
    if (!species) {
      return null;
    }

    const equippedMoves = resolveEquippedMoves(
      species,
      creature.equippedMoves,
      creature.unlockedMoves,
    );

    return {
      id: creature.id,
      species,
      ivs: parseCreatureIvs(creature.ivsJson),
      level: creature.level,
      isShiny: creature.isShiny,
      equippedMoves,
    };
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

    const fighter = await this.pickPlayerFighter(playerMeta.userId);
    if (!fighter) {
      return {
        ok: false,
        message: 'Bạn chưa có Pokémon nào trong kho! Hãy dùng `/p` bắt ít nhất 1 Pokémon trước.',
      };
    }

    const aiLevel = Math.max(3, fighter.level + Math.floor(Math.random() * 4) - 1);
    const enemyPool = defaultCreatureCatalog
      .getAll()
      .filter((s) => s.formType === 'base' && s.rarity !== 'legendary');
    const enemySpecies = enemyPool[Math.floor(Math.random() * enemyPool.length)] ?? enemyPool[0]!;
    const aiMoveCount: 2 | 3 | 4 = aiLevel >= 35 ? 4 : aiLevel >= 15 ? 3 : 2;
    const aiMoves = resolveAiMoves(enemySpecies, aiMoveCount);

    const combatA = buildCombatant(
      fighter.species,
      fighter.ivs,
      fighter.level,
      fighter.isShiny,
      playerMeta.userId,
      playerMeta.displayName,
      fighter.equippedMoves,
    );
    const combatB = buildCombatant(
      enemySpecies,
      PERFECT_ENEMY_IVS,
      aiLevel,
      false,
      'ai:pve',
      'Pokémon Hoang Dã',
      aiMoves,
    );

    const battleId = randomUUID().slice(0, 12);
    const session: InternalBattleSession = {
      battleId,
      mode: 'PVE',
      status: 'ACTIVE',
      turnNumber: 1,
      activeTurnOwnerId: playerMeta.userId,
      fighterACreatureId: fighter.id,
      fighterA: combatA,
      fighterB: combatB,
      winnerOwnerId: null,
      recentLogs: [
        `Trận đấu PvE bắt đầu! **${combatA.species.name} (Lv.${combatA.level})** đối đầu **${combatB.species.name} (Lv.${combatB.level})**.`,
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

    const fighter = await this.pickPlayerFighter(playerMeta.userId);
    if (!fighter) {
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
          message: `Bạn cần đánh bại **#${requestedStage - 1} · ${prev?.leaderName ?? 'đối thủ trước'}** để mở khóa **${matched.leaderName}**!`,
        };
      }
      gymSpec = matched;
    } else {
      gymSpec =
        overview.find((g) => g.unlocked && !g.cleared) ??
        overview[overview.length - 1];
    }

    if (!gymSpec) {
      return { ok: false, message: 'Không tìm thấy Challenger phù hợp.' };
    }

    const bossSpecies = defaultCreatureCatalog.getById(gymSpec.speciesId);
    if (!bossSpecies) {
      return { ok: false, message: 'Không tìm thấy Pokémon của Challenger.' };
    }

    const aiMoveCount: 2 | 3 | 4 =
      gymSpec.stage <= 2 ? 2 : gymSpec.stage <= 6 ? 3 : 4;
    const aiMoves = resolveAiMoves(bossSpecies, aiMoveCount);

    const combatA = buildCombatant(
      fighter.species,
      fighter.ivs,
      fighter.level,
      fighter.isShiny,
      playerMeta.userId,
      playerMeta.displayName,
      fighter.equippedMoves,
    );
    const combatB = buildCombatant(
      bossSpecies,
      { hp: 28, atk: 28, def: 28, spAtk: 28, spDef: 28, spd: 28 },
      gymSpec.level,
      false,
      `ai:gym:${gymSpec.stage}`,
      gymSpec.leaderName,
      aiMoves,
    );

    const battleId = randomUUID().slice(0, 12);
    const session: InternalBattleSession = {
      battleId,
      mode: 'GYM',
      status: 'ACTIVE',
      turnNumber: 1,
      activeTurnOwnerId: playerMeta.userId,
      gymSpec,
      fighterACreatureId: fighter.id,
      fighterA: combatA,
      fighterB: combatB,
      winnerOwnerId: null,
      recentLogs: [
        `Khiêu chiến **#${gymSpec.stage} · ${gymSpec.leaderName}** (*${gymSpec.title}*)!`,
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

    const [fighterA, fighterB] = await Promise.all([
      this.pickPlayerFighter(initiatorMeta.userId),
      this.pickPlayerFighter(targetMeta.userId),
    ]);

    if (!fighterA) {
      return { ok: false, message: 'Bạn chưa có Pokémon nào để xuất trận!' };
    }
    if (!fighterB) {
      return { ok: false, message: `${targetMeta.displayName} chưa có Pokémon nào để thi đấu!` };
    }

    const combatA = buildCombatant(
      fighterA.species,
      fighterA.ivs,
      fighterA.level,
      fighterA.isShiny,
      initiatorMeta.userId,
      initiatorMeta.displayName,
      fighterA.equippedMoves,
    );
    const combatB = buildCombatant(
      fighterB.species,
      fighterB.ivs,
      fighterB.level,
      fighterB.isShiny,
      targetMeta.userId,
      targetMeta.displayName,
      fighterB.equippedMoves,
    );

    const battleId = randomUUID().slice(0, 12);
    const firstTurnId =
      combatB.spd > combatA.spd ? targetMeta.userId : initiatorMeta.userId;

    const session: InternalBattleSession = {
      battleId,
      mode: 'PVP',
      status: 'CHALLENGED',
      turnNumber: 1,
      activeTurnOwnerId: firstTurnId,
      fighterACreatureId: fighterA.id,
      fighterBCreatureId: fighterB.id,
      fighterA: combatA,
      fighterB: combatB,
      winnerOwnerId: null,
      recentLogs: [
        `**${initiatorMeta.displayName}** gửi lời thách đấu PvP tới **${targetMeta.displayName}**!`,
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
    if (session.fighterB.ownerId !== actorUserId) {
      return { ok: false, message: 'Chỉ người được thách đấu mới có thể chấp nhận hoặc từ chối!' };
    }

    if (!accept) {
      session.status = 'FINISHED';
      session.recentLogs.push(`**${session.fighterB.ownerName}** đã từ chối lời thách đấu.`);
      const view = toView(session);
      this.activeBattles.delete(battleId);
      return { ok: true, battle: view };
    }

    session.status = 'ACTIVE';
    session.updatedAt = Date.now();
    session.recentLogs = [
      `Trận PvP bắt đầu! **${session.activeTurnOwnerId === session.fighterA.ownerId ? session.fighterA.species.name : session.fighterB.species.name}** có tốc độ cao hơn nên đi trước!`,
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
      const winnerCreatureId =
        winnerOwnerId === session.fighterA.ownerId
          ? session.fighterACreatureId
          : (session.fighterBCreatureId ?? session.fighterACreatureId);
      session.reward = await this.awardVictory(
        session,
        winnerOwnerId,
        winnerCreatureId,
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

    const isPlayerA = session.fighterA.ownerId === actorUserId;
    const isPlayerB = session.fighterB.ownerId === actorUserId;
    if (!isPlayerA && !isPlayerB) {
      return { ok: false, message: 'Bạn không phải người tham gia trận đấu này!' };
    }

    if (action.kind === 'forfeit') {
      const opponentId = isPlayerA ? session.fighterB.ownerId : session.fighterA.ownerId;
      session.recentLogs.push(
        `**${isPlayerA ? session.fighterA.ownerName : session.fighterB.ownerName}** đã đầu hàng!`,
      );
      const view = await this.finalizeSessionWinner(session, opponentId, interactionId);
      return { ok: true, battle: view };
    }

    if (session.activeTurnOwnerId !== actorUserId) {
      return { ok: false, message: 'Chưa tới lượt của bạn!' };
    }

    session.updatedAt = Date.now();

    if (session.mode === 'PVP') {
      const attacker = isPlayerA ? session.fighterA : session.fighterB;
      const defender = isPlayerA ? session.fighterB : session.fighterA;
      const isFaster =
        getEffectiveSpeed(attacker, action.slotIndex) >= getEffectiveSpeed(defender);
      const res = executeMove(attacker, defender, action.slotIndex, isFaster);
      session.recentLogs.push(res.logLine);

      if (defender.hp <= 0) {
        return {
          ok: true,
          battle: await this.finalizeSessionWinner(session, attacker.ownerId, interactionId),
        };
      }
      if (attacker.hp <= 0) {
        return {
          ok: true,
          battle: await this.finalizeSessionWinner(session, defender.ownerId, interactionId),
        };
      }

      const dotLog = applyEndOfRoundStatus(attacker);
      if (dotLog) {
        session.recentLogs.push(dotLog);
      }
      if (attacker.hp <= 0) {
        return {
          ok: true,
          battle: await this.finalizeSessionWinner(session, defender.ownerId, interactionId),
        };
      }

      session.turnNumber += 1;
      session.activeTurnOwnerId = defender.ownerId;
      session.recentLogs = session.recentLogs.slice(-5);
      return { ok: true, battle: toView(session) };
    }

    // PvE / Challenger: lượt người chơi + AI tính toán tốc độ thực (gồm ưu tiên & Flying +15% & Tê Liệt)
    const aiSlot = pickAiSlot(session.fighterB, session.fighterA);
    const playerSpeed = getEffectiveSpeed(session.fighterA, action.slotIndex);
    const aiSpeed = getEffectiveSpeed(session.fighterB, aiSlot);
    const playerGoesFirst = playerSpeed >= aiSpeed;
    const roundLogs: string[] = [];

    if (playerGoesFirst) {
      const pRes = executeMove(session.fighterA, session.fighterB, action.slotIndex, true);
      roundLogs.push(pRes.logLine);
      if (session.fighterB.hp > 0 && session.fighterA.hp > 0) {
        const aiRes = executeMove(session.fighterB, session.fighterA, aiSlot, false);
        roundLogs.push(aiRes.logLine);
      }
    } else {
      const aiRes = executeMove(session.fighterB, session.fighterA, aiSlot, true);
      roundLogs.push(aiRes.logLine);
      if (session.fighterA.hp > 0 && session.fighterB.hp > 0) {
        const pRes = executeMove(session.fighterA, session.fighterB, action.slotIndex, false);
        roundLogs.push(pRes.logLine);
      }
    }

    // Xử lý DoT (Bỏng / Trúng Độc) cuối lượt nếu cả 2 còn sống
    if (session.fighterA.hp > 0 && session.fighterB.hp > 0) {
      const dotA = applyEndOfRoundStatus(session.fighterA);
      if (dotA) roundLogs.push(dotA);
      const dotB = applyEndOfRoundStatus(session.fighterB);
      if (dotB) roundLogs.push(dotB);
    }

    session.recentLogs = roundLogs;

    if (session.fighterB.hp <= 0) {
      return {
        ok: true,
        battle: await this.finalizeSessionWinner(session, session.fighterA.ownerId, interactionId),
      };
    }

    if (session.fighterA.hp <= 0) {
      return {
        ok: true,
        battle: await this.finalizeSessionWinner(session, session.fighterB.ownerId, interactionId),
      };
    }

    session.turnNumber += 1;
    return { ok: true, battle: toView(session) };
  }

  private async awardVictory(
    session: InternalBattleSession,
    winnerUserId: string,
    winnerCreatureId: string,
    interactionId: string,
  ): Promise<BattleRewardSummary> {
    const prisma = getPrismaClient();
    const idempotencyKey = `battle:${session.battleId}:${interactionId}`;

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

        let coinsEarned = 400 + session.fighterB.level * 25;
        let trainerXpEarned = 75 + session.fighterB.level * 4;
        const buddyXpEarned = session.mode === 'GYM' ? 55 : 40;
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
          }
        } else if (session.mode === 'PVP') {
          coinsEarned = 800;
          trainerXpEarned = 120;
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

        const fighterRow = await tx.caughtCreature.findUnique({
          where: { id: winnerCreatureId },
          select: { id: true, xp: true, level: true },
        });
        if (fighterRow) {
          const cNext = addCreatureXp(fighterRow.xp, fighterRow.level, buddyXpEarned);
          await tx.caughtCreature.update({
            where: { id: fighterRow.id },
            data: { xp: cNext.xp, level: cNext.level },
          });
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
      const cleared = ownedSet.has(spec.badgeId);
      const prevSpec = idx > 0 ? CHALLENGER_ROSTER[idx - 1] : undefined;
      const unlocked =
        spec.stage <= 3 ||
        cleared ||
        Boolean(prevSpec && ownedSet.has(prevSpec.badgeId));

      return {
        ...spec,
        cleared,
        unlocked,
        speciesName: species?.name ?? `Pokémon #${spec.speciesId}`,
        speciesTypes: species?.types ?? ['Normal'],
      };
    });
  }

  public countOfficialGymBadges(ownedBadges: readonly string[]): number {
    return ownedBadges.filter((id) => OFFICIAL_GYM_BADGE_IDS.has(id)).length;
  }
}

export const battleService = new BattleService();
