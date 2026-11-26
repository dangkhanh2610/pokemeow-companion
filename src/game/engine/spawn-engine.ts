import {
  defaultCreatureCatalog,
  RARITY_CONFIGS,
  type ICreatureCatalog,
} from '../catalog/creature-catalog';
import type { CreatureIVs, CreatureSpecies, EncounterRoll, RarityTier } from '../types';

export const SHINY_CHANCE = 0.015;
const MAX_SINGLE_IV = 31;
const MAX_TOTAL_IV = 186;

const RARITY_ORDER: readonly RarityTier[] = [
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
    const totalWeight = RARITY_ORDER.reduce(
      (sum, tier) => sum + RARITY_CONFIGS[tier].weight,
      0,
    );
    let threshold = this.random() * totalWeight;

    for (const tier of RARITY_ORDER) {
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
