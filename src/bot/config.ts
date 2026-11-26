import 'dotenv/config';

export interface BotConfig {
  readonly token: string;
  readonly clientId: string;
  readonly guildId: string | null;
  readonly pokemeowBotId: string;
}

const DEFAULT_POKEMEOW_BOT_ID = '664508672713424926';

export function loadBotConfig(): BotConfig {
  const token = process.env['DISCORD_TOKEN']?.trim() ?? '';
  const clientId = process.env['DISCORD_CLIENT_ID']?.trim() ?? '';
  const rawGuildId = process.env['DISCORD_GUILD_ID']?.trim() ?? '';
  const pokemeowBotId = process.env['POKEMEOW_BOT_ID']?.trim() || DEFAULT_POKEMEOW_BOT_ID;

  if (!token || token === 'your_bot_token_here') {
    throw new Error(
      'Thiếu biến môi trường DISCORD_TOKEN. Hãy tạo file .env từ .env.example và điền Bot Token từ Discord Developer Portal.',
    );
  }

  if (!clientId || clientId === 'your_application_client_id_here') {
    throw new Error(
      'Thiếu biến môi trường DISCORD_CLIENT_ID. Hãy điền Application ID từ Discord Developer Portal vào file .env.',
    );
  }

  return {
    token,
    clientId,
    guildId: rawGuildId.length > 0 ? rawGuildId : null,
    pokemeowBotId,
  };
}
