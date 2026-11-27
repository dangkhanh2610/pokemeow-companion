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
  getMegaForms(): readonly CreatureSpecies[];
  findMegaByQuery(query: string): CreatureSpecies | undefined;
  search(query: string, rarity?: RarityTier): readonly CreatureSpecies[];
}

type SpriteMode = 'ani' | 'dex' | 'artwork';
type ShinySpriteMode = 'ani' | 'dex' | 'artwork' | 'normal';

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
  readonly shinySpriteMode?: ShinySpriteMode;
  readonly isStaticSprite?: boolean;
}

export const RARITY_CONFIGS: Readonly<Record<RarityTier, RarityConfig>> = {
  common: {
    tier: 'common',
    label: 'Common',
    weight: 61,
    colorHex: 0x94a3b8,
    badgeCss: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
    xpReward: 25,
  },
  uncommon: {
    tier: 'uncommon',
    label: 'Uncommon',
    weight: 28,
    colorHex: 0x10b981,
    badgeCss: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    xpReward: 45,
  },
  rare: {
    tier: 'rare',
    label: 'Rare',
    weight: 9.8,
    colorHex: 0xf97316,
    badgeCss: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
    xpReward: 90,
  },
  super_rare: {
    tier: 'super_rare',
    label: 'Super Rare',
    weight: 1.15,
    colorHex: 0xeab308,
    badgeCss: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
    xpReward: 180,
  },
  legendary: {
    tier: 'legendary',
    label: 'Legendary',
    weight: 0.05,
    colorHex: 0xa855f7,
    badgeCss: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    xpReward: 400,
  },
  mega: {
    tier: 'mega',
    label: 'Mega',
    weight: 0,
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
  const animatedSpriteUrl =
    entry.spriteMode === 'ani'
      ? `https://play.pokemonshowdown.com/sprites/ani/${entry.slug}.gif`
      : entry.spriteMode === 'dex'
        ? `https://play.pokemonshowdown.com/sprites/dex/${entry.slug}.png`
        : artworkUrl;

  const shinyMode = entry.shinySpriteMode ?? entry.spriteMode;
  let shinyAnimatedSpriteUrl: string;
  if (shinyMode === 'ani') {
    shinyAnimatedSpriteUrl = `https://play.pokemonshowdown.com/sprites/ani-shiny/${entry.slug}.gif`;
  } else if (shinyMode === 'dex') {
    shinyAnimatedSpriteUrl = `https://play.pokemonshowdown.com/sprites/dex-shiny/${entry.slug}.png`;
  } else if (shinyMode === 'artwork') {
    shinyAnimatedSpriteUrl = shinyArtworkUrl;
  } else {
    shinyAnimatedSpriteUrl = animatedSpriteUrl;
  }

  return {
    animatedSpriteUrl,
    shinyAnimatedSpriteUrl,
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
        isStaticSprite: entry.isStaticSprite ?? entry.spriteMode !== 'ani',
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

  public getMegaForms(): readonly CreatureSpecies[] {
    return this.speciesList.filter((s) => s.formType === 'mega');
  }

  public findMegaByQuery(query: string): CreatureSpecies | undefined {
    const q = query.trim().toLowerCase();
    if (!q) {
      return undefined;
    }
    const megas = this.getMegaForms();
    const compact = q.replace(/[^a-z0-9]/g, '');
    const tokens = q.split(/[\s-]+/).filter((t) => t.length > 0);

    const exact = megas.find(
      (s) =>
        s.name.toLowerCase() === q ||
        s.slug === q ||
        s.slug.replace(/[^a-z0-9]/g, '') === compact,
    );
    if (exact) {
      return exact;
    }

    const byBasePrefix = megas.find((s) => s.name.toLowerCase().startsWith(`${q}-`));
    if (byBasePrefix && tokens.length === 1) {
      return byBasePrefix;
    }

    if (tokens.length > 1) {
      const tokenMatch = megas.find((s) => {
        const lowerName = s.name.toLowerCase();
        return tokens.every((tok) => lowerName.includes(tok));
      });
      if (tokenMatch) {
        return tokenMatch;
      }
    }

    return (
      byBasePrefix ??
      megas.find(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.slug.replace(/[^a-z0-9]/g, '').includes(compact),
      )
    );
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
