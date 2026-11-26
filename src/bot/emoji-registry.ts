import {
  REST,
  type RESTGetAPIApplicationEmojisResult,
  type RESTPostAPIApplicationEmojiJSONBody,
  type RESTPostAPIApplicationEmojiResult,
} from 'discord.js';
import { BALL_CATALOG, getBallSpec } from '@/game/catalog/ball-catalog';
import type { BallId } from '@/game/types';

export interface StoredAppEmoji {
  readonly id: string;
  readonly name: string;
}

export class EmojiRegistry {
  private readonly emojis = new Map<BallId, StoredAppEmoji>();

  public async syncAndLoad(token: string, clientId: string): Promise<void> {
    const rest = new REST({ version: '10' }).setToken(token);
    const route = `/applications/${clientId}/emojis` as `/${string}`;

    let existingItems: RESTGetAPIApplicationEmojisResult['items'] = [];
    try {
      const response = (await rest.get(route)) as RESTGetAPIApplicationEmojisResult;
      existingItems = Array.isArray(response.items) ? response.items : [];
    } catch (error) {
      console.warn(
        '[EmojiRegistry] Không thể tải danh sách Application Emojis từ Discord, sẽ dùng emoji dự phòng:',
        error instanceof Error ? error.message : error,
      );
      return;
    }

    const byName = new Map<string, StoredAppEmoji>();
    for (const item of existingItems) {
      if (item.id && item.name) {
        byName.set(item.name, { id: item.id, name: item.name });
      }
    }

    for (const ball of BALL_CATALOG) {
      const targetName = `pv_${ball.id}`;
      const existing = byName.get(targetName);
      if (existing) {
        this.emojis.set(ball.id, existing);
        continue;
      }

      try {
        const res = await fetch(ball.iconUrl);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} khi tải ${ball.iconUrl}`);
        }
        const buffer = Buffer.from(await res.arrayBuffer());
        const dataUri = `data:image/png;base64,${buffer.toString('base64')}`;

        const body: RESTPostAPIApplicationEmojiJSONBody = {
          name: targetName,
          image: dataUri,
        };

        const created = (await rest.post(route, {
          body,
        })) as RESTPostAPIApplicationEmojiResult;

        if (created.id && created.name) {
          this.emojis.set(ball.id, { id: created.id, name: created.name });
          console.log(`[EmojiRegistry] Đã tải lên Discord Application Emoji: :${created.name}:`);
        }
      } catch (error) {
        console.warn(
          `[EmojiRegistry] Không thể upload emoji cho ${ball.id}, dùng emoji mặc định:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  public getBallMention(ballId: BallId): string {
    const entry = this.emojis.get(ballId);
    if (entry) {
      return `<:${entry.name}:${entry.id}>`;
    }
    return getBallSpec(ballId).emoji;
  }

  public getBallButtonEmoji(
    ballId: BallId,
  ): string | { readonly id: string; readonly name: string } {
    const entry = this.emojis.get(ballId);
    if (entry) {
      return { id: entry.id, name: entry.name };
    }
    return getBallSpec(ballId).emoji;
  }
}

export const botEmojiRegistry = new EmojiRegistry();
