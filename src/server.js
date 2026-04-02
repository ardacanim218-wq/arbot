import express from "express";
import { config } from "./config.js";
import { processIncomingMessage } from "./bot.js";
import { verifySignature } from "./lib/whatsapp.js";

const app = express();

app.use(
  express.json({
    verify: (req, _res, buffer) => {
      req.rawBody = buffer;
    }
  })
);

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "whatsapp-professional-bot"
  });
});

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === config.verifyToken) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  const signature = req.headers["x-hub-signature-256"];
  const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));

  if (!verifySignature(rawBody, signature)) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  const entries = req.body?.entry || [];

  for (const entry of entries) {
    for (const change of entry.changes || []) {
      const messages = change.value?.messages || [];

      for (const message of messages) {
        try {
          await processIncomingMessage(message);
        } catch (error) {
          console.error("[bot] Failed to process message:", error);
        }
      }
    }
  }

  return res.sendStatus(200);
});

app.listen(config.port, () => {
  console.log(`WhatsApp bot listening on port ${config.port}`);
});
