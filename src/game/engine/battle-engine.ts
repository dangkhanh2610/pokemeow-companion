import type { CreatureIVs, CreatureSpecies } from '../types';

export type BattleMoveAction = 'primary' | 'ultimate' | 'recover';

export interface CombatMoveSpec {
  readonly id: 'primary' | 'ultimate';
  readonly name: string;
  readonly type: string;
  readonly power: number;
  readonly accuracy: number;
  readonly category: 'physical' | 'special';
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
  ultimateCooldown: number;
  recoverUsesLeft: number;
  readonly primaryMove: CombatMoveSpec;
  readonly ultimateMove: CombatMoveSpec;
}

export interface MoveExecutionResult {
  readonly attackerName: string;
  readonly action: BattleMoveAction;
  readonly moveName: string;
  readonly hit: boolean;
  readonly damageDealt: number;
  readonly healedHp: number;
  readonly effectiveness: number;
  readonly isCrit: boolean;
  readonly logLine: string;
}

// Bảng khắc chế 18 hệ Pokémon chuẩn (miễn nhiễm chuyển thành 0.2x trong 1v1 để tránh kẹt chiêu)
const TYPE_EFFECTIVENESS_CHART: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  Normal: { Rock: 0.5, Ghost: 0.2, Steel: 0.5 },
  Fire: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 2, Bug: 2, Rock: 0.5, Dragon: 0.5, Steel: 2 },
  Water: { Fire: 2, Water: 0.5, Grass: 0.5, Ground: 2, Rock: 2, Dragon: 0.5 },
  Electric: { Water: 2, Electric: 0.5, Grass: 0.5, Ground: 0.2, Flying: 2, Dragon: 0.5 },
  Grass: { Fire: 0.5, Water: 2, Grass: 0.5, Poison: 0.5, Ground: 2, Flying: 0.5, Bug: 0.5, Rock: 2, Dragon: 0.5, Steel: 0.5 },
  Ice: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 0.5, Ground: 2, Flying: 2, Dragon: 2, Steel: 0.5 },
  Fighting: { Normal: 2, Ice: 2, Poison: 0.5, Flying: 0.5, Psychic: 0.5, Bug: 0.5, Rock: 2, Ghost: 0.2, Dark: 2, Steel: 2, Fairy: 0.5 },
  Poison: { Grass: 2, Poison: 0.5, Ground: 0.5, Rock: 0.5, Ghost: 0.5, Steel: 0.2, Fairy: 2 },
  Ground: { Fire: 2, Electric: 2, Grass: 0.5, Poison: 2, Flying: 0.2, Bug: 0.5, Rock: 2, Steel: 2 },
  Flying: { Electric: 0.5, Grass: 2, Fighting: 2, Bug: 2, Rock: 0.5, Steel: 0.5 },
  Psychic: { Fighting: 2, Poison: 2, Psychic: 0.5, Dark: 0.2, Steel: 0.5 },
  Bug: { Fire: 0.5, Grass: 2, Fighting: 0.5, Poison: 0.5, Flying: 0.5, Psychic: 2, Ghost: 0.5, Dark: 2, Steel: 0.5, Fairy: 0.5 },
  Rock: { Fire: 2, Ice: 2, Fighting: 0.5, Ground: 0.5, Flying: 2, Bug: 2, Steel: 0.5 },
  Ghost: { Normal: 0.2, Psychic: 2, Ghost: 2, Dark: 0.5 },
  Dragon: { Dragon: 2, Steel: 0.5, Fairy: 0.2 },
  Dark: { Fighting: 0.5, Psychic: 2, Ghost: 2, Dark: 0.5, Fairy: 0.5 },
  Steel: { Fire: 0.5, Water: 0.5, Electric: 0.5, Ice: 2, Rock: 2, Steel: 0.5, Fairy: 2 },
  Fairy: { Fire: 0.5, Fighting: 2, Poison: 0.5, Dragon: 2, Dark: 2, Steel: 0.5 },
};

const TYPE_PRIMARY_NAMES: Readonly<Record<string, string>> = {
  Normal: 'Body Slam',
  Fire: 'Flamethrower',
  Water: 'Surf',
  Electric: 'Thunderbolt',
  Grass: 'Energy Ball',
  Ice: 'Ice Beam',
  Fighting: 'Brick Break',
  Poison: 'Sludge Bomb',
  Ground: 'Earthquake',
  Flying: 'Air Slash',
  Psychic: 'Psychic',
  Bug: 'X-Scissor',
  Rock: 'Rock Slide',
  Ghost: 'Shadow Ball',
  Dragon: 'Dragon Claw',
  Dark: 'Dark Pulse',
  Steel: 'Flash Cannon',
  Fairy: 'Dazzling Gleam',
};

const TYPE_ULTIMATE_NAMES: Readonly<Record<string, string>> = {
  Normal: 'Giga Impact',
  Fire: 'Fire Blast',
  Water: 'Hydro Pump',
  Electric: 'Thunder',
  Grass: 'Solar Beam',
  Ice: 'Blizzard',
  Fighting: 'Close Combat',
  Poison: 'Gunk Shot',
  Ground: 'Earth Power',
  Flying: 'Brave Bird',
  Psychic: 'Psystrike',
  Bug: 'Megahorn',
  Rock: 'Stone Edge',
  Ghost: 'Shadow Force',
  Dragon: 'Outrage',
  Dark: 'Foul Play',
  Steel: 'Meteor Mash',
  Fairy: 'Moonblast',
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

function calcStat(base: number, iv: number, level: number, isHp: boolean): number {
  const scaled = Math.floor(((2 * base + iv) * level) / 100);
  return isHp ? scaled + level + 18 : scaled + 10;
}

export function buildCombatant(
  species: CreatureSpecies,
  ivs: CreatureIVs,
  level: number,
  isShiny: boolean,
  ownerId: string,
  ownerName: string,
): CombatantState {
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

  const primaryType = species.types[0] ?? 'Normal';
  const secondaryType = species.types[1] ?? primaryType;
  const preferPhysical = atk >= spAtk;

  return {
    ownerId,
    ownerName,
    species,
    isShiny,
    level: clampedLv,
    maxHp,
    hp: maxHp,
    atk,
    def,
    spAtk,
    spDef,
    spd,
    offenseBuff: 1.0,
    ultimateCooldown: 0,
    recoverUsesLeft: 2,
    primaryMove: {
      id: 'primary',
      name: TYPE_PRIMARY_NAMES[primaryType] ?? 'Tackle',
      type: primaryType,
      power: 85,
      accuracy: 1.0,
      category: preferPhysical ? 'physical' : 'special',
    },
    ultimateMove: {
      id: 'ultimate',
      name: TYPE_ULTIMATE_NAMES[secondaryType] ?? 'Hyper Beam',
      type: secondaryType,
      power: 125,
      accuracy: 0.88,
      category: preferPhysical ? 'physical' : 'special',
    },
  };
}

export function executeMove(
  attacker: CombatantState,
  defender: CombatantState,
  requestedAction: BattleMoveAction,
  randomFn: () => number = Math.random,
): MoveExecutionResult {
  if (attacker.ultimateCooldown > 0) {
    attacker.ultimateCooldown -= 1;
  }

  let action: BattleMoveAction = requestedAction;
  if (action === 'recover' && attacker.recoverUsesLeft <= 0) {
    action = 'primary';
  }
  if (action === 'ultimate' && attacker.ultimateCooldown > 0) {
    action = 'primary';
  }

  if (action === 'recover') {
    attacker.recoverUsesLeft -= 1;
    const healAmount = Math.max(12, Math.round(attacker.maxHp * 0.3));
    const prevHp = attacker.hp;
    attacker.hp = Math.min(attacker.maxHp, attacker.hp + healAmount);
    attacker.offenseBuff = Math.min(1.45, Number((attacker.offenseBuff + 0.15).toFixed(2)));
    const actualHeal = attacker.hp - prevHp;

    return {
      attackerName: attacker.species.name,
      action: 'recover',
      moveName: 'Recover & Focus',
      hit: true,
      damageDealt: 0,
      healedHp: actualHeal,
      effectiveness: 1,
      isCrit: false,
      logLine: `**${attacker.species.name}** hồi **+${actualHeal} HP** và tăng **+15%** công kích!`,
    };
  }

  const move = action === 'ultimate' ? attacker.ultimateMove : attacker.primaryMove;
  if (action === 'ultimate') {
    attacker.ultimateCooldown = 2;
  }

  if (randomFn() > move.accuracy) {
    return {
      attackerName: attacker.species.name,
      action,
      moveName: move.name,
      hit: false,
      damageDealt: 0,
      healedHp: 0,
      effectiveness: 1,
      isCrit: false,
      logLine: `**${attacker.species.name}** dùng **${move.name}** nhưng bị **trượt**!`,
    };
  }

  const offStat =
    (move.category === 'physical' ? attacker.atk : attacker.spAtk) * attacker.offenseBuff;
  const defStat = move.category === 'physical' ? defender.def : defender.spDef;
  const stab = attacker.species.types.includes(move.type) ? 1.25 : 1.0;
  const effectiveness = getTypeEffectiveness(move.type, defender.species.types);
  const isCrit = randomFn() < 0.1;
  const critMult = isCrit ? 1.45 : 1.0;
  const variance = 0.9 + randomFn() * 0.12;

  const baseDamage = ((2 * attacker.level) / 5 + 4) * move.power * (offStat / Math.max(1, defStat));
  const rawDamage = Math.floor((baseDamage / 42 + 4) * stab * effectiveness * critMult * variance);
  const damageDealt = Math.max(4, rawDamage);

  defender.hp = Math.max(0, defender.hp - damageDealt);

  const effTag =
    effectiveness >= 2
      ? ' *(Rất hiệu quả!)*'
      : effectiveness <= 0.5
        ? ' *(Không hiệu quả lắm)*'
        : '';
  const critTag = isCrit ? ' **[CHÍ MẠNG]**' : '';

  return {
    attackerName: attacker.species.name,
    action,
    moveName: move.name,
    hit: true,
    damageDealt,
    healedHp: 0,
    effectiveness,
    isCrit,
    logLine: `**${attacker.species.name}** tung **${move.name}** gây **${damageDealt} sát thương**!${critTag}${effTag}`,
  };
}
