import crypto from "node:crypto";
import { config } from "../config.js";

const apiUrl = `https://graph.facebook.com/v22.0/${config.phoneNumberId}/messages`;

export function verifySignature(rawBody, signatureHeader) {
  if (!config.appSecret || !signatureHeader) {
    return true;
  }

  const expectedSignature = crypto
    .createHmac("sha256", config.appSecret)
    .update(rawBody)
    .digest("hex");

  return signatureHeader === `sha256=${expectedSignature}`;
}

export async function sendTextMessage(to, body) {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.whatsappToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: {
        body
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`WhatsApp API error ${response.status}: ${errorText}`);
  }

  return response.json();
}
