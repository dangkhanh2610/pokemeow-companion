import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  REST,
  type RESTGetAPIApplicationEmojisResult,
  type RESTPostAPIApplicationEmojiJSONBody,
  type RESTPostAPIApplicationEmojiResult,
} from 'discord.js';
import { BALL_CATALOG, getBallSpec } from '@/game/catalog/ball-catalog';
import type { BallId, RarityTier } from '@/game/types';

export interface StoredAppEmoji {
  readonly id: string;
  readonly name: string;
  readonly animated: boolean;
}

const EMOJI_PREFIX = 'pn_';
const SHAKE_PREFIX = 'pn_shake_';
const TYPE_PREFIX = 'pn_type_';
const RARITY_PREFIX = 'pn_r3_';
const LEGACY_RARITY_PREFIXES: readonly string[] = ['pn_rar_', 'pn_r2_'];
const UI_PREFIX = 'pn_ui_';
const HP_PREFIX = 'pn_hp_';
const LEGACY_PREFIX = 'pv_';

const TYPE_SLUGS: readonly string[] = [
  'normal',
  'fighting',
  'flying',
  'poison',
  'ground',
  'rock',
  'bug',
  'ghost',
  'steel',
  'fire',
  'water',
  'grass',
  'electric',
  'psychic',
  'ice',
  'dragon',
  'dark',
  'fairy',
];

const RARITY_KEYS: readonly (RarityTier | 'shiny')[] = [
  'common',
  'uncommon',
  'rare',
  'super_rare',
  'legendary',
  'mega',
  'shiny',
];

export type UiIconKey = 'coin' | 'check' | 'cross' | 'timer' | 'fav' | 'token';

const UI_KEYS: readonly UiIconKey[] = ['coin', 'check', 'cross', 'timer', 'fav', 'token'];

export type HpBarSlotKey =
  | 'l_g'
  | 'm_g'
  | 'r_g'
  | 'l_y'
  | 'm_y'
  | 'r_y'
  | 'l_r'
  | 'm_r'
  | 'r_r'
  | 'l_e'
  | 'm_e'
  | 'r_e';

const HP_BAR_KEYS: readonly HpBarSlotKey[] = [
  'l_g',
  'm_g',
  'r_g',
  'l_y',
  'm_y',
  'r_y',
  'l_r',
  'm_r',
  'r_r',
  'l_e',
  'm_e',
  'r_e',
];

export class EmojiRegistry {
  private readonly staticEmojis = new Map<BallId, StoredAppEmoji>();
  private readonly shakeEmojis = new Map<BallId, StoredAppEmoji>();
  private readonly typeEmojis = new Map<string, StoredAppEmoji>();
  private readonly rarityEmojis = new Map<string, StoredAppEmoji>();
  private readonly uiEmojis = new Map<UiIconKey, StoredAppEmoji>();
  private readonly hpEmojis = new Map<HpBarSlotKey, StoredAppEmoji>();

  public async syncAndLoad(token: string, clientId: string): Promise<void> {
    const rest = new REST({ version: '10' }).setToken(token);
    const route = `/applications/${clientId}/emojis` as `/${string}`;

    let existingItems: RESTGetAPIApplicationEmojisResult['items'] = [];
    try {
      const response = (await rest.get(route)) as RESTGetAPIApplicationEmojisResult;
      existingItems = Array.isArray(response.items) ? response.items : [];
    } catch (error) {
      console.warn(
        '[EmojiRegistry] Không thể tải danh sách Application Emojis từ Discord, sẽ dùng ký hiệu dự phòng:',
        error instanceof Error ? error.message : error,
      );
      return;
    }

    const byName = new Map<string, StoredAppEmoji>();
    for (const item of existingItems) {
      if (item.id && item.name) {
        byName.set(item.name, {
          id: item.id,
          name: item.name,
          animated: Boolean(item.animated),
        });
      }
    }

    // Dọn emoji cũ pv_* và pn_rar_* nếu còn
    for (const ball of BALL_CATALOG) {
      const legacy = byName.get(`${LEGACY_PREFIX}${ball.id}`);
      if (legacy) {
        await rest
          .delete(`/applications/${clientId}/emojis/${legacy.id}` as `/${string}`)
          .catch(() => undefined);
      }
    }
    for (const prefix of LEGACY_RARITY_PREFIXES) {
      for (const rarityKey of RARITY_KEYS) {
        const legacy = byName.get(`${prefix}${rarityKey}`);
        if (legacy) {
          await rest
            .delete(`/applications/${clientId}/emojis/${legacy.id}` as `/${string}`)
            .catch(() => undefined);
        }
      }
    }

    // 1) Sync static HD Poké Ball icons
    for (const ball of BALL_CATALOG) {
      const targetName = `${EMOJI_PREFIX}${ball.id}`;
      const existing = byName.get(targetName);
      if (existing) {
        this.staticEmojis.set(ball.id, existing);
        continue;
      }

      try {
        const res = await fetch(ball.iconUrl);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} khi tải ${ball.iconUrl}`);
        }
        const buffer = Buffer.from(await res.arrayBuffer());
        const created = await this.uploadEmoji(rest, route, targetName, 'image/png', buffer);
        if (created) {
          this.staticEmojis.set(ball.id, created);
          console.log(`[EmojiRegistry] Đã tải lên HD Application Emoji: :${created.name}:`);
        }
      } catch (error) {
        console.warn(
          `[EmojiRegistry] Không thể upload emoji cho ${ball.id}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    // 2) Sync animated shaking Poké Ball GIFs
    for (const ball of BALL_CATALOG) {
      const targetName = `${SHAKE_PREFIX}${ball.id}`;
      const existing = byName.get(targetName);
      if (existing) {
        this.shakeEmojis.set(ball.id, existing);
        continue;
      }

      try {
        const gifPath = resolve(process.cwd(), 'public', 'balls', `shake-${ball.id}.gif`);
        const buffer = await readFile(gifPath);
        const created = await this.uploadEmoji(rest, route, targetName, 'image/gif', buffer);
        if (created) {
          this.shakeEmojis.set(ball.id, { ...created, animated: true });
          console.log(`[EmojiRegistry] Đã tải lên Animated Shake Emoji: :${created.name}:`);
        }
      } catch (error) {
        console.warn(
          `[EmojiRegistry] Không thể upload animated emoji cho ${ball.id}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    // 3) Sync 18 official Pokémon Type Icons
    for (const slug of TYPE_SLUGS) {
      const targetName = `${TYPE_PREFIX}${slug}`;
      const existing = byName.get(targetName);
      if (existing) {
        this.typeEmojis.set(slug, existing);
        continue;
      }

      try {
        const pngPath = resolve(process.cwd(), 'public', 'types', `${slug}.png`);
        const buffer = await readFile(pngPath);
        const created = await this.uploadEmoji(rest, route, targetName, 'image/png', buffer);
        if (created) {
          this.typeEmojis.set(slug, created);
          console.log(`[EmojiRegistry] Đã tải lên Type Emoji: :${created.name}:`);
        }
      } catch (error) {
        console.warn(
          `[EmojiRegistry] Không thể upload Type emoji ${slug}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    // 4) Sync 7 Rarity Badges
    for (const rarityKey of RARITY_KEYS) {
      const targetName = `${RARITY_PREFIX}${rarityKey}`;
      const existing = byName.get(targetName);
      if (existing) {
        this.rarityEmojis.set(rarityKey, existing);
        continue;
      }

      try {
        const pngPath = resolve(process.cwd(), 'public', 'badges', `rar_${rarityKey}.png`);
        const buffer = await readFile(pngPath);
        const created = await this.uploadEmoji(rest, route, targetName, 'image/png', buffer);
        if (created) {
          this.rarityEmojis.set(rarityKey, created);
          console.log(`[EmojiRegistry] Đã tải lên Rarity Badge: :${created.name}:`);
        }
      } catch (error) {
        console.warn(
          `[EmojiRegistry] Không thể upload Rarity badge ${rarityKey}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    // 5) Sync 5 Game UI Icons
    for (const uiKey of UI_KEYS) {
      const targetName = `${UI_PREFIX}${uiKey}`;
      const existing = byName.get(targetName);
      if (existing) {
        this.uiEmojis.set(uiKey, existing);
        continue;
      }

      try {
        const pngPath = resolve(process.cwd(), 'public', 'ui', `ui_${uiKey}.png`);
        const buffer = await readFile(pngPath);
        const created = await this.uploadEmoji(rest, route, targetName, 'image/png', buffer);
        if (created) {
          this.uiEmojis.set(uiKey, created);
          console.log(`[EmojiRegistry] Đã tải lên UI Icon: :${created.name}:`);
        }
      } catch (error) {
        console.warn(
          `[EmojiRegistry] Không thể upload UI icon ${uiKey}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    // 6) Sync 12 Seamless Capsule HP Bar segments
    for (const hpKey of HP_BAR_KEYS) {
      const targetName = `${HP_PREFIX}${hpKey}`;
      const existing = byName.get(targetName);
      if (existing) {
        this.hpEmojis.set(hpKey, existing);
        continue;
      }

      try {
        const pngPath = resolve(process.cwd(), 'public', 'ui', `hp_${hpKey}.png`);
        const buffer = await readFile(pngPath);
        const created = await this.uploadEmoji(rest, route, targetName, 'image/png', buffer);
        if (created) {
          this.hpEmojis.set(hpKey, created);
          console.log(`[EmojiRegistry] Đã tải lên HP Bar segment: :${created.name}:`);
        }
      } catch (error) {
        console.warn(
          `[EmojiRegistry] Không thể upload HP bar ${hpKey}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  private async uploadEmoji(
    rest: REST,
    route: `/${string}`,
    name: string,
    mime: 'image/png' | 'image/gif',
    buffer: Buffer,
  ): Promise<StoredAppEmoji | null> {
    const body: RESTPostAPIApplicationEmojiJSONBody = {
      name,
      image: `data:${mime};base64,${buffer.toString('base64')}`,
    };

    const created = (await rest.post(route, {
      body,
    })) as RESTPostAPIApplicationEmojiResult;

    if (created.id && created.name) {
      return {
        id: created.id,
        name: created.name,
        animated: Boolean(created.animated),
      };
    }
    return null;
  }

  public getBallMention(ballId: BallId): string {
    const entry = this.staticEmojis.get(ballId);
    if (entry) {
      return `<:${entry.name}:${entry.id}>`;
    }
    return getBallSpec(ballId).emoji;
  }

  public getBallShakeMention(ballId: BallId): string {
    const entry = this.shakeEmojis.get(ballId);
    if (entry) {
      return `<a:${entry.name}:${entry.id}>`;
    }
    return this.getBallMention(ballId);
  }

  public getBallShakeGifUrl(ballId: BallId): string | null {
    const entry = this.shakeEmojis.get(ballId);
    if (!entry) {
      return null;
    }
    return `https://cdn.discordapp.com/emojis/${entry.id}.gif?size=128&quality=lossless`;
  }

  public getBallButtonEmoji(
    ballId: BallId,
  ): string | { readonly id: string; readonly name: string } {
    const entry = this.staticEmojis.get(ballId);
    if (entry) {
      return { id: entry.id, name: entry.name };
    }
    return getBallSpec(ballId).emoji;
  }

  public getTypeMention(typeName: string): string {
    const key = typeName.trim().toLowerCase();
    const entry = this.typeEmojis.get(key);
    if (entry) {
      return `<:${entry.name}:${entry.id}>`;
    }
    return '';
  }

  public getTypeButtonEmoji(
    typeName: string,
  ): { readonly id: string; readonly name: string } | undefined {
    const key = typeName.trim().toLowerCase();
    const entry = this.typeEmojis.get(key);
    if (entry) {
      return { id: entry.id, name: entry.name };
    }
    return undefined;
  }

  public buildHpBar(hp: number, maxHp: number, length = 7): string {
    const safeLength = Math.max(3, length);
    const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
    const filled = hp <= 0 ? 0 : Math.max(1, Math.round(ratio * safeLength));
    const fillColor: 'g' | 'y' | 'r' = ratio > 0.5 ? 'g' : ratio > 0.2 ? 'y' : 'r';

    const segments: string[] = [];
    for (let i = 0; i < safeLength; i += 1) {
      const pos: 'l' | 'm' | 'r' = i === 0 ? 'l' : i === safeLength - 1 ? 'r' : 'm';
      const color = i < filled ? fillColor : 'e';
      const slotKey: HpBarSlotKey = `${pos}_${color}`;
      const entry = this.hpEmojis.get(slotKey);
      if (!entry) {
        return `${'▰'.repeat(filled)}${'▱'.repeat(safeLength - filled)}`;
      }
      segments.push(`<:${entry.name}:${entry.id}>`);
    }
    return segments.join('');
  }

  public getRarityMention(rarity: RarityTier): string {
    const entry = this.rarityEmojis.get(rarity);
    if (entry) {
      return `<:${entry.name}:${entry.id}>`;
    }
    return '';
  }

  public getShinyMention(): string {
    const entry = this.rarityEmojis.get('shiny');
    if (entry) {
      return `<:${entry.name}:${entry.id}>`;
    }
    return '★';
  }

  public getUiMention(key: UiIconKey, fallback: string): string {
    const entry = this.uiEmojis.get(key);
    if (entry) {
      return `<:${entry.name}:${entry.id}>`;
    }
    return fallback;
  }

  public getCoinMention(): string {
    return this.getUiMention('coin', 'PC');
  }

  public getCheckMention(): string {
    return this.getUiMention('check', '[OK]');
  }

  public getCrossMention(): string {
    return this.getUiMention('cross', '[X]');
  }

  public getTimerMention(): string {
    return this.getUiMention('timer', '[!]');
  }

  public getFavMention(): string {
    return this.getUiMention('fav', '♥');
  }

  public getTokenMention(): string {
    return this.getUiMention('token', 'FT');
  }
}

export const botEmojiRegistry = new EmojiRegistry();
