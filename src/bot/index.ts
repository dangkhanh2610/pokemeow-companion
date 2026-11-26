import { Client, Events, GatewayIntentBits, Partials } from 'discord.js';
import { loadBotConfig } from './config';
import { handleSlashCommand } from './handlers/interaction-handler';
import { PassiveHelperHandler } from './handlers/passive-helper-handler';
import { createBotStore, isDatabaseConfigured } from './store/store-factory';

function main(): void {
  const config = loadBotConfig();
  const store = createBotStore();
  const passiveHelper = new PassiveHelperHandler(store, config);

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Message, Partials.Channel],
  });

  client.once(Events.ClientReady, (readyClient) => {
    console.log(`🤖 PokéMeow Companion Bot đã trực tuyến: ${readyClient.user.tag}`);
    console.log(`🎯 Đang theo dõi ID PokéMeow Bot: ${config.pokemeowBotId}`);
    console.log(
      `💾 Chế độ lưu trữ: ${isDatabaseConfigured() ? 'PostgreSQL (Prisma — Đồng bộ Vercel)' : 'JSON cục bộ (data/bot-state.json)'}`,
    );
    passiveHelper.startCatchbotPoller(readyClient);
  });

  client.on(Events.InteractionCreate, (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    void handleSlashCommand(interaction, store);
  });

  client.on(Events.MessageCreate, (message) => {
    void passiveHelper.handleMessage(message);
  });

  client.on(Events.MessageUpdate, (_oldMessage, newMessage) => {
    void passiveHelper.handleMessageUpdate(newMessage);
  });

  const shutdown = (): void => {
    console.log('Đang tắt PokéMeow Companion Bot...');
    passiveHelper.dispose();
    void client.destroy();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  void client.login(config.token).catch((error: unknown) => {
    console.error('❌ Đăng nhập Discord Bot thất bại:', error);
    process.exit(1);
  });
}

main();
