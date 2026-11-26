import {
  BALL_ORDER,
  DEFAULT_BUFF_CONFIG,
  DEFAULT_ECONOMY_CONFIG,
  DEFAULT_FISHING_SETUP,
  RARITY_ORDER,
} from '@/domain/data/pokemeow-data';
import type {
  BallId,
  BuffConfig,
  CatchLogEntry,
  EconomyConfig,
  FishingSetup,
  RarityEconomyValue,
  RarityId,
  ValuationMode,
} from '@/domain/types';

const STORAGE_KEYS = {
  buffs: 'pokemeow_companion_v1_buffs',
  economy: 'pokemeow_companion_v1_economy',
  fishing: 'pokemeow_companion_v1_fishing',
  logs: 'pokemeow_companion_v1_logs',
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumber(record: Record<string, unknown>, key: string, fallback: number): number {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readBoolean(record: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = record[key];
  return typeof value === 'boolean' ? value : fallback;
}

function isBallId(value: unknown): value is BallId {
  return typeof value === 'string' && (BALL_ORDER as readonly string[]).includes(value);
}

function isRarityId(value: unknown): value is RarityId {
  return typeof value === 'string' && (RARITY_ORDER as readonly string[]).includes(value);
}

export function loadBuffConfig(): BuffConfig {
  if (typeof window === 'undefined') return DEFAULT_BUFF_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.buffs);
    if (!raw) return DEFAULT_BUFF_CONFIG;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return DEFAULT_BUFF_CONFIG;

    const rawValuation = parsed['valuationMode'];
    const valuationMode: ValuationMode =
      rawValuation === 'release' || rawValuation === 'market'
        ? rawValuation
        : DEFAULT_BUFF_CONFIG.valuationMode;

    return {
      amuletCoins: Math.min(
        10,
        Math.max(0, readNumber(parsed, 'amuletCoins', DEFAULT_BUFF_CONFIG.amuletCoins)),
      ),
      clanCatchRatePct: Math.min(
        25,
        Math.max(0, readNumber(parsed, 'clanCatchRatePct', DEFAULT_BUFF_CONFIG.clanCatchRatePct)),
      ),
      patreonNinja: readBoolean(parsed, 'patreonNinja', DEFAULT_BUFF_CONFIG.patreonNinja),
      quickHandsSavePct: Math.min(
        20,
        Math.max(0, readNumber(parsed, 'quickHandsSavePct', DEFAULT_BUFF_CONFIG.quickHandsSavePct)),
      ),
      eventCatchBoostPct: Math.min(
        30,
        Math.max(
          0,
          readNumber(parsed, 'eventCatchBoostPct', DEFAULT_BUFF_CONFIG.eventCatchBoostPct),
        ),
      ),
      charmCatchBoostPct: Math.min(
        20,
        Math.max(
          0,
          readNumber(parsed, 'charmCatchBoostPct', DEFAULT_BUFF_CONFIG.charmCatchBoostPct),
        ),
      ),
      shinyCharmOwned: readBoolean(parsed, 'shinyCharmOwned', DEFAULT_BUFF_CONFIG.shinyCharmOwned),
      includePremierBall: readBoolean(
        parsed,
        'includePremierBall',
        DEFAULT_BUFF_CONFIG.includePremierBall,
      ),
      valuationMode,
      wildCooldownSec: Math.min(
        30,
        Math.max(4, readNumber(parsed, 'wildCooldownSec', DEFAULT_BUFF_CONFIG.wildCooldownSec)),
      ),
      fishCooldownSec: Math.min(
        30,
        Math.max(4, readNumber(parsed, 'fishCooldownSec', DEFAULT_BUFF_CONFIG.fishCooldownSec)),
      ),
      soundEnabled: readBoolean(parsed, 'soundEnabled', DEFAULT_BUFF_CONFIG.soundEnabled),
    };
  } catch {
    return DEFAULT_BUFF_CONFIG;
  }
}

export function saveBuffConfig(config: BuffConfig): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEYS.buffs, JSON.stringify(config));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadEconomyConfig(): EconomyConfig {
  if (typeof window === 'undefined') return DEFAULT_ECONOMY_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.economy);
    if (!raw) return DEFAULT_ECONOMY_CONFIG;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return DEFAULT_ECONOMY_CONFIG;

    const rawPrices = parsed['ballPrices'];
    const rawValues = parsed['rarityValues'];

    const ballPrices = { ...DEFAULT_ECONOMY_CONFIG.ballPrices };
    if (isRecord(rawPrices)) {
      for (const ballId of BALL_ORDER) {
        ballPrices[ballId] = Math.max(
          0,
          readNumber(rawPrices, ballId, DEFAULT_ECONOMY_CONFIG.ballPrices[ballId]),
        );
      }
    }

    const rarityValues = { ...DEFAULT_ECONOMY_CONFIG.rarityValues };
    if (isRecord(rawValues)) {
      for (const rarityId of RARITY_ORDER) {
        const entry = rawValues[rarityId];
        const defaults = DEFAULT_ECONOMY_CONFIG.rarityValues[rarityId];
        if (isRecord(entry)) {
          const sanitized: RarityEconomyValue = {
            catchCoins: Math.max(0, readNumber(entry, 'catchCoins', defaults.catchCoins)),
            releaseValue: Math.max(0, readNumber(entry, 'releaseValue', defaults.releaseValue)),
            marketValue: Math.max(0, readNumber(entry, 'marketValue', defaults.marketValue)),
          };
          rarityValues[rarityId] = sanitized;
        }
      }
    }

    return { ballPrices, rarityValues };
  } catch {
    return DEFAULT_ECONOMY_CONFIG;
  }
}

export function saveEconomyConfig(config: EconomyConfig): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEYS.economy, JSON.stringify(config));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadFishingSetup(): FishingSetup {
  if (typeof window === 'undefined') return DEFAULT_FISHING_SETUP;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.fishing);
    if (!raw) return DEFAULT_FISHING_SETUP;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return DEFAULT_FISHING_SETUP;

    const rodVal = parsed['rod'];
    const lureVal = parsed['lure'];

    const rod =
      rodVal === 'old' || rodVal === 'good' || rodVal === 'super'
        ? rodVal
        : DEFAULT_FISHING_SETUP.rod;
    const lure =
      lureVal === 'none' || lureVal === 'pokelure' || lureVal === 'misty'
        ? lureVal
        : DEFAULT_FISHING_SETUP.lure;

    return {
      rod,
      lure,
      goldenHour: readBoolean(parsed, 'goldenHour', DEFAULT_FISHING_SETUP.goldenHour),
      tokenToCoinRate: Math.max(
        0,
        readNumber(parsed, 'tokenToCoinRate', DEFAULT_FISHING_SETUP.tokenToCoinRate),
      ),
    };
  } catch {
    return DEFAULT_FISHING_SETUP;
  }
}

export function saveFishingSetup(setup: FishingSetup): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEYS.fishing, JSON.stringify(setup));
  } catch {
    // Ignore storage quota errors
  }
}

function isValidLogEntry(item: unknown): item is CatchLogEntry {
  if (!isRecord(item)) return false;
  return (
    typeof item['id'] === 'string' &&
    typeof item['timestamp'] === 'number' &&
    (item['source'] === 'wild' || item['source'] === 'fishing') &&
    isRarityId(item['rarityId']) &&
    isBallId(item['ballId']) &&
    typeof item['caught'] === 'boolean' &&
    typeof item['pokemonName'] === 'string' &&
    typeof item['ballCost'] === 'number' &&
    typeof item['coinsEarned'] === 'number' &&
    typeof item['netProfit'] === 'number'
  );
}

export function loadCatchLogs(): readonly CatchLogEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.logs);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidLogEntry);
  } catch {
    return [];
  }
}

export function saveCatchLogs(logs: readonly CatchLogEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEYS.logs, JSON.stringify(logs));
  } catch {
    // Ignore storage quota errors
  }
}

export function buildCsvContent(logs: readonly CatchLogEntry[]): string {
  const header = [
    'ID',
    'Timestamp',
    'Source',
    'Rarity',
    'Ball',
    'Caught',
    'Pokemon',
    'BallCost',
    'CoinsEarned',
    'NetProfit',
  ].join(',');

  const rows = logs.map((entry) => {
    const escapedName = `"${entry.pokemonName.replaceAll('"', '""')}"`;
    return [
      entry.id,
      new Date(entry.timestamp).toISOString(),
      entry.source,
      entry.rarityId,
      entry.ballId,
      entry.caught ? 'true' : 'false',
      escapedName,
      String(entry.ballCost),
      String(entry.coinsEarned),
      String(entry.netProfit),
    ].join(',');
  });

  return [header, ...rows].join('\n');
}

export function triggerFileDownload(filename: string, content: string, mimeType: string): void {
  if (typeof window === 'undefined') return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
