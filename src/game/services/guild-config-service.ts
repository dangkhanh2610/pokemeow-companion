import { getPrismaClient } from '@/lib/prisma';

export interface GuildToggleState {
  readonly enabled: boolean;
  readonly disabledBy: string | null;
  readonly disabledAt: Date | null;
}

const DEFAULT_STATE: GuildToggleState = {
  enabled: true,
  disabledBy: null,
  disabledAt: null,
};

export class GuildConfigService {
  private readonly cache = new Map<string, GuildToggleState>();

  public async getGuildStatus(guildId: string): Promise<GuildToggleState> {
    const cached = this.cache.get(guildId);
    if (cached) {
      return cached;
    }

    const prisma = getPrismaClient();
    const record = await prisma.guildConfig.findUnique({
      where: { guildId },
      select: {
        enabled: true,
        disabledBy: true,
        disabledAt: true,
      },
    });

    const state: GuildToggleState = record
      ? {
          enabled: record.enabled,
          disabledBy: record.disabledBy,
          disabledAt: record.disabledAt,
        }
      : DEFAULT_STATE;

    this.cache.set(guildId, state);
    return state;
  }

  public async setGuildEnabled(
    guildId: string,
    enabled: boolean,
    actorTag: string,
  ): Promise<GuildToggleState> {
    const prisma = getPrismaClient();
    const disabledBy = enabled ? null : actorTag;
    const disabledAt = enabled ? null : new Date();

    const updated = await prisma.guildConfig.upsert({
      where: { guildId },
      update: {
        enabled,
        disabledBy,
        disabledAt,
      },
      create: {
        guildId,
        enabled,
        disabledBy,
        disabledAt,
      },
      select: {
        enabled: true,
        disabledBy: true,
        disabledAt: true,
      },
    });

    const state: GuildToggleState = {
      enabled: updated.enabled,
      disabledBy: updated.disabledBy,
      disabledAt: updated.disabledAt,
    };

    this.cache.set(guildId, state);
    return state;
  }
}

export const guildConfigService = new GuildConfigService();
