const fs = require("fs");
const path = require("path");
const appConfig = require("./config");

const DEFAULT_STATE = {
  ownerNumber: appConfig.ownerNumber,
  authorizedUsers: [],
  warnings: {},
  mutes: {},
  logs: []
};

function ensureStateFile(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(DEFAULT_STATE, null, 2));
  }
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeIdentity(value) {
  return normalizePhone(value);
}

function normalizeUserId(value) {
  const digits = normalizePhone(value);
  return digits ? `${digits}@c.us` : "";
}

function nowIso() {
  return new Date().toISOString();
}

class BotState {
  constructor(filePath) {
    this.filePath = filePath;
    ensureStateFile(filePath);
    this.state = this.read();
  }

  read() {
    const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
    return {
      ...DEFAULT_STATE,
      ...parsed,
      authorizedUsers: Array.isArray(parsed.authorizedUsers) ? parsed.authorizedUsers : [],
      warnings: parsed.warnings || {},
      mutes: parsed.mutes || {},
      logs: Array.isArray(parsed.logs) ? parsed.logs : []
    };
  }

  save() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2));
  }

  refresh() {
    this.state = this.read();
    return this.state;
  }

  addAuthorizedUser(userId, actorId) {
    const normalized = normalizeIdentity(userId);
    if (!normalized || normalized === normalizeIdentity(appConfig.ownerNumber)) {
      return false;
    }

    if (!this.state.authorizedUsers.includes(normalized)) {
      this.state.authorizedUsers.push(normalized);
      this.logAction({
        type: "authorized_add",
        actorId,
        targetId: normalized
      });
      this.save();
    }

    return true;
  }

  removeAuthorizedUser(userId, actorId) {
    const normalized = normalizeIdentity(userId);
    const next = this.state.authorizedUsers.filter((item) => item !== normalized);
    const changed = next.length !== this.state.authorizedUsers.length;
    this.state.authorizedUsers = next;

    if (changed) {
      this.logAction({
        type: "authorized_remove",
        actorId,
        targetId: normalized
      });
      this.save();
    }

    return changed;
  }

  isAuthorizedUser(userId) {
    const normalized = normalizeIdentity(userId);
    return (
      normalized === normalizeIdentity(appConfig.ownerNumber) ||
      this.state.authorizedUsers.includes(normalized)
    );
  }

  addWarning(chatId, userId, actorId, reason) {
    const key = `${chatId}:${normalizeUserId(userId)}`;
    const entry = this.state.warnings[key] || [];
    entry.push({
      actorId: normalizeUserId(actorId),
      reason: reason || "Sebep belirtilmedi.",
      createdAt: nowIso()
    });
    this.state.warnings[key] = entry.slice(-20);
    this.logAction({
      type: "warn",
      actorId,
      targetId: userId,
      chatId,
      reason
    });
    this.save();
    return this.state.warnings[key];
  }

  getWarnings(chatId, userId) {
    const key = `${chatId}:${normalizeUserId(userId)}`;
    return this.state.warnings[key] || [];
  }

  setMute(chatId, userId, actorId, durationMs, reason) {
    const key = `${chatId}:${normalizeUserId(userId)}`;
    this.state.mutes[key] = {
      actorId: normalizeUserId(actorId),
      reason: reason || "Sebep belirtilmedi.",
      createdAt: nowIso(),
      expiresAt: new Date(Date.now() + durationMs).toISOString()
    };
    this.logAction({
      type: "mute",
      actorId,
      targetId: userId,
      chatId,
      reason,
      expiresAt: this.state.mutes[key].expiresAt
    });
    this.save();
    return this.state.mutes[key];
  }

  clearMute(chatId, userId, actorId) {
    const key = `${chatId}:${normalizeUserId(userId)}`;
    const existed = Boolean(this.state.mutes[key]);
    delete this.state.mutes[key];

    if (existed) {
      this.logAction({
        type: "unmute",
        actorId,
        targetId: userId,
        chatId
      });
      this.save();
    }

    return existed;
  }

  getMute(chatId, userId) {
    const key = `${chatId}:${normalizeUserId(userId)}`;
    const mute = this.state.mutes[key];
    if (!mute) {
      return null;
    }

    if (new Date(mute.expiresAt).getTime() <= Date.now()) {
      delete this.state.mutes[key];
      this.save();
      return null;
    }

    return mute;
  }

  getPunishments(chatId, userId) {
    return {
      warnings: this.getWarnings(chatId, userId),
      mute: this.getMute(chatId, userId)
    };
  }

  logAction(action) {
    this.state.logs.unshift({
      ...action,
      createdAt: nowIso()
    });
    this.state.logs = this.state.logs.slice(0, 300);
  }
}

function parseDuration(input) {
  const text = String(input || "").trim().toLowerCase();
  const match = text.match(/^(\d+)\s*(dk|dakika|min|m|saat|sa|h|gun|g)$/i);
  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  const unit = match[2];

  if (["dk", "dakika", "min", "m"].includes(unit)) {
    return amount * 60 * 1000;
  }

  if (["saat", "sa", "h"].includes(unit)) {
    return amount * 60 * 60 * 1000;
  }

  if (["gun", "g"].includes(unit)) {
    return amount * 24 * 60 * 60 * 1000;
  }

  return null;
}

function formatRelativeExpiry(isoDate) {
  const diff = new Date(isoDate).getTime() - Date.now();
  if (diff <= 0) {
    return "suresi dolmus";
  }

  const minutes = Math.ceil(diff / (60 * 1000));
  if (minutes < 60) {
    return `${minutes} dakika`;
  }

  const hours = Math.ceil(minutes / 60);
  if (hours < 24) {
    return `${hours} saat`;
  }

  return `${Math.ceil(hours / 24)} gun`;
}

function getParticipantSerializedId(participant) {
  return participant?.id?._serialized || "";
}

function getParticipantPhone(participant) {
  return normalizePhone(participant?.id?._serialized || participant?.id?.user || "");
}

function findParticipantInChat(chat, userId) {
  const normalized = normalizeIdentity(userId);
  return (chat.participants || []).find(
    (participant) => {
      const serializedId = getParticipantSerializedId(participant);
      const phone = getParticipantPhone(participant);
      return (
        serializedId === userId ||
        normalizeIdentity(serializedId) === normalized ||
        phone === normalized
      );
    }
  );
}

async function getParticipant(chat, userId) {
  return findParticipantInChat(chat, userId);
}

function listAdmins(chat) {
  return (chat.participants || [])
    .filter((participant) => participant.isAdmin || participant.isSuperAdmin)
    .map((participant) => normalizePhone(participant.id?._serialized || participant.id?.user || ""));
}

async function resolveTargetUserId(message) {
  const chat = await message.getChat();

  if (Array.isArray(message.mentionedIds) && message.mentionedIds.length) {
    const matchedParticipant = await getParticipant(chat, message.mentionedIds[0]);
    if (matchedParticipant) {
      return getParticipantSerializedId(matchedParticipant);
    }
    return message.mentionedIds[0];
  }

  if (typeof message.getMentions === "function") {
    const mentions = await message.getMentions();
    if (Array.isArray(mentions) && mentions.length) {
      const mentionId =
        mentions[0]?.id?._serialized || mentions[0]?.id?.user || mentions[0]?.serialized || "";
      const matchedParticipant = await getParticipant(chat, mentionId);
      if (matchedParticipant) {
        return getParticipantSerializedId(matchedParticipant);
      }
      if (mentionId) {
        return mentionId;
      }
    }
  }

  if (message.hasQuotedMsg) {
    const quoted = await message.getQuotedMessage();
    return quoted.author || quoted.from;
  }

  const numberMatch = String(message.body || "").match(/@?(\d{8,16})/);
  if (numberMatch) {
    const matchedParticipant = await getParticipant(chat, numberMatch[1]);
    if (matchedParticipant) {
      return getParticipantSerializedId(matchedParticipant);
    }
  }

  return "";
}

async function resolveTargetParticipant(message) {
  const chat = await message.getChat();
  const targetId = await resolveTargetUserId(message);
  if (!targetId) {
    return { targetId: "", participant: null };
  }

  const participant = findParticipantInChat(chat, targetId);
  if (participant) {
    return {
      targetId: getParticipantSerializedId(participant),
      participant
    };
  }

  return {
    targetId,
    participant: null
  };
}

async function isGroupAdmin(chat, userId) {
  const participant = await getParticipant(chat, userId);
  return Boolean(participant && (participant.isAdmin || participant.isSuperAdmin));
}

async function isBotAdmin(client, chat) {
  const currentUser = client.info?.wid?._serialized;
  if (!currentUser) {
    return false;
  }

  return isGroupAdmin(chat, currentUser);
}

function isOwner(userId) {
  return normalizeIdentity(userId) === normalizeIdentity(appConfig.ownerNumber);
}

function isConfiguredAdmin(userId) {
  const phone = normalizePhone(userId);
  return appConfig.adminNumbers.includes(phone);
}

function isAllowedGroup(chat) {
  const hasGroupRestriction =
    appConfig.allowedGroupIds.length > 0 || appConfig.allowedGroupNames.length > 0;

  if (!hasGroupRestriction) {
    return true;
  }

  const groupId = chat.id?._serialized || "";
  const groupName = String(chat.name || "").trim().toLowerCase();

  return (
    appConfig.allowedGroupIds.includes(groupId) ||
    appConfig.allowedGroupNames.includes(groupName)
  );
}

async function hasCommandAccess(message, chat, state) {
  const senderId = message.author || message.from;
  if (isOwner(senderId) || isConfiguredAdmin(senderId) || state.isAuthorizedUser(senderId)) {
    return true;
  }

  return isGroupAdmin(chat, senderId);
}

function buildHelpMessage() {
  return [
    `*${appConfig.botName} Komutlari*`,
    `${appConfig.commandPrefix}yardim`,
    `${appConfig.commandPrefix}owner`,
    `${appConfig.commandPrefix}durum`,
    `${appConfig.commandPrefix}kurallar`,
    `${appConfig.commandPrefix}adminler`,
    `${appConfig.commandPrefix}kim @kullanici`,
    `${appConfig.commandPrefix}kimim`,
    `${appConfig.commandPrefix}rolum`,
    `${appConfig.commandPrefix}uyar @kullanici sebep`,
    `${appConfig.commandPrefix}sustur @kullanici 30dk sebep`,
    `${appConfig.commandPrefix}ac @kullanici`,
    `${appConfig.commandPrefix}ban @kullanici sebep`,
    `${appConfig.commandPrefix}cezalar @kullanici`,
    `${appConfig.commandPrefix}adminekle @kullanici`,
    `${appConfig.commandPrefix}adminsil @kullanici`,
    `${appConfig.commandPrefix}botadminler`,
    `${appConfig.commandPrefix}yetkiliekle @kullanici`,
    `${appConfig.commandPrefix}yetkilisil @kullanici`,
    `${appConfig.commandPrefix}yetkililer`,
    `${appConfig.commandPrefix}grupbilgi`,
    `${appConfig.commandPrefix}yenidenbaslat`
  ].join("\n");
}

function buildOwnerMessage() {
  return [
    `Bot: ${appConfig.botName}`,
    `Sahip: ${appConfig.ownerName}`,
    `Numara: +${appConfig.ownerNumber}`
  ].join("\n");
}

function buildRulesMessage() {
  return [
    "*Grup Kurallari*",
    "1. Saygili olun, hakaret ve kufur kullanmayin.",
    "2. Spam, flood ve tekrar eden ilanlar paylasmayin.",
    "3. Dolandiricilik supheli paylasimlar adminlere bildirilecektir.",
    "4. Admin kararlarina itiraz varsa ozelden sakince iletin."
  ].join("\n");
}

async function handlePrivateMessage(message) {
  const rawText = (message.body || "").trim();
  const text = rawText.toLowerCase();

  if (!appConfig.privateAutoReply && !text.startsWith(appConfig.commandPrefix) && text !== "yardim") {
    return;
  }

  if (!text.startsWith(appConfig.commandPrefix) && text !== "yardim") {
    await message.reply(
      [
        `${appConfig.botName} aktif.`,
        "Bu bot ozelden sohbet baslatmaz.",
        `Komutlari gormek icin ${appConfig.commandPrefix}yardim yazabilirsin.`
      ].join("\n")
    );
    return;
  }

  const normalized = text.startsWith(appConfig.commandPrefix)
    ? text.slice(appConfig.commandPrefix.length)
    : text;

  if (["yardim", "help"].includes(normalized)) {
    await message.reply(buildHelpMessage());
    return;
  }

  if (normalized === "owner") {
    await message.reply(buildOwnerMessage());
    return;
  }

  if (normalized === "kurallar") {
    await message.reply(buildRulesMessage());
    return;
  }

  await message.reply(`Komutlari gormek icin ${appConfig.commandPrefix}yardim kullan.`);
}

function parseCommand(body) {
  const text = String(body || "").trim();
  if (!text.startsWith(appConfig.commandPrefix)) {
    return null;
  }

  const withoutPrefix = text.slice(appConfig.commandPrefix.length).trim();
  if (!withoutPrefix) {
    return null;
  }

  const [command, ...args] = withoutPrefix.split(/\s+/);
  return {
    command: command.toLowerCase(),
    args
  };
}

function formatUserTag(userId) {
  return `+${normalizePhone(userId)}`;
}

async function guardTarget(chat, targetId) {
  if (!targetId) {
    return "Bir kullanici etiketle veya mesajina yanit ver.";
  }

  const participant = await getParticipant(chat, targetId);
  if (!participant) {
    return "Hedef kullanici grupta bulunamadi.";
  }

  if (isOwner(targetId)) {
    return "Owner uzerinde islem yapilamaz.";
  }

  if (participant.isAdmin || participant.isSuperAdmin) {
    return "Grup adminleri uzerinde bu komut kullanilamaz.";
  }

  return "";
}

async function guardResolvedTarget(chat, resolvedTarget) {
  if (!resolvedTarget.targetId) {
    return "Bir kullanici etiketle veya mesajina yanit ver.";
  }

  const participant = resolvedTarget.participant || (await getParticipant(chat, resolvedTarget.targetId));

  if (isOwner(resolvedTarget.targetId)) {
    return "Owner uzerinde islem yapilamaz.";
  }

  if (participant && (participant.isAdmin || participant.isSuperAdmin)) {
    return "Grup adminleri uzerinde bu komut kullanilamaz.";
  }

  return "";
}

async function handleCommand(client, message, state, actions = {}) {
  const commandData = parseCommand(message.body);
  if (!commandData) {
    return;
  }

  const chat = await message.getChat();
  const senderId = message.author || message.from;
  const isGroupChat = Boolean(chat.isGroup);
  const commandText = String(message.body || "");
  const tail = commandText
    .slice(appConfig.commandPrefix.length + commandData.command.length)
    .trim();

  const allowed = isGroupChat ? await hasCommandAccess(message, chat, state) : true;

  if (!allowed) {
    return;
  }

  if (commandData.command === "yardim") {
    await message.reply(buildHelpMessage());
    return;
  }

  if (commandData.command === "owner") {
    await message.reply(buildOwnerMessage());
    return;
  }

  if (commandData.command === "durum") {
    const botAdmin = await isBotAdmin(client, chat);
    const adminCount = listAdmins(chat).length;
    await message.reply(
      [
        `${appConfig.botName} aktif.`,
        `Grup: ${chat.name}`,
        `Bot admin: ${botAdmin ? "evet" : "hayir"}`,
        `Admin sayisi: ${adminCount}`,
        `Ek yetkili sayisi: ${state.state.authorizedUsers.length}`
      ].join("\n")
    );
    return;
  }

  if (commandData.command === "kurallar") {
    await message.reply(buildRulesMessage());
    return;
  }

  if (commandData.command === "adminler") {
    const admins = listAdmins(chat).map((user) => `+${user}`);
    await message.reply(
      admins.length ? `Grup adminleri:\n${admins.join("\n")}` : "Bu grupta admin bilgisi alinamadi."
    );
    return;
  }

  if (commandData.command === "kim") {
    const resolvedTarget = await resolveTargetParticipant(message);
    const targetId = resolvedTarget.targetId;
    if (!targetId) {
      await message.reply("Kullanim: !kim @kullanici");
      return;
    }

    const targetIsGroupAdmin = await isGroupAdmin(chat, targetId);
    const targetIsOwner = isOwner(targetId);
    const targetIsConfiguredAdmin = isConfiguredAdmin(targetId);
    const targetIsAuthorized = state.isAuthorizedUser(targetId);

    let role = "normal uye";
    if (targetIsOwner) {
      role = "owner";
    } else if (targetIsGroupAdmin) {
      role = "grup admini";
    } else if (targetIsAuthorized || targetIsConfiguredAdmin) {
      role = "bot yetkilisi";
    }

    await message.reply(
      [
        `Kullanici: +${normalizePhone(targetId)}`,
        `WhatsApp ID: ${targetId}`,
        `Rol: ${role}`,
        `Owner mi: ${targetIsOwner ? "evet" : "hayir"}`,
        `Grup admini mi: ${targetIsGroupAdmin ? "evet" : "hayir"}`,
        `Bot yetkilisi mi: ${targetIsAuthorized || targetIsConfiguredAdmin ? "evet" : "hayir"}`
      ].join("\n")
    );
    return;
  }

  if (commandData.command === "kimim" || commandData.command === "rolum") {
    const isGroupAdminValue = await isGroupAdmin(chat, senderId);
    const isOwnerValue = isOwner(senderId);
    const isConfiguredAdminValue = isConfiguredAdmin(senderId);
    const isAuthorizedValue = state.isAuthorizedUser(senderId);

    let role = "normal uye";
    if (isOwnerValue) {
      role = "owner";
    } else if (isGroupAdminValue) {
      role = "grup admini";
    } else if (isAuthorizedValue || isConfiguredAdminValue) {
      role = "bot yetkilisi";
    }

    await message.reply(
      [
        `Numaran: +${normalizePhone(senderId)}`,
        `WhatsApp ID: ${senderId}`,
        `Rol: ${role}`,
        `Owner mi: ${isOwnerValue ? "evet" : "hayir"}`,
        `Grup admini mi: ${isGroupAdminValue ? "evet" : "hayir"}`,
        `Bot yetkilisi mi: ${isAuthorizedValue || isConfiguredAdminValue ? "evet" : "hayir"}`,
        `Izinli grup mu: ${isAllowedGroup(chat) ? "evet" : "hayir"}`
      ].join("\n")
    );
    return;
  }

  if (commandData.command === "adminekle" || commandData.command === "yetkiliekle") {
    if (!isOwner(senderId)) {
      await message.reply("Bu komutu sadece bot sahibi kullanabilir.");
      return;
    }

    const resolvedTarget = await resolveTargetParticipant(message);
    const targetId = resolvedTarget.targetId;
    const error = await guardResolvedTarget(chat, resolvedTarget);
    if (error) {
      await message.reply(error);
      return;
    }

    state.addAuthorizedUser(targetId, senderId);
    await message.reply(`${formatUserTag(targetId)} bot admini olarak eklendi.`);
    return;
  }

  if (commandData.command === "adminsil" || commandData.command === "yetkilisil") {
    if (!isOwner(senderId)) {
      await message.reply("Bu komutu sadece bot sahibi kullanabilir.");
      return;
    }

    const resolvedTarget = await resolveTargetParticipant(message);
    const targetId = resolvedTarget.targetId;
    if (!targetId) {
      await message.reply("Bir kullanici etiketle veya mesajina yanit ver.");
      return;
    }

    const removed = state.removeAuthorizedUser(targetId, senderId);
    await message.reply(
      removed
        ? `${formatUserTag(targetId)} bot adminliginden cikarildi.`
        : "Bu kullanici zaten bot admin listesinde degildi."
    );
    return;
  }

  if (commandData.command === "botadminler" || commandData.command === "yetkililer") {
    const lines = state.state.authorizedUsers.map((userId) => `+${userId}`);
    await message.reply(
      lines.length ? `Bot adminleri:\n${lines.join("\n")}` : "Ek bot admini bulunmuyor."
    );
    return;
  }

  if (commandData.command === "grupbilgi") {
    await message.reply(
      [
        `Grup adi: ${chat.name}`,
        `Grup ID: ${chat.id._serialized}`,
        `Izinli grup: ${isAllowedGroup(chat) ? "evet" : "hayir"}`
      ].join("\n")
    );
    return;
  }

  if (commandData.command === "yenidenbaslat") {
    if (!isOwner(senderId)) {
      await message.reply("Bu komutu sadece bot sahibi kullanabilir.");
      return;
    }

    await message.reply("Bot yeniden baslatiliyor...");
    if (typeof actions.restartClient === "function") {
      setTimeout(() => {
        actions.restartClient().catch((error) => {
          console.error("Bot yeniden baslatilamadi:", error);
        });
      }, 500);
    }
    return;
  }

  if (commandData.command === "uyar") {
    const resolvedTarget = await resolveTargetParticipant(message);
    const targetId = resolvedTarget.targetId;
    const error = await guardResolvedTarget(chat, resolvedTarget);
    if (error) {
      await message.reply(error);
      return;
    }

    const reason = tail.replace(/@\d+/g, "").trim() || "Sebep belirtilmedi.";
    const warnings = state.addWarning(chat.id._serialized, targetId, senderId, reason);
    await message.reply(
      `${formatUserTag(targetId)} uyarildi.\nSebep: ${reason}\nToplam uyari: ${warnings.length}`
    );
    return;
  }

  if (commandData.command === "sustur") {
    const resolvedTarget = await resolveTargetParticipant(message);
    const targetId = resolvedTarget.targetId;
    const error = await guardResolvedTarget(chat, resolvedTarget);
    if (error) {
      await message.reply(error);
      return;
    }

    const argsWithoutMention = commandData.args.filter((arg) => !arg.startsWith("@"));
    const durationInput = argsWithoutMention[0];
    const durationMs = parseDuration(durationInput);
    if (!durationMs) {
      await message.reply("Kullanim: !sustur @kullanici 30dk sebep");
      return;
    }

    const reason = argsWithoutMention.slice(1).join(" ").trim() || "Sebep belirtilmedi.";
    const mute = state.setMute(chat.id._serialized, targetId, senderId, durationMs, reason);
    await message.reply(
      `${formatUserTag(targetId)} susturuldu.\nSure: ${formatRelativeExpiry(
        mute.expiresAt
      )}\nSebep: ${reason}`
    );
    return;
  }

  if (commandData.command === "ac") {
    const resolvedTarget = await resolveTargetParticipant(message);
    const targetId = resolvedTarget.targetId;
    if (!targetId) {
      await message.reply("Bir kullanici etiketle veya mesajina yanit ver.");
      return;
    }

    const changed = state.clearMute(chat.id._serialized, targetId, senderId);
    await message.reply(
      changed
        ? `${formatUserTag(targetId)} icin susturma kaldirildi.`
        : "Bu kullanici zaten susturulmamis."
    );
    return;
  }

  if (commandData.command === "cezalar") {
    const resolvedTarget = await resolveTargetParticipant(message);
    const targetId = resolvedTarget.targetId || senderId;
    const punishments = state.getPunishments(chat.id._serialized, targetId);
    const warningCount = punishments.warnings.length;
    const muteLine = punishments.mute
      ? `Susturma: aktif (${formatRelativeExpiry(punishments.mute.expiresAt)})`
      : "Susturma: aktif degil";

    await message.reply(
      [
        `${formatUserTag(targetId)} icin kayitli cezalar:`,
        `Uyari sayisi: ${warningCount}`,
        muteLine
      ].join("\n")
    );
    return;
  }

  if (commandData.command === "ban") {
    const resolvedTarget = await resolveTargetParticipant(message);
    const targetId = resolvedTarget.targetId;
    const error = await guardResolvedTarget(chat, resolvedTarget);
    if (error) {
      await message.reply(error);
      return;
    }

    const botAdmin = await isBotAdmin(client, chat);
    if (!botAdmin) {
      await message.reply("Ban islemi icin botun bu grupta admin olmasi gerekir.");
      return;
    }

    const reason = tail.replace(/@\d+/g, "").trim() || "Sebep belirtilmedi.";
    try {
      await chat.removeParticipants([targetId]);
      state.logAction({
        type: "ban",
        actorId: senderId,
        targetId,
        chatId: chat.id._serialized,
        reason
      });
      state.save();
      await message.reply(`${formatUserTag(targetId)} gruptan cikarildi.\nSebep: ${reason}`);
    } catch (errorBan) {
      await message.reply(`Ban islemi basarisiz oldu: ${errorBan.message}`);
    }
  }
}

async function enforceMute(message, state) {
  const chat = await message.getChat();
  if (!chat.isGroup) {
    return false;
  }

  const senderId = message.author || message.from;
  const mute = state.getMute(chat.id._serialized, senderId);
  if (!mute) {
    return false;
  }

  try {
    await message.delete(true);
  } catch (_error) {
    return false;
  }

  await chat.sendMessage(
    `${formatUserTag(senderId)} susturulmus durumda. Kalan sure: ${formatRelativeExpiry(
      mute.expiresAt
    )}`
  );
  return true;
}

async function handleIncomingMessage(client, message, state, actions = {}) {
  if (message.fromMe) {
    return;
  }

  const chat = await message.getChat();

  if (!chat.isGroup) {
    await handlePrivateMessage(message);
    return;
  }

  if (!isAllowedGroup(chat)) {
    return;
  }

  if (await enforceMute(message, state)) {
    return;
  }

  const command = parseCommand(message.body);
  if (!command) {
    return;
  }

  await handleCommand(client, message, state, actions);
}

module.exports = {
  BotState,
  handleIncomingMessage
};
