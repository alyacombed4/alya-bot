const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder,
  TextInputBuilder, TextInputStyle
} = require("discord.js");
const Kahoot = require("kahoot.js-latest");

// Kahoot answer colors — same 4 shapes the game shows players
const COLORS = [
  { emoji: "🔴", label: "Vermelho", style: ButtonStyle.Danger },
  { emoji: "🔵", label: "Azul",     style: ButtonStyle.Primary },
  { emoji: "🟡", label: "Amarelo",  style: ButtonStyle.Secondary },
  { emoji: "🟢", label: "Verde",    style: ButtonStyle.Success },
];

// channelId → { client, collector, msg, question }
const sessions = new Map();

// ─────────────────────────────────────────────────────────────
// Debug helper — logs every key/value of an object shallowly
// ─────────────────────────────────────────────────────────────
function debugObject(label, obj) {
  try {
    const safe = {};
    for (const k of Object.keys(obj ?? {})) {
      const v = obj[k];
      safe[k] = typeof v === "function" ? "[Function]" : v;
    }
    console.log(`[Kahoot DEBUG] ${label}:`, JSON.stringify(safe, null, 2));
  } catch (e) {
    console.log(`[Kahoot DEBUG] ${label}: (could not serialize)`, obj);
  }
}

// ─────────────────────────────────────────────────────────────
// Build question embed — text shown only when available
// ─────────────────────────────────────────────────────────────
function buildQuestionEmbed(question, questionNumber) {
  // kahoot.js-latest may expose text in different fields depending on version
  const text =
    question.question ||       // sometimes populated
    question.title ||          // fallback
    question.text ||           // fallback
    null;

  const timeLeft =
    question.timeLeft ??
    question.time ??
    question.timer ??
    20;

  const numChoices =
    question.numberOfChoices ??
    question.choices?.length ??
    question.answerCount ??
    4;

  const embed = new EmbedBuilder()
    .setTitle(`❓ Pergunta ${questionNumber}`)
    .setColor(0x46178f)
    .setFooter({ text: `⏱ ${timeLeft}s para responder` });

  if (text) {
    embed.setDescription(`**${text}**`);
  } else {
    embed.setDescription(
      "*Texto da pergunta disponível apenas na tela do apresentador.*\n" +
      "Escolha a cor/forma que você vê na tela!"
    );
  }

  // Show answer texts if kahoot.js exposes them
  const choices = question.choices ?? [];
  if (choices.length > 0) {
    const hasText = choices.some(c => c.answer || c.text || c.content);
    if (hasText) {
      embed.addFields(
        choices.slice(0, 4).map((c, i) => ({
          name: `${COLORS[i]?.emoji ?? "⬜"} ${COLORS[i]?.label ?? `Opção ${i + 1}`}`,
          value: c.answer || c.text || c.content || "—",
          inline: true,
        }))
      );
    }
  }

  return embed;
}

// ─────────────────────────────────────────────────────────────
// Build answer buttons (always 4 colors, disable extras if < 4)
// ─────────────────────────────────────────────────────────────
function buildAnswerRow(question) {
  const numChoices =
    question.numberOfChoices ??
    question.choices?.length ??
    question.answerCount ??
    4;

  const buttons = COLORS.slice(0, 4).map((c, i) =>
    new ButtonBuilder()
      .setCustomId(`kahoot_ans_${i}`)
      .setLabel(`${c.emoji} ${c.label}`)
      .setStyle(c.style)
      .setDisabled(i >= numChoices)
  );

  return new ActionRowBuilder().addComponents(buttons);
}

// ─────────────────────────────────────────────────────────────
// Connect to Kahoot
// ─────────────────────────────────────────────────────────────
async function connectKahoot(pin, nickname, channel, onStatus) {
  // Close existing session for this channel
  if (sessions.has(channel.id)) {
    const old = sessions.get(channel.id);
    try { old.client?.leave?.(); } catch (_) {}
    try { old.collector?.stop?.("reconnect"); } catch (_) {}
    sessions.delete(channel.id);
  }

  const client = new Kahoot();

  // Shared state for this session
  const state = {
    client,
    collector: null,
    msg: null,           // last question message
    question: null,      // current question object
    questionNumber: 0,
  };
  sessions.set(channel.id, state);

  // ── Joined ──
  client.on("Joined", () => {
    onStatus("✅ Conectado ao Kahoot via WebSocket! Aguardando o quiz iniciar...");
  });

  // ── Quiz start ──
  client.on("QuizStart", async (quiz) => {
    debugObject("QuizStart", quiz);
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("🎮 Quiz iniciado!")
          .setDescription(
            quiz?.name
              ? `**${quiz.name}** começou!\nAs perguntas aparecerão aqui com botões de cores.`
              : "O Kahoot começou! As perguntas aparecerão aqui com botões de cores."
          )
          .setColor(0x46178f),
      ],
    });
  });

  // ── Question start ──
  client.on("QuestionStart", async (question) => {
    debugObject("QuestionStart", question);
    state.question = question;
    state.questionNumber += 1;

    // Stop previous collector
    if (state.collector) {
      state.collector.stop("new_question");
      state.collector = null;
    }

    const timeLeft =
      question.timeLeft ?? question.time ?? question.timer ?? 20;

    const embed = buildQuestionEmbed(question, state.questionNumber);
    const row   = buildAnswerRow(question);

    // Send or update message
    try {
      if (state.msg) {
        await state.msg.edit({ embeds: [embed], components: [row] });
      } else {
        state.msg = await channel.send({ embeds: [embed], components: [row] });
      }
    } catch (_) {
      state.msg = await channel.send({ embeds: [embed], components: [row] });
    }

    // Collect one button click
    state.collector = state.msg.createMessageComponentCollector({
      filter: (i) => i.customId.startsWith("kahoot_ans_"),
      time: timeLeft * 1000 + 4000,
      max: 1,
    });

    state.collector.on("collect", async (btnInteraction) => {
      const idx = parseInt(btnInteraction.customId.replace("kahoot_ans_", ""), 10);
      const color = COLORS[idx];

      // Answer the question
      try {
        state.question.answer(idx);
      } catch (err) {
        console.error("[Kahoot] answer() error:", err);
        // Some versions use a different method name
        try { state.question.sendAnswer?.(idx); } catch (_) {}
      }

      await btnInteraction.update({
        embeds: [
          new EmbedBuilder()
            .setTitle("✅ Resposta enviada!")
            .setDescription(`Você escolheu: ${color.emoji} **${color.label}**`)
            .setColor(0x57f287),
        ],
        components: [],
      });
    });

    state.collector.on("end", async (collected, reason) => {
      if (reason === "new_question" || reason === "question_end") return;
      if (collected.size === 0 && state.msg) {
        try {
          await state.msg.edit({
            embeds: [
              new EmbedBuilder()
                .setTitle("⏰ Tempo esgotado!")
                .setDescription("Você não respondeu a tempo.")
                .setColor(0xed4245),
            ],
            components: [],
          });
        } catch (_) {}
      }
    });
  });

  // ── Question end ──
  client.on("QuestionEnd", async (result) => {
    debugObject("QuestionEnd", result);

    if (state.collector) {
      state.collector.stop("question_end");
      state.collector = null;
    }

    const correct = result?.correctAnswers ?? result?.correct ?? [];
    const isRight = result?.isCorrect ?? result?.correct !== undefined ? false : null;

    // Map correct answer indices to color labels
    const correctLabels = (Array.isArray(correct) ? correct : [correct])
      .map((c) => {
        if (typeof c === "number") {
          return `${COLORS[c]?.emoji ?? "?"} ${COLORS[c]?.label ?? c}`;
        }
        return String(c);
      })
      .join(", ");

    const embed = new EmbedBuilder()
      .setTitle(isRight === true ? "✅ Correto!" : isRight === false ? "❌ Errou!" : "📊 Resultado")
      .setDescription(
        correctLabels
          ? `Resposta(s) correta(s): **${correctLabels}**`
          : "Fim da pergunta."
      )
      .setColor(isRight === true ? 0x57f287 : isRight === false ? 0xed4245 : 0x46178f);

    if (result?.points != null)  embed.addFields({ name: "Pontos ganhos", value: String(result.points), inline: true });
    if (result?.rank   != null)  embed.addFields({ name: "Sua posição",   value: `#${result.rank}`,    inline: true });
    if (result?.total  != null)  embed.addFields({ name: "Total",         value: String(result.total), inline: true });

    try {
      if (state.msg) {
        await state.msg.edit({ embeds: [embed], components: [] });
      } else {
        await channel.send({ embeds: [embed] });
      }
    } catch (_) {}

    state.msg = null;
  });

  // ── Quiz end ──
  client.on("QuizEnd", async () => {
    sessions.delete(channel.id);
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("🏁 Jogo encerrado!")
          .setDescription("O Kahoot terminou. Obrigado por jogar!")
          .setColor(0x46178f),
      ],
    });
  });

  // ── Disconnect ──
  client.on("Disconnect", async (reason) => {
    sessions.delete(channel.id);
    await channel
      .send({
        embeds: [
          new EmbedBuilder()
            .setTitle("🔌 Desconectado")
            .setDescription(`Motivo: ${reason || "desconhecido"}`)
            .setColor(0xed4245),
        ],
      })
      .catch(() => {});
  });

  // ── Errors ──
  client.on("error", async (err) => {
    console.error("[Kahoot] Erro:", err);
    await channel
      .send({
        embeds: [
          new EmbedBuilder()
            .setTitle("❌ Erro no Kahoot")
            .setDescription(err?.message || String(err))
            .setColor(0xed4245),
        ],
      })
      .catch(() => {});
  });

  // Join
  await client.join(pin, nickname);
  return client;
}

// ─────────────────────────────────────────────────────────────
// Bot setup
// ─────────────────────────────────────────────────────────────
function setup(client) {
  // !kahootmsg — send panel
  client.on("messageCreate", async (msg) => {
    if (msg.author.bot) return;
    if (msg.content !== "!kahootmsg") return;

    const embed = new EmbedBuilder()
      .setTitle("🎮 Kahoot Bot")
      .setDescription("Clique no botão abaixo para entrar em uma sala do Kahoot!\nAs perguntas aparecerão aqui com **botões coloridos** para você responder.")
      .setColor(0x46178f)
      .setFooter({ text: "Kahoot Bot • Conecta via WebSocket" });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("kahoot_join")
        .setLabel("🚀 Entrar na Sala")
        .setStyle(ButtonStyle.Primary)
    );

    await msg.channel.send({ embeds: [embed], components: [row] });
  });

  // Interactions
  client.on("interactionCreate", async (interaction) => {

    // ── "Entrar na Sala" button ──
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

    // ── Modal submit ──
    if (interaction.isModalSubmit() && interaction.customId === "kahoot_modal") {
      const pin      = interaction.fields.getTextInputValue("pin").trim().replace(/\s+/g, "");
      const nickname = interaction.fields.getTextInputValue("nickname").trim();

      await interaction.deferReply({ ephemeral: true });
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("🎮 Conectando ao Kahoot...")
            .setDescription("⏳ Estabelecendo conexão WebSocket...")
            .setColor(0x46178f),
        ],
      });

      try {
        await connectKahoot(pin, nickname, interaction.channel, async (statusMsg) => {
          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setTitle("🎮 Kahoot Bot")
                .setDescription(statusMsg)
                .setColor(0x46178f),
            ],
          });
        });

        await interaction.channel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle("🎮 Kahoot conectado!")
              .setDescription(
                `<@${interaction.user.id}> entrou como **${nickname}**.\n` +
                `🔗 Conectado ao PIN **${pin}** via WebSocket.\n\n` +
                `Quando o jogo começar, responda clicando nas **cores**!\n` +
                `🔴 Vermelho • 🔵 Azul • 🟡 Amarelo • 🟢 Verde`
              )
              .setColor(0x46178f),
          ],
        });

        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle("✅ Conectado!")
              .setDescription(`Entrou na sala **${pin}** como **${nickname}**.`)
              .setColor(0x57f287),
          ],
        });
      } catch (err) {
        console.error("[Kahoot] Erro ao conectar:", err);
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle("❌ Erro ao conectar")
              .setDescription(
                `${err?.message || err}\n\nVerifique se o PIN está correto e se o jogo está aberto para entrar.`
              )
              .setColor(0xed4245)
              .setFooter({ text: "Verifique o PIN e tente novamente" }),
          ],
        });
      }
    }
  });
}

module.exports = { setup };
