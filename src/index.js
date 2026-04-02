const http = require("http");
const qrcode = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");
const config = require("./config");
const { BotState, handleIncomingMessage } = require("./bot");

const state = new BotState(config.dataPath);
const runtimeState = {
  startedAt: new Date().toISOString(),
  status: "starting",
  qrAvailable: false,
  authenticated: false,
  ready: false,
  lastError: ""
};

const healthServer = http.createServer((_req, res) => {
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(
    JSON.stringify({
      ok: true,
      service: config.botName,
      runtime: runtimeState
    })
  );
});

healthServer.listen(config.port, () => {
  console.log(`Health server listening on port ${config.port}`);
});

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
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-extensions",
      "--no-zygote",
      "--single-process"
    ]
  }
});

async function restartClient() {
  console.log("Bot yeniden baslatiliyor...");
  runtimeState.status = "restarting";
  runtimeState.ready = false;
  runtimeState.qrAvailable = false;
  try {
    await client.destroy();
  } catch (error) {
    console.error("Client destroy hatasi:", error);
    runtimeState.lastError = error.message;
  }

  setTimeout(() => {
    client.initialize().catch((error) => {
      console.error("Client initialize hatasi:", error);
      runtimeState.status = "error";
      runtimeState.lastError = error.message;
    });
  }, 1000);
}

client.on("qr", (qr) => {
  console.log("WhatsApp baglantisi icin QR kodu okutun:");
  qrcode.generate(qr, { small: true });
  runtimeState.status = "waiting_for_qr";
  runtimeState.qrAvailable = true;
  runtimeState.ready = false;
  runtimeState.lastError = "";
});

client.on("authenticated", () => {
  console.log("WhatsApp oturumu dogrulandi.");
  runtimeState.status = "authenticated";
  runtimeState.authenticated = true;
  runtimeState.qrAvailable = false;
  runtimeState.lastError = "";
});

client.on("ready", () => {
  console.log(`${config.botName} hazir. Owner: ${config.ownerName} (+${config.ownerNumber})`);
  runtimeState.status = "ready";
  runtimeState.ready = true;
  runtimeState.authenticated = true;
  runtimeState.qrAvailable = false;
  runtimeState.lastError = "";
});

client.on("auth_failure", (message) => {
  console.error("Kimlik dogrulama hatasi:", message);
  runtimeState.status = "auth_failure";
  runtimeState.ready = false;
  runtimeState.lastError = String(message || "Authentication failed");
});

client.on("disconnected", (reason) => {
  console.error("WhatsApp baglantisi koptu:", reason);
  runtimeState.status = "disconnected";
  runtimeState.ready = false;
  runtimeState.authenticated = false;
  runtimeState.lastError = String(reason || "Disconnected");
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
    runtimeState.lastError = error.message;
    try {
      await message.reply("Komut islenirken bir hata olustu.");
    } catch (_replyError) {
      console.error("Hata mesaji da gonderilemedi.");
    }
  }
});

client.initialize().catch((error) => {
  console.error("Baslatma hatasi:", error);
  runtimeState.status = "error";
  runtimeState.lastError = error.message;
});
