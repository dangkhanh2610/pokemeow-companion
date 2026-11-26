import { Client, Events, GatewayIntentBits } from 'discord.js';
import { loadBotConfig } from './config';
import { botEmojiRegistry } from './emoji-registry';
import { BotCommandRouter } from './handlers/command-router';

async function bootstrapBot(): Promise<void> {
  const config = loadBotConfig();
  await botEmojiRegistry.syncAndLoad(config.token, config.clientId);
  const router = new BotCommandRouter(config.prefix, config.botName);

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once(Events.ClientReady, (readyClient) => {
    console.log(
      `[${config.botName}] Đã kết nối Discord dưới tên ${readyClient.user.tag} (${readyClient.guilds.cache.size} servers).`,
    );
    console.log(`[${config.botName}] Sẵn sàng nhận Slash Commands (/) và Prefix (${config.prefix}).`);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        await router.handleSlashCommand(interaction);
      } else if (interaction.isButton()) {
        await router.handleButtonInteraction(interaction);
      }
    } catch (error) {
      console.error('Lỗi xử lý Interaction:', error);
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction
          .reply({ content: '❌ Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.', ephemeral: true })
          .catch(() => undefined);
      }
    }
  });

  client.on(Events.MessageCreate, async (message) => {
    try {
      await router.handlePrefixMessage(message);
    } catch (error) {
      console.error('Lỗi xử lý Prefix Message:', error);
      await message
        .reply('❌ Đã xảy ra lỗi khi xử lý lệnh. Vui lòng thử lại sau.')
        .catch(() => undefined);
    }
  });

  const shutdown = (signal: string): void => {
    console.log(`[${config.botName}] Nhận tín hiệu ${signal}, đang ngắt kết nối Discord...`);
    client.destroy();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  await client.login(config.token);
}

bootstrapBot().catch((error: unknown) => {
  console.error('Không thể khởi động bot:', error);
  process.exit(1);
});
