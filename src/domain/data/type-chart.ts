export type PokemonType =
  | 'normal'
  | 'fire'
  | 'water'
  | 'electric'
  | 'grass'
  | 'ice'
  | 'fighting'
  | 'poison'
  | 'ground'
  | 'flying'
  | 'psychic'
  | 'bug'
  | 'rock'
  | 'ghost'
  | 'dragon'
  | 'dark'
  | 'steel'
  | 'fairy';

export const ALL_POKEMON_TYPES: readonly PokemonType[] = [
  'normal',
  'fire',
  'water',
  'electric',
  'grass',
  'ice',
  'fighting',
  'poison',
  'ground',
  'flying',
  'psychic',
  'bug',
  'rock',
  'ghost',
  'dragon',
  'dark',
  'steel',
  'fairy',
];

export const TYPE_LABELS_VI: Readonly<Record<PokemonType, string>> = {
  normal: 'Normal (Thường)',
  fire: 'Fire (Lửa)',
  water: 'Water (Nước)',
  electric: 'Electric (Điện)',
  grass: 'Grass (Cỏ)',
  ice: 'Ice (Băng)',
  fighting: 'Fighting (Giác đấu)',
  poison: 'Poison (Độc)',
  ground: 'Ground (Đất)',
  flying: 'Flying (Bay)',
  psychic: 'Psychic (Tâm linh)',
  bug: 'Bug (Côn trùng)',
  rock: 'Rock (Đá)',
  ghost: 'Ghost (Ma)',
  dragon: 'Dragon (Rồng)',
  dark: 'Dark (Bóng tối)',
  steel: 'Steel (Thép)',
  fairy: 'Fairy (Tiên)',
};

// Attacking type -> Defending type -> Multiplier (only non-1x entries listed)
const EFFECTIVENESS_CHART: Readonly<
  Record<PokemonType, Readonly<Partial<Record<PokemonType, number>>>>
> = {
  normal: { rock: 0.5, ghost: 0, steel: 0.5 },
  fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
  water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
  grass: {
    fire: 0.5,
    water: 2,
    grass: 0.5,
    poison: 0.5,
    ground: 2,
    flying: 0.5,
    bug: 0.5,
    rock: 2,
    dragon: 0.5,
    steel: 0.5,
  },
  ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
  fighting: {
    normal: 2,
    ice: 2,
    poison: 0.5,
    flying: 0.5,
    psychic: 0.5,
    bug: 0.5,
    rock: 2,
    ghost: 0,
    dark: 2,
    steel: 2,
    fairy: 0.5,
  },
  poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
  ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
  flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
  psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
  bug: {
    fire: 0.5,
    grass: 2,
    fighting: 0.5,
    poison: 0.5,
    flying: 0.5,
    psychic: 2,
    ghost: 0.5,
    dark: 2,
    steel: 0.5,
    fairy: 0.5,
  },
  rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
  ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
  dragon: { dragon: 2, steel: 0.5, fairy: 0 },
  dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
  steel: { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2 },
  fairy: { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 },
};

export interface DefensiveMatchups {
  readonly quadWeak: readonly PokemonType[];
  readonly doubleWeak: readonly PokemonType[];
  readonly resistant: readonly PokemonType[];
  readonly doubleResistant: readonly PokemonType[];
  readonly immune: readonly PokemonType[];
}

export function calculateDefensiveMatchups(
  defenderTypes: readonly PokemonType[],
): DefensiveMatchups {
  const quadWeak: PokemonType[] = [];
  const doubleWeak: PokemonType[] = [];
  const resistant: PokemonType[] = [];
  const doubleResistant: PokemonType[] = [];
  const immune: PokemonType[] = [];

  for (const attackType of ALL_POKEMON_TYPES) {
    let multiplier = 1;
    for (const defType of defenderTypes) {
      const factor = EFFECTIVENESS_CHART[attackType][defType] ?? 1;
      multiplier *= factor;
    }

    if (multiplier === 0) {
      immune.push(attackType);
    } else if (multiplier >= 4) {
      quadWeak.push(attackType);
    } else if (multiplier >= 2) {
      doubleWeak.push(attackType);
    } else if (multiplier <= 0.25) {
      doubleResistant.push(attackType);
    } else if (multiplier < 1) {
      resistant.push(attackType);
    }
  }

  return {
    quadWeak,
    doubleWeak,
    resistant,
    doubleResistant,
    immune,
  };
}

export interface PokemonDexInfo {
  readonly name: string;
  readonly dexNumber: number | null;
  readonly types: readonly PokemonType[];
  readonly baseStatTotal: number | null;
  readonly spriteUrl: string | null;
}

const BUILTIN_DEX: Readonly<Record<string, readonly PokemonType[]>> = {
  charizard: ['fire', 'flying'],
  blastoise: ['water'],
  venusaur: ['grass', 'poison'],
  pikachu: ['electric'],
  gengar: ['ghost', 'poison'],
  gyarados: ['water', 'flying'],
  lapras: ['water', 'ice'],
  snorlax: ['normal'],
  dragonite: ['dragon', 'flying'],
  mewtwo: ['psychic'],
  mew: ['psychic'],
  tyranitar: ['rock', 'dark'],
  lugia: ['psychic', 'flying'],
  hooh: ['fire', 'flying'],
  blaziken: ['fire', 'fighting'],
  gardevoir: ['psychic', 'fairy'],
  slaking: ['normal'],
  aggron: ['steel', 'rock'],
  salamence: ['dragon', 'flying'],
  metagross: ['steel', 'psychic'],
  kyogre: ['water'],
  groudon: ['ground'],
  rayquaza: ['dragon', 'flying'],
  garchomp: ['dragon', 'ground'],
  lucario: ['fighting', 'steel'],
  togekiss: ['fairy', 'flying'],
  dialga: ['steel', 'dragon'],
  palkia: ['water', 'dragon'],
  giratina: ['ghost', 'dragon'],
  darkrai: ['dark'],
  arceus: ['normal'],
  excadrill: ['ground', 'steel'],
  hydreigon: ['dark', 'dragon'],
  volcarona: ['bug', 'fire'],
  reshiram: ['dragon', 'fire'],
  zekrom: ['dragon', 'electric'],
  kyurem: ['dragon', 'ice'],
  greninja: ['water', 'dark'],
  talonflame: ['fire', 'flying'],
  aegislash: ['steel', 'ghost'],
  sylveon: ['fairy'],
  xerneas: ['fairy'],
  yveltal: ['dark', 'flying'],
  zygarde: ['dragon', 'ground'],
  decidueye: ['grass', 'ghost'],
  incineroar: ['fire', 'dark'],
  primarina: ['water', 'fairy'],
  mimikyu: ['ghost', 'fairy'],
  tapukoko: ['electric', 'fairy'],
  solgaleo: ['psychic', 'steel'],
  lunala: ['psychic', 'ghost'],
  necrozma: ['psychic'],
  zeraora: ['electric'],
  zacian: ['fairy', 'steel'],
  zamazenta: ['fighting', 'steel'],
  eternatus: ['poison', 'dragon'],
  dragapult: ['dragon', 'ghost'],
  scizor: ['bug', 'steel'],
  ferrothorn: ['grass', 'steel'],
  swampert: ['water', 'ground'],
  kingdra: ['water', 'dragon'],
};

const pokeApiCache = new Map<string, PokemonDexInfo>();

function isPokemonType(val: string): val is PokemonType {
  return (ALL_POKEMON_TYPES as readonly string[]).includes(val);
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

export async function lookupPokemonDex(rawQuery: string): Promise<PokemonDexInfo | null> {
  const slug = rawQuery
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

  if (slug.length === 0) return null;

  const cached = pokeApiCache.get(slug);
  if (cached) return cached;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(slug)}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const json: unknown = await res.json();
      if (isRecord(json)) {
        const name = typeof json['name'] === 'string' ? json['name'] : slug;
        const dexNumber = typeof json['id'] === 'number' ? json['id'] : null;

        const types: PokemonType[] = [];
        if (Array.isArray(json['types'])) {
          for (const tItem of json['types']) {
            if (isRecord(tItem) && isRecord(tItem['type'])) {
              const tName = tItem['type']['name'];
              if (typeof tName === 'string' && isPokemonType(tName)) {
                types.push(tName);
              }
            }
          }
        }

        let baseStatTotal: number | null = null;
        if (Array.isArray(json['stats'])) {
          let sum = 0;
          for (const sItem of json['stats']) {
            if (isRecord(sItem) && typeof sItem['base_stat'] === 'number') {
              sum += sItem['base_stat'];
            }
          }
          baseStatTotal = sum > 0 ? sum : null;
        }

        let spriteUrl: string | null = null;
        if (isRecord(json['sprites']) && typeof json['sprites']['front_default'] === 'string') {
          spriteUrl = json['sprites']['front_default'];
        }

        if (types.length > 0) {
          const info: PokemonDexInfo = {
            name: name.charAt(0).toUpperCase() + name.slice(1),
            dexNumber,
            types,
            baseStatTotal,
            spriteUrl,
          };
          pokeApiCache.set(slug, info);
          return info;
        }
      }
    }
  } catch {
    // Fallback to offline dictionary below if offline or timeout
  }

  const compactKey = slug.replaceAll('-', '');
  const builtinTypes = BUILTIN_DEX[compactKey];
  if (builtinTypes) {
    const fallbackInfo: PokemonDexInfo = {
      name: rawQuery.trim().charAt(0).toUpperCase() + rawQuery.trim().slice(1),
      dexNumber: null,
      types: builtinTypes,
      baseStatTotal: null,
      spriteUrl: null,
    };
    pokeApiCache.set(slug, fallbackInfo);
    return fallbackInfo;
  }

  return null;
}
