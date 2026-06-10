const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  EmbedBuilder, ModalBuilder,
  TextInputBuilder, TextInputStyle
} = require("discord.js");
const Kahoot = require("kahoot.js-latest");

// ─── Kahoot colors (same order as game: red, blue, yellow, green) ───
const COLORS = [
  { emoji: "🔴", label: "Vermelho", style: ButtonStyle.Danger },
  { emoji: "🔵", label: "Azul",     style: ButtonStyle.Primary },
  { emoji: "🟡", label: "Amarelo",  style: ButtonStyle.Secondary },
  { emoji: "🟢", label: "Verde",    style: ButtonStyle.Success },
];

// channelId → session state
const sessions = new Map();

// ─────────────────────────────────────────────────────────────────────
// Fetch full quiz data from Kahoot's public REST API
// Returns array of questions: [{ question, choices: [{answer, correct}] }]
// ─────────────────────────────────────────────────────────────────────
async function fetchQuizData(quizUUID) {
  const url = `https://kahoot.it/rest/kahoots/${quizUUID}`;
  console.log("[Kahoot] Fetching quiz data from:", url);

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "application/json",
    },
  });

  if (!res.ok) {
    console.warn(`[Kahoot] REST API returned ${res.status} for UUID ${quizUUID}`);
    return null;
  }

  const data = await res.json();
  console.log("[Kahoot] Quiz title:", data.title);
  console.log("[Kahoot] Questions count:", data.questions?.length);

  // Normalize: each question has .question (text) and .choices [{answer, correct}]
  const questions = (data.questions || []).map((q) => ({
    question: q.question || q.title || "",
    image: q.image || null,
    choices: (q.choices || []).map((c) => ({
      answer: c.answer || c.text || "",
      correct: c.correct ?? false,
    })),
    // also store raw for debugging
    _raw: q,
  }));

  return { title: data.title, questions };
}

// ─────────────────────────────────────────────────────────────────────
// Build the question embed (with full text if available)
// ─────────────────────────────────────────────────────────────────────
function buildQuestionEmbed(questionData, questionIndex, timeLeft) {
  const embed = new EmbedBuilder()
    .setTitle(`❓ Pergunta ${questionIndex + 1}`)
    .setColor(0x46178f)
    .setFooter({ text: `⏱ ${timeLeft}s para responder` });

  if (questionData) {
    embed.setDescription(`**${questionData.question || "Leia na tela do apresentador"}**`);

    if (questionData.choices?.length > 0) {
      embed.addFields(
        questionData.choices.slice(0, 4).map((c, i) => ({
          name: `${COLORS[i]?.emoji ?? "⬜"} ${COLORS[i]?.label ?? `Opção ${i + 1}`}`,
          value: c.answer || "—",
          inline: true,
        }))
      );
    }

    if (questionData.image) {
      embed.setImage(questionData.image);
    }
  } else {
    embed.setDescription(
      "*Texto não disponível — leia na tela do apresentador!*\n" +
      "Clique na cor/forma que você vê na tela:"
    );
  }

  return embed;
}

// ─────────────────────────────────────────────────────────────────────
// Build answer buttons
// ─────────────────────────────────────────────────────────────────────
function buildAnswerRow(questionData, numChoices) {
  const count = questionData?.choices?.length || numChoices || 4;

  const buttons = COLORS.slice(0, 4).map((c, i) => {
    const choiceText = questionData?.choices?.[i]?.answer;
    const label = choiceText
      ? `${c.emoji} ${choiceText.substring(0, 60)}`
      : `${c.emoji} ${c.label}`;

    return new ButtonBuilder()
      .setCustomId(`kahoot_ans_${i}`)
      .setLabel(label)
      .setStyle(c.style)
      .setDisabled(i >= count);
  });

  return new ActionRowBuilder().addComponents(buttons);
}

// ─────────────────────────────────────────────────────────────────────
// Main connection function
// ─────────────────────────────────────────────────────────────────────
async function connectKahoot(pin, nickname, channel, onStatus) {
  // Close existing session
  if (sessions.has(channel.id)) {
    const old = sessions.get(channel.id);
    try { old.client?.leave?.(); } catch (_) {}
    try { old.collector?.stop?.("reconnect"); } catch (_) {}
    sessions.delete(channel.id);
  }

  const client = new Kahoot();

  const state = {
    client,
    collector: null,
    questionMsg: null,   // the current question's Discord message
    quizData: null,      // fetched from REST API
    questionIndex: -1,   // tracks current question number
    answeredThisQ: false,
  };
  sessions.set(channel.id, state);

  // ── Joined ──
  client.on("Joined", () => {
    onStatus("✅ Conectado via WebSocket! Aguardando o quiz iniciar...");
  });

  // ── Quiz start — fetch full quiz data ──
  client.on("QuizStart", async (quiz) => {
    console.log("[Kahoot] QuizStart event. quiz object keys:", Object.keys(quiz ?? {}));

    // Try multiple possible fields for the UUID
    const uuid =
      quiz?.uuid ||
      quiz?.quizId ||
      quiz?.quizID ||
      quiz?.id ||
      quiz?.kahootId ||
      client?.quiz?.uuid ||
      client?.quiz?.quizId ||
      client?.quizId;

    console.log("[Kahoot] Detected quiz UUID:", uuid);

    let titleText = quiz?.name || quiz?.title || "Quiz";

    if (uuid) {
      try {
        state.quizData = await fetchQuizData(uuid);
        if (state.quizData) {
          titleText = state.quizData.title || titleText;
          console.log(`[Kahoot] Loaded ${state.quizData.questions.length} questions from REST API`);
        }
      } catch (err) {
        console.warn("[Kahoot] Failed to fetch quiz data:", err.message);
      }
    } else {
      console.warn("[Kahoot] No UUID found — will show colors only (no text)");
    }

    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("🎮 Quiz iniciado!")
          .setDescription(
            `**${titleText}** começou!\n\n` +
            (state.quizData
              ? `📋 ${state.quizData.questions.length} perguntas carregadas — você verá o texto completo!\n`
              : "⚠️ Não foi possível carregar as perguntas. Só mostrarei as cores.\n") +
            "Responda clicando nos botões coloridos!"
          )
          .setColor(0x46178f),
      ],
    });
  });

  // ── Question start ──
  client.on("QuestionStart", async (question) => {
    // IMPORTANT: always reset state for each new question
    state.answeredThisQ = false;
    state.questionIndex += 1;
    const idx = state.questionIndex;

    console.log(
      `[Kahoot] QuestionStart #${idx}. question keys:`,
      Object.keys(question ?? {})
    );

    // Stop previous collector
    if (state.collector) {
      state.collector.stop("new_question");
      state.collector = null;
    }

    // Resolve time
    const timeLeft =
      question?.timeLeft ??
      question?.time ??
      question?.timer ??
      20;

    // Look up pre-fetched question data by index
    const qData = state.quizData?.questions?.[idx] ?? null;

    const numChoices =
      question?.numberOfChoices ??
      question?.choices?.length ??
      question?.answerCount ??
      qData?.choices?.length ??
      4;

    const embed = buildQuestionEmbed(qData, idx, timeLeft);
    const row   = buildAnswerRow(qData, numChoices);

    // Always send a NEW message per question (never edit — avoids the "only 1 question" bug)
    state.questionMsg = await channel.send({
      embeds: [embed],
      components: [row],
    });

    // Collect one button click
    state.collector = state.questionMsg.createMessageComponentCollector({
      filter: (i) => i.customId.startsWith("kahoot_ans_"),
      time: (timeLeft + 4) * 1000,
      max: 1,
    });

    state.collector.on("collect", async (btnInteraction) => {
      state.answeredThisQ = true;
      const answerIdx = parseInt(btnInteraction.customId.replace("kahoot_ans_", ""), 10);
      const color = COLORS[answerIdx];

      // Submit the answer to Kahoot
      try {
        question.answer(answerIdx);
      } catch (err) {
        console.warn("[Kahoot] question.answer() failed:", err.message);
      }

      const choiceText = qData?.choices?.[answerIdx]?.answer;
      const desc = choiceText
        ? `Você escolheu: ${color.emoji} **${choiceText}**`
        : `Você escolheu: ${color.emoji} **${color.label}**`;

      await btnInteraction.update({
        embeds: [
          new EmbedBuilder()
            .setTitle("✅ Resposta enviada!")
            .setDescription(desc)
            .setColor(0x57f287),
        ],
        components: [],
      });
    });

    state.collector.on("end", async (collected, reason) => {
      if (reason === "new_question" || reason === "question_end") return;
      if (!state.answeredThisQ && state.questionMsg) {
        try {
          await state.questionMsg.edit({
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

  // ── Question end — show correct answer ──
  client.on("QuestionEnd", async (result) => {
    console.log("[Kahoot] QuestionEnd. result keys:", Object.keys(result ?? {}));

    if (state.collector) {
      state.collector.stop("question_end");
      state.collector = null;
    }

    const idx = state.questionIndex;
    const qData = state.quizData?.questions?.[idx] ?? null;

    // Find correct answers
    const correctIndices = [];
    if (qData) {
      qData.choices.forEach((c, i) => {
        if (c.correct) correctIndices.push(i);
      });
    }

    const isRight = result?.isCorrect ?? null;
    const points  = result?.points ?? result?.pointsData?.totalPoints ?? null;
    const rank    = result?.rank ?? null;

    // Build result description
    let desc = "";
    if (correctIndices.length > 0) {
      const correctLabels = correctIndices
        .map((i) => {
          const c = COLORS[i];
          const text = qData?.choices?.[i]?.answer;
          return text
            ? `${c.emoji} **${text}**`
            : `${c.emoji} **${c.label}**`;
        })
        .join(", ");
      desc = `Resposta correta: ${correctLabels}`;
    } else if (result?.correctAnswers?.length > 0) {
      desc = `Resposta correta: **${result.correctAnswers.join(", ")}**`;
    } else {
      desc = "Fim da pergunta.";
    }

    const embed = new EmbedBuilder()
      .setTitle(
        isRight === true  ? "✅ Correto!" :
        isRight === false ? "❌ Errou!"   :
                            "📊 Resultado da Pergunta"
      )
      .setDescription(desc)
      .setColor(
        isRight === true  ? 0x57f287 :
        isRight === false ? 0xed4245 :
                            0x46178f
      );

    if (points != null) embed.addFields({ name: "Pontos ganhos", value: `+${points}`, inline: true });
    if (rank   != null) embed.addFields({ name: "Sua posição",   value: `#${rank}`,   inline: true });

    // Send as a new follow-up message (don't edit, keeps question visible)
    try {
      await channel.send({ embeds: [embed] });
    } catch (_) {}
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
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("🔌 Desconectado")
          .setDescription(`Motivo: ${reason || "desconhecido"}`)
          .setColor(0xed4245),
      ],
    }).catch(() => {});
  });

  // ── Error ──
  client.on("error", async (err) => {
    console.error("[Kahoot] Error:", err);
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("❌ Erro no Kahoot")
          .setDescription(err?.message || String(err))
          .setColor(0xed4245),
      ],
    }).catch(() => {});
  });

  await client.join(pin, nickname);
  return client;
}

// ─────────────────────────────────────────────────────────────────────
// Bot setup
// ─────────────────────────────────────────────────────────────────────
function setup(client) {
  client.on("messageCreate", async (msg) => {
    if (msg.author.bot || msg.content !== "!kahootmsg") return;

    const embed = new EmbedBuilder()
      .setTitle("🎮 Kahoot Bot")
      .setDescription(
        "Clique no botão abaixo para entrar em uma sala do Kahoot!\n" +
        "As **perguntas e respostas** aparecerão aqui em texto completo + botões coloridos."
      )
      .setColor(0x46178f)
      .setFooter({ text: "Kahoot Bot • Conecta via WebSocket + REST API" });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("kahoot_join")
        .setLabel("🚀 Entrar na Sala")
        .setStyle(ButtonStyle.Primary)
    );

    await msg.channel.send({ embeds: [embed], components: [row] });
  });

  client.on("interactionCreate", async (interaction) => {

    // ── Join button → open modal ──
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
            .setMinLength(4).setMaxLength(9)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("nickname")
            .setLabel("Seu Nickname")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Ex: Player1")
            .setMinLength(1).setMaxLength(15)
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
        embeds: [new EmbedBuilder()
          .setTitle("🎮 Conectando...")
          .setDescription("⏳ Estabelecendo conexão WebSocket...")
          .setColor(0x46178f)],
      });

      try {
        await connectKahoot(pin, nickname, interaction.channel, async (statusMsg) => {
          await interaction.editReply({
            embeds: [new EmbedBuilder()
              .setTitle("🎮 Kahoot Bot")
              .setDescription(statusMsg)
              .setColor(0x46178f)],
          });
        });

        await interaction.channel.send({
          embeds: [new EmbedBuilder()
            .setTitle("🎮 Kahoot conectado!")
            .setDescription(
              `<@${interaction.user.id}> entrou como **${nickname}**.\n` +
              `🔗 Conectado ao PIN **${pin}**.\n\n` +
              `Quando o quiz iniciar, cada pergunta aparecerá aqui com **texto completo** e botões!\n` +
              `🔴 Vermelho • 🔵 Azul • 🟡 Amarelo • 🟢 Verde`
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
        console.error("[Kahoot] Connection error:", err);
        await interaction.editReply({
          embeds: [new EmbedBuilder()
            .setTitle("❌ Erro ao conectar")
            .setDescription(`${err?.message || err}\n\nVerifique se o PIN está correto e se o jogo está aberto.`)
            .setColor(0xed4245)
            .setFooter({ text: "Verifique o PIN e tente novamente" })],
        });
      }
    }
  });
}

module.exports = { setup };
