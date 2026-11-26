import { REST, Routes } from 'discord.js';
import { SLASH_COMMANDS } from './commands/definitions';
import { loadBotConfig } from './config';

async function registerCommands(): Promise<void> {
  const config = loadBotConfig();
  const rest = new REST({ version: '10' }).setToken(config.token);

  console.log(`Đang đăng ký ${SLASH_COMMANDS.length} slash commands cho ${config.botName}...`);

  if (config.guildId) {
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
      body: [...SLASH_COMMANDS],
    });
    console.log(`Đã đăng ký thành công slash commands cho Guild ID: ${config.guildId}`);
  } else {
    await rest.put(Routes.applicationCommands(config.clientId), {
      body: [...SLASH_COMMANDS],
    });
    console.log('Đã đăng ký thành công Global slash commands.');
  }
}

registerCommands().catch((err: unknown) => {
  console.error('Lỗi đăng ký slash commands:', err);
  process.exit(1);
});
