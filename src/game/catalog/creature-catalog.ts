import rawPokedexData from '../data/pokedex.json';
import type {
  CreatureBaseStats,
  CreatureFormType,
  CreatureSpecies,
  RarityConfig,
  RarityTier,
} from '../types';

export interface ICreatureCatalog {
  getAll(): readonly CreatureSpecies[];
  getById(id: number): CreatureSpecies | undefined;
  getByRarity(rarity: RarityTier): readonly CreatureSpecies[];
  search(query: string, rarity?: RarityTier): readonly CreatureSpecies[];
}

type SpriteMode = 'ani' | 'dex' | 'artwork';

interface CompactPokedexEntry {
  readonly id: number;
  readonly dexNumber: number;
  readonly slug: string;
  readonly name: string;
  readonly rarity: RarityTier;
  readonly formType: CreatureFormType;
  readonly types: readonly string[];
  readonly baseStats: CreatureBaseStats;
  readonly baseCatchRate: number;
  readonly baseReward: number;
  readonly spriteMode: SpriteMode;
}

export const RARITY_CONFIGS: Readonly<Record<RarityTier, RarityConfig>> = {
  common: {
    tier: 'common',
    label: 'Common',
    weight: 51,
    colorHex: 0x94a3b8,
    badgeCss: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
    xpReward: 25,
  },
  uncommon: {
    tier: 'uncommon',
    label: 'Uncommon',
    weight: 25.5,
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
  mega: {
    tier: 'mega',
    label: 'Mega',
    weight: 1.5,
    colorHex: 0xf43f5e,
    badgeCss: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    xpReward: 450,
  },
};

function buildArtworkUrl(dexNumber: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${dexNumber}.png`;
}

function buildShinyArtworkUrl(dexNumber: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/shiny/${dexNumber}.png`;
}

function resolveAnimatedSprites(
  entry: CompactPokedexEntry,
  artworkUrl: string,
  shinyArtworkUrl: string,
): { readonly animatedSpriteUrl: string; readonly shinyAnimatedSpriteUrl: string } {
  if (entry.spriteMode === 'ani') {
    return {
      animatedSpriteUrl: `https://play.pokemonshowdown.com/sprites/ani/${entry.slug}.gif`,
      shinyAnimatedSpriteUrl: `https://play.pokemonshowdown.com/sprites/ani-shiny/${entry.slug}.gif`,
    };
  }
  if (entry.spriteMode === 'dex') {
    return {
      animatedSpriteUrl: `https://play.pokemonshowdown.com/sprites/dex/${entry.slug}.png`,
      shinyAnimatedSpriteUrl: `https://play.pokemonshowdown.com/sprites/dex-shiny/${entry.slug}.png`,
    };
  }
  return {
    animatedSpriteUrl: artworkUrl,
    shinyAnimatedSpriteUrl: shinyArtworkUrl,
  };
}

export class PokemonCreatureCatalog implements ICreatureCatalog {
  private readonly speciesList: readonly CreatureSpecies[];
  private readonly speciesById: ReadonlyMap<number, CreatureSpecies>;
  private readonly speciesByRarity: ReadonlyMap<RarityTier, readonly CreatureSpecies[]>;

  public constructor() {
    const entries = rawPokedexData as readonly CompactPokedexEntry[];

    this.speciesList = entries.map((entry) => {
      const artworkUrl = buildArtworkUrl(entry.dexNumber);
      const shinyArtworkUrl = buildShinyArtworkUrl(entry.dexNumber);
      const { animatedSpriteUrl, shinyAnimatedSpriteUrl } = resolveAnimatedSprites(
        entry,
        artworkUrl,
        shinyArtworkUrl,
      );

      return {
        id: entry.id,
        dexNumber: entry.dexNumber,
        slug: entry.slug,
        name: entry.name,
        rarity: entry.rarity,
        formType: entry.formType,
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
    const normalized = query.trim().toLowerCase().replace(/^#/, '');
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
        String(species.dexNumber) === normalized ||
        species.slug.includes(normalized) ||
        species.types.some((t) => t.toLowerCase().includes(normalized))
      );
    });
  }
}

export const defaultCreatureCatalog: ICreatureCatalog = new PokemonCreatureCatalog();
