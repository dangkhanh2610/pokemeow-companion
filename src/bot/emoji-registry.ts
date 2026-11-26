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
const RARITY_PREFIX = 'pn_rar_';
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

export class EmojiRegistry {
  private readonly staticEmojis = new Map<BallId, StoredAppEmoji>();
  private readonly shakeEmojis = new Map<BallId, StoredAppEmoji>();
  private readonly typeEmojis = new Map<string, StoredAppEmoji>();
  private readonly rarityEmojis = new Map<string, StoredAppEmoji>();

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

    // Dọn emoji cũ pv_* nếu còn
    for (const ball of BALL_CATALOG) {
      const legacy = byName.get(`${LEGACY_PREFIX}${ball.id}`);
      if (legacy) {
        await rest
          .delete(`/applications/${clientId}/emojis/${legacy.id}` as `/${string}`)
          .catch(() => undefined);
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
}

export const botEmojiRegistry = new EmojiRegistry();
