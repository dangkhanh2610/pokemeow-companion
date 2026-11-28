import {
  defaultCreatureCatalog,
  RARITY_CONFIGS,
  type ICreatureCatalog,
} from '../catalog/creature-catalog';
import type { CreatureIVs, CreatureSpecies, EncounterRoll, RarityTier } from '../types';

export const SHINY_CHANCE = 1 / 8192;
export const MAX_CREATURE_LEVEL = 100;
const MAX_SINGLE_IV = 31;
const MAX_TOTAL_IV = 186;

export const CATCH_COIN_MULTIPLIER = 2.5;
export const SHINY_COIN_MULTIPLIER = 3;
export const FISHING_COIN_BONUS_MULTIPLIER = 1.2;

/**
 * Single source of truth for PokéCoin rewards when catching a wild or fished Pokémon.
 */
export function calculateCatchCoins(
  baseReward: number,
  isShiny: boolean,
  source: 'wild' | 'fishing' = 'wild',
): number {
  const safeBase = Math.max(0, baseReward);
  const shinyFactor = isShiny ? SHINY_COIN_MULTIPLIER : 1;
  const sourceFactor = source === 'fishing' ? FISHING_COIN_BONUS_MULTIPLIER : 1;
  return Math.round(safeBase * CATCH_COIN_MULTIPLIER * shinyFactor * sourceFactor);
}

export const BUDDY_CATCH_XP_BY_RARITY: Readonly<Record<RarityTier, number>> = {
  common: 35,
  uncommon: 65,
  rare: 150,
  super_rare: 360,
  legendary: 1000,
  mega: 1200,
};

export function calculateBuddyCatchXp(
  rarity: RarityTier,
  isShiny: boolean,
  source: 'wild' | 'fishing' = 'wild',
): number {
  const base = BUDDY_CATCH_XP_BY_RARITY[rarity];
  const withShiny = isShiny ? Math.max(600, Math.round(base * 2.5)) : base;
  return source === 'fishing' ? Math.round(withShiny * 1.2) : withShiny;
}

export function creatureXpNeeded(level: number): number {
  const clamped = Math.max(1, Math.min(MAX_CREATURE_LEVEL, Math.floor(level)));
  const step = clamped - 1;
  return Math.round(50 + 22 * step + 1.8 * step * step);
}

export function addCreatureXp(
  currentXp: number,
  currentLevel: number,
  gainedXp: number,
): {
  readonly xp: number;
  readonly level: number;
  readonly leveledUp: boolean;
  readonly levelsGained: number;
} {
  let xp = currentXp + Math.max(0, gainedXp);
  const startLevel = Math.max(1, Math.min(MAX_CREATURE_LEVEL, currentLevel));
  let level = startLevel;

  while (level < MAX_CREATURE_LEVEL && xp >= creatureXpNeeded(level)) {
    xp -= creatureXpNeeded(level);
    level += 1;
  }

  if (level >= MAX_CREATURE_LEVEL) {
    xp = 0;
  }

  return {
    xp,
    level,
    leveledUp: level > startLevel,
    levelsGained: level - startLevel,
  };
}

const WILD_RARITY_ORDER: readonly RarityTier[] = [
  'common',
  'uncommon',
  'rare',
  'super_rare',
  'legendary',
];

export type RandomFn = () => number;

export function xpForNextLevel(level: number): number {
  return Math.max(100, level * 120 + (level - 1) * 40);
}

export function applyXp(
  currentXp: number,
  currentLevel: number,
  gainedXp: number,
): { readonly xp: number; readonly level: number; readonly leveledUp: boolean } {
  let xp = currentXp + Math.max(0, gainedXp);
  let level = Math.max(1, currentLevel);
  let leveledUp = false;

  while (xp >= xpForNextLevel(level)) {
    xp -= xpForNextLevel(level);
    level += 1;
    leveledUp = true;
  }

  return { xp, level, leveledUp };
}

export function computeIvSummary(ivs: CreatureIVs): {
  readonly ivTotal: number;
  readonly ivPercent: number;
} {
  const ivTotal = ivs.hp + ivs.atk + ivs.def + ivs.spAtk + ivs.spDef + ivs.spd;
  const ivPercent = Number(((ivTotal / MAX_TOTAL_IV) * 100).toFixed(1));
  return { ivTotal, ivPercent };
}

export class SpawnEngine {
  private readonly catalog: ICreatureCatalog;
  private readonly random: RandomFn;

  public constructor(
    catalog: ICreatureCatalog = defaultCreatureCatalog,
    random: RandomFn = Math.random,
  ) {
    this.catalog = catalog;
    this.random = random;
  }

  public rollRarity(): RarityTier {
    const totalWeight = WILD_RARITY_ORDER.reduce(
      (sum, tier) => sum + RARITY_CONFIGS[tier].weight,
      0,
    );
    let threshold = this.random() * totalWeight;

    for (const tier of WILD_RARITY_ORDER) {
      threshold -= RARITY_CONFIGS[tier].weight;
      if (threshold <= 0) {
        return tier;
      }
    }

    return 'common';
  }

  public generateIVs(): CreatureIVs {
    const rollStat = (): number => Math.floor(this.random() * (MAX_SINGLE_IV + 1));
    return {
      hp: rollStat(),
      atk: rollStat(),
      def: rollStat(),
      spAtk: rollStat(),
      spDef: rollStat(),
      spd: rollStat(),
    };
  }

  public rollEncounter(): EncounterRoll {
    const rarity = this.rollRarity();
    const candidates = this.catalog.getByRarity(rarity);
    const fallbackPool = candidates.length > 0 ? candidates : this.catalog.getAll();
    const pickedIndex = Math.min(
      fallbackPool.length - 1,
      Math.max(0, Math.floor(this.random() * fallbackPool.length)),
    );
    const species: CreatureSpecies | undefined = fallbackPool[pickedIndex];

    if (!species) {
      throw new Error('Creature catalog không có dữ liệu loài nào để spawn.');
    }

    const isShiny = this.random() < SHINY_CHANCE;
    const ivs = this.generateIVs();
    const { ivTotal, ivPercent } = computeIvSummary(ivs);

    return {
      species,
      isShiny,
      ivs,
      ivTotal,
      ivPercent,
    };
  }
}

export const defaultSpawnEngine = new SpawnEngine();
