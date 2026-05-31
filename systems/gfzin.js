const { 
  EmbedBuilder, 
  AuditLogEvent, 
  PermissionFlagsBits,
  Colors,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const fs = require("fs");
const express = require("express");
const afkTimers = new Map();
const pendingAfkChecks = new Map();

const AFK_CHANNEL_ID = "1476321423042543706";
const AFK_TIME = 10 * 60 * 1000;

module.exports = (client) => {

class LoggerPro {
  constructor() {
    this.STATIC_LOGS = {
      "1403143110694932570": "1484934763939631165",
      "705954733742882907": "1479261311635554435",
      "1484725561002561597": "1484936001947308163"
    };

    this.COLORS = {
      success: 0x22c55e,
      error: 0xef4444,
      warning: 0xf59e0b,
      info: 0x3b82f6,
      voice: 0x8b5cf6,
      premium: 0x5865F2
    };

    this.cooldowns = new Map();
    this.logChannels = new Map();
    this.customLogs = new Map();
    this.stats = new Map();
    this.whitelist = new Set();

    this.init();
  }

  init() {
    this.loadCustomLogs();
    console.log("🚀 Logger PRO ULTRA carregado");
  }

  loadCustomLogs() {
    if (fs.existsSync("./logs.json")) {
      const data = JSON.parse(fs.readFileSync("./logs.json"));
      Object.entries(data).forEach(([g, c]) => {
        this.customLogs.set(g, c);
      });
    }
  }

  saveCustomLogs() {
    fs.writeFileSync("./logs.json", JSON.stringify(
      Object.fromEntries(this.customLogs), null, 2
    ));
  }

  getLogChannel(guildId) {
    let channelId = this.STATIC_LOGS[guildId] || this.customLogs.get(guildId);
    if (!channelId) return null;

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return null;

    return guild.channels.cache.get(channelId);
  }

  async getExecutor(guild, type, targetId) {
    try {
      const logs = await guild.fetchAuditLogs({ limit: 5, type });
      const entry = logs.entries.find(e => e.target?.id === targetId);
      return entry?.executor || null;
    } catch {
      return null;
    }
  }

  
  createEmbed({
    title,
    color,
    user,
    executor,
    reason,
    fields = [],
    footerExtra = ""
  }) {
    const embed = new EmbedBuilder()
      .setColor(color || this.COLORS.premium)
      .setTitle(title)
      .setTimestamp();

    if (user) {
      embed
        .setAuthor({
          name: `${user.tag}`,
          iconURL: user.displayAvatarURL({ dynamic: true })
        })
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: "👤 Usuário", value: `<@${user.id}>`, inline: true },
          { name: "🆔 ID", value: `\`${user.id}\``, inline: true },
          { name: "📛 Tag", value: `\`${user.tag}\``, inline: true }
        );
    }

    if (executor) {
      embed.addFields({
        name: "🛠️ Executor",
        value: `<@${executor.id}> (\`${executor.tag}\`)`,
        inline: false
      });
    }

    if (reason) {
      embed.addFields({
        name: "📄 Motivo",
        value: reason,
        inline: false
      });
    }

    if (fields.length > 0) embed.addFields(fields);

    embed.setFooter({
      text: `Logger PRO ULTRA ${footerExtra}`
    });

    return embed;
  }

  async sendLog(guildId, embed, components = null) {
    const channel = this.getLogChannel(guildId);
    if (!channel) return;

    const stats = this.stats.get(guildId) || { total: 0 };
    stats.total++;
    this.stats.set(guildId, stats);

    channel.send({
      embeds: [embed],
      components: components ? [components] : []
    }).catch(() => {});
  }
}

const logger = new LoggerPro();

function resetAfkTimer(member, voiceState) {
  if (!member || !voiceState?.channelId) return;

  if (afkTimers.has(member.id)) {
    clearTimeout(afkTimers.get(member.id));
  }

  if (voiceState.channelId === AFK_CHANNEL_ID) return;

  const timer = setTimeout(async () => {
    try {
      const guild = voiceState.guild;
      const freshMember = await guild.members.fetch(member.id).catch(() => null);
      if (!freshMember?.voice?.channelId) return;

      if (freshMember.voice.channelId === AFK_CHANNEL_ID) return;

      const alreadyPending = pendingAfkChecks.get(freshMember.id);
      if (alreadyPending) return;

      pendingAfkChecks.set(freshMember.id, {
        guildId: guild.id,
        userId: freshMember.id,
        voiceChannelId: freshMember.voice.channelId,
        createdAt: Date.now()
      });

      const embed = new EmbedBuilder()
        .setColor(0xf59e0b)
        .setTitle("💤 Possível AFK Detectado")
        .setThumbnail(freshMember.user.displayAvatarURL({ dynamic: true }))
        .setDescription(`⚠️ **${freshMember.user.tag}** está há mais de **5 minutos sem atividade detectável** na call.`)
        .addFields(
          { name: "👤 Usuário", value: `<@${freshMember.id}>`, inline: true },
          { name: "🆔 ID", value: `\`${freshMember.id}\``, inline: true },
          { name: "📢 Canal Atual", value: freshMember.voice.channel?.toString() || "Desconhecido", inline: true },
          { name: "📌 Ação", value: "Deseja mover este membro para o canal AFK?", inline: false }
        )
        .setFooter({ text: "Logger PRO ULTRA • Confirmação de AFK" })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`afk_yes_${freshMember.id}`)
          .setLabel("Sim, mover")
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId(`afk_no_${freshMember.id}`)
          .setLabel("Não mover")
          .setStyle(ButtonStyle.Danger)
      );

      await logger.sendLog(guild.id, embed, row);
      afkTimers.delete(member.id);
    } catch (err) {
      console.log("Erro no sistema AFK:", err.message);
    }
  }, AFK_TIME);

  afkTimers.set(member.id, timer);
}



client.on("voiceStateUpdate", async (oldState, newState) => {
  const member = newState.member || oldState.member;
  if (!member) return;

  const guild = newState.guild;

  const getExecutor = async (type) => {
    try {
      const logs = await guild.fetchAuditLogs({ limit: 5, type });
      const entry = logs.entries.find(e =>
        e.target?.id === member.id &&
        Date.now() - e.createdTimestamp < 10000
      );
      return entry?.executor || null;
    } catch {
      return null;
    }
  };

  const channelNow = newState.channelId;
  const wasInVoice = !!oldState.channelId;
  const isInVoice = !!newState.channelId;

  
  if (isInVoice && channelNow !== AFK_CHANNEL_ID) {
    const changedActivity =
      oldState.channelId !== newState.channelId ||
      oldState.selfMute !== newState.selfMute ||
      oldState.selfDeaf !== newState.selfDeaf ||
      oldState.serverMute !== newState.serverMute ||
      oldState.serverDeaf !== newState.serverDeaf ||
      oldState.selfVideo !== newState.selfVideo ||
      oldState.streaming !== newState.streaming;

    if (changedActivity) {
      resetAfkTimer(member, newState);
    }
  }

  if (!isInVoice || channelNow === AFK_CHANNEL_ID) {
  if (afkTimers.has(member.id)) {
    clearTimeout(afkTimers.get(member.id));
    afkTimers.delete(member.id);
  }

  if (pendingAfkChecks.has(member.id)) {
    pendingAfkChecks.delete(member.id);
  }
}

  
  if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
    const executor = await getExecutor(AuditLogEvent.MemberMove);

    const embed = new EmbedBuilder()
      .setColor(0x8b5cf6)
      .setTitle("🎯 Movimento de Voz")
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .setDescription(
        executor
          ? `👑 <@${executor.id}> moveu **${member.user.tag}**`
          : `🔊 ${member.user.tag} mudou de canal sozinho`
      )
      .addFields(
        { name: "👤 Usuário", value: `<@${member.id}>`, inline: true },
        { name: "🆔 ID", value: member.id, inline: true },
        { name: "📤 Saiu de", value: oldState.channel?.toString() || "Desconhecido", inline: true },
        { name: "📥 Entrou em", value: newState.channel?.toString() || "Desconhecido", inline: true }
      )
      .setTimestamp();

    return logger.sendLog(guild.id, embed);
  }

  
  if (!wasInVoice && isInVoice) {
    resetAfkTimer(member, newState);

    const embed = new EmbedBuilder()
      .setColor(0x22c55e)
      .setTitle("🎧 Entrou na call")
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .setDescription(`🔥 **${member.user.tag} entrou na call**`)
      .addFields(
        { name: "👤 Usuário", value: `<@${member.id}>`, inline: true },
        { name: "🆔 ID", value: member.id, inline: true },
        { name: "📢 Canal", value: newState.channel.toString(), inline: true }
      )
      .setTimestamp();

    return logger.sendLog(guild.id, embed);
  }

  
  if (wasInVoice && !isInVoice) {
    if (afkTimers.has(member.id)) {
      clearTimeout(afkTimers.get(member.id));
      afkTimers.delete(member.id);
    }

    const embed = new EmbedBuilder()
      .setColor(0xf59e0b)
      .setTitle("📤 Saiu da call")
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .setDescription(`😴 **${member.user.tag} saiu da call**`)
      .addFields(
        { name: "👤 Usuário", value: `<@${member.id}>`, inline: true },
        { name: "🆔 ID", value: member.id, inline: true },
        { name: "📢 Canal", value: oldState.channel?.toString() || "Desconhecido", inline: true }
      )
      .setTimestamp();

    return logger.sendLog(guild.id, embed);
  }

  
  if (oldState.serverMute !== newState.serverMute) {
    const executor = await getExecutor(AuditLogEvent.MemberUpdate);

    const embed = new EmbedBuilder()
      .setColor(newState.serverMute ? 0xef4444 : 0x22c55e)
      .setTitle(newState.serverMute ? "🔇 Membro Mutado" : "🔊 Membro Desmutado")
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .setDescription(
        newState.serverMute
          ? `🔇 **${member.user.tag}** foi mutado no servidor`
          : `🔊 **${member.user.tag}** foi desmutado no servidor`
      )
      .addFields(
        { name: "👤 Usuário", value: `<@${member.id}>`, inline: true },
        { name: "🆔 ID", value: member.id, inline: true },
        { name: "📢 Canal", value: newState.channel?.toString() || oldState.channel?.toString() || "Desconhecido", inline: true },
        { name: "🛠️ Executor", value: executor ? `<@${executor.id}>` : "Desconhecido", inline: false }
      )
      .setTimestamp();

    return logger.sendLog(guild.id, embed);
  }

  
  if (oldState.serverDeaf !== newState.serverDeaf) {
    const executor = await getExecutor(AuditLogEvent.MemberUpdate);

    const embed = new EmbedBuilder()
      .setColor(newState.serverDeaf ? 0xef4444 : 0x22c55e)
      .setTitle(newState.serverDeaf ? "🔕 Membro Ensurdecido" : "🎧 Ensurdecimento Removido")
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .setDescription(
        newState.serverDeaf
          ? `🔕 **${member.user.tag}** foi ensurdecido no servidor`
          : `🎧 **${member.user.tag}** voltou a ouvir no servidor`
      )
      .addFields(
        { name: "👤 Usuário", value: `<@${member.id}>`, inline: true },
        { name: "🆔 ID", value: member.id, inline: true },
        { name: "📢 Canal", value: newState.channel?.toString() || oldState.channel?.toString() || "Desconhecido", inline: true },
        { name: "🛠️ Executor", value: executor ? `<@${executor.id}>` : "Desconhecido", inline: false }
      )
      .setTimestamp();

    return logger.sendLog(guild.id, embed);
  }

  
  if (oldState.selfMute !== newState.selfMute) {
    const embed = new EmbedBuilder()
      .setColor(newState.selfMute ? 0xf59e0b : 0x22c55e)
      .setTitle(newState.selfMute ? "🎙️ Microfone Desligado" : "🎙️ Microfone Ligado")
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .setDescription(
        newState.selfMute
          ? `🔇 **${member.user.tag}** se mutou`
          : `🔊 **${member.user.tag}** se desmutou`
      )
      .addFields(
        { name: "👤 Usuário", value: `<@${member.id}>`, inline: true },
        { name: "📢 Canal", value: newState.channel?.toString() || oldState.channel?.toString() || "Desconhecido", inline: true }
      )
      .setTimestamp();

    return logger.sendLog(guild.id, embed);
  }

  
  if (oldState.selfDeaf !== newState.selfDeaf) {
    const embed = new EmbedBuilder()
      .setColor(newState.selfDeaf ? 0xf59e0b : 0x22c55e)
      .setTitle(newState.selfDeaf ? "🎧 Auto-Ensurdeceu" : "🎧 Auto-Ensurdecimento Removido")
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .setDescription(
        newState.selfDeaf
          ? `🔕 **${member.user.tag}** se ensurdeceu`
          : `🔊 **${member.user.tag}** voltou a ouvir`
      )
      .addFields(
        { name: "👤 Usuário", value: `<@${member.id}>`, inline: true },
        { name: "📢 Canal", value: newState.channel?.toString() || oldState.channel?.toString() || "Desconhecido", inline: true }
      )
      .setTimestamp();

    return logger.sendLog(guild.id, embed);
  }

  
  if (oldState.streaming !== newState.streaming) {
    const embed = new EmbedBuilder()
      .setColor(newState.streaming ? 0x5865F2 : 0xf59e0b)
      .setTitle(newState.streaming ? "📺 Iniciou Stream" : "🛑 Finalizou Stream")
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .setDescription(
        newState.streaming
          ? `📺 **${member.user.tag}** iniciou uma transmissão`
          : `🛑 **${member.user.tag}** encerrou a transmissão`
      )
      .addFields(
        { name: "👤 Usuário", value: `<@${member.id}>`, inline: true },
        { name: "📢 Canal", value: newState.channel?.toString() || oldState.channel?.toString() || "Desconhecido", inline: true }
      )
      .setTimestamp();

    return logger.sendLog(guild.id, embed);
  }

  
  if (oldState.selfVideo !== newState.selfVideo) {
    const embed = new EmbedBuilder()
      .setColor(newState.selfVideo ? 0x3b82f6 : 0xf59e0b)
      .setTitle(newState.selfVideo ? "📷 Câmera Ligada" : "📷 Câmera Desligada")
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .setDescription(
        newState.selfVideo
          ? `📷 **${member.user.tag}** ligou a câmera`
          : `📷 **${member.user.tag}** desligou a câmera`
      )
      .addFields(
        { name: "👤 Usuário", value: `<@${member.id}>`, inline: true },
        { name: "📢 Canal", value: newState.channel?.toString() || oldState.channel?.toString() || "Desconhecido", inline: true }
      )
      .setTimestamp();

    return logger.sendLog(guild.id, embed);
  }
});




client.on("guildBanAdd", async (ban) => {
  const guild = ban.guild;
  const user = ban.user;

  const executor = await logger.getExecutor(guild, AuditLogEvent.MemberBanAdd, user.id);

  const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 });
  const reason = logs.entries.first()?.reason || "Não especificado";

  const embed = logger.createEmbed({
    title: "🔨 Usuário Banido",
    color: logger.COLORS.error,
    user,
    executor,
    reason
  });

  logger.sendLog(guild.id, embed);
});


client.on("guildBanRemove", async (ban) => {
  const guild = ban.guild;
  const user = ban.user;

  const executor = await logger.getExecutor(guild, AuditLogEvent.MemberBanRemove, user.id);

  const embed = logger.createEmbed({
    title: "🔓 Ban Removido",
    color: logger.COLORS.success,
    user,
    executor
  });

  logger.sendLog(guild.id, embed);
});




client.on("guildMemberUpdate", async (oldMember, newMember) => {
  const guild = newMember.guild;
  const user = newMember.user;

 
  if (oldMember.nickname !== newMember.nickname) {
    let executor = null;

    try {
      const logs = await guild.fetchAuditLogs({
        type: AuditLogEvent.MemberUpdate,
        limit: 5
      });

      const entry = logs.entries.find(e =>
        e.target?.id === user.id &&
        Date.now() - e.createdTimestamp < 10000
      );

      executor = entry?.executor || null;
    } catch {}

    const embed = logger.createEmbed({
      title: "✏️ Apelido Alterado",
      color: logger.COLORS.info,
      user,
      executor,
      fields: [
        { name: "Antes", value: oldMember.nickname || "Nenhum", inline: true },
        { name: "Depois", value: newMember.nickname || "Nenhum", inline: true }
      ]
    });

    logger.sendLog(guild.id, embed);
  }

  
  const addedRoles = newMember.roles.cache.filter(
    r => !oldMember.roles.cache.has(r.id) && r.id !== guild.id
  );

  const removedRoles = oldMember.roles.cache.filter(
    r => !newMember.roles.cache.has(r.id) && r.id !== guild.id
  );

  if (addedRoles.size > 0) {
    const executor = await logger.getExecutor(
      guild,
      AuditLogEvent.MemberRoleUpdate,
      user.id
    );

    const embed = logger.createEmbed({
      title: "🟢 Cargo Adicionado",
      color: logger.COLORS.success,
      user,
      executor,
      fields: [
        {
          name: "Cargos",
          value: addedRoles.map(r => `<@&${r.id}>`).join(", ")
        }
      ]
    });

    logger.sendLog(guild.id, embed);
  }

  if (removedRoles.size > 0) {
    const executor = await logger.getExecutor(
      guild,
      AuditLogEvent.MemberRoleUpdate,
      user.id
    );

    const embed = logger.createEmbed({
      title: "🔴 Cargo Removido",
      color: logger.COLORS.error,
      user,
      executor,
      fields: [
        {
          name: "Cargos",
          value: removedRoles.map(r => `<@&${r.id}>`).join(", ")
        }
      ]
    });

    logger.sendLog(guild.id, embed);
  }

  
  if (oldMember.communicationDisabledUntilTimestamp !== newMember.communicationDisabledUntilTimestamp) {
    let executor = null;

    try {
      const logs = await guild.fetchAuditLogs({
        type: AuditLogEvent.MemberUpdate,
        limit: 5
      });

      const entry = logs.entries.find(e =>
        e.target?.id === user.id &&
        Date.now() - e.createdTimestamp < 10000
      );

      executor = entry?.executor || null;
    } catch {}

    const isTimedOut = newMember.communicationDisabledUntilTimestamp &&
      newMember.communicationDisabledUntilTimestamp > Date.now();

    const embed = logger.createEmbed({
      title: isTimedOut ? "⏳ Membro Silenciado (Timeout)" : "🔓 Timeout Removido",
      color: isTimedOut ? logger.COLORS.warning : logger.COLORS.success,
      user,
      executor,
      fields: [
        {
          name: "Status",
          value: isTimedOut
            ? `Até <t:${Math.floor(newMember.communicationDisabledUntilTimestamp / 1000)}:F>`
            : "Timeout removido",
          inline: false
        }
      ]
    });

    logger.sendLog(guild.id, embed);
  }
});




client.on("guildMemberAdd", async (member) => {
  const user = member.user;

  const embed = logger.createEmbed({
    title: "👋 Novo Membro",
    color: logger.COLORS.success,
    user,
    fields: [
      { name: "📊 Total", value: `${member.guild.memberCount}`, inline: true }
    ]
  });

  logger.sendLog(member.guild.id, embed);
});


client.on("guildMemberRemove", async (member) => {
  const user = member.user;

  const embed = logger.createEmbed({
    title: "🚪 Membro Saiu",
    color: logger.COLORS.error,
    user,
    fields: [
      { name: "📊 Total", value: `${member.guild.memberCount}`, inline: true }
    ]
  });

  logger.sendLog(member.guild.id, embed);
});



client.on("messageDelete", async (msg) => {
  if (!msg.guild || msg.author?.bot) return;
  if (logger.whitelist.has(msg.author.id)) return;

  const user = msg.author;

  const embed = logger.createEmbed({
    title: "🗑️ Mensagem Deletada",
    color: logger.COLORS.error,
    user,
    fields: [
      { name: "📍 Canal", value: `<#${msg.channel.id}>`, inline: true },
      { name: "💬 Conteúdo", value: msg.content?.slice(0, 1000) || "Sem conteúdo" }
    ]
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("Ver Perfil")
      .setStyle(ButtonStyle.Link)
      .setURL(`https://discord.com/users/${user.id}`)
  );

  logger.sendLog(msg.guild.id, embed, row);
});




client.on("messageUpdate", async (oldMsg, newMsg) => {
  if (!oldMsg.guild || oldMsg.author?.bot) return;
  if (logger.whitelist.has(oldMsg.author.id)) return;
  if (oldMsg.content === newMsg.content) return;

  const user = oldMsg.author;

  const embed = logger.createEmbed({
    title: "✏️ Mensagem Editada",
    color: logger.COLORS.warning,
    user,
    fields: [
      { name: "📍 Canal", value: `<#${oldMsg.channel.id}>` },
      { name: "Antes", value: oldMsg.content?.slice(0, 1000) || "Sem conteúdo" },
      { name: "Depois", value: newMsg.content?.slice(0, 1000) || "Sem conteúdo" }
    ]
  });

  logger.sendLog(oldMsg.guild.id, embed);
});




client.on("channelCreate", async (channel) => {
  const embed = new EmbedBuilder()
    .setColor(logger.COLORS.success)
    .setTitle("📁 Canal Criado")
    .addFields(
      { name: "📌 Nome", value: channel.name, inline: true },
      { name: "🆔 ID", value: `\`${channel.id}\``, inline: true }
    )
    .setTimestamp();

  logger.sendLog(channel.guild.id, embed);
});


client.on("channelDelete", async (channel) => {
  const embed = new EmbedBuilder()
    .setColor(logger.COLORS.error)
    .setTitle("🗑️ Canal Deletado")
    .addFields(
      { name: "📌 Nome", value: channel.name, inline: true },
      { name: "🆔 ID", value: `\`${channel.id}\``, inline: true }
    )
    .setTimestamp();

  logger.sendLog(channel.guild.id, embed);
});


client.on("channelUpdate", async (oldCh, newCh) => {
  if (oldCh.name === newCh.name) return;

  const embed = new EmbedBuilder()
    .setColor(logger.COLORS.warning)
    .setTitle("✏️ Canal Atualizado")
    .addFields(
      { name: "Antes", value: oldCh.name, inline: true },
      { name: "Depois", value: newCh.name, inline: true }
    )
    .setTimestamp();

  logger.sendLog(newCh.guild.id, embed);
});




client.on("roleCreate", async (role) => {
  const embed = new EmbedBuilder()
    .setColor(logger.COLORS.success)
    .setTitle("🎖️ Cargo Criado")
    .addFields({ name: "Nome", value: role.name });

  logger.sendLog(role.guild.id, embed);
});


client.on("roleDelete", async (role) => {
  const embed = new EmbedBuilder()
    .setColor(logger.COLORS.error)
    .setTitle("🎖️ Cargo Deletado")
    .addFields({ name: "Nome", value: role.name });

  logger.sendLog(role.guild.id, embed);
});


client.on("roleUpdate", async (oldRole, newRole) => {
  if (oldRole.name === newRole.name) return;

  const embed = new EmbedBuilder()
    .setColor(logger.COLORS.warning)
    .setTitle("✏️ Cargo Atualizado")
    .addFields(
      { name: "Antes", value: oldRole.name, inline: true },
      { name: "Depois", value: newRole.name, inline: true }
    );

  logger.sendLog(newRole.guild.id, embed);
});




const spamMap = new Map();

client.on("messageCreate", async (msg) => {
  if (!msg.guild || msg.author.bot) return;

  const userId = msg.author.id;

  const data = spamMap.get(userId) || {
    count: 0,
    last: Date.now()
  };

  data.count++;
  data.last = Date.now();
  spamMap.set(userId, data);

  setTimeout(() => {
    data.count--;
  }, 4000);

  if (data.count >= 6) {
    msg.delete().catch(() => {});

    const embed = logger.createEmbed({
      title: "🚫 Spam Detectado",
      color: logger.COLORS.error,
      user: msg.author,
      fields: [
        { name: "📍 Canal", value: `<#${msg.channel.id}>` },
        { name: "⚠️ Ação", value: "Mensagem removida automaticamente" }
      ]
    });

    logger.sendLog(msg.guild.id, embed);
  }
});




client.on("interactionCreate", async (interaction) => {
  if (interaction.isButton()) {
    if (interaction.customId.startsWith("afk_yes_") || interaction.customId.startsWith("afk_no_")) {
      if (!interaction.member.permissions.has(PermissionFlagsBits.MoveMembers)) {
        return interaction.reply({
          content: "❌ Você precisa da permissão **Mover Membros** para usar isso.",
          ephemeral: true
        });
      }

      const userId = interaction.customId.split("_")[2];
      const data = pendingAfkChecks.get(userId);

      if (!data) {
        return interaction.reply({
          content: "⚠️ Essa verificação AFK já expirou ou foi resolvida.",
          ephemeral: true
        });
      }

      const guild = interaction.guild;
      const member = await guild.members.fetch(userId).catch(() => null);

      if (!member || !member.voice?.channelId) {
        pendingAfkChecks.delete(userId);

        return interaction.update({
          content: "⚠️ O usuário não está mais em call.",
          embeds: [],
          components: []
        });
      }

      if (interaction.customId.startsWith("afk_yes_")) {
        const afkChannel = guild.channels.cache.get(AFK_CHANNEL_ID);

        if (!afkChannel) {
          return interaction.reply({
            content: "❌ Canal AFK não encontrado.",
            ephemeral: true
          });
        }

        await member.voice.setChannel(afkChannel).catch(() => {});
        pendingAfkChecks.delete(userId);

        const embed = new EmbedBuilder()
          .setColor(0x22c55e)
          .setTitle("✅ Membro Movido para AFK")
          .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
          .setDescription(`😴 **${member.user.tag}** foi movido manualmente para o canal AFK.`)
          .addFields(
            { name: "👤 Usuário", value: `<@${member.id}>`, inline: true },
            { name: "🛠️ Aprovado por", value: `<@${interaction.user.id}>`, inline: true },
            { name: "📥 Destino", value: `<#${AFK_CHANNEL_ID}>`, inline: true }
          )
          .setFooter({ text: "Logger PRO ULTRA • AFK confirmado" })
          .setTimestamp();

        return interaction.update({
          embeds: [embed],
          components: []
        });
      }

      if (interaction.customId.startsWith("afk_no_")) {
        pendingAfkChecks.delete(userId);

        const embed = new EmbedBuilder()
          .setColor(0xef4444)
          .setTitle("❌ AFK Cancelado")
          .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
          .setDescription(`🛡️ Foi decidido que **${member.user.tag}** não será movido para o canal AFK.`)
          .addFields(
            { name: "👤 Usuário", value: `<@${member.id}>`, inline: true },
            { name: "🛠️ Cancelado por", value: `<@${interaction.user.id}>`, inline: true }
          )
          .setFooter({ text: "Logger PRO ULTRA • AFK rejeitado" })
          .setTimestamp();

        return interaction.update({
          embeds: [embed],
          components: []
        });
      }
    }
  }

  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "logset") {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return;

    const channel = interaction.options.getChannel("canal");
    logger.customLogs.set(interaction.guild.id, channel.id);
    logger.saveCustomLogs();

    return interaction.reply({
      content: "✅ Canal de logs configurado com sucesso!",
      ephemeral: true
    });
  }

  if (interaction.commandName === "logremove") {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return;

    logger.customLogs.delete(interaction.guild.id);
    logger.saveCustomLogs();

    return interaction.reply({
      content: "🗑️ Sistema de logs removido!",
      ephemeral: true
    });
  }

  if (interaction.commandName === "whitelist") {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return;

    const user = interaction.options.getUser("usuario");
    logger.whitelist.add(user.id);

    return interaction.reply({
      content: `✅ ${user.tag} foi adicionado à whitelist`,
      ephemeral: true
    });
  }
});




const app = express();

app.get("/", (req, res) => {
  res.send({
    status: "online",
    servers: client.guilds.cache.size,
    users: client.users.cache.size,
    version: "ULTRA PRO"
  });
});

app.listen(3000);
}


