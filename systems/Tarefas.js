const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  EmbedBuilder, ModalBuilder,
  TextInputBuilder, TextInputStyle,
  StringSelectMenuBuilder,
} = require("discord.js");

const { login, listarTarefas, extrairQuestoes, responderQuestao } = require("./scraper");

// ─── Paleta ───────────────────────────────────────────────────────────
const C = {
  roxo:    0x5c2d91,
  verde:   0x57f287,
  vermelho:0xed4245,
  amarelo: 0xffd700,
  azul:    0x5865f2,
  cinza:   0x99aab5,
};

// userId → sessão { browser, page, tarefas, tarefaAtual, questoes, questaoAtual, tarefaMsg, questaoMsg }
const sessoes = new Map();

// userId → { channelId, coletor } — para coletar resposta via reply
const aguardandoResposta = new Map();

// ─── Helpers de embed ─────────────────────────────────────────────────

function embedLogin() {
  return new EmbedBuilder()
    .setColor(C.roxo)
    .setTitle("🏫  Sala do Futuro")
    .setDescription(
      "Acesse suas tarefas diretamente pelo Discord.\n\n" +
      "✦  Veja tarefas **pendentes** e **expiradas**\n" +
      "✦  Leia as questões uma a uma\n" +
      "✦  Responda diretamente no Discord"
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
    pendente:  "🟡",
    expirada:  "🔴",
    entregue:  "✅",
  }[tarefa.status] ?? "⚪";

  const barra = buildBarra(index + 1, total);

  return new EmbedBuilder()
    .setColor(tarefa.status === "pendente" ? C.amarelo : tarefa.status === "expirada" ? C.vermelho : C.verde)
    .setAuthor({ name: `📋  Tarefa ${index + 1} de ${total}  ${barra}` })
    .setTitle(`${statusEmoji}  ${tarefa.titulo}`)
    .addFields(
      { name: "Status",  value: capitalizar(tarefa.status), inline: true },
      { name: "Prazo",   value: tarefa.prazo ?? "Não informado", inline: true },
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
    embed.setFooter({ text: `Responda: !c A  ou  !c B  ...  (reply nesta mensagem)` });
  } else {
    embed.setFooter({ text: `Responda: !c Sua resposta aqui  (reply nesta mensagem)` });
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
      .setLabel("◀  Anterior")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(index === 0),
    new ButtonBuilder()
      .setCustomId("sf_questao_prox")
      .setLabel("Próxima  ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(index >= total - 1),
    new ButtonBuilder()
      .setCustomId("sf_voltar_tarefas")
      .setLabel("📋  Tarefas")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("sf_responder")
      .setLabel("✏️  Responder")
      .setStyle(ButtonStyle.Success),
  );
}

// ─────────────────────────────────────────────────────────────────────
// Setup do bot
// ─────────────────────────────────────────────────────────────────────
function setup(client) {

  // ── !tarefasmsg → painel inicial ─────────────────────────────────────
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
      // Confirma que é reply na mensagem de questão certa
      if (!esperando || msg.reference.messageId !== esperando.messageId) return;

      const respostaTexto = msg.content.slice(3).trim();
      if (!respostaTexto) return;

      const questao = sess.questoes[sess.questaoAtual];
      const tarefa  = sess.tarefas[sess.tarefaAtual];

      // Feedback imediato
      const feedbackMsg = await msg.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(C.azul)
            .setTitle("⏳  Enviando resposta...")
            .setDescription(`Questão **${questao.numero}**: \`${respostaTexto}\``),
        ],
      });

      try {
        const ok = await responderQuestao(
          sess.browser,
          tarefa.link,
          questao.numero,
          respostaTexto
        );

        // Atualiza estado local
        questao.respondida = true;
        questao.resposta   = respostaTexto;
        aguardandoResposta.delete(userId);

        // Atualiza embed da questão original
        if (sess.questaoMsg) {
          await sess.questaoMsg.edit({
            embeds: [embedQuestao(questao, sess.questaoAtual, sess.questoes.length, tarefa.titulo)],
            components: [rowNavQuestoes(sess.questaoAtual, sess.questoes.length)],
          }).catch(() => {});
        }

        await feedbackMsg.edit({
          embeds: [
            new EmbedBuilder()
              .setColor(ok ? C.verde : C.amarelo)
              .setTitle(ok ? "✅  Resposta enviada!" : "⚠️  Resposta salva localmente")
              .setDescription(
                ok
                  ? `Questão **${questao.numero}** respondida com: \`${respostaTexto}\``
                  : `Não consegui confirmar o envio no site, mas salvei localmente.`
              ),
          ],
        });

      } catch (err) {
        await feedbackMsg.edit({
          embeds: [embedErro(`Falha ao enviar: ${err.message}`)],
        });
      }
      return;
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
      const ra    = interaction.fields.getTextInputValue("ra").trim();
      const senha = interaction.fields.getTextInputValue("senha").trim();
      const userId = interaction.user.id;

      await interaction.deferReply({ ephemeral: true });
      await interaction.editReply({ embeds: [embedCarregando("Abrindo navegador e fazendo login...")] });

      try {
        // Fecha sessão anterior
        const sessAnterior = sessoes.get(userId);
        if (sessAnterior) {
          try { await sessAnterior.browser.close(); } catch (_) {}
          sessoes.delete(userId);
        }

        // Login
        const { browser, page } = await login(ra, senha);

        await interaction.editReply({ embeds: [embedCarregando("Login feito! Buscando tarefas...")] });

        // Lista tarefas
        const tarefas = await listarTarefas(page);

        if (!tarefas || tarefas.length === 0) {
          await browser.close();
          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(C.cinza)
                .setTitle("📭  Nenhuma tarefa encontrada")
                .setDescription("Não encontrei tarefas na sua conta. Verifique no site diretamente.")
            ],
          });
          return;
        }

        // Salva sessão
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

        // Aviso privado de sucesso
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(C.verde)
              .setTitle("✅  Logado!")
              .setDescription(`Encontrei **${total} tarefa(s)**. Veja no canal!`),
          ],
        });

        // Manda primeira tarefa no canal
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

    // ── Ver questões de uma tarefa ────────────────────────────────────
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
                .setDescription("Não encontrei questões nesta tarefa. Pode ser um tipo de atividade diferente."),
            ],
            components: [rowNavTarefas(sess.tarefaAtual, sess.tarefas.length, true)],
          });
          return;
        }

        sess.questoes     = questoes;
        sess.questaoAtual = 0;

        const q     = questoes[0];
        const total = questoes.length;

        // Edita msg de tarefa para mostrar primeira questão
        await interaction.message.edit({
          embeds:     [embedQuestao(q, 0, total, tarefa.titulo)],
          components: [rowNavQuestoes(0, total)],
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

      const t     = sess.tarefas[sess.tarefaAtual];
      const total = sess.tarefas.length;

      await interaction.message.edit({
        embeds:     [embedTarefa(t, sess.tarefaAtual, total)],
        components: [rowNavTarefas(sess.tarefaAtual, total, !!t.link)],
      });
      return;
    }

    // ── Botão "Responder" → instrução para !c ─────────────────────────
    if (interaction.customId === "sf_responder") {
      const q = sess.questoes[sess.questaoAtual];

      let instrucao = "";
      if (q.tipo === "multipla_escolha") {
        instrucao =
          "**Responda fazendo reply nesta mensagem** com:\n```!c A```\n" +
          "*(substituindo A pela letra correta)*\n\n" +
          q.alternativas.map((a, i) => `\`${letras[i]}\`  ${a}`).join("\n");
      } else {
        instrucao =
          "**Responda fazendo reply nesta mensagem** com:\n```!c Sua resposta aqui```";
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

      // Registra que estamos esperando reply para esta questão
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

module.exports = { setup };
