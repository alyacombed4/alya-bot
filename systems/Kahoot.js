const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder
} = require("discord.js");
const Kahoot = require("kahoot.js-latest");

// Cores do Kahoot por índice
const KAHOOT_COLORS = ["🔴", "🔵", "🟡", "🟢"];

// Armazena sessões ativas: channelId → client
const sessoes = new Map();

// ─────────────────────────────────────────────────────────────
// Monta o embed com a pergunta e botões de resposta
// ─────────────────────────────────────────────────────────────
function buildPerguntaEmbed(question) {
  const choices = question.choices || [];

  const embed = new EmbedBuilder()
    .setTitle("❓ Nova Pergunta!")
    .setDescription(`**${question.question || "Pergunta não identificada"}**`)
    .setColor(0x46178f)
    .setFooter({ text: `Questão ${(question.index ?? 0) + 1} • Tempo: ${question.timeLeft ?? "?"}s` });

  if (choices.length > 0) {
    embed.addFields(
      choices.map((c, i) => ({
        name: `${KAHOOT_COLORS[i] ?? "⬜"} Opção ${i + 1}`,
        value: c.answer || "?",
        inline: true,
      }))
    );
  }

  return embed;
}

function buildPerguntaRow(question) {
  const choices = question.choices || [];
  if (choices.length === 0) return null;

  const buttons = choices.slice(0, 4).map((c, i) =>
    new ButtonBuilder()
      .setCustomId(`kahoot_resp_${i}`)
      .setLabel(`${KAHOOT_COLORS[i] ?? "⬜"} ${(c.answer || "?").substring(0, 75)}`)
      .setStyle(ButtonStyle.Primary)
  );

  return new ActionRowBuilder().addComponents(buttons);
}

// ─────────────────────────────────────────────────────────────
// Conecta ao Kahoot via WebSocket (sem Puppeteer)
// ─────────────────────────────────────────────────────────────
async function conectarKahoot(pin, nickname, channel, onStep) {
  // Se já existe sessão neste canal, fecha antes
  if (sessoes.has(channel.id)) {
    const antiga = sessoes.get(channel.id);
    try { antiga.leave(); } catch (_) {}
    sessoes.delete(channel.id);
  }

  const client = new Kahoot();
  let msgAtual = null;
  let coletorAtual = null;
  let questaoAtual = null;

  // ── Entrou na sala ──
  client.on("Joined", () => {
    onStep("✅ Conectado ao Kahoot via WebSocket!");
  });

  // ── Quiz começou ──
  client.on("QuizStart", async () => {
    await channel.send({
      embeds: [new EmbedBuilder()
        .setTitle("🎮 Quiz iniciado!")
        .setDescription("O Kahoot começou! As perguntas aparecerão aqui.")
        .setColor(0x46178f)]
    });
  });

  // ── Nova pergunta ──
  client.on("QuestionStart", async (question) => {
    questaoAtual = question;

    // Para coletor anterior se existir
    if (coletorAtual) {
      coletorAtual.stop("nova_pergunta");
      coletorAtual = null;
    }

    const embed = buildPerguntaEmbed(question);
    const row = buildPerguntaRow(question);

    const components = row ? [row] : [];

    try {
      if (msgAtual) {
        await msgAtual.edit({ embeds: [embed], components });
      } else {
        msgAtual = await channel.send({ embeds: [embed], components });
      }
    } catch (_) {
      msgAtual = await channel.send({ embeds: [embed], components });
    }

    if (!row) return;

    // Coletor de botões
    coletorAtual = msgAtual.createMessageComponentCollector({
      filter: (i) => i.customId.startsWith("kahoot_resp_"),
      time: (question.timeLeft ?? 20) * 1000 + 3000,
      max: 1,
    });

    coletorAtual.on("collect", async (btnInteraction) => {
      const idx = parseInt(btnInteraction.customId.replace("kahoot_resp_", ""));
      const choices = questaoAtual?.choices || [];
      const escolhida = choices[idx]?.answer || "?";

      try {
        questaoAtual.answer(idx);
      } catch (_) {}

      await btnInteraction.update({
        embeds: [new EmbedBuilder()
          .setTitle("✅ Resposta enviada!")
          .setDescription(`Você escolheu: ${KAHOOT_COLORS[idx] ?? "⬜"} **${escolhida}**`)
          .setColor(0x57f287)],
        components: [],
      });
    });

    coletorAtual.on("end", async (collected, reason) => {
      if (collected.size === 0 && reason !== "nova_pergunta" && msgAtual) {
        try {
          await msgAtual.edit({
            embeds: [new EmbedBuilder()
              .setTitle("⏰ Tempo esgotado!")
              .setDescription("Você não respondeu a tempo.")
              .setColor(0xed4245)],
            components: [],
          });
        } catch (_) {}
      }
    });
  });

  // ── Pergunta encerrada ──
  client.on("QuestionEnd", async (result) => {
    if (coletorAtual) {
      coletorAtual.stop("fim_pergunta");
      coletorAtual = null;
    }

    const corretas = result.correctAnswers ?? [];
    const acertou = result.isCorrect ?? false;

    const embed = new EmbedBuilder()
      .setTitle(acertou ? "✅ Correto!" : "❌ Errou!")
      .setDescription(
        corretas.length > 0
          ? `Resposta(s) correta(s): **${corretas.join(", ")}**`
          : "Fim da pergunta."
      )
      .setColor(acertou ? 0x57f287 : 0xed4245);

    try {
      if (msgAtual) {
        await msgAtual.edit({ embeds: [embed], components: [] });
      } else {
        await channel.send({ embeds: [embed] });
      }
    } catch (_) {}

    msgAtual = null;
  });

  // ── Quiz encerrado / pódio ──
  client.on("QuizEnd", async () => {
    sessoes.delete(channel.id);
    await channel.send({
      embeds: [new EmbedBuilder()
        .setTitle("🏁 Jogo encerrado!")
        .setDescription("O Kahoot terminou. Obrigado por jogar!")
        .setColor(0x46178f)]
    });
  });

  // ── Desconectado ──
  client.on("Disconnect", async (reason) => {
    sessoes.delete(channel.id);
    await channel.send({
      embeds: [new EmbedBuilder()
        .setTitle("🔌 Desconectado")
        .setDescription(`Motivo: ${reason || "desconhecido"}`)
        .setColor(0xed4245)]
    }).catch(() => {});
  });

  // ── Erros ──
  client.on("error", async (err) => {
    console.error("[Kahoot] Erro:", err);
    await channel.send({
      embeds: [new EmbedBuilder()
        .setTitle("❌ Erro")
        .setDescription(err?.message || String(err))
        .setColor(0xed4245)]
    }).catch(() => {});
  });

  // Conecta
  await client.join(pin, nickname);
  sessoes.set(channel.id, client);

  return client;
}

// ─────────────────────────────────────────────────────────────
// Setup do bot
// ─────────────────────────────────────────────────────────────
function setup(client) {
  // ── !kahootmsg — manda o painel inicial ──
  client.on("messageCreate", async (msg) => {
    if (msg.author.bot) return;

    if (msg.content === "!kahootmsg") {
      const embed = new EmbedBuilder()
        .setTitle("🎮 Kahoot Bot")
        .setDescription("Clique no botão abaixo para entrar em uma sala do Kahoot!")
        .setColor(0x46178f)
        .setFooter({ text: "Kahoot Bot • Conecta via WebSocket" });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("kahoot_join")
          .setLabel("🚀 Entrar na Sala")
          .setStyle(ButtonStyle.Primary)
      );

      await msg.channel.send({ embeds: [embed], components: [row] });
    }
  });

  // ── Interações ──
  client.on("interactionCreate", async (interaction) => {
    // Botão "Entrar na Sala"
    if (interaction.isButton() && interaction.customId === "kahoot_join") {
      const modal = new ModalBuilder()
        .setCustomId("kahoot_modal")
        .setTitle("Entrar no Kahoot");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("pin")
            .setLabel("PIN da Sala")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Ex: 3552907")
            .setMinLength(4)
            .setMaxLength(9)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("nickname")
            .setLabel("Seu Nickname")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Ex: Player1")
            .setMinLength(1)
            .setMaxLength(15)
            .setRequired(true)
        )
      );

      await interaction.showModal(modal);
      return;
    }

    // Submit do modal
    if (interaction.isModalSubmit() && interaction.customId === "kahoot_modal") {
      const pin = interaction.fields
        .getTextInputValue("pin")
        .trim()
        .replace(/\s+/g, "");
      const nickname = interaction.fields.getTextInputValue("nickname").trim();

      await interaction.deferReply({ ephemeral: true });

      const statusEmbed = () =>
        new EmbedBuilder()
          .setTitle("🎮 Conectando ao Kahoot...")
          .setDescription("⏳ Estabelecendo conexão WebSocket...")
          .setColor(0x46178f);

      await interaction.editReply({ embeds: [statusEmbed()] });

      try {
        await conectarKahoot(pin, nickname, interaction.channel, async (msg) => {
          await interaction.editReply({
            embeds: [new EmbedBuilder()
              .setTitle("🎮 Kahoot Bot")
              .setDescription(msg)
              .setColor(0x46178f)],
          });
        });

        await interaction.channel.send({
          embeds: [new EmbedBuilder()
            .setTitle("🎮 Kahoot conectado!")
            .setDescription(
              `<@${interaction.user.id}> entrou como **${nickname}**.\n` +
              `🔗 Conectado via WebSocket ao PIN **${pin}**.\n` +
              `Quando o jogo começar, as perguntas aparecerão aqui com botões!`
            )
            .setColor(0x46178f)],
        });

        await interaction.editReply({
          embeds: [new EmbedBuilder()
            .setTitle("✅ Conectado!")
            .setDescription(`Entrou na sala **${pin}** como **${nickname}**.`)
            .setColor(0x57f287)],
        });
      } catch (err) {
        console.error("[Kahoot] Erro ao conectar:", err);
        await interaction.editReply({
          embeds: [new EmbedBuilder()
            .setTitle("❌ Erro ao conectar")
            .setDescription(
              `${err?.message || err}\n\n` +
              `Verifique se o PIN está correto e se o jogo está aberto.`
            )
            .setColor(0xed4245)
            .setFooter({ text: "Verifique o PIN e tente novamente" })],
        });
      }

      return;
    }
  });
}

module.exports = { setup };
