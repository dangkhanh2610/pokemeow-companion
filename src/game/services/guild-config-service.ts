import { getPrismaClient, withDbRetry } from '@/lib/prisma';

export interface GuildSettings {
  readonly prefix: string;
  readonly enabled: boolean;
  readonly disabledBy: string | null;
  readonly disabledAt: Date | null;
  readonly allowedChannels: readonly string[];
  readonly blockedChannels: readonly string[];
}

export type GuildToggleState = Pick<GuildSettings, 'enabled' | 'disabledBy' | 'disabledAt'>;

export function isChannelAllowed(
  settings: Pick<GuildSettings, 'allowedChannels' | 'blockedChannels'>,
  channelId: string,
): boolean {
  if (settings.blockedChannels.includes(channelId)) {
    return false;
  }
  if (settings.allowedChannels.length > 0) {
    return settings.allowedChannels.includes(channelId);
  }
  return true;
}

export function validatePrefix(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 5) {
    return null;
  }
  if (/\s/.test(trimmed) || trimmed.includes('<') || trimmed.includes('@') || trimmed.includes('`')) {
    return null;
  }
  return trimmed;
}

export class GuildConfigService {
  private readonly cache = new Map<string, GuildSettings>();

  public peekCachedSettings(guildId: string): GuildSettings | undefined {
    return this.cache.get(guildId);
  }

  public async getGuildSettings(
    guildId: string,
    defaultPrefix = ';',
  ): Promise<GuildSettings> {
    const cached = this.cache.get(guildId);
    if (cached) {
      return cached;
    }

    const prisma = getPrismaClient();
    const record = await withDbRetry(() =>
      prisma.guildConfig.findUnique({
        where: { guildId },
        select: {
          prefix: true,
          enabled: true,
          disabledBy: true,
          disabledAt: true,
          allowedChannels: true,
          blockedChannels: true,
        },
      }),
    );

    const settings: GuildSettings = record
      ? {
          prefix: record.prefix,
          enabled: record.enabled,
          disabledBy: record.disabledBy,
          disabledAt: record.disabledAt,
          allowedChannels: record.allowedChannels,
          blockedChannels: record.blockedChannels,
        }
      : {
          prefix: defaultPrefix,
          enabled: true,
          disabledBy: null,
          disabledAt: null,
          allowedChannels: [],
          blockedChannels: [],
        };

    this.cache.set(guildId, settings);
    return settings;
  }

  public async getGuildStatus(guildId: string): Promise<GuildToggleState> {
    return this.getGuildSettings(guildId);
  }

  public async setGuildEnabled(
    guildId: string,
    enabled: boolean,
    actorTag: string,
  ): Promise<GuildSettings> {
    const prisma = getPrismaClient();
    const disabledBy = enabled ? null : actorTag;
    const disabledAt = enabled ? null : new Date();

    const updated = await withDbRetry(() =>
      prisma.guildConfig.upsert({
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
          prefix: true,
          enabled: true,
          disabledBy: true,
          disabledAt: true,
          allowedChannels: true,
          blockedChannels: true,
        },
      }),
    );

    const settings: GuildSettings = {
      prefix: updated.prefix,
      enabled: updated.enabled,
      disabledBy: updated.disabledBy,
      disabledAt: updated.disabledAt,
      allowedChannels: updated.allowedChannels,
      blockedChannels: updated.blockedChannels,
    };

    this.cache.set(guildId, settings);
    return settings;
  }

  public async setGuildPrefix(guildId: string, newPrefix: string): Promise<GuildSettings> {
    const prisma = getPrismaClient();
    const updated = await withDbRetry(() =>
      prisma.guildConfig.upsert({
        where: { guildId },
        update: { prefix: newPrefix },
        create: { guildId, prefix: newPrefix },
        select: {
          prefix: true,
          enabled: true,
          disabledBy: true,
          disabledAt: true,
          allowedChannels: true,
          blockedChannels: true,
        },
      }),
    );

    const settings: GuildSettings = {
      prefix: updated.prefix,
      enabled: updated.enabled,
      disabledBy: updated.disabledBy,
      disabledAt: updated.disabledAt,
      allowedChannels: updated.allowedChannels,
      blockedChannels: updated.blockedChannels,
    };

    this.cache.set(guildId, settings);
    return settings;
  }

  public async allowChannel(guildId: string, channelId: string): Promise<GuildSettings> {
    const current = await this.getGuildSettings(guildId);
    const allowedSet = new Set(current.allowedChannels);
    allowedSet.add(channelId);
    const blockedChannels = current.blockedChannels.filter((id) => id !== channelId);
    return this.updateChannelLists(guildId, [...allowedSet], blockedChannels);
  }

  public async blockChannel(guildId: string, channelId: string): Promise<GuildSettings> {
    const current = await this.getGuildSettings(guildId);
    const blockedSet = new Set(current.blockedChannels);
    blockedSet.add(channelId);
    const allowedChannels = current.allowedChannels.filter((id) => id !== channelId);
    return this.updateChannelLists(guildId, allowedChannels, [...blockedSet]);
  }

  public async resetChannels(guildId: string): Promise<GuildSettings> {
    return this.updateChannelLists(guildId, [], []);
  }

  private async updateChannelLists(
    guildId: string,
    allowedChannels: string[],
    blockedChannels: string[],
  ): Promise<GuildSettings> {
    const prisma = getPrismaClient();
    const updated = await withDbRetry(() =>
      prisma.guildConfig.upsert({
        where: { guildId },
        update: { allowedChannels, blockedChannels },
        create: { guildId, allowedChannels, blockedChannels },
        select: {
          prefix: true,
          enabled: true,
          disabledBy: true,
          disabledAt: true,
          allowedChannels: true,
          blockedChannels: true,
        },
      }),
    );

    const settings: GuildSettings = {
      prefix: updated.prefix,
      enabled: updated.enabled,
      disabledBy: updated.disabledBy,
      disabledAt: updated.disabledAt,
      allowedChannels: updated.allowedChannels,
      blockedChannels: updated.blockedChannels,
    };

    this.cache.set(guildId, settings);
    return settings;
  }
}

export const guildConfigService = new GuildConfigService();
