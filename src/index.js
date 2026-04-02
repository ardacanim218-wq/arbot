const qrcode = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");
const config = require("./config");
const { BotState, handleIncomingMessage } = require("./bot");

const state = new BotState(config.dataPath);

const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: config.sessionPath
  }),
  webVersionCache: {
    type: "local",
    path: config.cachePath
  },
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  }
});

async function restartClient() {
  console.log("Bot yeniden baslatiliyor...");
  try {
    await client.destroy();
  } catch (error) {
    console.error("Client destroy hatasi:", error);
  }

  setTimeout(() => {
    client.initialize().catch((error) => {
      console.error("Client initialize hatasi:", error);
    });
  }, 1000);
}

client.on("qr", (qr) => {
  console.log("WhatsApp baglantisi icin QR kodu okutun:");
  qrcode.generate(qr, { small: true });
});

client.on("authenticated", () => {
  console.log("WhatsApp oturumu dogrulandi.");
});

client.on("ready", () => {
  console.log(`${config.botName} hazir. Owner: ${config.ownerName} (+${config.ownerNumber})`);
});

client.on("auth_failure", (message) => {
  console.error("Kimlik dogrulama hatasi:", message);
});

client.on("disconnected", (reason) => {
  console.error("WhatsApp baglantisi koptu:", reason);
});

client.on("message", async (message) => {
  if (message.fromMe) {
    return;
  }

  try {
    state.refresh();
    await handleIncomingMessage(client, message, state, { restartClient });
  } catch (error) {
    console.error("Mesaj islenemedi:", error);
    try {
      await message.reply("Komut islenirken bir hata olustu.");
    } catch (_replyError) {
      console.error("Hata mesaji da gonderilemedi.");
    }
  }
});

client.initialize();
