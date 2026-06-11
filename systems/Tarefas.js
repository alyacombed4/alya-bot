const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  EmbedBuilder, ModalBuilder,
  TextInputBuilder, TextInputStyle,
} = require("discord.js");

const { login, listarTarefas, extrairQuestoes, responderQuestao } = require("./scraper");
const OpenAI = require("openai");

// ─── Paleta ───────────────────────────────────────────────────────────
const C = {
  roxo:     0x5c2d91,
  verde:    0x57f287,
  vermelho: 0xed4245,
  amarelo:  0xffd700,
  azul:     0x5865f2,
  cinza:    0x99aab5,
  laranja:  0xff6b35,
};

// userId → sessão { browser, page, tarefas, tarefaAtual, questoes, questaoAtual, tarefaMsg, questaoMsg }
const sessoes = new Map();

// userId → { messageId, channelId } — para coletar resposta via reply
const aguardandoResposta = new Map();

// userId → { messageId, respostaIA } — esperando confirmação de resposta dissertativa
const aguardandoConfirmacao = new Map();

// ─── Prompt da IA para responder tarefas (SEM modo caótico) ──────────
const PROMPT_TAREFAS = `
Você é um assistente especializado em responder questões escolares de forma precisa e objetiva.

Seu trabalho é analisar uma questão e determinar/sugerir a melhor resposta.

REGRAS OBRIGATÓRIAS:
- Para questões de múltipla escolha: analise cada alternativa e responda APENAS com a letra correta em negrito, ex: **A** ou **B** ou **C** etc.
- Para questões dissertativas: escreva uma resposta completa, clara e objetiva. Coloque a resposta sugerida em negrito entre marcadores assim: **RESPOSTA:** sua resposta aqui **FIM**
- Seja direto e preciso. Sem comentários desnecessários.
- Se for múltipla escolha, diga qual letra e por quê em uma frase curta.
- Responda sempre em português.
`.trim();

// ─── Helpers de embed ─────────────────────────────────────────────────

function embedLogin() {
  return new EmbedBuilder()
    .setColor(C.roxo)
    .setTitle("🏫  Sala do Futuro")
    .setDescription(
      "Acesse suas tarefas diretamente pelo Discord.\n\n" +
      "✦  Veja tarefas **pendentes** e **expiradas**\n" +
      "✦  Leia as questões uma a uma\n" +
      "✦  Responda com IA ou manualmente"
    )
    .setFooter({ text: "Sala do Futuro Bot  •  Seus dados ficam apenas na sessão" });
}

function embedCarregando(texto) {
  return new EmbedBuilder()
    .setColor(C.azul)
    .setTitle("⏳  Aguarde...")
    .setDescription(texto);
}

function embedErro(texto) {
  return new EmbedBuilder()
    .setColor(C.vermelho)
    .setTitle("❌  Erro")
    .setDescription(texto)
    .setFooter({ text: "Tente novamente" });
}

function embedTarefa(tarefa, index, total) {
  const statusEmoji = {
    pendente: "🟡",
    expirada: "🔴",
    entregue: "✅",
  }[tarefa.status] ?? "⚪";

  const barra = buildBarra(index + 1, total);

  return new EmbedBuilder()
    .setColor(tarefa.status === "pendente" ? C.amarelo : tarefa.status === "expirada" ? C.vermelho : C.verde)
    .setAuthor({ name: `📋  Tarefa ${index + 1} de ${total}  ${barra}` })
    .setTitle(`${statusEmoji}  ${tarefa.titulo}`)
    .addFields(
      { name: "Status", value: capitalizar(tarefa.status), inline: true },
      { name: "Prazo",  value: tarefa.prazo ?? "Não informado", inline: true },
    )
    .setFooter({ text: "Use os botões para navegar ou ver as questões" });
}

function embedQuestao(questao, index, total, tarefaTitulo) {
  const barra = buildBarra(index + 1, total);
  const tipo = questao.tipo === "multipla_escolha" ? "🔘 Múltipla Escolha" : "✍️  Dissertativa";

  const embed = new EmbedBuilder()
    .setColor(C.roxo)
    .setAuthor({ name: `${tarefaTitulo}  •  Questão ${index + 1}/${total}  ${barra}` })
    .setTitle(`❓  Questão ${index + 1}`)
    .setDescription(`${questao.enunciado}`)
    .addFields({ name: "Tipo", value: tipo, inline: true });

  if (questao.tipo === "multipla_escolha" && questao.alternativas.length > 0) {
    embed.addFields({
      name: "Alternativas",
      value: questao.alternativas.map((a, i) => `\`${letras[i]}\`  ${a}`).join("\n"),
    });
    embed.setFooter({ text: `Responda: !c A  ou  !c B  ...  ou use ✨ Responder com IA` });
  } else {
    embed.setFooter({ text: `Responda: !c Sua resposta  (reply)  ou use ✨ Responder com IA` });
  }

  if (questao.respondida) {
    embed.addFields({ name: "✅  Sua resposta", value: `\`${questao.resposta}\`` });
    embed.setColor(C.verde);
  }

  if (questao.imagem) embed.setImage(questao.imagem);

  return embed;
}

const letras = ["A", "B", "C", "D", "E"];

function buildBarra(atual, total, tam = 10) {
  const preenchido = Math.round((atual / total) * tam);
  return "▓".repeat(preenchido) + "░".repeat(tam - preenchido);
}

function capitalizar(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ─── Botões de navegação de TAREFAS ──────────────────────────────────

function rowNavTarefas(index, total, temLink) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("sf_tarefa_ant")
      .setLabel("◀  Anterior")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(index === 0),
    new ButtonBuilder()
      .setCustomId("sf_tarefa_prox")
      .setLabel("Próxima  ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(index >= total - 1),
    new ButtonBuilder()
      .setCustomId("sf_ver_questoes")
      .setLabel("📖  Ver Questões")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!temLink),
    new ButtonBuilder()
      .setCustomId("sf_sair")
      .setLabel("Sair")
      .setStyle(ButtonStyle.Danger),
  );
}

// ─── Botões de navegação de QUESTÕES ─────────────────────────────────

function rowNavQuestoes(index, total) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("sf_questao_ant")
      .setLabel("◀")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(index === 0),
    new ButtonBuilder()
      .setCustomId("sf_questao_prox")
      .setLabel("▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(index >= total - 1),
    new ButtonBuilder()
      .setCustomId("sf_voltar_tarefas")
      .setLabel("📋  Tarefas")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("sf_responder_ia")
      .setLabel("✨ IA")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("sf_responder")
      .setLabel("✏️  Manual")
      .setStyle(ButtonStyle.Primary),
  );
}

// ─── Botões de confirmação de resposta dissertativa ───────────────────

function rowConfirmacaoDissertativa() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("sf_confirmar_ia")
      .setLabel("✅ Enviar essa resposta")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("sf_editar_dissertativa")
      .setLabel("✏️ Quero escrever a minha")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("sf_cancelar_ia")
      .setLabel("❌ Cancelar")
      .setStyle(ButtonStyle.Danger),
  );
}

// ─── Instância da IA ──────────────────────────────────────────────────

function criarClienteIA() {
  const api1Key = process.env.GROQ_API_KEY;
  const api2Key = process.env.GROQ_API_KEY2;

  const api1 = new OpenAI({
    baseURL: "https://literouter.com/api/v1",
    apiKey: api1Key,
  });

  const api2 = new OpenAI({
    baseURL: "https://api.groq.com/openai/v1",
    apiKey: api2Key,
  });

  return { api1, api2 };
}

// ─── Função: pedir resposta para a IA ────────────────────────────────

async function pedirRespostaIA(questao) {
  const { api1, api2 } = criarClienteIA();

  // Monta o texto da questão
  let textoQuestao = `Questão: ${questao.enunciado}\n\nTipo: ${questao.tipo === "multipla_escolha" ? "Múltipla Escolha" : "Dissertativa"}`;

  if (questao.tipo === "multipla_escolha" && questao.alternativas.length > 0) {
    textoQuestao += "\n\nAlternativas:\n";
    questao.alternativas.forEach((alt, i) => {
      textoQuestao += `${letras[i]}) ${alt}\n`;
    });
    textoQuestao += "\nResponda APENAS com a letra correta em negrito, ex: **A**";
  } else {
    textoQuestao += "\n\nEscreva uma resposta dissertativa. Coloque a resposta entre: **RESPOSTA:** aqui **FIM**";
  }

  const mensagens = [
    { role: "system", content: PROMPT_TAREFAS },
    { role: "user", content: textoQuestao },
  ];

  let resposta = null;

  // Tenta API 1
  try {
    const r1 = await api1.chat.completions.create({
      model: "meta-llama/llama-3.3-70b-instruct:free",
      messages: mensagens,
      temperature: 0.3,
    });
    resposta = r1.choices?.[0]?.message?.content;
  } catch (err) {
    console.log("⚠️ [Tarefas IA] API 1 falhou:", err?.message);
  }

  // Tenta API 2 se necessário
  if (!resposta) {
    const r2 = await api2.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: mensagens,
      temperature: 0.3,
    });
    resposta = r2.choices?.[0]?.message?.content;
  }

  return resposta;
}

// ─── Extrai resposta da IA do texto retornado ─────────────────────────

function extrairRespostaMultipla(textoIA) {
  // Procura padrão **A**, **B**, etc.
  const match = textoIA.match(/\*\*([A-Ea-e])\*\*/);
  if (match) return match[1].toUpperCase();

  // Fallback: procura letra isolada no início
  const matchSimples = textoIA.match(/^([A-Ea-e])[).:\s]/);
  if (matchSimples) return matchSimples[1].toUpperCase();

  return null;
}

function extrairRespostaDissertativa(textoIA) {
  // Procura padrão **RESPOSTA:** texto **FIM**
  const match = textoIA.match(/\*\*RESPOSTA:\*\*\s*([\s\S]*?)\s*\*\*FIM\*\*/i);
  if (match) return match[1].trim();

  // Fallback: retorna o texto inteiro limpo de markdown
  return textoIA.replace(/\*\*/g, "").trim();
}

// ─────────────────────────────────────────────────────────────────────
// Setup do bot
// ─────────────────────────────────────────────────────────────────────
function setup(client) {

  // ── Listeners de mensagem ─────────────────────────────────────────────
  client.on("messageCreate", async (msg) => {
    if (msg.author.bot) return;

    // ── Comando !tarefasmsg ─────────────────────────────────────────────
    if (msg.content === "!tarefasmsg") {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("sf_entrar")
          .setLabel("🚀  Entrar na Sala do Futuro")
          .setStyle(ButtonStyle.Primary)
      );
      await msg.channel.send({ embeds: [embedLogin()], components: [row] });
      return;
    }

    // ── Comando !c <resposta> (reply em questão) ─────────────────────────
    if (msg.content.startsWith("!c ") && msg.reference) {
      const userId = msg.author.id;
      const sess = sessoes.get(userId);
      if (!sess) return;

      const esperando = aguardandoResposta.get(userId);
      if (!esperando || msg.reference.messageId !== esperando.messageId) return;

      const respostaTexto = msg.content.slice(3).trim();
      if (!respostaTexto) return;

      await _enviarRespostaFinal(msg, sess, userId, respostaTexto, esperando.feedbackMsgId);
      return;
    }

    // ── Reply com texto livre para dissertativa (sem !c) ─────────────────
    if (msg.reference) {
      const userId = msg.author.id;
      const esperando = aguardandoResposta.get(userId);

      if (esperando && msg.reference.messageId === esperando.messageId && !msg.content.startsWith("!")) {
        const sess = sessoes.get(userId);
        if (!sess) return;
        await _enviarRespostaFinal(msg, sess, userId, msg.content.trim(), null);
      }
    }
  });

  // ── Interações ────────────────────────────────────────────────────────
  client.on("interactionCreate", async (interaction) => {

    // ── Botão "Entrar" → abre modal ───────────────────────────────────
    if (interaction.isButton() && interaction.customId === "sf_entrar") {
      const modal = new ModalBuilder()
        .setCustomId("sf_modal_login")
        .setTitle("Sala do Futuro — Login");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("ra")
            .setLabel("RA (Registro do Aluno)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Ex: 1119391234")
            .setMinLength(6).setMaxLength(15)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("senha")
            .setLabel("Senha")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Sua senha")
            .setMinLength(1).setMaxLength(50)
            .setRequired(true)
        )
      );

      await interaction.showModal(modal);
      return;
    }

    // ── Modal login → faz login + lista tarefas ───────────────────────
    if (interaction.isModalSubmit() && interaction.customId === "sf_modal_login") {
      const ra     = interaction.fields.getTextInputValue("ra").trim();
      const senha  = interaction.fields.getTextInputValue("senha").trim();
      const userId = interaction.user.id;

      await interaction.deferReply({ ephemeral: true });
      await interaction.editReply({ embeds: [embedCarregando("Abrindo navegador e fazendo login...")] });

      try {
        const sessAnterior = sessoes.get(userId);
        if (sessAnterior) {
          try { await sessAnterior.browser.close(); } catch (_) {}
          sessoes.delete(userId);
        }

        const { browser, page } = await login(ra, senha);

        await interaction.editReply({ embeds: [embedCarregando("Login feito! Buscando tarefas...")] });

        const tarefas = await listarTarefas(page);

        if (!tarefas || tarefas.length === 0) {
          await browser.close();
          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(C.cinza)
                .setTitle("📭  Nenhuma tarefa encontrada")
                .setDescription("Não encontrei tarefas na sua conta."),
            ],
          });
          return;
        }

        sessoes.set(userId, {
          browser, page,
          tarefas,
          tarefaAtual:  0,
          questoes:     [],
          questaoAtual: 0,
          tarefaMsg:    null,
          questaoMsg:   null,
        });

        const sess  = sessoes.get(userId);
        const total = tarefas.length;

        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(C.verde)
              .setTitle("✅  Logado!")
              .setDescription(`Encontrei **${total} tarefa(s)**. Veja no canal!`),
          ],
        });

        const tarefaEmbed = embedTarefa(tarefas[0], 0, total);
        const tarefaRow   = rowNavTarefas(0, total, !!tarefas[0].link);

        sess.tarefaMsg = await interaction.channel.send({
          embeds: [tarefaEmbed],
          components: [tarefaRow],
        });

      } catch (err) {
        console.error("[SF] Erro login:", err);
        await interaction.editReply({ embeds: [embedErro(err.message)] });
      }
      return;
    }

    // ── Botões que precisam de sessão ─────────────────────────────────
    if (!interaction.isButton()) return;

    const userId = interaction.user.id;
    const sess   = sessoes.get(userId);

    if (!sess && !["sf_entrar"].includes(interaction.customId)) {
      await interaction.reply({
        embeds: [embedErro("Sessão não encontrada. Use !tarefasmsg para começar.")],
        ephemeral: true,
      });
      return;
    }

    // ── Navegar tarefas ───────────────────────────────────────────────
    if (interaction.customId === "sf_tarefa_ant" || interaction.customId === "sf_tarefa_prox") {
      await interaction.deferUpdate();

      if (interaction.customId === "sf_tarefa_ant") sess.tarefaAtual = Math.max(0, sess.tarefaAtual - 1);
      if (interaction.customId === "sf_tarefa_prox") sess.tarefaAtual = Math.min(sess.tarefas.length - 1, sess.tarefaAtual + 1);

      const t = sess.tarefas[sess.tarefaAtual];
      await interaction.message.edit({
        embeds:     [embedTarefa(t, sess.tarefaAtual, sess.tarefas.length)],
        components: [rowNavTarefas(sess.tarefaAtual, sess.tarefas.length, !!t.link)],
      });
      return;
    }

    // ── Ver questões ──────────────────────────────────────────────────
    if (interaction.customId === "sf_ver_questoes") {
      await interaction.deferUpdate();

      const tarefa = sess.tarefas[sess.tarefaAtual];
      if (!tarefa.link) {
        await interaction.followUp({ embeds: [embedErro("Esta tarefa não tem link disponível.")], ephemeral: true });
        return;
      }

      await interaction.message.edit({
        embeds: [embedCarregando(`Abrindo tarefa: **${tarefa.titulo}**\nIsso pode levar alguns segundos...`)],
        components: [],
      });

      try {
        const questoes = await extrairQuestoes(sess.browser, tarefa.link);

        if (!questoes || questoes.length === 0) {
          await interaction.message.edit({
            embeds: [
              new EmbedBuilder()
                .setColor(C.cinza)
                .setTitle("📭  Sem questões")
                .setDescription("Não encontrei questões nesta tarefa."),
            ],
            components: [rowNavTarefas(sess.tarefaAtual, sess.tarefas.length, true)],
          });
          return;
        }

        sess.questoes     = questoes;
        sess.questaoAtual = 0;

        await interaction.message.edit({
          embeds:     [embedQuestao(questoes[0], 0, questoes.length, tarefa.titulo)],
          components: [rowNavQuestoes(0, questoes.length)],
        });

        sess.questaoMsg = interaction.message;

      } catch (err) {
        console.error("[SF] Erro ao extrair questões:", err);
        await interaction.message.edit({
          embeds:     [embedErro(err.message)],
          components: [rowNavTarefas(sess.tarefaAtual, sess.tarefas.length, true)],
        });
      }
      return;
    }

    // ── Navegar questões ──────────────────────────────────────────────
    if (interaction.customId === "sf_questao_ant" || interaction.customId === "sf_questao_prox") {
      await interaction.deferUpdate();
      aguardandoResposta.delete(userId);
      aguardandoConfirmacao.delete(userId);

      if (interaction.customId === "sf_questao_ant") sess.questaoAtual = Math.max(0, sess.questaoAtual - 1);
      if (interaction.customId === "sf_questao_prox") sess.questaoAtual = Math.min(sess.questoes.length - 1, sess.questaoAtual + 1);

      const q      = sess.questoes[sess.questaoAtual];
      const tarefa = sess.tarefas[sess.tarefaAtual];

      await interaction.message.edit({
        embeds:     [embedQuestao(q, sess.questaoAtual, sess.questoes.length, tarefa.titulo)],
        components: [rowNavQuestoes(sess.questaoAtual, sess.questoes.length)],
      });

      sess.questaoMsg = interaction.message;
      return;
    }

    // ── Voltar para lista de tarefas ──────────────────────────────────
    if (interaction.customId === "sf_voltar_tarefas") {
      await interaction.deferUpdate();
      aguardandoResposta.delete(userId);
      aguardandoConfirmacao.delete(userId);

      const t     = sess.tarefas[sess.tarefaAtual];
      const total = sess.tarefas.length;

      await interaction.message.edit({
        embeds:     [embedTarefa(t, sess.tarefaAtual, total)],
        components: [rowNavTarefas(sess.tarefaAtual, total, !!t.link)],
      });
      return;
    }

    // ── Botão "✨ IA" → pede resposta para a IA ───────────────────────
    if (interaction.customId === "sf_responder_ia") {
      await interaction.deferReply({ ephemeral: false });

      const q      = sess.questoes[sess.questaoAtual];
      const tarefa = sess.tarefas[sess.tarefaAtual];

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(C.azul)
            .setTitle("🤖  IA analisando a questão...")
            .setDescription(`Questão ${q.numero}: ${q.enunciado.slice(0, 100)}...`),
        ],
      });

      try {
        const respostaTextoIA = await pedirRespostaIA(q);

        if (!respostaTextoIA) {
          await interaction.editReply({ embeds: [embedErro("A IA não conseguiu gerar uma resposta.")] });
          return;
        }

        // ── Múltipla escolha: extrai letra e responde automaticamente ──
        if (q.tipo === "multipla_escolha") {
          const letra = extrairRespostaMultipla(respostaTextoIA);

          if (!letra) {
            await interaction.editReply({
              embeds: [embedErro(`A IA não conseguiu identificar a letra correta.\n\nResposta completa:\n${respostaTextoIA}`)],
            });
            return;
          }

          // Mostra o raciocínio e já envia
          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(C.laranja)
                .setTitle(`🤖  IA escolheu: **${letra}**`)
                .setDescription(respostaTextoIA)
                .setFooter({ text: "Enviando resposta automaticamente..." }),
            ],
          });

          // Envia a resposta
          try {
            const ok = await responderQuestao(sess.browser, tarefa.link, q.numero, letra);

            q.respondida = true;
            q.resposta   = letra;

            if (sess.questaoMsg) {
              await sess.questaoMsg.edit({
                embeds:     [embedQuestao(q, sess.questaoAtual, sess.questoes.length, tarefa.titulo)],
                components: [rowNavQuestoes(sess.questaoAtual, sess.questoes.length)],
              }).catch(() => {});
            }

            await interaction.editReply({
              embeds: [
                new EmbedBuilder()
                  .setColor(ok ? C.verde : C.amarelo)
                  .setTitle(ok ? `✅  Respondido com **${letra}**!` : `⚠️  Salvo localmente como **${letra}**`)
                  .setDescription(respostaTextoIA),
              ],
            });

          } catch (err) {
            await interaction.editReply({ embeds: [embedErro(`Falha ao enviar: ${err.message}`)] });
          }

        // ── Dissertativa: mostra sugestão e pede confirmação ──────────
        } else {
          const respostaSugerida = extrairRespostaDissertativa(respostaTextoIA);

          // Guarda para usar na confirmação
          aguardandoConfirmacao.set(userId, { respostaIA: respostaSugerida });

          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(C.laranja)
                .setTitle("🤖  Sugestão da IA")
                .setDescription(
                  `**Questão ${q.numero}:** ${q.enunciado.slice(0, 100)}${q.enunciado.length > 100 ? "..." : ""}\n\n` +
                  `**Resposta sugerida:**\n${respostaSugerida}`
                )
                .setFooter({ text: "Escolha uma opção abaixo" }),
            ],
            components: [rowConfirmacaoDissertativa()],
          });
        }

      } catch (err) {
        console.error("[SF] Erro IA:", err);
        await interaction.editReply({ embeds: [embedErro(`Erro na IA: ${err.message}`)] });
      }
      return;
    }

    // ── Confirmar resposta da IA (dissertativa) ───────────────────────
    if (interaction.customId === "sf_confirmar_ia") {
      const confirmacao = aguardandoConfirmacao.get(userId);
      if (!confirmacao) {
        await interaction.reply({ embeds: [embedErro("Nenhuma resposta pendente de confirmação.")], ephemeral: true });
        return;
      }

      await interaction.deferUpdate();

      const q      = sess.questoes[sess.questaoAtual];
      const tarefa = sess.tarefas[sess.tarefaAtual];
      const respostaFinal = confirmacao.respostaIA;

      aguardandoConfirmacao.delete(userId);

      try {
        const ok = await responderQuestao(sess.browser, tarefa.link, q.numero, respostaFinal);

        q.respondida = true;
        q.resposta   = respostaFinal;

        if (sess.questaoMsg) {
          await sess.questaoMsg.edit({
            embeds:     [embedQuestao(q, sess.questaoAtual, sess.questoes.length, tarefa.titulo)],
            components: [rowNavQuestoes(sess.questaoAtual, sess.questoes.length)],
          }).catch(() => {});
        }

        await interaction.message.edit({
          embeds: [
            new EmbedBuilder()
              .setColor(ok ? C.verde : C.amarelo)
              .setTitle(ok ? "✅  Resposta enviada!" : "⚠️  Salvo localmente")
              .setDescription(`**Questão ${q.numero}** respondida com a sugestão da IA.`),
          ],
          components: [],
        });

      } catch (err) {
        await interaction.message.edit({
          embeds:     [embedErro(`Falha ao enviar: ${err.message}`)],
          components: [],
        });
      }
      return;
    }

    // ── Editar resposta dissertativa (usuário quer escrever a sua) ─────
    if (interaction.customId === "sf_editar_dissertativa") {
      aguardandoConfirmacao.delete(userId);

      const q = sess.questoes[sess.questaoAtual];

      const instrucaoMsg = await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(C.azul)
            .setTitle(`✏️  Escreva sua resposta — Questão ${q.numero}`)
            .setDescription(
              "**Faça reply nesta mensagem** com sua resposta.\n\n" +
              `> ${q.enunciado.slice(0, 200)}${q.enunciado.length > 200 ? "..." : ""}`
            )
            .setFooter({ text: "Qualquer texto em reply nesta mensagem será enviado como resposta" }),
        ],
        fetchReply: true,
      });

      aguardandoResposta.set(userId, {
        messageId: instrucaoMsg.id,
        channelId: interaction.channelId,
      });
      return;
    }

    // ── Cancelar IA ───────────────────────────────────────────────────
    if (interaction.customId === "sf_cancelar_ia") {
      await interaction.deferUpdate();
      aguardandoConfirmacao.delete(userId);

      await interaction.message.edit({
        embeds: [
          new EmbedBuilder()
            .setColor(C.cinza)
            .setTitle("❌  Cancelado")
            .setDescription("Resposta da IA descartada. Use os botões na questão para responder manualmente."),
        ],
        components: [],
      });
      return;
    }

    // ── Botão "✏️ Manual" → instrução para responder via reply ────────
    if (interaction.customId === "sf_responder") {
      const q = sess.questoes[sess.questaoAtual];

      let instrucao = "";
      if (q.tipo === "multipla_escolha") {
        instrucao =
          "**Faça reply nesta mensagem** com `!c` seguido da letra:\n```!c A```\n" +
          "*(substituindo A pela letra correta)*\n\n" +
          q.alternativas.map((a, i) => `\`${letras[i]}\`  ${a}`).join("\n");
      } else {
        instrucao =
          "**Faça reply nesta mensagem** com seu texto:\n\n" +
          "Qualquer mensagem em reply aqui será enviada como resposta.";
      }

      const aviso = await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(C.azul)
            .setTitle(`✏️  Respondendo Questão ${q.numero}`)
            .setDescription(instrucao),
        ],
        fetchReply: true,
      });

      aguardandoResposta.set(userId, {
        messageId: aviso.id,
        channelId: interaction.channelId,
      });
      return;
    }

    // ── Sair ──────────────────────────────────────────────────────────
    if (interaction.customId === "sf_sair") {
      await interaction.deferUpdate();
      aguardandoResposta.delete(userId);
      aguardandoConfirmacao.delete(userId);

      try { await sess.browser.close(); } catch (_) {}
      sessoes.delete(userId);

      await interaction.message.edit({
        embeds: [
          new EmbedBuilder()
            .setColor(C.cinza)
            .setTitle("👋  Sessão encerrada")
            .setDescription("Você saiu da Sala do Futuro. Use !tarefasmsg para entrar novamente."),
        ],
        components: [],
      });
      return;
    }
  });
}

// ─── Helper interno: envia resposta final ao site ────────────────────

async function _enviarRespostaFinal(msg, sess, userId, respostaTexto, feedbackMsgId) {
  const questao = sess.questoes[sess.questaoAtual];
  const tarefa  = sess.tarefas[sess.tarefaAtual];

  aguardandoResposta.delete(userId);

  const feedbackMsg = await msg.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(C.azul)
        .setTitle("⏳  Enviando resposta...")
        .setDescription(`Questão **${questao.numero}**: \`${respostaTexto}\``),
    ],
  });

  try {
    const ok = await responderQuestao(sess.browser, tarefa.link, questao.numero, respostaTexto);

    questao.respondida = true;
    questao.resposta   = respostaTexto;

    if (sess.questaoMsg) {
      await sess.questaoMsg.edit({
        embeds:     [embedQuestao(questao, sess.questaoAtual, sess.questoes.length, tarefa.titulo)],
        components: [rowNavQuestoes(sess.questaoAtual, sess.questoes.length)],
      }).catch(() => {});
    }

    await feedbackMsg.edit({
      embeds: [
        new EmbedBuilder()
          .setColor(ok ? C.verde : C.amarelo)
          .setTitle(ok ? "✅  Resposta enviada!" : "⚠️  Salvo localmente")
          .setDescription(
            ok
              ? `Questão **${questao.numero}** respondida: \`${respostaTexto}\``
              : `Não consegui confirmar no site, mas salvei localmente.`
          ),
      ],
    });

  } catch (err) {
    await feedbackMsg.edit({ embeds: [embedErro(`Falha ao enviar: ${err.message}`)] });
  }
}

module.exports = { setup };
