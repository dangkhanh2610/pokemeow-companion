import type { GenerationGroup } from '../types';

/**
 * Complete normalized set of Generation 6 (Kalos #650-#721) and
 * Generation 7 (Alola #722-#809, including Alolan variants) Pokémon.
 * In PokéMeow, Gen 6 & 7 species have lower base catch rates than Gen 1-5 & 8.
 */
const GEN_6_7_SPECIES: ReadonlySet<string> = new Set([
  // Gen 6 (Kalos: #650 - #721)
  'chespin',
  'quilladin',
  'chesnaught',
  'fennekin',
  'braixen',
  'delphox',
  'froakie',
  'frogadier',
  'greninja',
  'bunnelby',
  'diggersby',
  'fletchling',
  'fletchinder',
  'talonflame',
  'scatterbug',
  'spewpa',
  'vivillon',
  'litleo',
  'pyroar',
  'flabebe',
  'floette',
  'florges',
  'skiddo',
  'gogoat',
  'pancham',
  'pangoro',
  'furfrou',
  'espurr',
  'meowstic',
  'honedge',
  'doublade',
  'aegislash',
  'spritzee',
  'aromatisse',
  'swirlix',
  'slurpuff',
  'inkay',
  'malamar',
  'binacle',
  'barbaracle',
  'skrelp',
  'dragalge',
  'clauncher',
  'clawitzer',
  'helioptile',
  'heliolisk',
  'tyrunt',
  'tyrantrum',
  'amaura',
  'aurorus',
  'sylveon',
  'hawlucha',
  'dedenne',
  'carbink',
  'goomy',
  'sliggoo',
  'goodra',
  'klefki',
  'phantump',
  'trevenant',
  'pumpkaboo',
  'gourgeist',
  'bergmite',
  'avalugg',
  'noibat',
  'noivern',
  'xerneas',
  'yveltal',
  'zygarde',
  'diancie',
  'hoopa',
  'volcanion',

  // Gen 7 (Alola: #722 - #809)
  'rowlet',
  'dartrix',
  'decidueye',
  'litten',
  'torracat',
  'incineroar',
  'popplio',
  'brionne',
  'primarina',
  'pikipek',
  'trumbeak',
  'toucannon',
  'yungoos',
  'gumshoos',
  'grubbin',
  'charjabug',
  'vikavolt',
  'crabrawler',
  'crabominable',
  'oricorio',
  'cutiefly',
  'ribombee',
  'rockruff',
  'lycanroc',
  'wishiwashi',
  'mareanie',
  'toxapex',
  'mudbray',
  'mudsdale',
  'dewpider',
  'araquanid',
  'fomantis',
  'lurantis',
  'morelull',
  'shiinotic',
  'salandit',
  'salazzle',
  'stufful',
  'bewear',
  'bounsweet',
  'steenee',
  'tsareena',
  'comfey',
  'oranguru',
  'passimian',
  'wimpod',
  'golisopod',
  'sandygast',
  'palossand',
  'pyukumuku',
  'typenull',
  'type:null',
  'type-null',
  'silvally',
  'minior',
  'komala',
  'turtonator',
  'togedemaru',
  'mimikyu',
  'bruxish',
  'drampa',
  'dhelmise',
  'jangmoo',
  'jangmo-o',
  'hakamoo',
  'hakamo-o',
  'kommoo',
  'kommo-o',
  'tapukoko',
  'tapu-koko',
  'tapulele',
  'tapu-lele',
  'tapubulu',
  'tapu-bulu',
  'tapufini',
  'tapu-fini',
  'cosmog',
  'cosmoem',
  'solgaleo',
  'lunala',
  'nihilego',
  'buzzwole',
  'pheromosa',
  'xurkitree',
  'celesteela',
  'kartana',
  'guzzlord',
  'necrozma',
  'magearna',
  'marshadow',
  'poipole',
  'naganadel',
  'stakataka',
  'blacephalon',
  'zeraora',
  'meltan',
  'melmetal',
]);

function normalizeSpeciesKey(rawName: string): string {
  return rawName
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^(?:shiny|golden|event\s+shiny)\s+/i, '')
    .trim();
}

export function isGen6Or7Pokemon(pokemonName: string): boolean {
  const cleaned = normalizeSpeciesKey(pokemonName);
  if (cleaned.length === 0) return false;

  if (cleaned.startsWith('alolan ') || cleaned.startsWith('alola-')) {
    return true;
  }

  if (GEN_6_7_SPECIES.has(cleaned)) {
    return true;
  }

  const compact = cleaned.replace(/[\s.'_-]+/g, '');
  return GEN_6_7_SPECIES.has(compact);
}

export function detectGenerationGroup(
  pokemonName: string,
  fallback: GenerationGroup = 'gen1_5_8',
): GenerationGroup {
  if (isGen6Or7Pokemon(pokemonName)) {
    return 'gen6_7';
  }
  return fallback;
}
