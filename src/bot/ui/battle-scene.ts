import { AttachmentBuilder } from 'discord.js';
import sharp, { type OverlayOptions } from 'sharp';
import type { CombatantState } from '@/game/engine/battle-engine';
import type { BattleMode, BattleSessionView } from '@/game/services/battle-service';

const WIDTH = 760;
const HEIGHT = 320;
const SPRITE_CACHE_LIMIT = 150;
const FETCH_TIMEOUT_MS = 2500;

const spriteBufferCache = new Map<string, Buffer>();

const TYPE_GLOW_COLORS: Readonly<Record<string, string>> = {
  Normal: '#a8a29e',
  Fire: '#f97316',
  Water: '#38bdf8',
  Electric: '#facc15',
  Grass: '#4ade80',
  Ice: '#67e8f9',
  Fighting: '#ef4444',
  Poison: '#c084fc',
  Ground: '#eab308',
  Flying: '#93c5fd',
  Psychic: '#f472b6',
  Bug: '#a3e635',
  Rock: '#d6d3d1',
  Ghost: '#818cf8',
  Dragon: '#6366f1',
  Dark: '#64748b',
  Steel: '#cbd5e1',
  Fairy: '#f9a8d4',
};

const ARENA_THEMES: Readonly<
  Record<BattleMode, { readonly top: string; readonly mid: string; readonly bot: string; readonly accent: string }>
> = {
  PVE: {
    top: '#0f2942',
    mid: '#164e63',
    bot: '#14532d',
    accent: '#34d399',
  },
  GYM: {
    top: '#1e1b4b',
    mid: '#4c1d95',
    bot: '#3b0764',
    accent: '#f43f5e',
  },
  PVP: {
    top: '#090d1f',
    mid: '#1e293b',
    bot: '#1e1b4b',
    accent: '#38bdf8',
  },
};

function cacheSprite(url: string, buf: Buffer): void {
  if (spriteBufferCache.size >= SPRITE_CACHE_LIMIT) {
    const oldest = spriteBufferCache.keys().next().value;
    if (oldest) {
      spriteBufferCache.delete(oldest);
    }
  }
  spriteBufferCache.set(url, buf);
}

async function fetchSpriteBuffer(url: string): Promise<Buffer | null> {
  const cached = spriteBufferCache.get(url);
  if (cached) {
    return cached;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      return null;
    }
    const raw = Buffer.from(await res.arrayBuffer());
    cacheSprite(url, raw);
    return raw;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function prepareCombatantSprite(
  combatant: CombatantState,
  faceRight: boolean,
): Promise<Buffer | null> {
  const primaryUrl = combatant.isShiny
    ? combatant.species.shinyArtworkUrl
    : combatant.species.artworkUrl;
  const fallbackUrl = combatant.isShiny
    ? combatant.species.shinyAnimatedSpriteUrl
    : combatant.species.animatedSpriteUrl;

  const raw = (await fetchSpriteBuffer(primaryUrl)) ?? (await fetchSpriteBuffer(fallbackUrl));
  if (!raw) {
    return null;
  }

  let pipeline = sharp(raw).resize(192, 192, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });

  if (faceRight) {
    pipeline = pipeline.flop();
  }
  if (combatant.hp <= 0) {
    pipeline = pipeline.modulate({ brightness: 0.4, saturation: 0.2 });
  }

  return pipeline.png().toBuffer();
}

function buildTeamPokeballIcons(
  team: readonly CombatantState[],
  activeIdx: number,
  startX: number,
  centerY: number,
): string {
  const parts: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    const cx = startX + i * 20;
    const member = team[i];
    if (!member || member.hp <= 0) {
      parts.push(
        `<circle cx="${cx}" cy="${centerY}" r="7" fill="#1e293b" stroke="#475569" stroke-width="1.5"/>`,
      );
      continue;
    }
    const ring = i === activeIdx ? '#facc15' : '#0f172a';
    const ringWidth = i === activeIdx ? 2 : 1.5;
    parts.push(
      `<circle cx="${cx}" cy="${centerY}" r="7.5" fill="#f8fafc" stroke="${ring}" stroke-width="${ringWidth}"/>`,
      `<path d="M ${cx - 7.5} ${centerY} A 7.5 7.5 0 0 1 ${cx + 7.5} ${centerY} Z" fill="#ef4444"/>`,
      `<line x1="${cx - 7.5}" y1="${centerY}" x2="${cx + 7.5}" y2="${centerY}" stroke="#0f172a" stroke-width="1.5"/>`,
      `<circle cx="${cx}" cy="${centerY}" r="2.2" fill="#f8fafc" stroke="#0f172a" stroke-width="1.2"/>`,
    );
  }
  return parts.join('');
}

function hpColorHex(ratio: number): string {
  if (ratio > 0.5) return '#22c55e';
  if (ratio > 0.2) return '#f59e0b';
  return '#ef4444';
}

function buildBackgroundSvg(battle: BattleSessionView): Buffer {
  const theme = ARENA_THEMES[battle.mode];
  const leftGlow = TYPE_GLOW_COLORS[battle.fighterA.species.types[0] ?? 'Normal'] ?? '#38bdf8';
  const rightGlow = TYPE_GLOW_COLORS[battle.fighterB.species.types[0] ?? 'Normal'] ?? '#f43f5e';

  const svg = `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${theme.top}"/>
      <stop offset="58%" stop-color="${theme.mid}"/>
      <stop offset="100%" stop-color="${theme.bot}"/>
    </linearGradient>
    <radialGradient id="glowL" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${leftGlow}" stop-opacity="0.48"/>
      <stop offset="100%" stop-color="${leftGlow}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowR" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${rightGlow}" stop-opacity="0.48"/>
      <stop offset="100%" stop-color="${rightGlow}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="beam" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${theme.accent}" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="${theme.accent}" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" rx="18" fill="url(#sky)"/>
  <polygon points="0,0 320,0 180,${HEIGHT} 0,${HEIGHT}" fill="url(#beam)"/>
  <polygon points="${WIDTH},0 440,0 580,${HEIGHT} ${WIDTH},${HEIGHT}" fill="url(#beam)"/>

  <line x1="0" y1="215" x2="${WIDTH}" y2="215" stroke="#ffffff" stroke-opacity="0.08" stroke-width="1"/>
  <line x1="0" y1="255" x2="${WIDTH}" y2="255" stroke="#ffffff" stroke-opacity="0.06" stroke-width="1"/>

  <ellipse cx="192" cy="242" rx="145" ry="42" fill="url(#glowL)"/>
  <ellipse cx="192" cy="242" rx="116" ry="28" fill="#0f172a" fill-opacity="0.65" stroke="${leftGlow}" stroke-opacity="0.7" stroke-width="2.5"/>
  <ellipse cx="192" cy="242" rx="92" ry="18" fill="#ffffff" fill-opacity="0.07"/>

  <ellipse cx="568" cy="222" rx="145" ry="42" fill="url(#glowR)"/>
  <ellipse cx="568" cy="222" rx="116" ry="28" fill="#0f172a" fill-opacity="0.65" stroke="${rightGlow}" stroke-opacity="0.7" stroke-width="2.5"/>
  <ellipse cx="568" cy="222" rx="92" ry="18" fill="#ffffff" fill-opacity="0.07"/>

  <polygon points="392,52 362,158 384,158 368,244 402,134 380,134" fill="#ffffff" fill-opacity="0.16"/>
</svg>`;

  return Buffer.from(svg);
}

function buildHudOverlaySvg(battle: BattleSessionView): Buffer {
  const ratioA =
    battle.fighterA.maxHp > 0
      ? Math.max(0, Math.min(1, battle.fighterA.hp / battle.fighterA.maxHp))
      : 0;
  const ratioB =
    battle.fighterB.maxHp > 0
      ? Math.max(0, Math.min(1, battle.fighterB.hp / battle.fighterB.maxHp))
      : 0;

  const fillWidthA = battle.fighterA.hp <= 0 ? 0 : Math.max(8, Math.round(134 * ratioA));
  const fillWidthB = battle.fighterB.hp <= 0 ? 0 : Math.max(8, Math.round(134 * ratioB));

  const ballsA = buildTeamPokeballIcons(battle.teamA, battle.activeIndexA, 226, 292);
  const ballsB = buildTeamPokeballIcons(battle.teamB, battle.activeIndexB, 602, 292);

  const svg = `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect x="64" y="275" width="224" height="34" rx="17" fill="#0f172a" fill-opacity="0.86" stroke="#334155" stroke-width="1.5"/>
  <rect x="78" y="286" width="134" height="12" rx="6" fill="#1e293b"/>
  ${fillWidthA > 0 ? `<rect x="78" y="286" width="${fillWidthA}" height="12" rx="6" fill="${hpColorHex(ratioA)}"/>` : ''}
  ${ballsA}

  <rect x="440" y="275" width="224" height="34" rx="17" fill="#0f172a" fill-opacity="0.86" stroke="#334155" stroke-width="1.5"/>
  <rect x="454" y="286" width="134" height="12" rx="6" fill="#1e293b"/>
  ${fillWidthB > 0 ? `<rect x="454" y="286" width="${fillWidthB}" height="12" rx="6" fill="${hpColorHex(ratioB)}"/>` : ''}
  ${ballsB}
</svg>`;

  return Buffer.from(svg);
}

export async function renderBattleSceneAttachment(
  battle: BattleSessionView,
): Promise<AttachmentBuilder | null> {
  try {
    const [spriteA, spriteB] = await Promise.all([
      prepareCombatantSprite(battle.fighterA, true),
      prepareCombatantSprite(battle.fighterB, false),
    ]);

    const layers: OverlayOptions[] = [];
    if (spriteA) {
      layers.push({ input: spriteA, left: 96, top: 64 });
    }
    if (spriteB) {
      layers.push({ input: spriteB, left: 472, top: 44 });
    }
    layers.push({ input: buildHudOverlaySvg(battle), left: 0, top: 0 });

    const buffer = await sharp(buildBackgroundSvg(battle))
      .composite(layers)
      .png({ compressionLevel: 6 })
      .toBuffer();

    return new AttachmentBuilder(buffer, { name: 'battle-arena.png' });
  } catch {
    return null;
  }
}
