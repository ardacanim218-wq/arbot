const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

const ownerNumber = normalizePhone(process.env.OWNER_NUMBER || "905319678514");

module.exports = {
  port: Number(process.env.PORT || 3000),
  botName: process.env.BOT_NAME || "ArBot",
  commandPrefix: process.env.COMMAND_PREFIX || "!",
  ownerName: process.env.OWNER_NAME || "Arda Gurbuz",
  ownerNumber,
  adminNumbers: (process.env.ADMIN_NUMBERS || "")
    .split(",")
    .map((value) => normalizePhone(value))
    .filter(Boolean),
  privateAutoReply: String(process.env.PRIVATE_AUTO_REPLY || "true").toLowerCase() !== "false",
  allowedGroupIds: (process.env.ALLOWED_GROUP_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  allowedGroupNames: (process.env.ALLOWED_GROUP_NAMES || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
  sessionPath: path.join(process.cwd(), ".wwebjs_auth"),
  cachePath: path.join(process.cwd(), ".wwebjs_cache"),
  dataPath: path.join(process.cwd(), "data", "bot-state.json")
};
