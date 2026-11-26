import { REST, Routes } from 'discord.js';
import { COMMAND_DEFINITIONS } from './commands/definitions';
import { loadBotConfig } from './config';

async function registerCommands(): Promise<void> {
  const config = loadBotConfig();
  const rest = new REST({ version: '10' }).setToken(config.token);

  console.log(`Đang đăng ký ${COMMAND_DEFINITIONS.length} Slash Commands...`);

  if (config.guildId) {
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
      body: COMMAND_DEFINITIONS,
    });
    console.log(`✅ Đã đăng ký Slash Commands cho server (Guild ID: ${config.guildId}).`);
    return;
  }

  await rest.put(Routes.applicationCommands(config.clientId), {
    body: COMMAND_DEFINITIONS,
  });
  console.log('✅ Đã đăng ký Slash Commands toàn cục (có thể mất vài phút để đồng bộ).');
}

void registerCommands().catch((error: unknown) => {
  console.error('❌ Đăng ký Slash Commands thất bại:', error);
  process.exitCode = 1;
});
