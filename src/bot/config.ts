import 'dotenv/config';

export interface BotConfig {
  readonly token: string;
  readonly clientId: string;
  readonly guildId: string | null;
  readonly prefix: string;
  readonly botName: string;
  readonly ownerIds: readonly string[];
}

export function loadBotConfig(): BotConfig {
  const token = process.env['DISCORD_TOKEN']?.trim() ?? '';
  const clientId = process.env['DISCORD_CLIENT_ID']?.trim() ?? '';
  const rawGuildId = process.env['DISCORD_GUILD_ID']?.trim() ?? '';
  const prefix = process.env['BOT_PREFIX']?.trim() || ';';
  const botName = process.env['BOT_NAME']?.trim() || 'PokeNyan';
  const rawOwnerIds = process.env['BOT_OWNER_IDS']?.trim() ?? '';
  const ownerIds = rawOwnerIds
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  if (!token || token === 'your_bot_token_here') {
    throw new Error(
      'Thiếu biến môi trường DISCORD_TOKEN. Hãy kiểm tra file .env và điền Bot Token từ Discord Developer Portal.',
    );
  }

  if (!clientId || clientId === 'your_application_client_id_here') {
    throw new Error(
      'Thiếu biến môi trường DISCORD_CLIENT_ID. Hãy điền Application ID vào file .env.',
    );
  }

  return {
    token,
    clientId,
    guildId: rawGuildId.length > 0 ? rawGuildId : null,
    prefix,
    botName,
    ownerIds,
  };
}
