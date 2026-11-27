import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { getPrismaClient, withDbRetry } from '@/lib/prisma';
import { defaultCreatureCatalog } from '../catalog/creature-catalog';
import { applyXp } from '../engine/spawn-engine';
import {
  buildCombatant,
  executeMove,
  type BattleMoveAction,
  type CombatantState,
} from '../engine/battle-engine';
import type { BallId, CreatureIVs, CreatureSpecies } from '../types';
import { addCreatureXp } from './evolution-service';
import { questService } from './quest-service';
import { trainerService, type TrainerIdentityInput } from './trainer-service';

export interface GymLeaderSpec {
  readonly stage: number;
  readonly badgeId: string;
  readonly badgeName: string;
  readonly leaderName: string;
  readonly title: string;
  readonly speciesId: number;
  readonly level: number;
  readonly rewardCoins: number;
  readonly rewardBall: BallId;
  readonly rewardQty: number;
}

export const GYM_LEADERS: readonly GymLeaderSpec[] = [
  {
    stage: 1,
    badgeId: 'boulder',
    badgeName: 'Boulder Badge',
    leaderName: 'Brock',
    title: 'Thủ Lĩnh Đá Pewter',
    speciesId: 95,
    level: 12,
    rewardCoins: 2000,
    rewardBall: 'greatball',
    rewardQty: 3,
  },
  {
    stage: 2,
    badgeId: 'cascade',
    badgeName: 'Cascade Badge',
    leaderName: 'Misty',
    title: 'Thủ Lĩnh Nước Cerulean',
    speciesId: 121,
    level: 18,
    rewardCoins: 3500,
    rewardBall: 'ultraball',
    rewardQty: 3,
  },
  {
    stage: 3,
    badgeId: 'thunder',
    badgeName: 'Thunder Badge',
    leaderName: 'Lt. Surge',
    title: 'Thủ Lĩnh Sấm Vermilion',
    speciesId: 26,
    level: 24,
    rewardCoins: 5000,
    rewardBall: 'premierball',
    rewardQty: 1,
  },
  {
    stage: 4,
    badgeId: 'rainbow',
    badgeName: 'Rainbow Badge',
    leaderName: 'Erika',
    title: 'Thủ Lĩnh Thảo Celadon',
    speciesId: 45,
    level: 32,
    rewardCoins: 7500,
    rewardBall: 'premierball',
    rewardQty: 2,
  },
  {
    stage: 5,
    badgeId: 'soul',
    badgeName: 'Soul Badge',
    leaderName: 'Koga',
    title: 'Ninja Độc Fuchsia',
    speciesId: 89,
    level: 40,
    rewardCoins: 10000,
    rewardBall: 'premierball',
    rewardQty: 2,
  },
  {
    stage: 6,
    badgeId: 'marsh',
    badgeName: 'Marsh Badge',
    leaderName: 'Sabrina',
    title: 'Ngoại Cảm Saffron',
    speciesId: 65,
    level: 48,
    rewardCoins: 13500,
    rewardBall: 'premierball',
    rewardQty: 3,
  },
  {
    stage: 7,
    badgeId: 'volcano',
    badgeName: 'Volcano Badge',
    leaderName: 'Blaine',
    title: 'Lửa Núi Cinnabar',
    speciesId: 59,
    level: 56,
    rewardCoins: 17500,
    rewardBall: 'premierball',
    rewardQty: 3,
  },
  {
    stage: 8,
    badgeId: 'earth',
    badgeName: 'Earth Badge',
    leaderName: 'Giovanni',
    title: 'Trùm Cuối Viridian',
    speciesId: 150,
    level: 68,
    rewardCoins: 25000,
    rewardBall: 'masterball',
    rewardQty: 1,
  },
];

export type BattleMode = 'PVE' | 'GYM' | 'PVP';

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
  readonly gymSpec?: GymLeaderSpec;
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
  readonly gymSpec?: GymLeaderSpec;
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
    fighterA: { ...s.fighterA },
    fighterB: { ...s.fighterB },
    winnerOwnerId: s.winnerOwnerId,
    recentLogs: [...s.recentLogs],
    reward: s.reward,
  };
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

    return {
      id: creature.id,
      species,
      ivs: parseCreatureIvs(creature.ivsJson),
      level: creature.level,
      isShiny: creature.isShiny,
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

    const combatA = buildCombatant(
      fighter.species,
      fighter.ivs,
      fighter.level,
      fighter.isShiny,
      playerMeta.userId,
      playerMeta.displayName,
    );
    const combatB = buildCombatant(
      enemySpecies,
      PERFECT_ENEMY_IVS,
      aiLevel,
      false,
      'ai:pve',
      'Pokémon Hoang Dã',
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
        message: 'Bạn chưa có Pokémon nào trong kho để khiêu chiến Gym!',
      };
    }

    const prisma = getPrismaClient();
    const trainer = await withDbRetry(() =>
      prisma.trainer.findUniqueOrThrow({
        where: { userId: playerMeta.userId },
        select: { gymBadges: true },
      }),
    );

    let gymSpec: GymLeaderSpec | undefined;
    if (requestedStage !== undefined) {
      gymSpec = GYM_LEADERS.find((g) => g.stage === requestedStage);
      if (!gymSpec) {
        return { ok: false, message: 'Gym chỉ có từ tầng **1** đến **8**.' };
      }
      if (requestedStage > trainer.gymBadges.length + 1) {
        return {
          ok: false,
          message: `Bạn cần vượt qua **Gym ${trainer.gymBadges.length + 1}** trước khi khiêu chiến **Gym ${requestedStage}**!`,
        };
      }
    } else {
      const nextStage = Math.min(8, trainer.gymBadges.length + 1);
      gymSpec = GYM_LEADERS.find((g) => g.stage === nextStage) ?? GYM_LEADERS[0]!;
    }

    const bossSpecies = defaultCreatureCatalog.getById(gymSpec.speciesId);
    if (!bossSpecies) {
      return { ok: false, message: 'Không tìm thấy Pokémon của Gym Leader.' };
    }

    const combatA = buildCombatant(
      fighter.species,
      fighter.ivs,
      fighter.level,
      fighter.isShiny,
      playerMeta.userId,
      playerMeta.displayName,
    );
    const combatB = buildCombatant(
      bossSpecies,
      { hp: 28, atk: 28, def: 28, spAtk: 28, spDef: 28, spd: 28 },
      gymSpec.level,
      false,
      `ai:gym:${gymSpec.stage}`,
      `Gym ${gymSpec.leaderName}`,
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
        `Khiêu chiến **Gym ${gymSpec.stage} · ${gymSpec.leaderName}** (${gymSpec.badgeName})!`,
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
    );
    const combatB = buildCombatant(
      fighterB.species,
      fighterB.ivs,
      fighterB.level,
      fighterB.isShiny,
      targetMeta.userId,
      targetMeta.displayName,
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

  public async takeTurn(
    battleId: string,
    actorUserId: string,
    action: BattleMoveAction | 'forfeit',
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

    if (action === 'forfeit') {
      session.status = 'FINISHED';
      session.winnerOwnerId = isPlayerA ? session.fighterB.ownerId : session.fighterA.ownerId;
      session.recentLogs.push(
        `**${isPlayerA ? session.fighterA.ownerName : session.fighterB.ownerName}** đã đầu hàng!`,
      );
      if (session.mode === 'PVP' && session.winnerOwnerId) {
        const winnerCreatureId = isPlayerA
          ? (session.fighterBCreatureId ?? session.fighterACreatureId)
          : session.fighterACreatureId;
        session.reward = await this.awardVictory(
          session,
          session.winnerOwnerId,
          winnerCreatureId,
          interactionId,
        );
      }
      const view = toView(session);
      this.activeBattles.delete(battleId);
      return { ok: true, battle: view };
    }

    if (session.activeTurnOwnerId !== actorUserId) {
      return { ok: false, message: 'Chưa tới lượt của bạn!' };
    }

    session.updatedAt = Date.now();

    if (session.mode === 'PVP') {
      const attacker = isPlayerA ? session.fighterA : session.fighterB;
      const defender = isPlayerA ? session.fighterB : session.fighterA;
      const res = executeMove(attacker, defender, action);
      session.recentLogs.push(res.logLine);

      if (defender.hp <= 0) {
        session.status = 'FINISHED';
        session.winnerOwnerId = attacker.ownerId;
        const winnerCreatureId = isPlayerA
          ? session.fighterACreatureId
          : (session.fighterBCreatureId ?? session.fighterACreatureId);
        session.reward = await this.awardVictory(
          session,
          attacker.ownerId,
          winnerCreatureId,
          interactionId,
        );
        const view = toView(session);
        this.activeBattles.delete(battleId);
        return { ok: true, battle: view };
      }

      session.turnNumber += 1;
      session.activeTurnOwnerId = defender.ownerId;
      session.recentLogs = session.recentLogs.slice(-4);
      return { ok: true, battle: toView(session) };
    }

    // PvE / Gym: lượt của người chơi + AI phản công (theo thứ tự Speed)
    const rollAi = Math.random();
    const aiAction: BattleMoveAction =
      session.fighterB.hp < session.fighterB.maxHp * 0.35 &&
      session.fighterB.recoverUsesLeft > 0 &&
      rollAi < 0.55
        ? 'recover'
        : session.fighterB.ultimateCooldown === 0 && rollAi < 0.45
          ? 'ultimate'
          : rollAi < 0.72
            ? 'secondary'
            : 'primary';

    const playerGoesFirst = session.fighterA.spd >= session.fighterB.spd;
    const roundLogs: string[] = [];

    if (playerGoesFirst) {
      const pRes = executeMove(session.fighterA, session.fighterB, action);
      roundLogs.push(pRes.logLine);
      if (session.fighterB.hp > 0) {
        const aiRes = executeMove(session.fighterB, session.fighterA, aiAction);
        roundLogs.push(aiRes.logLine);
      }
    } else {
      const aiRes = executeMove(session.fighterB, session.fighterA, aiAction);
      roundLogs.push(aiRes.logLine);
      if (session.fighterA.hp > 0) {
        const pRes = executeMove(session.fighterA, session.fighterB, action);
        roundLogs.push(pRes.logLine);
      }
    }

    session.recentLogs = roundLogs;

    if (session.fighterB.hp <= 0) {
      session.status = 'FINISHED';
      session.winnerOwnerId = session.fighterA.ownerId;
      session.reward = await this.awardVictory(
        session,
        session.fighterA.ownerId,
        session.fighterACreatureId,
        interactionId,
      );
      const view = toView(session);
      this.activeBattles.delete(battleId);
      return { ok: true, battle: view };
    }

    if (session.fighterA.hp <= 0) {
      session.status = 'FINISHED';
      session.winnerOwnerId = session.fighterB.ownerId;
      const view = toView(session);
      this.activeBattles.delete(battleId);
      return { ok: true, battle: view };
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
        const buddyXpEarned = session.mode === 'GYM' ? 50 : 40;
        let firstClearBadgeName: string | undefined;
        let bonusBallId: BallId | undefined;
        let bonusBallQty: number | undefined;
        const nextBadges = [...trainer.gymBadges];

        if (session.mode === 'GYM' && session.gymSpec) {
          const isFirstClear = !nextBadges.includes(session.gymSpec.badgeId);
          if (isFirstClear) {
            nextBadges.push(session.gymSpec.badgeId);
            coinsEarned = session.gymSpec.rewardCoins;
            trainerXpEarned = 200 + session.gymSpec.stage * 80;
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
            trainerXpEarned = 110 + session.gymSpec.stage * 20;
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
          ...(session.gymSpec ? { gymStage: session.gymSpec.stage } : {}),
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

  public getGymOverview(ownedBadges: readonly string[]): readonly (GymLeaderSpec & {
    readonly cleared: boolean;
  })[] {
    const ownedSet = new Set(ownedBadges);
    return GYM_LEADERS.map((g) => ({
      ...g,
      cleared: ownedSet.has(g.badgeId),
    }));
  }
}

export const battleService = new BattleService();
