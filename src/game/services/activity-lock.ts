import type { CreatureSpecies } from '../types';

export interface CachedEncounterPreview {
  readonly userId: string;
  readonly species: CreatureSpecies;
  readonly isShiny: boolean;
  readonly expiresAtMs: number;
}

const MAX_PREVIEW_ENTRIES = 2_000;
const activeUserActionLocks = new Set<string>();
const wildPreviewCache = new Map<string, CachedEncounterPreview>();
const fishPreviewCache = new Map<string, CachedEncounterPreview>();

function prunePreviewMap(cache: Map<string, CachedEncounterPreview>, nowMs: number): void {
  if (cache.size <= MAX_PREVIEW_ENTRIES) {
    return;
  }
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAtMs <= nowMs) {
      cache.delete(key);
    }
  }
  while (cache.size > MAX_PREVIEW_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (!oldest) {
      break;
    }
    cache.delete(oldest);
  }
}

export function tryAcquireEncounterLock(userId: string): boolean {
  if (activeUserActionLocks.has(userId)) {
    return false;
  }
  activeUserActionLocks.add(userId);
  return true;
}

export function releaseEncounterLock(userId: string): void {
  activeUserActionLocks.delete(userId);
}

export function setWildPreview(
  encounterId: string,
  preview: CachedEncounterPreview,
): void {
  prunePreviewMap(wildPreviewCache, Date.now());
  wildPreviewCache.set(encounterId, preview);
}

export function getWildPreview(encounterId: string): CachedEncounterPreview | undefined {
  const entry = wildPreviewCache.get(encounterId);
  if (!entry) {
    return undefined;
  }
  if (entry.expiresAtMs <= Date.now()) {
    wildPreviewCache.delete(encounterId);
    return undefined;
  }
  return entry;
}

export function deleteWildPreview(encounterId: string): void {
  wildPreviewCache.delete(encounterId);
}

export function setFishPreview(
  encounterId: string,
  preview: CachedEncounterPreview,
): void {
  prunePreviewMap(fishPreviewCache, Date.now());
  fishPreviewCache.set(encounterId, preview);
}

export function getFishPreview(encounterId: string): CachedEncounterPreview | undefined {
  const entry = fishPreviewCache.get(encounterId);
  if (!entry) {
    return undefined;
  }
  if (entry.expiresAtMs <= Date.now()) {
    fishPreviewCache.delete(encounterId);
    return undefined;
  }
  return entry;
}

export function deleteFishPreview(encounterId: string): void {
  fishPreviewCache.delete(encounterId);
}
