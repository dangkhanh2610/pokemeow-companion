import { JsonBotStore } from './json-bot-store';
import { PrismaBotStore } from './prisma-bot-store';
import type { IBotStateStore } from './store-interface';

export function isDatabaseConfigured(): boolean {
  const url = process.env['DATABASE_URL']?.trim() ?? '';
  return url.length > 0 && !url.startsWith('postgresql://user:password@');
}

export function createBotStore(): IBotStateStore {
  if (isDatabaseConfigured()) {
    return new PrismaBotStore();
  }
  return new JsonBotStore();
}
