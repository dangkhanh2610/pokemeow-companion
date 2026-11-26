import type {
  BallId,
  EncounterSource,
  QuestEntry,
  QuestTargetKind,
  RarityId,
} from '@/domain/types';

export interface PokemeowMessageInput {
  readonly content: string;
  readonly embedAuthor?: string;
  readonly embedTitle: string;
  readonly embedDescription: string;
  readonly embedFieldsText?: string;
  readonly embedFooter: string;
  readonly embedColor?: number | null;
  readonly componentsText?: string;
  readonly interactionCommandName?: string;
}

export interface ParsedEncounter {
  readonly source: EncounterSource;
  readonly rarityId: RarityId;
  readonly matchedText: string;
  readonly pokemonName: string;
  readonly trainerName: string;
}

export interface FallbackEncounterInfo {
  readonly source: EncounterSource;
  readonly rarityId: RarityId;
  readonly pokemonName: string;
}

export interface ParsedCatchOutcome {
  readonly source: EncounterSource;
  readonly rarityId: RarityId;
  readonly ballId: BallId;
  readonly caught: boolean;
  readonly pokemonName: string;
  readonly trainerName: string;
  readonly coinsEarnedOverride: number | null;
}

export interface ParsedCooldownWait {
  readonly source: EncounterSource | null;
  readonly waitSeconds: number;
}

export interface ParsedCatchbotTimer {
  readonly remainingSeconds: number;
}

export interface ParsedSeaFluteTimer {
  readonly startsInSeconds: number;
}

const CAPTCHA_KEYWORDS: readonly string[] = [
  'captcha',
  'verify',
  'human',
  'anti-bot',
  'please solve',
];

const OUTCOME_SUCCESS_PATTERNS: readonly RegExp[] = [
  /\byou\s+caught\b/i,
  /\bcaught\s+a\b/i,
  /\bgotcha!/i,
];

const OUTCOME_FAIL_PATTERNS: readonly RegExp[] = [
  /\bbroke\s+out\b/i,
  /\bbroke\s+free\b/i,
  /\bescaped\b/i,
  /\bfled\b/i,
  /\bran\s+away\b/i,
  /\bnothing\s+nibbled\b/i,
  /\bnot\s+even\s+a\s+nibble\b/i,
  /\bpulled\s+too\b/i,
];

const SPAWN_INDICATORS: readonly string[] = [
  'found a wild',
  'a wild',
  'has spawned',
  'rarity:',
  'rarity :',
  'fished up',
  'caught a nibbling',
  'nibbling',
  'on the hook',
  'on the line',
  'biting',
  'cast your rod',
];

const BALL_BUTTON_PATTERNS: readonly RegExp[] = [
  /"custom_id"\s*:\s*"(?:pb|gb|ub|prb|mb|db|pokeball|greatball|ultraball|premierball|masterball|diveball)/i,
  /:(?:pokeball|greatball|ultraball|premierball|masterball|diveball)[_a-z0-9]*:/i,
];

const FISHING_INDICATORS: readonly string[] = [
  'fished up',
  'caught a nibbling',
  'nibbling',
  'on the hook',
  'on the line',
  'fishing',
  'diveball',
  'cast your rod',
];

const RARITY_RULES: readonly {
  readonly rarityId: RarityId;
  readonly patterns: readonly RegExp[];
}[] = [
  { rarityId: 'golden', patterns: [/\bgolden\b/i, /:golden[_a-z0-9]*:/i] },
  {
    rarityId: 'shiny_event',
    patterns: [/\bevent\s+shiny\b/i, /\bshiny\s*\(event\)/i, /:event[_]?shiny[_a-z0-9]*:/i],
  },
  { rarityId: 'shiny_full', patterns: [/\bshiny\b/i, /:shiny[_a-z0-9]*:/i] },
  {
    rarityId: 'legendary',
    patterns: [/\blegendary\b/i, /\bmythical\b/i, /:(?:legendary|mythical)[_a-z0-9]*:/i],
  },
  {
    rarityId: 'super_rare',
    patterns: [/\bsuper[\s_]*rare\b/i, /:super[_]?rare[_a-z0-9]*:/i, /:sr:/i],
  },
  { rarityId: 'uncommon', patterns: [/\buncommon\b/i, /:uncommon[_a-z0-9]*:/i] },
  { rarityId: 'rare', patterns: [/\brare\b/i, /:rare[_a-z0-9]*:/i] },
  { rarityId: 'common', patterns: [/\bcommon\b/i, /:common[_a-z0-9]*:/i] },
];

const BALL_RULES: readonly {
  readonly ballId: BallId;
  readonly patterns: readonly RegExp[];
}[] = [
  {
    ballId: 'mb',
    patterns: [
      /\bmaster\s*ball\b/i,
      /:(?:master[_]?ball|mb)[_a-z0-9]*:/i,
      /\bmb\b/i,
    ],
  },
  {
    ballId: 'prb',
    patterns: [
      /\bpremier\s*ball\b/i,
      /:(?:premier[_]?ball|prb)[_a-z0-9]*:/i,
      /\bprb\b/i,
    ],
  },
  {
    ballId: 'db',
    patterns: [
      /\bdive\s*ball\b/i,
      /:(?:dive[_]?ball|db)[_a-z0-9]*:/i,
      /\bdb\b/i,
    ],
  },
  {
    ballId: 'ub',
    patterns: [
      /\bultra\s*ball\b/i,
      /:(?:ultra[_]?ball|ub)[_a-z0-9]*:/i,
      /\bub\b/i,
    ],
  },
  {
    ballId: 'gb',
    patterns: [
      /\bgreat\s*ball\b/i,
      /:(?:great[_]?ball|gb)[_a-z0-9]*:/i,
      /\bgb\b/i,
    ],
  },
  {
    ballId: 'pb',
    patterns: [
      /\bpok[eé]\s*ball\b/i,
      /:(?:pok[eé][_]?ball|pb)[_a-z0-9]*:/i,
      /\bpb\b/i,
    ],
  },
];

const INVALID_POKEMON_NAMES: ReadonlySet<string> = new Set([
  'wild',
  'shiny',
  'golden',
  'event',
  'level',
  'rare',
  'common',
  'uncommon',
  'super',
  'legendary',
  'mythical',
  'pokemon',
  'pokémon',
  'nibbling',
  'buddy',
]);

function buildCombinedText(input: PokemeowMessageInput): string {
  return [
    input.content,
    input.embedAuthor ?? '',
    input.embedTitle,
    input.embedDescription,
    input.embedFieldsText ?? '',
    input.embedFooter,
  ]
    .filter((part) => part.trim().length > 0)
    .join('\n');
}

function containsCaptcha(normalizedText: string): boolean {
  return CAPTCHA_KEYWORDS.some((keyword) => normalizedText.includes(keyword));
}

export function parsePokemeowCaptchaAlert(input: PokemeowMessageInput): boolean {
  const combined = buildCombinedText(input);
  if (combined.length === 0) return false;
  return containsCaptcha(combined.toLowerCase());
}

function detectSource(normalizedText: string, interactionCommandName?: string): EncounterSource {
  const cmd = interactionCommandName?.trim().toLowerCase() ?? '';
  if (cmd === 'fish' || cmd === 'f') {
    return 'fishing';
  }
  if (FISHING_INDICATORS.some((indicator) => normalizedText.includes(indicator))) {
    return 'fishing';
  }
  return 'wild';
}

function matchRarityInText(text: string): { rarityId: RarityId; matchedText: string } | null {
  const explicitLine = text.match(/rarity\s*:\s*([^\n|•]+)/i);
  if (explicitLine?.[1]) {
    for (const rule of RARITY_RULES) {
      for (const pattern of rule.patterns) {
        const m = explicitLine[1].match(pattern);
        if (m) {
          return { rarityId: rule.rarityId, matchedText: m[0] };
        }
      }
    }
  }

  for (const rule of RARITY_RULES) {
    for (const pattern of rule.patterns) {
      const match = text.match(pattern);
      if (match) {
        return { rarityId: rule.rarityId, matchedText: match[0] };
      }
    }
  }
  return null;
}

function stripDiscordCustomEmojisAndMarkdown(raw: string): string {
  return raw
    .replace(/<a?:[a-zA-Z0-9_]+:\d+>/g, ' ')
    .replace(/[*_~`]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * Strips Buddy EXP, level-up, quest, and ball inventory lines so Buddy Pokémon
 * (e.g. "Your Virizion gained 50 EXP!") never contaminate encounter/outcome Pokémon extraction.
 */
function stripBuddyAndInventoryLines(raw: string): string {
  return raw
    .split('\n')
    .filter((line) => {
      const lower = line.toLowerCase();
      if (lower.includes('buddy')) return false;
      if (/\bgained\s+\d+[\d,]*\s*exp/i.test(line)) return false;
      if (/\bleveled\s+up\s+to\s+level/i.test(line)) return false;
      if (/\b(?:balls?\s+left|pok[eé]balls?\s*:\s*\d+|greatballs?\s*:\s*\d+)\b/i.test(line)) {
        return false;
      }
      return true;
    })
    .join('\n');
}

function extractTrainerName(input: PokemeowMessageInput): string {
  const headerSources = [
    input.embedAuthor ?? '',
    input.content,
    input.embedTitle,
    input.embedDescription.split('\n')[0] ?? '',
    input.embedFooter,
  ];

  for (const rawLine of headerSources) {
    const cleaned = stripDiscordCustomEmojisAndMarkdown(rawLine).replace(/^@/, '');
    if (!cleaned) continue;

    const actionTrainer = cleaned.match(
      /^([A-Za-z0-9_ .'-]{2,32}?)\s+(?:found\s+a|caught\s+a|fished\s+up|cast\s+their|threw\s+a)/i,
    );
    if (actionTrainer?.[1]) {
      const candidate = actionTrainer[1].trim();
      if (candidate.toLowerCase() !== 'you' && candidate.toLowerCase() !== 'a') {
        return candidate;
      }
    }

    const footerTrainer = cleaned.match(/(?:requested\s+by|caught\s+by)\s+@?([A-Za-z0-9_ .'-]{2,32})/i);
    if (footerTrainer?.[1]) {
      return footerTrainer[1].trim();
    }
  }

  return '';
}

function extractPokemonName(rawText: string, allowEmojiBoldFallback: boolean): string {
  const filteredRaw = stripBuddyAndInventoryLines(rawText);
  const cleaned = stripDiscordCustomEmojisAndMarkdown(filteredRaw);

  const actionMatch = cleaned.match(
    /(?:found|caught|fished\s+up)\s+a\s+(?:wild\s+)?(?:event\s+shiny\s+|shiny\s+|golden\s+)?(?:level\s+\d+\s+)?((?:alolan\s+)?[A-Za-z0-9'♀♂.:-]{2,25})/i,
  );
  if (actionMatch?.[1]) {
    const candidate = actionMatch[1].replace(/[!.,:;]+$/, '').trim();
    if (!INVALID_POKEMON_NAMES.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  const wildMatch = cleaned.match(
    /\bwild\s+(?:event\s+shiny\s+|shiny\s+|golden\s+)?((?:alolan\s+)?[A-Za-z0-9'♀♂.:-]{2,25})\s+(?:appeared|has\s+spawned|broke\s+out|broke\s+free|escaped|fled|ran\s+away)/i,
  );
  if (wildMatch?.[1]) {
    const candidate = wildMatch[1].replace(/[!.,:;]+$/, '').trim();
    if (!INVALID_POKEMON_NAMES.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  // Only use "<:sprite:id> **Pokemon**" fallback on active spawn embeds (never outcome embeds where usernames/buddies appear)
  if (allowEmojiBoldFallback) {
    const boldMatch = filteredRaw.match(
      /<a?:[a-zA-Z0-9_]+:\d+>\s*\*{1,2}((?:Alolan\s+)?[A-Za-z0-9'♀♂.:-]{2,25})\*{1,2}/i,
    );
    if (boldMatch?.[1]) {
      const candidate = boldMatch[1].trim();
      if (!INVALID_POKEMON_NAMES.has(candidate.toLowerCase())) {
        return candidate;
      }
    }
  }

  return '';
}

function extractThrownBall(actionText: string): BallId {
  const sanitizedLines = stripBuddyAndInventoryLines(actionText);

  const phraseMatch = sanitizedLines.match(
    /(?:with|threw|used|into|out\s+of|from)\s+(?:a|an|the)?\s*(<a?:[a-z0-9_]+:\d+>|[a-zé]+\s*ball|\b(?:pb|gb|ub|prb|mb|db)\b)/i,
  );
  if (phraseMatch?.[1]) {
    for (const rule of BALL_RULES) {
      if (rule.patterns.some((p) => p.test(phraseMatch[1] ?? ''))) {
        return rule.ballId;
      }
    }
  }

  for (const rule of BALL_RULES) {
    if (rule.patterns.some((p) => p.test(sanitizedLines))) {
      return rule.ballId;
    }
  }

  return 'pb';
}

function parseHoursMinutesSeconds(text: string): number | null {
  const hoursMatch = text.match(/(\d+)\s*(?:hours?|hrs?|h)\b/i);
  const minsMatch = text.match(/(\d+)\s*(?:minutes?|mins?|m)\b/i);
  const secsMatch = text.match(/(\d+)\s*(?:seconds?|secs?|s)\b/i);

  if (!hoursMatch && !minsMatch) {
    return null;
  }

  const hours = hoursMatch?.[1] ? Number.parseInt(hoursMatch[1], 10) : 0;
  const minutes = minsMatch?.[1] ? Number.parseInt(minsMatch[1], 10) : 0;
  const seconds = secsMatch?.[1] ? Number.parseInt(secsMatch[1], 10) : 0;

  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  if (!Number.isFinite(totalSeconds) || totalSeconds < 60 || totalSeconds > 48 * 3600) {
    return null;
  }

  return totalSeconds;
}

export function parsePokemeowCooldownWait(
  input: PokemeowMessageInput,
): ParsedCooldownWait | null {
  const combined = buildCombinedText(input);
  if (combined.length === 0) return null;

  const normalized = combined.toLowerCase();
  if (containsCaptcha(normalized)) {
    return null;
  }

  const waitMatch = combined.match(
    /please\s+wait\s+(?:[^\d\n]{0,12})?(\d+)\s+seconds?(?:\s+before\s+([a-z\s]+))?/i,
  );
  if (!waitMatch?.[1]) {
    return null;
  }

  const waitSeconds = Number.parseInt(waitMatch[1], 10);
  if (!Number.isFinite(waitSeconds) || waitSeconds <= 0) {
    return null;
  }

  const context = (waitMatch[2] ?? '').toLowerCase();
  let source: EncounterSource | null = null;
  if (context.includes('fish')) {
    source = 'fishing';
  } else if (
    context.includes('catch') ||
    context.includes('find') ||
    context.includes('pokemon') ||
    context.includes('pokémon') ||
    context.includes('spawn')
  ) {
    source = 'wild';
  }

  return { source, waitSeconds };
}

export function parsePokemeowCatchbotTimer(
  input: PokemeowMessageInput,
): ParsedCatchbotTimer | null {
  const combined = buildCombinedText(input);
  if (combined.length === 0) return null;

  const normalized = combined.toLowerCase();
  if (containsCaptcha(normalized)) {
    return null;
  }

  const cmd = input.interactionCommandName?.trim().toLowerCase() ?? '';
  const hasCatchbotContext =
    cmd === 'catchbot' ||
    cmd === 'cb' ||
    normalized.includes('catchbot') ||
    normalized.includes('catch bot');
  if (!hasCatchbotContext) {
    return null;
  }

  const activeTimeContext = combined.match(
    /(?:returns?\s+in|back\s+in|time\s+left|remaining|started[^\n]*for|out\s+for|running[^\n]*?)[:\s]*([^\n.!?]+)/i,
  );

  const totalSeconds = parseHoursMinutesSeconds(activeTimeContext?.[1] ?? combined);
  if (totalSeconds === null) return null;

  return { remainingSeconds: totalSeconds };
}

/**
 * Parses PokéMeow's ;seaflute / Golden Fishing Hour countdown messages.
 */
export function parsePokemeowSeaFlute(input: PokemeowMessageInput): ParsedSeaFluteTimer | null {
  const combined = buildCombinedText(input);
  if (combined.length === 0) return null;

  const normalized = combined.toLowerCase();
  if (containsCaptcha(normalized)) {
    return null;
  }

  const cmd = input.interactionCommandName?.trim().toLowerCase() ?? '';
  const isSeaFlute =
    cmd === 'seaflute' ||
    normalized.includes('sea flute') ||
    normalized.includes('seaflute') ||
    normalized.includes('golden fishing hour') ||
    normalized.includes('golden hour');

  if (!isSeaFlute) return null;

  // Avoid confusing an already-active Golden Hour spawn with a future countdown unless "in ..." is present
  const countdownLine = combined.match(
    /(?:golden\s+(?:fishing\s+)?hour[^\n]*?(?:starts?|begins?|is)\s+in|next\s+golden[^\n]*?in)[:\s]*([^\n.!?]+)/i,
  );
  if (!countdownLine?.[1]) return null;

  const startsInSeconds = parseHoursMinutesSeconds(countdownLine[1]);
  if (startsInSeconds === null) return null;

  return { startsInSeconds };
}

/**
 * Parses PokéMeow's ;quest / ;q daily quests list into trackable QuestEntry items.
 */
export function parsePokemeowQuests(input: PokemeowMessageInput): readonly QuestEntry[] | null {
  const combined = buildCombinedText(input);
  if (combined.length === 0) return null;

  const normalized = combined.toLowerCase();
  if (containsCaptcha(normalized)) return null;

  const cmd = input.interactionCommandName?.trim().toLowerCase() ?? '';
  const hasQuestHeader =
    cmd === 'quests' ||
    cmd === 'quest' ||
    /\bdaily\s+quests?\b/i.test(combined) ||
    /\byour\s+quests?\b/i.test(combined);

  if (!hasQuestHeader) return null;

  const lines = combined.split('\n');
  const quests: QuestEntry[] = [];

  for (const rawLine of lines) {
    const cleaned = stripDiscordCustomEmojisAndMarkdown(rawLine);
    // Match progress patterns like "(12/50)" or "[12/50]" or "12/50"
    const progressMatch = cleaned.match(/[[(]?(\d+)\s*\/\s*(\d+)[\])]?/);
    if (!progressMatch?.[1] || !progressMatch[2]) continue;

    const current = Number.parseInt(progressMatch[1], 10);
    const goal = Number.parseInt(progressMatch[2], 10);
    if (!Number.isFinite(current) || !Number.isFinite(goal) || goal <= 0 || current > goal) {
      continue;
    }

    // Must look like an objective line (catch, fish, encounter, win, battle)
    if (!/\b(?:catch|fish|find|battle|win|release)\b/i.test(cleaned)) {
      continue;
    }

    const lowerLine = cleaned.toLowerCase();
    let kind: QuestTargetKind = 'other';
    let rarityFilter: RarityId | null = null;

    if (lowerLine.includes('fish')) {
      kind = 'fishing';
    } else if (lowerLine.includes('catch')) {
      const rarityHit = matchRarityInText(cleaned);
      if (rarityHit) {
        kind = 'rarity';
        rarityFilter = rarityHit.rarityId;
      } else if (/\btype\b/i.test(cleaned) || /\bregion\b/i.test(cleaned) || /\bgen\b/i.test(cleaned)) {
        kind = 'other';
      } else {
        kind = 'any_catch';
      }
    }

    quests.push({
      index: quests.length + 1,
      description: cleaned.replace(/^\d+[.)]\s*/, '').trim(),
      kind,
      rarityFilter,
      current,
      goal,
    });
  }

  return quests.length > 0 ? quests : null;
}

export function parsePokemeowEncounter(input: PokemeowMessageInput): ParsedEncounter | null {
  const combined = buildCombinedText(input);
  if (combined.length === 0) return null;

  const normalized = combined.toLowerCase();
  if (containsCaptcha(normalized)) {
    return null;
  }

  if (parsePokemeowCooldownWait(input) !== null) {
    return null;
  }

  const isOutcome =
    OUTCOME_SUCCESS_PATTERNS.some((p) => p.test(combined)) ||
    OUTCOME_FAIL_PATTERNS.some((p) => p.test(combined));
  if (isOutcome) {
    return null;
  }

  const cmd = input.interactionCommandName?.trim().toLowerCase() ?? '';
  const isSlashSpawnCmd = cmd === 'pokemon' || cmd === 'p' || cmd === 'fish' || cmd === 'f';
  const componentsStr = input.componentsText ?? '';
  const hasBallButtons = BALL_BUTTON_PATTERNS.some((p) => p.test(componentsStr));
  const hasTextIndicator = SPAWN_INDICATORS.some((indicator) => normalized.includes(indicator));

  if (!hasTextIndicator && !isSlashSpawnCmd && !hasBallButtons) {
    return null;
  }

  const source = detectSource(normalized, input.interactionCommandName);
  const pokemonName = extractPokemonName(combined, true);
  const trainerName = extractTrainerName(input);

  const bodyWithoutFooter = [
    input.content,
    input.embedAuthor ?? '',
    input.embedTitle,
    input.embedDescription,
  ]
    .filter((part) => part.trim().length > 0)
    .join('\n');

  const rarityMatch = matchRarityInText(input.embedFooter) ?? matchRarityInText(bodyWithoutFooter);
  if (rarityMatch) {
    return {
      source,
      rarityId: rarityMatch.rarityId,
      matchedText: rarityMatch.matchedText,
      pokemonName,
      trainerName,
    };
  }

  if (hasBallButtons || isSlashSpawnCmd) {
    return {
      source,
      rarityId: 'common',
      matchedText: 'button-fallback',
      pokemonName,
      trainerName,
    };
  }

  return null;
}

export function parsePokemeowCatchOutcome(
  input: PokemeowMessageInput,
  fallback?: FallbackEncounterInfo,
): ParsedCatchOutcome | null {
  const combined = buildCombinedText(input);
  if (combined.length === 0) return null;

  const normalized = combined.toLowerCase();
  if (containsCaptcha(normalized)) {
    return null;
  }

  const isCaught = OUTCOME_SUCCESS_PATTERNS.some((p) => p.test(combined));
  const isFailed = !isCaught && OUTCOME_FAIL_PATTERNS.some((p) => p.test(combined));

  if (!isCaught && !isFailed) {
    return null;
  }

  const actionBodyText = [
    input.content,
    input.embedAuthor ?? '',
    input.embedTitle,
    input.embedDescription,
  ]
    .filter((part) => part.trim().length > 0)
    .join('\n');

  const detectedBall = extractThrownBall(actionBodyText);
  const trainerName = extractTrainerName(input);

  const rarityId: RarityId =
    fallback?.rarityId ?? matchRarityInText(input.embedFooter)?.rarityId ?? 'common';
  const source: EncounterSource =
    fallback?.source ?? detectSource(normalized, input.interactionCommandName);

  const extractedName = extractPokemonName(actionBodyText, false);
  const pokemonName = extractedName.length > 0 ? extractedName : (fallback?.pokemonName ?? '');

  let coinsEarnedOverride: number | null = null;
  if (isCaught) {
    const coinsMatch = combined.match(/([0-9][0-9,]*)\s*pok[eé]coins/i);
    if (coinsMatch?.[1]) {
      const parsedCoins = Number.parseInt(coinsMatch[1].replaceAll(',', ''), 10);
      if (Number.isFinite(parsedCoins) && parsedCoins >= 0) {
        coinsEarnedOverride = parsedCoins;
      }
    }
  }

  return {
    source,
    rarityId,
    ballId: detectedBall,
    caught: isCaught,
    pokemonName,
    trainerName,
    coinsEarnedOverride,
  };
}

export function parseManualCommandTrigger(content: string): EncounterSource | null {
  const normalized = content.trim().toLowerCase();
  if (/^;(?:p|pokemon)(?:\s|$)/.test(normalized)) {
    return 'wild';
  }
  if (/^;(?:f|fish)(?:\s|$)/.test(normalized)) {
    return 'fishing';
  }
  return null;
}
