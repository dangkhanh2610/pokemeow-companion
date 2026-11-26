import type { CreatureSpecies, RarityConfig, RarityTier } from '../types';

export interface ICreatureCatalog {
  getAll(): readonly CreatureSpecies[];
  getById(id: number): CreatureSpecies | undefined;
  getByRarity(rarity: RarityTier): readonly CreatureSpecies[];
  search(query: string, rarity?: RarityTier): readonly CreatureSpecies[];
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

interface RawSpeciesEntry {
  readonly id: number;
  readonly name: string;
  readonly rarity: RarityTier;
  readonly types: readonly string[];
  readonly baseCatchRate: number;
  readonly baseReward: number;
}

function buildArtworkUrl(id: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
}

function buildShinyArtworkUrl(id: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/${id}.png`;
}

const RAW_POKEMON_SPECIES: readonly RawSpeciesEntry[] = [
  // Common (20)
  { id: 10, name: 'Caterpie', rarity: 'common', types: ['Bug'], baseCatchRate: 0.72, baseReward: 120 },
  { id: 13, name: 'Weedle', rarity: 'common', types: ['Bug', 'Poison'], baseCatchRate: 0.72, baseReward: 120 },
  { id: 16, name: 'Pidgey', rarity: 'common', types: ['Normal', 'Flying'], baseCatchRate: 0.7, baseReward: 130 },
  { id: 19, name: 'Rattata', rarity: 'common', types: ['Normal'], baseCatchRate: 0.7, baseReward: 130 },
  { id: 21, name: 'Spearow', rarity: 'common', types: ['Normal', 'Flying'], baseCatchRate: 0.68, baseReward: 135 },
  { id: 23, name: 'Ekans', rarity: 'common', types: ['Poison'], baseCatchRate: 0.68, baseReward: 140 },
  { id: 41, name: 'Zubat', rarity: 'common', types: ['Poison', 'Flying'], baseCatchRate: 0.68, baseReward: 140 },
  { id: 43, name: 'Oddish', rarity: 'common', types: ['Grass', 'Poison'], baseCatchRate: 0.66, baseReward: 145 },
  { id: 52, name: 'Meowth', rarity: 'common', types: ['Normal'], baseCatchRate: 0.65, baseReward: 160 },
  { id: 54, name: 'Psyduck', rarity: 'common', types: ['Water'], baseCatchRate: 0.65, baseReward: 150 },
  { id: 60, name: 'Poliwag', rarity: 'common', types: ['Water'], baseCatchRate: 0.66, baseReward: 145 },
  { id: 69, name: 'Bellsprout', rarity: 'common', types: ['Grass', 'Poison'], baseCatchRate: 0.66, baseReward: 145 },
  { id: 74, name: 'Geodude', rarity: 'common', types: ['Rock', 'Ground'], baseCatchRate: 0.64, baseReward: 155 },
  { id: 81, name: 'Magnemite', rarity: 'common', types: ['Electric', 'Steel'], baseCatchRate: 0.64, baseReward: 160 },
  { id: 129, name: 'Magikarp', rarity: 'common', types: ['Water'], baseCatchRate: 0.75, baseReward: 110 },
  { id: 161, name: 'Sentret', rarity: 'common', types: ['Normal'], baseCatchRate: 0.7, baseReward: 130 },
  { id: 163, name: 'Hoothoot', rarity: 'common', types: ['Normal', 'Flying'], baseCatchRate: 0.68, baseReward: 135 },
  { id: 261, name: 'Poochyena', rarity: 'common', types: ['Dark'], baseCatchRate: 0.66, baseReward: 145 },
  { id: 263, name: 'Zigzagoon', rarity: 'common', types: ['Normal'], baseCatchRate: 0.7, baseReward: 135 },
  { id: 396, name: 'Starly', rarity: 'common', types: ['Normal', 'Flying'], baseCatchRate: 0.68, baseReward: 140 },

  // Uncommon (14)
  { id: 1, name: 'Bulbasaur', rarity: 'uncommon', types: ['Grass', 'Poison'], baseCatchRate: 0.48, baseReward: 320 },
  { id: 4, name: 'Charmander', rarity: 'uncommon', types: ['Fire'], baseCatchRate: 0.48, baseReward: 320 },
  { id: 7, name: 'Squirtle', rarity: 'uncommon', types: ['Water'], baseCatchRate: 0.48, baseReward: 320 },
  { id: 25, name: 'Pikachu', rarity: 'uncommon', types: ['Electric'], baseCatchRate: 0.5, baseReward: 350 },
  { id: 37, name: 'Vulpix', rarity: 'uncommon', types: ['Fire'], baseCatchRate: 0.5, baseReward: 300 },
  { id: 58, name: 'Growlithe', rarity: 'uncommon', types: ['Fire'], baseCatchRate: 0.49, baseReward: 310 },
  { id: 63, name: 'Abra', rarity: 'uncommon', types: ['Psychic'], baseCatchRate: 0.46, baseReward: 330 },
  { id: 66, name: 'Machop', rarity: 'uncommon', types: ['Fighting'], baseCatchRate: 0.5, baseReward: 290 },
  { id: 79, name: 'Slowpoke', rarity: 'uncommon', types: ['Water', 'Psychic'], baseCatchRate: 0.52, baseReward: 280 },
  { id: 92, name: 'Gastly', rarity: 'uncommon', types: ['Ghost', 'Poison'], baseCatchRate: 0.48, baseReward: 320 },
  { id: 133, name: 'Eevee', rarity: 'uncommon', types: ['Normal'], baseCatchRate: 0.46, baseReward: 360 },
  { id: 179, name: 'Mareep', rarity: 'uncommon', types: ['Electric'], baseCatchRate: 0.52, baseReward: 280 },
  { id: 280, name: 'Ralts', rarity: 'uncommon', types: ['Psychic', 'Fairy'], baseCatchRate: 0.47, baseReward: 340 },
  { id: 447, name: 'Riolu', rarity: 'uncommon', types: ['Fighting'], baseCatchRate: 0.45, baseReward: 380 },

  // Rare (11)
  { id: 123, name: 'Scyther', rarity: 'rare', types: ['Bug', 'Flying'], baseCatchRate: 0.34, baseReward: 750 },
  { id: 127, name: 'Pinsir', rarity: 'rare', types: ['Bug'], baseCatchRate: 0.34, baseReward: 720 },
  { id: 131, name: 'Lapras', rarity: 'rare', types: ['Water', 'Ice'], baseCatchRate: 0.32, baseReward: 820 },
  { id: 137, name: 'Porygon', rarity: 'rare', types: ['Normal'], baseCatchRate: 0.33, baseReward: 780 },
  { id: 142, name: 'Aerodactyl', rarity: 'rare', types: ['Rock', 'Flying'], baseCatchRate: 0.31, baseReward: 850 },
  { id: 143, name: 'Snorlax', rarity: 'rare', types: ['Normal'], baseCatchRate: 0.3, baseReward: 900 },
  { id: 197, name: 'Umbreon', rarity: 'rare', types: ['Dark'], baseCatchRate: 0.32, baseReward: 840 },
  { id: 212, name: 'Scizor', rarity: 'rare', types: ['Bug', 'Steel'], baseCatchRate: 0.3, baseReward: 880 },
  { id: 214, name: 'Heracross', rarity: 'rare', types: ['Bug', 'Fighting'], baseCatchRate: 0.33, baseReward: 790 },
  { id: 359, name: 'Absol', rarity: 'rare', types: ['Dark'], baseCatchRate: 0.33, baseReward: 800 },
  { id: 448, name: 'Lucario', rarity: 'rare', types: ['Fighting', 'Steel'], baseCatchRate: 0.3, baseReward: 920 },

  // Super Rare (9)
  { id: 94, name: 'Gengar', rarity: 'super_rare', types: ['Ghost', 'Poison'], baseCatchRate: 0.21, baseReward: 2200 },
  { id: 130, name: 'Gyarados', rarity: 'super_rare', types: ['Water', 'Flying'], baseCatchRate: 0.21, baseReward: 2100 },
  { id: 149, name: 'Dragonite', rarity: 'super_rare', types: ['Dragon', 'Flying'], baseCatchRate: 0.19, baseReward: 2600 },
  { id: 248, name: 'Tyranitar', rarity: 'super_rare', types: ['Rock', 'Dark'], baseCatchRate: 0.19, baseReward: 2600 },
  { id: 282, name: 'Gardevoir', rarity: 'super_rare', types: ['Psychic', 'Fairy'], baseCatchRate: 0.2, baseReward: 2350 },
  { id: 373, name: 'Salamence', rarity: 'super_rare', types: ['Dragon', 'Flying'], baseCatchRate: 0.18, baseReward: 2700 },
  { id: 376, name: 'Metagross', rarity: 'super_rare', types: ['Steel', 'Psychic'], baseCatchRate: 0.18, baseReward: 2700 },
  { id: 445, name: 'Garchomp', rarity: 'super_rare', types: ['Dragon', 'Ground'], baseCatchRate: 0.18, baseReward: 2800 },
  { id: 635, name: 'Hydreigon', rarity: 'super_rare', types: ['Dark', 'Dragon'], baseCatchRate: 0.18, baseReward: 2750 },

  // Legendary (6)
  { id: 144, name: 'Articuno', rarity: 'legendary', types: ['Ice', 'Flying'], baseCatchRate: 0.11, baseReward: 6500 },
  { id: 145, name: 'Zapdos', rarity: 'legendary', types: ['Electric', 'Flying'], baseCatchRate: 0.11, baseReward: 6500 },
  { id: 146, name: 'Moltres', rarity: 'legendary', types: ['Fire', 'Flying'], baseCatchRate: 0.11, baseReward: 6500 },
  { id: 150, name: 'Mewtwo', rarity: 'legendary', types: ['Psychic'], baseCatchRate: 0.09, baseReward: 8500 },
  { id: 249, name: 'Lugia', rarity: 'legendary', types: ['Psychic', 'Flying'], baseCatchRate: 0.09, baseReward: 8500 },
  { id: 384, name: 'Rayquaza', rarity: 'legendary', types: ['Dragon', 'Flying'], baseCatchRate: 0.08, baseReward: 9500 },
];

export class PokemonCreatureCatalog implements ICreatureCatalog {
  private readonly speciesList: readonly CreatureSpecies[];
  private readonly speciesById: ReadonlyMap<number, CreatureSpecies>;
  private readonly speciesByRarity: ReadonlyMap<RarityTier, readonly CreatureSpecies[]>;

  public constructor() {
    this.speciesList = RAW_POKEMON_SPECIES.map((entry) => ({
      ...entry,
      artworkUrl: buildArtworkUrl(entry.id),
      shinyArtworkUrl: buildShinyArtworkUrl(entry.id),
    }));

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
        species.types.some((t) => t.toLowerCase().includes(normalized))
      );
    });
  }
}

export const defaultCreatureCatalog: ICreatureCatalog = new PokemonCreatureCatalog();
