const http = require("http");
const QRCode = require("qrcode");
const qrcode = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");
const config = require("./config");
const { BotState, handleIncomingMessage } = require("./bot");

const state = new BotState(config.dataPath);
const runtimeState = {
  startedAt: new Date().toISOString(),
  status: "starting",
  qrAvailable: false,
  qrValue: "",
  authenticated: false,
  ready: false,
  lastError: "",
  lastMessage: null
};

const processedMessages = new Set();

const healthServer = http.createServer(async (req, res) => {
  if (req.url === "/qr") {
    if (!runtimeState.qrValue) {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8"
      });
      res.end(`
        <!doctype html>
        <html lang="tr">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>${config.botName} QR</title>
            <style>
              body { font-family: Arial, sans-serif; background:#101418; color:#f5f7fa; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }
              .card { background:#17202a; padding:24px; border-radius:16px; width:min(92vw, 480px); box-shadow:0 10px 30px rgba(0,0,0,.3); text-align:center; }
              h1 { margin-top:0; font-size:24px; }
              p { color:#c7d0d9; line-height:1.5; }
              code { background:#0c1117; padding:4px 8px; border-radius:8px; }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>${config.botName}</h1>
              <p>QR henuz hazir degil. Biraz bekleyip sayfayi yenile.</p>
              <p>Durum: <code>${runtimeState.status}</code></p>
            </div>
          </body>
        </html>
      `);
      return;
    }

    try {
      const qrDataUrl = await QRCode.toDataURL(runtimeState.qrValue, {
        margin: 1,
        width: 320
      });

      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8"
      });
      res.end(`
        <!doctype html>
        <html lang="tr">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>${config.botName} QR</title>
            <style>
              body { font-family: Arial, sans-serif; background:#0f141a; color:#f5f7fa; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }
              .card { background:#18212b; padding:24px; border-radius:18px; width:min(92vw, 520px); box-shadow:0 10px 30px rgba(0,0,0,.35); text-align:center; }
              h1 { margin-top:0; font-size:24px; }
              p { color:#c8d1db; line-height:1.5; }
              img { background:#fff; padding:14px; border-radius:16px; max-width:100%; height:auto; }
              code { background:#0c1117; padding:4px 8px; border-radius:8px; }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>${config.botName} WhatsApp QR</h1>
              <p>Telefonda <code>WhatsApp &gt; Bagli Cihazlar &gt; Cihaz Bagla</code> yolunu acip bu QR'i okut.</p>
              <img src="${qrDataUrl}" alt="WhatsApp QR" />
              <p>Durum: <code>${runtimeState.status}</code></p>
            </div>
          </body>
        </html>
      `);
    } catch (error) {
      res.writeHead(500, {
        "Content-Type": "application/json; charset=utf-8"
      });
      res.end(JSON.stringify({ ok: false, error: error.message }));
    }
    return;
  }

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

async function processMessageEvent(message, eventName) {
  if (message.fromMe) {
    return;
  }

  const messageId = message.id?._serialized || `${eventName}:${message.from}:${message.timestamp}`;
  if (processedMessages.has(messageId)) {
    return;
  }

  processedMessages.add(messageId);
  setTimeout(() => processedMessages.delete(messageId), 5 * 60 * 1000);

  try {
    const chat = await message.getChat();
    runtimeState.lastMessage = {
      event: eventName,
      from: message.from,
      author: message.author || "",
      body: String(message.body || "").slice(0, 200),
      isGroup: Boolean(chat.isGroup),
      chatName: chat.name || "",
      receivedAt: new Date().toISOString()
    };

    console.log(
      `[incoming:${eventName}] from=${message.from} author=${message.author || "-"} group=${
        chat.isGroup ? "yes" : "no"
      } body=${JSON.stringify(String(message.body || "").slice(0, 120))}`
    );

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
}

client.on("qr", (qr) => {
  console.log("WhatsApp baglantisi icin QR kodu okutun:");
  qrcode.generate(qr, { small: true });
  runtimeState.status = "waiting_for_qr";
  runtimeState.qrAvailable = true;
  runtimeState.qrValue = qr;
  runtimeState.ready = false;
  runtimeState.lastError = "";
});

client.on("authenticated", () => {
  console.log("WhatsApp oturumu dogrulandi.");
  runtimeState.status = "authenticated";
  runtimeState.authenticated = true;
  runtimeState.qrAvailable = false;
  runtimeState.qrValue = "";
  runtimeState.lastError = "";
});

client.on("ready", () => {
  console.log(`${config.botName} hazir. Owner: ${config.ownerName} (+${config.ownerNumber})`);
  runtimeState.status = "ready";
  runtimeState.ready = true;
  runtimeState.authenticated = true;
  runtimeState.qrAvailable = false;
  runtimeState.qrValue = "";
  runtimeState.lastError = "";
});

client.on("auth_failure", (message) => {
  console.error("Kimlik dogrulama hatasi:", message);
  runtimeState.status = "auth_failure";
  runtimeState.ready = false;
  runtimeState.qrValue = "";
  runtimeState.lastError = String(message || "Authentication failed");
});

client.on("disconnected", (reason) => {
  console.error("WhatsApp baglantisi koptu:", reason);
  runtimeState.status = "disconnected";
  runtimeState.ready = false;
  runtimeState.authenticated = false;
  runtimeState.qrValue = "";
  runtimeState.lastError = String(reason || "Disconnected");
});

client.on("message", async (message) => {
  await processMessageEvent(message, "message");
});

client.on("message_create", async (message) => {
  await processMessageEvent(message, "message_create");
});

client.initialize().catch((error) => {
  console.error("Baslatma hatasi:", error);
  runtimeState.status = "error";
  runtimeState.lastError = error.message;
});
