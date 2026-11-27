import { getSpeciesMovePool, type MoveSpec } from '../catalog/move-catalog';
import type { CreatureIVs, CreatureSpecies } from '../types';

export type BattleStatusCondition = 'NONE' | 'BURN' | 'PARALYZE' | 'FREEZE' | 'POISON';

export interface ComputedCreatureStats {
  readonly maxHp: number;
  readonly atk: number;
  readonly def: number;
  readonly spAtk: number;
  readonly spDef: number;
  readonly spd: number;
  readonly combatPower: number;
  readonly starterMoves: readonly [MoveSpec, MoveSpec];
}

export interface DefensiveMatchupSummary {
  readonly weaknesses: readonly { readonly type: string; readonly mult: number }[];
  readonly resistances: readonly { readonly type: string; readonly mult: number }[];
  readonly immunities: readonly { readonly type: string; readonly mult: number }[];
}

export interface CombatantState {
  readonly ownerId: string;
  readonly ownerName: string;
  readonly species: CreatureSpecies;
  readonly isShiny: boolean;
  readonly level: number;
  readonly maxHp: number;
  hp: number;
  readonly atk: number;
  readonly def: number;
  readonly spAtk: number;
  readonly spDef: number;
  readonly spd: number;
  offenseBuff: number;
  defMultiplier: number;
  speedMultiplier: number;
  status: BattleStatusCondition;
  steelGuardTurns: number;
  flinched: boolean;
  healUsesLeft: number;
  cooldowns: Record<string, number>;
  readonly moves: readonly MoveSpec[];
}

export interface MoveExecutionResult {
  readonly attackerName: string;
  readonly slotIndex: number;
  readonly moveName: string;
  readonly moveType: string;
  readonly hit: boolean;
  readonly damageDealt: number;
  readonly selfDamageDealt: number;
  readonly healedHp: number;
  readonly effectiveness: number;
  readonly isCrit: boolean;
  readonly logLine: string;
}

interface TraitAfterHitContext {
  readonly attacker: CombatantState;
  readonly defender: CombatantState;
  readonly move: MoveSpec;
  readonly damageDealt: number;
  readonly isMovingFirst: boolean;
  readonly randomFn: () => number;
}

export interface ElementalTypeTrait {
  readonly type: string;
  readonly traitName: string;
  readonly bonusCritRate?: number;
  readonly bonusAccuracy?: number;
  readonly speedTurnMultiplier?: number;
  readonly defenseIgnoreRatio?: number;
  readonly rawDamageMultiplier?: number;
  readonly ignoresSteelGuard?: boolean;
  onAfterHit?(ctx: TraitAfterHitContext): {
    readonly note: string | null;
    readonly selfDamageDealt?: number;
    readonly healedHp?: number;
  };
}

const ALL_TYPES: readonly string[] = [
  'Normal',
  'Fire',
  'Water',
  'Electric',
  'Grass',
  'Ice',
  'Fighting',
  'Poison',
  'Ground',
  'Flying',
  'Psychic',
  'Bug',
  'Rock',
  'Ghost',
  'Dragon',
  'Dark',
  'Steel',
  'Fairy',
];

// Bảng khắc chế 18 hệ Pokémon chuẩn (bao gồm miễn nhiễm 0x chính xác)
const TYPE_EFFECTIVENESS_CHART: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  Normal: { Rock: 0.5, Ghost: 0, Steel: 0.5 },
  Fire: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 2, Bug: 2, Rock: 0.5, Dragon: 0.5, Steel: 2 },
  Water: { Fire: 2, Water: 0.5, Grass: 0.5, Ground: 2, Rock: 2, Dragon: 0.5 },
  Electric: { Water: 2, Electric: 0.5, Grass: 0.5, Ground: 0, Flying: 2, Dragon: 0.5 },
  Grass: { Fire: 0.5, Water: 2, Grass: 0.5, Poison: 0.5, Ground: 2, Flying: 0.5, Bug: 0.5, Rock: 2, Dragon: 0.5, Steel: 0.5 },
  Ice: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 0.5, Ground: 2, Flying: 2, Dragon: 2, Steel: 0.5 },
  Fighting: { Normal: 2, Ice: 2, Poison: 0.5, Flying: 0.5, Psychic: 0.5, Bug: 0.5, Rock: 2, Ghost: 0, Dark: 2, Steel: 2, Fairy: 0.5 },
  Poison: { Grass: 2, Poison: 0.5, Ground: 0.5, Rock: 0.5, Ghost: 0.5, Steel: 0, Fairy: 2 },
  Ground: { Fire: 2, Electric: 2, Grass: 0.5, Poison: 2, Flying: 0, Bug: 0.5, Rock: 2, Steel: 2 },
  Flying: { Electric: 0.5, Grass: 2, Fighting: 2, Bug: 2, Rock: 0.5, Steel: 0.5 },
  Psychic: { Fighting: 2, Poison: 2, Psychic: 0.5, Dark: 0, Steel: 0.5 },
  Bug: { Fire: 0.5, Grass: 2, Fighting: 0.5, Poison: 0.5, Flying: 0.5, Psychic: 2, Ghost: 0.5, Dark: 2, Steel: 0.5, Fairy: 0.5 },
  Rock: { Fire: 2, Ice: 2, Fighting: 0.5, Ground: 0.5, Flying: 2, Bug: 2, Steel: 0.5 },
  Ghost: { Normal: 0, Psychic: 2, Ghost: 2, Dark: 0.5 },
  Dragon: { Dragon: 2, Steel: 0.5, Fairy: 0 },
  Dark: { Fighting: 0.5, Psychic: 2, Ghost: 2, Dark: 0.5, Fairy: 0.5 },
  Steel: { Fire: 0.5, Water: 0.5, Electric: 0.5, Ice: 2, Rock: 2, Steel: 0.5, Fairy: 2 },
  Fairy: { Fire: 0.5, Fighting: 2, Poison: 0.5, Dragon: 2, Dark: 2, Steel: 0.5 },
};

// Strategy Pattern: Đặc tính chiến đấu riêng của từng hệ (bao gồm Loạn Đả Tự Tấn Công của hệ Rồng)
export const TYPE_TRAIT_REGISTRY: Readonly<Record<string, ElementalTypeTrait>> = {
  Normal: {
    type: 'Normal',
    traitName: 'Tinh Thuần (+8% Chí Mạng)',
    bonusCritRate: 0.08,
  },
  Fire: {
    type: 'Fire',
    traitName: 'Thiêu Đốt (20% gây Bỏng)',
    onAfterHit: ({ defender, randomFn }) => {
      if (
        defender.hp > 0 &&
        defender.status === 'NONE' &&
        !defender.species.types.includes('Fire') &&
        randomFn() < 0.2
      ) {
        defender.status = 'BURN';
        return {
          note: `└ [TYPE:Fire] **${defender.species.name}** bị **BỎNG** (-20% Công vật lý & mất 8% HP/lượt)!`,
        };
      }
      return { note: null };
    },
  },
  Water: {
    type: 'Water',
    traitName: 'Thủy Mạc (Hồi 5% HP & giải Bỏng)',
    onAfterHit: ({ attacker }) => {
      let healedHp = 0;
      const cured = attacker.status === 'BURN';
      if (cured) {
        attacker.status = 'NONE';
      }
      if (attacker.hp > 0 && attacker.hp < attacker.maxHp) {
        const heal = Math.max(4, Math.round(attacker.maxHp * 0.05));
        const prev = attacker.hp;
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
        healedHp = attacker.hp - prev;
      }
      if (healedHp > 0 || cured) {
        return {
          healedHp,
          note: `└ [TYPE:Water] Thủy Mạc hồi **+${healedHp} HP**${cured ? ' và dập tắt **BỎNG**' : ''}!`,
        };
      }
      return { note: null };
    },
  },
  Electric: {
    type: 'Electric',
    traitName: 'Xung Điện (22% Tê Liệt)',
    onAfterHit: ({ defender, randomFn }) => {
      if (
        defender.hp > 0 &&
        defender.status === 'NONE' &&
        !defender.species.types.includes('Electric') &&
        !defender.species.types.includes('Ground') &&
        randomFn() < 0.22
      ) {
        defender.status = 'PARALYZE';
        return {
          note: `└ [TYPE:Electric] **${defender.species.name}** bị **TÊ LIỆT** (-35% Tốc độ & có tỉ lệ mất lượt)!`,
        };
      }
      return { note: null };
    },
  },
  Grass: {
    type: 'Grass',
    traitName: 'Hấp Thụ (Hồi 18%–30% sát thương)',
    onAfterHit: ({ attacker, move, damageDealt }) => {
      const ratio = move.specialEffect === 'drain_30' ? 0.3 : 0.18;
      const heal = Math.max(3, Math.round(damageDealt * ratio));
      const prev = attacker.hp;
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
      const healedHp = attacker.hp - prev;
      return healedHp > 0
        ? { healedHp, note: `└ [TYPE:Grass] Hút sinh lực hồi **+${healedHp} HP**!` }
        : { note: null };
    },
  },
  Ice: {
    type: 'Ice',
    traitName: 'Hàn Băng (15% Đóng Băng)',
    onAfterHit: ({ defender, randomFn }) => {
      if (
        defender.hp > 0 &&
        defender.status === 'NONE' &&
        !defender.species.types.includes('Ice') &&
        randomFn() < 0.15
      ) {
        defender.status = 'FREEZE';
        return {
          note: `└ [TYPE:Ice] **${defender.species.name}** bị **ĐÓNG BĂNG** và mất lượt kế tiếp!`,
        };
      }
      return { note: null };
    },
  },
  Fighting: {
    type: 'Fighting',
    traitName: 'Phá Giáp (Xuyên 15% Thủ)',
    defenseIgnoreRatio: 0.15,
    onAfterHit: ({ attacker, move, damageDealt }) => {
      if (move.specialEffect !== 'drain_30') {
        return { note: null };
      }
      const heal = Math.max(4, Math.round(damageDealt * 0.3));
      const prev = attacker.hp;
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
      const healedHp = attacker.hp - prev;
      return healedHp > 0
        ? { healedHp, note: `└ [TYPE:Fighting] Hút sinh lực hồi **+${healedHp} HP**!` }
        : { note: null };
    },
  },
  Poison: {
    type: 'Poison',
    traitName: 'Kịch Độc (25% Trúng Độc)',
    onAfterHit: ({ defender, randomFn }) => {
      if (
        defender.hp > 0 &&
        defender.status === 'NONE' &&
        !defender.species.types.includes('Poison') &&
        !defender.species.types.includes('Steel') &&
        randomFn() < 0.25
      ) {
        defender.status = 'POISON';
        return {
          note: `└ [TYPE:Poison] **${defender.species.name}** bị **TRÚNG ĐỘC** (mất 10% HP mỗi cuối lượt)!`,
        };
      }
      return { note: null };
    },
  },
  Ground: {
    type: 'Ground',
    traitName: 'Địa Chấn (Phá Giáp Thép)',
    ignoresSteelGuard: true,
    rawDamageMultiplier: 1.06,
  },
  Flying: {
    type: 'Flying',
    traitName: 'Thuận Gió (+15% Tốc độ ưu tiên)',
    speedTurnMultiplier: 1.15,
  },
  Psychic: {
    type: 'Psychic',
    traitName: 'Áp Lực Tâm Linh (+8% Acc & 20% Giảm Công)',
    bonusAccuracy: 0.08,
    onAfterHit: ({ defender, randomFn }) => {
      if (defender.hp > 0 && randomFn() < 0.2 && defender.offenseBuff > 0.75) {
        defender.offenseBuff = Math.max(0.75, Number((defender.offenseBuff - 0.1).toFixed(2)));
        return {
          note: `└ [TYPE:Psychic] **${defender.species.name}** bị rối loạn tâm trí (-10% Công kích)!`,
        };
      }
      return { note: null };
    },
  },
  Bug: {
    type: 'Bug',
    traitName: 'Bủa Vây (22% Giảm Tốc độ địch)',
    onAfterHit: ({ defender, randomFn }) => {
      if (defender.hp > 0 && randomFn() < 0.22 && defender.speedMultiplier > 0.7) {
        defender.speedMultiplier = Math.max(
          0.7,
          Number((defender.speedMultiplier - 0.12).toFixed(2)),
        );
        return {
          note: `└ [TYPE:Bug] **${defender.species.name}** bị bủa vây (-12% Tốc độ)!`,
        };
      }
      return { note: null };
    },
  },
  Rock: {
    type: 'Rock',
    traitName: 'Nham Thạch Sắc (Xuyên 15% Thủ)',
    defenseIgnoreRatio: 0.15,
  },
  Ghost: {
    type: 'Ghost',
    traitName: 'Ám Kích (18% Choáng khi đi trước)',
    onAfterHit: ({ defender, isMovingFirst, randomFn }) => {
      if (defender.hp > 0 && isMovingFirst && randomFn() < 0.18) {
        defender.flinched = true;
        return {
          note: `└ [TYPE:Ghost] **${defender.species.name}** bị **CHOÁNG** bởi ám ảnh!`,
        };
      }
      return { note: null };
    },
  },
  Dragon: {
    type: 'Dragon',
    traitName: 'Long Nộ (+10% Sát thương · Rủi ro Loạn Đả tự đánh)',
    rawDamageMultiplier: 1.1,
    onAfterHit: ({ attacker, move, randomFn }) => {
      // Đặc trưng hệ Rồng (PokéMeow): Sức mạnh cực đại nhưng có tỉ lệ tự loạn đả vào bản thân
      const selfHitChance = move.power >= 115 ? 0.28 : 0.22;
      if (attacker.hp > 0 && randomFn() < selfHitChance) {
        const selfDamage = Math.max(4, Math.round(attacker.maxHp * 0.15));
        attacker.hp = Math.max(0, attacker.hp - selfDamage);
        return {
          selfDamageDealt: selfDamage,
          note: `└ [TYPE:Dragon] **Loạn Đả Hệ Rồng!** **${attacker.species.name}** mất kiểm soát và tự tấn công bản thân (**-${selfDamage} HP**)!`,
        };
      }
      return { note: null };
    },
  },
  Dark: {
    type: 'Dark',
    traitName: 'Đánh Lén (18% Choáng khi đi trước)',
    onAfterHit: ({ defender, isMovingFirst, randomFn }) => {
      if (defender.hp > 0 && isMovingFirst && randomFn() < 0.18) {
        defender.flinched = true;
        return {
          note: `└ [TYPE:Dark] **${defender.species.name}** bị **CHOÁNG** vì đòn đánh lén!`,
        };
      }
      return { note: null };
    },
  },
  Steel: {
    type: 'Steel',
    traitName: 'Giáp Thép (Giảm 15% sát thương nhận 1 lượt)',
    onAfterHit: ({ attacker }) => {
      attacker.steelGuardTurns = 1;
      return {
        note: `└ [TYPE:Steel] **${attacker.species.name}** dựng **Giáp Thép** (-15% sát thương nhận lượt tới)!`,
      };
    },
  },
  Fairy: {
    type: 'Fairy',
    traitName: 'Phép Tiên (+8% Acc & 20% Giảm Công)',
    bonusAccuracy: 0.08,
    onAfterHit: ({ defender, randomFn }) => {
      if (defender.hp > 0 && randomFn() < 0.2 && defender.offenseBuff > 0.75) {
        defender.offenseBuff = Math.max(0.75, Number((defender.offenseBuff - 0.1).toFixed(2)));
        return {
          note: `└ [TYPE:Fairy] Ma lực Tiên làm **${defender.species.name}** suy yếu (-10% Công)!`,
        };
      }
      return { note: null };
    },
  },
};

export function getTypeEffectiveness(
  moveType: string,
  defenderTypes: readonly string[],
): number {
  const row = TYPE_EFFECTIVENESS_CHART[moveType];
  if (!row) {
    return 1;
  }
  let mult = 1;
  for (const defType of defenderTypes) {
    const factor = row[defType];
    if (factor !== undefined) {
      mult *= factor;
    }
  }
  return Number(mult.toFixed(2));
}

export function analyzeDefensiveMatchups(
  defenderTypes: readonly string[],
): DefensiveMatchupSummary {
  const weaknesses: { readonly type: string; readonly mult: number }[] = [];
  const resistances: { readonly type: string; readonly mult: number }[] = [];
  const immunities: { readonly type: string; readonly mult: number }[] = [];

  for (const atkType of ALL_TYPES) {
    const mult = getTypeEffectiveness(atkType, defenderTypes);
    if (mult === 0) {
      immunities.push({ type: atkType, mult: 0 });
    } else if (mult > 1) {
      weaknesses.push({ type: atkType, mult });
    } else if (mult < 1) {
      resistances.push({ type: atkType, mult });
    }
  }

  weaknesses.sort((a, b) => b.mult - a.mult);
  resistances.sort((a, b) => a.mult - b.mult);

  return { weaknesses, resistances, immunities };
}

function calcStat(base: number, iv: number, level: number, isHp: boolean): number {
  const scaled = Math.floor(((2 * base + iv) * level) / 100);
  return isHp ? scaled + level + 18 : scaled + 10;
}

export function computeComputedStats(
  species: CreatureSpecies,
  ivs: CreatureIVs,
  level: number,
  isShiny: boolean,
): ComputedCreatureStats {
  const clampedLv = Math.max(1, Math.min(100, level));
  const shinyFactor = isShiny ? 1.05 : 1.0;

  const maxHp = Math.round(calcStat(species.baseStats.hp, ivs.hp, clampedLv, true) * shinyFactor);
  const atk = Math.round(calcStat(species.baseStats.atk, ivs.atk, clampedLv, false) * shinyFactor);
  const def = Math.round(calcStat(species.baseStats.def, ivs.def, clampedLv, false) * shinyFactor);
  const spAtk = Math.round(
    calcStat(species.baseStats.spAtk, ivs.spAtk, clampedLv, false) * shinyFactor,
  );
  const spDef = Math.round(
    calcStat(species.baseStats.spDef, ivs.spDef, clampedLv, false) * shinyFactor,
  );
  const spd = Math.round(calcStat(species.baseStats.spd, ivs.spd, clampedLv, false) * shinyFactor);

  const combatPower = Math.round(
    maxHp * 1.4 + Math.max(atk, spAtk) * 1.8 + (def + spDef) * 0.9 + spd * 1.1,
  );

  const pool = getSpeciesMovePool(species);

  return {
    maxHp,
    atk,
    def,
    spAtk,
    spDef,
    spd,
    combatPower,
    starterMoves: pool.starterMoves,
  };
}

export function buildCombatant(
  species: CreatureSpecies,
  ivs: CreatureIVs,
  level: number,
  isShiny: boolean,
  ownerId: string,
  ownerName: string,
  equippedMoves?: readonly MoveSpec[],
): CombatantState {
  const clampedLv = Math.max(1, Math.min(100, level));
  const stats = computeComputedStats(species, ivs, clampedLv, isShiny);
  const moves =
    equippedMoves && equippedMoves.length > 0
      ? equippedMoves.slice(0, 4)
      : stats.starterMoves;

  return {
    ownerId,
    ownerName,
    species,
    isShiny,
    level: clampedLv,
    maxHp: stats.maxHp,
    hp: stats.maxHp,
    atk: stats.atk,
    def: stats.def,
    spAtk: stats.spAtk,
    spDef: stats.spDef,
    spd: stats.spd,
    offenseBuff: 1.0,
    defMultiplier: 1.0,
    speedMultiplier: 1.0,
    status: 'NONE',
    steelGuardTurns: 0,
    flinched: false,
    healUsesLeft: 2,
    cooldowns: {},
    moves,
  };
}

export function getEffectiveSpeed(combatant: CombatantState, slotIndex?: number): number {
  const move = slotIndex !== undefined ? combatant.moves[slotIndex] : undefined;
  const trait = move ? TYPE_TRAIT_REGISTRY[move.type] : undefined;
  const statusMult = combatant.status === 'PARALYZE' ? 0.65 : 1.0;
  const traitSpeedMult = trait?.speedTurnMultiplier ?? 1.0;
  const priorityBonus = move?.specialEffect === 'priority' ? 5000 : 0;
  return combatant.spd * combatant.speedMultiplier * statusMult * traitSpeedMult + priorityBonus;
}

function tickCooldowns(combatant: CombatantState): void {
  for (const [moveId, cd] of Object.entries(combatant.cooldowns)) {
    if (cd > 0) {
      combatant.cooldowns[moveId] = cd - 1;
    }
  }
}

export function executeMove(
  attacker: CombatantState,
  defender: CombatantState,
  requestedSlot: number,
  isMovingFirst = true,
  randomFn: () => number = Math.random,
): MoveExecutionResult {
  tickCooldowns(attacker);

  let chosenIndex = Math.max(0, Math.min(attacker.moves.length - 1, requestedSlot));
  let move = attacker.moves[chosenIndex] ?? attacker.moves[0]!;

  const currentCd = attacker.cooldowns[move.id] ?? 0;
  if (currentCd > 0 || (move.specialEffect === 'heal_38' && attacker.healUsesLeft <= 0)) {
    const fallbackIdx = attacker.moves.findIndex(
      (candidate) =>
        (attacker.cooldowns[candidate.id] ?? 0) === 0 &&
        !(candidate.specialEffect === 'heal_38' && attacker.healUsesLeft <= 0),
    );
    chosenIndex = fallbackIdx >= 0 ? fallbackIdx : 0;
    move = attacker.moves[chosenIndex]!;
  }

  // Kiểm tra trạng thái khống chế trước khi tung chiêu
  if (attacker.flinched) {
    attacker.flinched = false;
    return {
      attackerName: attacker.species.name,
      slotIndex: chosenIndex,
      moveName: move.name,
      moveType: move.type,
      hit: false,
      damageDealt: 0,
      selfDamageDealt: 0,
      healedHp: 0,
      effectiveness: 1,
      isCrit: false,
      logLine: `[TYPE:${move.type}] **${attacker.species.name}** bị **CHOÁNG** nên không thể tung **${move.name}**!`,
    };
  }

  if (attacker.status === 'FREEZE') {
    attacker.status = 'NONE';
    return {
      attackerName: attacker.species.name,
      slotIndex: chosenIndex,
      moveName: move.name,
      moveType: move.type,
      hit: false,
      damageDealt: 0,
      selfDamageDealt: 0,
      healedHp: 0,
      effectiveness: 1,
      isCrit: false,
      logLine: `[TYPE:Ice] **${attacker.species.name}** bị **ĐÓNG BĂNG**, mất 1 lượt trước khi tan băng!`,
    };
  }

  if (attacker.status === 'PARALYZE' && randomFn() < 0.25) {
    return {
      attackerName: attacker.species.name,
      slotIndex: chosenIndex,
      moveName: move.name,
      moveType: move.type,
      hit: false,
      damageDealt: 0,
      selfDamageDealt: 0,
      healedHp: 0,
      effectiveness: 1,
      isCrit: false,
      logLine: `[TYPE:Electric] **${attacker.species.name}** bị **TÊ LIỆT** toàn thân và mất lượt!`,
    };
  }

  if (move.cooldownTurns > 0) {
    attacker.cooldowns[move.id] = move.cooldownTurns + 1;
  }

  // Chiêu Status / Hồi phục / Buff
  if (move.category === 'status') {
    if (move.specialEffect === 'heal_38') {
      attacker.healUsesLeft = Math.max(0, attacker.healUsesLeft - 1);
      const healAmount = Math.max(12, Math.round(attacker.maxHp * 0.38));
      const prevHp = attacker.hp;
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + healAmount);
      const healedHp = attacker.hp - prevHp;
      const hadStatus = attacker.status !== 'NONE';
      attacker.status = 'NONE';

      return {
        attackerName: attacker.species.name,
        slotIndex: chosenIndex,
        moveName: move.name,
        moveType: move.type,
        hit: true,
        damageDealt: 0,
        selfDamageDealt: 0,
        healedHp,
        effectiveness: 1,
        isCrit: false,
        logLine: `[TYPE:${move.type}] **${attacker.species.name}** dùng **${move.name}** hồi **+${healedHp} HP**${hadStatus ? ' & giải sạch trạng thái xấu' : ''}!`,
      };
    }

    if (move.specialEffect === 'buff_atk_spd') {
      attacker.offenseBuff = Math.min(1.65, Number((attacker.offenseBuff + 0.28).toFixed(2)));
      attacker.speedMultiplier = Math.min(1.5, Number((attacker.speedMultiplier + 0.12).toFixed(2)));
      return {
        attackerName: attacker.species.name,
        slotIndex: chosenIndex,
        moveName: move.name,
        moveType: move.type,
        hit: true,
        damageDealt: 0,
        selfDamageDealt: 0,
        healedHp: 0,
        effectiveness: 1,
        isCrit: false,
        logLine: `[TYPE:${move.type}] **${attacker.species.name}** kích hoạt **${move.name}** (**+28% Công**, **+12% Tốc độ**)!`,
      };
    }

    attacker.offenseBuff = Math.min(1.65, Number((attacker.offenseBuff + 0.25).toFixed(2)));
    attacker.defMultiplier = Math.min(1.5, Number((attacker.defMultiplier + 0.15).toFixed(2)));
    return {
      attackerName: attacker.species.name,
      slotIndex: chosenIndex,
      moveName: move.name,
      moveType: move.type,
      hit: true,
      damageDealt: 0,
      selfDamageDealt: 0,
      healedHp: 0,
      effectiveness: 1,
      isCrit: false,
      logLine: `[TYPE:${move.type}] **${attacker.species.name}** dùng **${move.name}** (**+25% Công**, **+15% Thủ**)!`,
    };
  }

  const trait = TYPE_TRAIT_REGISTRY[move.type];
  const effectiveAcc = Math.min(1.0, move.accuracy + (trait?.bonusAccuracy ?? 0));

  if (randomFn() > effectiveAcc) {
    return {
      attackerName: attacker.species.name,
      slotIndex: chosenIndex,
      moveName: move.name,
      moveType: move.type,
      hit: false,
      damageDealt: 0,
      selfDamageDealt: 0,
      healedHp: 0,
      effectiveness: 1,
      isCrit: false,
      logLine: `[TYPE:${move.type}] **${attacker.species.name}** tung **${move.name}** nhưng bị **trượt**!`,
    };
  }

  const effectiveness = getTypeEffectiveness(move.type, defender.species.types);
  if (effectiveness === 0) {
    return {
      attackerName: attacker.species.name,
      slotIndex: chosenIndex,
      moveName: move.name,
      moveType: move.type,
      hit: true,
      damageDealt: 0,
      selfDamageDealt: 0,
      healedHp: 0,
      effectiveness: 0,
      isCrit: false,
      logLine: `[TYPE:${move.type}] **${attacker.species.name}** tung **${move.name}** → **${defender.species.name}** **MIỄN NHIỄM (x0 — 0 sát thương)**!`,
    };
  }

  const burnAtkPenalty =
    move.category === 'physical' && attacker.status === 'BURN' ? 0.8 : 1.0;
  const offStat =
    (move.category === 'physical' ? attacker.atk : attacker.spAtk) *
    attacker.offenseBuff *
    burnAtkPenalty;

  const baseDefStat =
    (move.category === 'physical' ? defender.def : defender.spDef) * defender.defMultiplier;
  const defIgnore = trait?.defenseIgnoreRatio ?? 0;
  const effectiveDefStat = Math.max(1, baseDefStat * (1 - defIgnore));

  const isStab = attacker.species.types.includes(move.type);
  const stabMult = isStab ? 1.5 : 1.0;
  const critChance = Math.min(0.5, move.critRate + (trait?.bonusCritRate ?? 0));
  const isCrit = randomFn() < critChance;
  const critMult = isCrit ? 1.5 : 1.0;
  const variance = 0.9 + randomFn() * 0.12;
  const traitDamageMult = trait?.rawDamageMultiplier ?? 1.0;
  const steelShieldMult =
    defender.steelGuardTurns > 0 && !trait?.ignoresSteelGuard ? 0.85 : 1.0;

  if (defender.steelGuardTurns > 0) {
    defender.steelGuardTurns = 0;
  }

  const baseDamage =
    ((2 * attacker.level) / 5 + 4) * move.power * (offStat / effectiveDefStat);
  const rawDamage = Math.floor(
    (baseDamage / 42 + 4) *
      stabMult *
      effectiveness *
      critMult *
      traitDamageMult *
      steelShieldMult *
      variance,
  );
  const damageDealt = Math.max(2, rawDamage);

  defender.hp = Math.max(0, defender.hp - damageDealt);

  const effTag =
    effectiveness >= 4
      ? ' *(x4 Khắc chế kép!)*'
      : effectiveness >= 2
        ? ' *(x2 Khắc hệ!)*'
        : effectiveness <= 0.25
          ? ' *(x0.25 Bị kháng mạnh)*'
          : effectiveness < 1
            ? ' *(x0.5 Không hiệu quả)*'
            : '';
  const stabTag = isStab ? ' `STAB`' : '';
  const critTag = isCrit ? ' **[CHÍ MẠNG]**' : '';

  const logParts: string[] = [
    `[TYPE:${move.type}] **${attacker.species.name}** dùng **${move.name}** gây **${damageDealt} sát thương**!${critTag}${stabTag}${effTag}`,
  ];

  let selfDamageDealt = 0;
  let healedHp = 0;

  if (trait?.onAfterHit) {
    const traitOutcome = trait.onAfterHit({
      attacker,
      defender,
      move,
      damageDealt,
      isMovingFirst,
      randomFn,
    });
    if (traitOutcome.note) {
      logParts.push(traitOutcome.note);
    }
    if (traitOutcome.selfDamageDealt) {
      selfDamageDealt = traitOutcome.selfDamageDealt;
    }
    if (traitOutcome.healedHp) {
      healedHp = traitOutcome.healedHp;
    }
  }

  return {
    attackerName: attacker.species.name,
    slotIndex: chosenIndex,
    moveName: move.name,
    moveType: move.type,
    hit: true,
    damageDealt,
    selfDamageDealt,
    healedHp,
    effectiveness,
    isCrit,
    logLine: logParts.join('\n'),
  };
}

export function applyEndOfRoundStatus(combatant: CombatantState): string | null {
  if (combatant.hp <= 0) {
    return null;
  }
  if (combatant.status === 'BURN') {
    const dot = Math.max(2, Math.round(combatant.maxHp * 0.08));
    combatant.hp = Math.max(0, combatant.hp - dot);
    return `[TYPE:Fire] **${combatant.species.name}** chịu **-${dot} HP** từ vết **BỎNG**!`;
  }
  if (combatant.status === 'POISON') {
    const dot = Math.max(2, Math.round(combatant.maxHp * 0.1));
    combatant.hp = Math.max(0, combatant.hp - dot);
    return `[TYPE:Poison] **${combatant.species.name}** chịu **-${dot} HP** từ **ĐỘC TỐ**!`;
  }
  return null;
}
