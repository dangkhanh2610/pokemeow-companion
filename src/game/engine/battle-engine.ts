import type { CreatureIVs, CreatureSpecies } from '../types';

export type BattleMoveAction = 'primary' | 'secondary' | 'ultimate' | 'recover';

export interface CombatMoveSpec {
  readonly id: 'primary' | 'secondary' | 'ultimate';
  readonly name: string;
  readonly type: string;
  readonly power: number;
  readonly accuracy: number;
  readonly category: 'physical' | 'special';
  readonly critRate: number;
  readonly cooldownTurns: number;
  readonly description: string;
}

export interface ComputedCreatureStats {
  readonly maxHp: number;
  readonly atk: number;
  readonly def: number;
  readonly spAtk: number;
  readonly spDef: number;
  readonly spd: number;
  readonly combatPower: number;
  readonly primaryMove: CombatMoveSpec;
  readonly secondaryMove: CombatMoveSpec;
  readonly ultimateMove: CombatMoveSpec;
}

export interface DefensiveMatchupSummary {
  readonly weaknesses: readonly { readonly type: string; readonly mult: number }[];
  readonly resistances: readonly { readonly type: string; readonly mult: number }[];
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
  readonly secondaryMove: CombatMoveSpec;
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

const PHYSICAL_PRIMARY_MOVES: Readonly<Record<string, string>> = {
  Normal: 'Body Slam',
  Fire: 'Fire Punch',
  Water: 'Waterfall',
  Electric: 'Wild Charge',
  Grass: 'Leaf Blade',
  Ice: 'Icicle Crash',
  Fighting: 'Brick Break',
  Poison: 'Poison Jab',
  Ground: 'Earthquake',
  Flying: 'Drill Peck',
  Psychic: 'Zen Headbutt',
  Bug: 'X-Scissor',
  Rock: 'Rock Slide',
  Ghost: 'Shadow Claw',
  Dragon: 'Dragon Claw',
  Dark: 'Crunch',
  Steel: 'Iron Head',
  Fairy: 'Play Rough',
};

const SPECIAL_PRIMARY_MOVES: Readonly<Record<string, string>> = {
  Normal: 'Hyper Voice',
  Fire: 'Flamethrower',
  Water: 'Surf',
  Electric: 'Thunderbolt',
  Grass: 'Energy Ball',
  Ice: 'Ice Beam',
  Fighting: 'Aura Sphere',
  Poison: 'Sludge Bomb',
  Ground: 'Earth Power',
  Flying: 'Air Slash',
  Psychic: 'Psychic',
  Bug: 'Bug Buzz',
  Rock: 'Power Gem',
  Ghost: 'Shadow Ball',
  Dragon: 'Dragon Pulse',
  Dark: 'Dark Pulse',
  Steel: 'Flash Cannon',
  Fairy: 'Dazzling Gleam',
};

const PHYSICAL_ULTIMATE_MOVES: Readonly<Record<string, string>> = {
  Normal: 'Giga Impact',
  Fire: 'Flare Blitz',
  Water: 'Wave Crash',
  Electric: 'Volt Tackle',
  Grass: 'Wood Hammer',
  Ice: 'Mountain Gale',
  Fighting: 'Close Combat',
  Poison: 'Gunk Shot',
  Ground: 'Headlong Rush',
  Flying: 'Brave Bird',
  Psychic: 'Psychic Fangs',
  Bug: 'Megahorn',
  Rock: 'Stone Edge',
  Ghost: 'Phantom Force',
  Dragon: 'Outrage',
  Dark: 'Foul Play',
  Steel: 'Meteor Mash',
  Fairy: 'Spirit Break',
};

const SPECIAL_ULTIMATE_MOVES: Readonly<Record<string, string>> = {
  Normal: 'Hyper Beam',
  Fire: 'Fire Blast',
  Water: 'Hydro Pump',
  Electric: 'Thunder',
  Grass: 'Solar Beam',
  Ice: 'Blizzard',
  Fighting: 'Focus Blast',
  Poison: 'Sludge Wave',
  Ground: 'Scorching Sands',
  Flying: 'Hurricane',
  Psychic: 'Psystrike',
  Bug: 'Buggy Impact',
  Rock: 'Meteor Beam',
  Ghost: 'Shadow Force',
  Dragon: 'Draco Meteor',
  Dark: 'Night Daze',
  Steel: 'Steel Beam',
  Fairy: 'Moonblast',
};

const MONO_TYPE_COVERAGE: Readonly<Record<string, string>> = {
  Normal: 'Fighting',
  Fire: 'Ground',
  Water: 'Ice',
  Electric: 'Steel',
  Grass: 'Poison',
  Ice: 'Water',
  Fighting: 'Rock',
  Poison: 'Dark',
  Ground: 'Rock',
  Flying: 'Normal',
  Psychic: 'Fairy',
  Bug: 'Grass',
  Rock: 'Ground',
  Ghost: 'Dark',
  Dragon: 'Fire',
  Dark: 'Ghost',
  Steel: 'Rock',
  Fairy: 'Psychic',
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

  for (const atkType of ALL_TYPES) {
    const mult = getTypeEffectiveness(atkType, defenderTypes);
    if (mult > 1) {
      weaknesses.push({ type: atkType, mult });
    } else if (mult < 1) {
      resistances.push({ type: atkType, mult });
    }
  }

  weaknesses.sort((a, b) => b.mult - a.mult);
  resistances.sort((a, b) => a.mult - b.mult);

  return { weaknesses, resistances };
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
    maxHp * 1.4 + (Math.max(atk, spAtk) * 1.8) + (def + spDef) * 0.9 + spd * 1.1,
  );

  const primaryType = species.types[0] ?? 'Normal';
  const secondaryType = species.types[1] ?? MONO_TYPE_COVERAGE[primaryType] ?? 'Normal';
  const preferPhysical = atk >= spAtk;
  const category: 'physical' | 'special' = preferPhysical ? 'physical' : 'special';

  const primaryMove: CombatMoveSpec = {
    id: 'primary',
    name:
      (preferPhysical
        ? PHYSICAL_PRIMARY_MOVES[primaryType]
        : SPECIAL_PRIMARY_MOVES[primaryType]) ?? 'Tackle',
    type: primaryType,
    power: 85,
    accuracy: 1.0,
    category,
    critRate: 0.1,
    cooldownTurns: 0,
    description: 'Chiêu chủ lực chính xác 100%, nhận STAB +25%',
  };

  const secondaryMove: CombatMoveSpec = {
    id: 'secondary',
    name:
      (preferPhysical
        ? PHYSICAL_PRIMARY_MOVES[secondaryType]
        : SPECIAL_PRIMARY_MOVES[secondaryType]) ?? 'Swift',
    type: secondaryType,
    power: 95,
    accuracy: 0.95,
    category,
    critRate: 0.22,
    cooldownTurns: 0,
    description: 'Chiêu phủ hệ tỷ lệ Chí Mạng cao (22%)',
  };

  const ultimateMove: CombatMoveSpec = {
    id: 'ultimate',
    name:
      (preferPhysical
        ? PHYSICAL_ULTIMATE_MOVES[primaryType]
        : SPECIAL_ULTIMATE_MOVES[primaryType]) ?? 'Hyper Beam',
    type: primaryType,
    power: 125,
    accuracy: 0.88,
    category,
    critRate: 0.12,
    cooldownTurns: 2,
    description: 'Tuyệt kỹ sát thương cực lớn (hồi 1 lượt sau khi tung)',
  };

  return {
    maxHp,
    atk,
    def,
    spAtk,
    spDef,
    spd,
    combatPower,
    primaryMove,
    secondaryMove,
    ultimateMove,
  };
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
  const stats = computeComputedStats(species, ivs, clampedLv, isShiny);

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
    ultimateCooldown: 0,
    recoverUsesLeft: 2,
    primaryMove: stats.primaryMove,
    secondaryMove: stats.secondaryMove,
    ultimateMove: stats.ultimateMove,
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

  const move =
    action === 'ultimate'
      ? attacker.ultimateMove
      : action === 'secondary'
        ? attacker.secondaryMove
        : attacker.primaryMove;

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
  const isCrit = randomFn() < move.critRate;
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
