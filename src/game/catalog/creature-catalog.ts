import rawPokedexData from '../data/pokedex.json';
import type { CreatureBaseStats, CreatureSpecies, RarityConfig, RarityTier } from '../types';

export interface ICreatureCatalog {
  getAll(): readonly CreatureSpecies[];
  getById(id: number): CreatureSpecies | undefined;
  getByRarity(rarity: RarityTier): readonly CreatureSpecies[];
  search(query: string, rarity?: RarityTier): readonly CreatureSpecies[];
}

interface CompactPokedexEntry {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly rarity: RarityTier;
  readonly types: readonly string[];
  readonly baseStats: CreatureBaseStats;
  readonly baseCatchRate: number;
  readonly baseReward: number;
  readonly hasAnimatedSprite: boolean;
}

export const RARITY_CONFIGS: Readonly<Record<RarityTier, RarityConfig>> = {
  common: {
    tier: 'common',
    label: 'Common',
    weight: 52,
    colorHex: 0x94a3b8,
    badgeCss: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
    xpReward: 25,
  },
  uncommon: {
    tier: 'uncommon',
    label: 'Uncommon',
    weight: 26,
    colorHex: 0x10b981,
    badgeCss: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    xpReward: 45,
  },
  rare: {
    tier: 'rare',
    label: 'Rare',
    weight: 13,
    colorHex: 0x3b82f6,
    badgeCss: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    xpReward: 90,
  },
  super_rare: {
    tier: 'super_rare',
    label: 'Super Rare',
    weight: 6,
    colorHex: 0xa855f7,
    badgeCss: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    xpReward: 180,
  },
  legendary: {
    tier: 'legendary',
    label: 'Legendary',
    weight: 3,
    colorHex: 0xf59e0b,
    badgeCss: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    xpReward: 400,
  },
};

function buildArtworkUrl(id: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
}

function buildShinyArtworkUrl(id: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/shiny/${id}.png`;
}

export class PokemonCreatureCatalog implements ICreatureCatalog {
  private readonly speciesList: readonly CreatureSpecies[];
  private readonly speciesById: ReadonlyMap<number, CreatureSpecies>;
  private readonly speciesByRarity: ReadonlyMap<RarityTier, readonly CreatureSpecies[]>;

  public constructor() {
    const entries = rawPokedexData as readonly CompactPokedexEntry[];

    this.speciesList = entries.map((entry) => {
      const artworkUrl = buildArtworkUrl(entry.id);
      const shinyArtworkUrl = buildShinyArtworkUrl(entry.id);
      const animatedSpriteUrl = entry.hasAnimatedSprite
        ? `https://play.pokemonshowdown.com/sprites/ani/${entry.slug}.gif`
        : artworkUrl;
      const shinyAnimatedSpriteUrl = entry.hasAnimatedSprite
        ? `https://play.pokemonshowdown.com/sprites/ani-shiny/${entry.slug}.gif`
        : shinyArtworkUrl;

      return {
        id: entry.id,
        slug: entry.slug,
        name: entry.name,
        rarity: entry.rarity,
        types: entry.types,
        baseStats: entry.baseStats,
        baseCatchRate: entry.baseCatchRate,
        baseReward: entry.baseReward,
        artworkUrl,
        shinyArtworkUrl,
        animatedSpriteUrl,
        shinyAnimatedSpriteUrl,
      };
    });

    const byId = new Map<number, CreatureSpecies>();
    const byRarity = new Map<RarityTier, CreatureSpecies[]>();

    for (const species of this.speciesList) {
      byId.set(species.id, species);
      const bucket = byRarity.get(species.rarity);
      if (bucket) {
        bucket.push(species);
      } else {
        byRarity.set(species.rarity, [species]);
      }
    }

    this.speciesById = byId;
    this.speciesByRarity = byRarity;
  }

  public getAll(): readonly CreatureSpecies[] {
    return this.speciesList;
  }

  public getById(id: number): CreatureSpecies | undefined {
    return this.speciesById.get(id);
  }

  public getByRarity(rarity: RarityTier): readonly CreatureSpecies[] {
    return this.speciesByRarity.get(rarity) ?? [];
  }

  public search(query: string, rarity?: RarityTier): readonly CreatureSpecies[] {
    const normalized = query.trim().toLowerCase();
    return this.speciesList.filter((species) => {
      if (rarity && species.rarity !== rarity) {
        return false;
      }
      if (!normalized) {
        return true;
      }
      return (
        species.name.toLowerCase().includes(normalized) ||
        String(species.id) === normalized ||
        species.slug.includes(normalized) ||
        species.types.some((t) => t.toLowerCase().includes(normalized))
      );
    });
  }
}

export const defaultCreatureCatalog: ICreatureCatalog = new PokemonCreatureCatalog();
