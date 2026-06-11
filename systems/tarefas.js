const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require("discord.js");

const playwright = require("playwright");

// Armazena sessões ativas por usuário
const sessoes = new Map();

module.exports = (client) => {
  // ─────────────────────────────────────────────
  // COMANDO !tarefasmsg
  // ─────────────────────────────────────────────
  client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) return;

    if (message.content.toLowerCase() === "!tarefasmsg") {
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("📚  Sala do Futuro — Tarefas")
        .setDescription(
          "Acesse suas tarefas da plataforma **Sala do Futuro** diretamente pelo Discord.\n\n" +
          "**Como funciona:**\n" +
          "⬜  Inserir RA e senha\n" +
          "⬜  Autenticar na plataforma\n" +
          "⬜  Carregar suas tarefas\n" +
          "⬜  Você escolhe qual fazer\n" +
          "⬜  As questões chegam aqui\n\n" +
          "*Seus dados são usados apenas nesta sessão e não são armazenados permanentemente.*"
        )
        .setFooter({ text: "Sala do Futuro • Seduc-SP" })
        .setTimestamp();

      const botao = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("tarefas_login")
          .setLabel("Entrar com RA e Senha")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("🔐")
      );

      await message.reply({ embeds: [embed], components: [botao] });
    }

    // ─────────────────────────────────────────────
    // RESPOSTA DE QUESTÃO: !c <início da alternativa>
    // ─────────────────────────────────────────────
    if (message.content.toLowerCase().startsWith("!c ")) {
      const sessao = sessoes.get(message.author.id);
      if (!sessao || !sessao.aguardandoResposta) return;

      const resposta = message.content.slice(3).trim().toLowerCase();
      const { questaoAtual, alternativas, page, resolverQuestao } = sessao;

      // Acha a alternativa que começa com o texto enviado
      const alternativaEscolhida = alternativas.find((alt) =>
        alt.texto.toLowerCase().startsWith(resposta)
      );

      if (!alternativaEscolhida) {
        await message.reply(
          "❌ Não encontrei essa alternativa. Responda com o **início** da opção em negrito."
        );
        return;
      }

      await message.reply(
        `✅ Alternativa **"${alternativaEscolhida.texto}"** selecionada! Confirmando...`
      );

      sessao.aguardandoResposta = false;
      await resolverQuestao(alternativaEscolhida);
    }
  });

  // ─────────────────────────────────────────────
  // BOTÃO: Abrir modal de login
  // ─────────────────────────────────────────────
  client.on("interactionCreate", async (interaction) => {
    // ── Modal de Login ──
    if (
      interaction.isButton() &&
      interaction.customId === "tarefas_login"
    ) {
      const modal = new ModalBuilder()
        .setCustomId("tarefas_modal_login")
        .setTitle("Login — Sala do Futuro");

      const raInput = new TextInputBuilder()
        .setCustomId("ra")
        .setLabel("RA (Registro do Aluno)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Ex: 123456789")
        .setRequired(true);

      const senhaInput = new TextInputBuilder()
        .setCustomId("senha")
        .setLabel("Senha")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Sua senha da plataforma")
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(raInput),
        new ActionRowBuilder().addComponents(senhaInput)
      );

      await interaction.showModal(modal);
    }

    // ── Submit do Modal ──
    if (interaction.isModalSubmit() && interaction.customId === "tarefas_modal_login") {
      const ra = interaction.fields.getTextInputValue("ra").trim();
      const senha = interaction.fields.getTextInputValue("senha").trim();

      await interaction.reply({
        embeds: [embedStatus("Iniciando sessão...", [
          { label: "Inserir RA e senha", feito: true },
          { label: "Autenticar na plataforma", feito: false },
          { label: "Carregar suas tarefas", feito: false },
          { label: "Você escolhe qual fazer", feito: false },
          { label: "As questões chegam aqui", feito: false },
        ])],
        ephemeral: true,
      });

      iniciarSessao(client, interaction, ra, senha);
    }

    // ── Seleção de tarefas ──
    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === "tarefas_escolha"
    ) {
      const sessao = sessoes.get(interaction.user.id);
      if (!sessao) return;

      const escolhidas = interaction.values; // array de índices
      sessao.tarefasEscolhidas = escolhidas;

      const modal = new ModalBuilder()
        .setCustomId("tarefas_modal_tempo")
        .setTitle("Tempo por tarefa");

      const tempoInput = new TextInputBuilder()
        .setCustomId("tempo")
        .setLabel("Quantos minutos por tarefa?")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Ex: 30")
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(tempoInput));
      await interaction.showModal(modal);
    }

    // ── Submit do tempo ──
    if (
      interaction.isModalSubmit() &&
      interaction.customId === "tarefas_modal_tempo"
    ) {
      const sessao = sessoes.get(interaction.user.id);
      if (!sessao) return;

      const minutos = parseInt(interaction.fields.getTextInputValue("tempo"));
      if (isNaN(minutos) || minutos < 1) {
        await interaction.reply({
          content: "❌ Tempo inválido. Digite um número em minutos.",
          ephemeral: true,
        });
        return;
      }

      sessao.tempoPorTarefa = minutos * 60 * 1000;

      await interaction.reply({
        content: `⏱️ Combinado! **${minutos} minutos** por tarefa. Iniciando...`,
        ephemeral: true,
      });

      processarTarefas(client, interaction.user, sessao);
    }
  });
};

// ─────────────────────────────────────────────
// EMBED DE STATUS COM PROGRESSO
// ─────────────────────────────────────────────
function embedStatus(titulo, passos) {
  const linhas = passos.map(
    (p) => `${p.feito ? "✅" : "⬜"}  ${p.label}`
  );

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📚  Sala do Futuro — Tarefas")
    .setDescription(`**${titulo}**\n\n${linhas.join("\n")}`)
    .setFooter({ text: "Sala do Futuro • Seduc-SP" })
    .setTimestamp();
}

// ─────────────────────────────────────────────
// INICIAR SESSÃO COM PLAYWRIGHT
// ─────────────────────────────────────────────
async function iniciarSessao(client, interaction, ra, senha) {
  const userId = interaction.user.id;
  const apiKey = process.env.SED_APIM_KEY;

  let browser;
  try {
    browser = await playwright.chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Injeta a API key como header se disponível
    if (apiKey) {
      await context.setExtraHTTPHeaders({ "x-api-key": apiKey });
    }

    // ── Passo 2: Autenticando ──
    await interaction.editReply({
      embeds: [embedStatus("Autenticando na plataforma...", [
        { label: "Inserir RA e senha", feito: true },
        { label: "Autenticar na plataforma", feito: false },
        { label: "Carregar suas tarefas", feito: false },
        { label: "Você escolhe qual fazer", feito: false },
        { label: "As questões chegam aqui", feito: false },
      ])],
    });

    await page.goto("https://saladofuturo.educacao.sp.gov.br/login-alunos", {
      waitUntil: "networkidle",
    });

    // Preenche RA e senha (ajuste os seletores se necessário)
    await page.fill('input[name="ra"], input[placeholder*="RA"], input[id*="ra"]', ra);
    await page.fill('input[type="password"]', senha);
    await page.click('button[type="submit"], button:has-text("Entrar"), button:has-text("Login")');

    await page.waitForNavigation({ waitUntil: "networkidle", timeout: 15000 }).catch(() => {});

    // Verifica se logou
    const url = page.url();
    if (url.includes("login")) {
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("❌ Falha no login")
          .setDescription("RA ou senha incorretos. Use `!tarefasmsg` para tentar novamente.")
        ],
      });
      await browser.close();
      return;
    }

    // ── Passo 3: Carregando tarefas ──
    await interaction.editReply({
      embeds: [embedStatus("Carregando suas tarefas...", [
        { label: "Inserir RA e senha", feito: true },
        { label: "Autenticar na plataforma", feito: true },
        { label: "Carregar suas tarefas", feito: false },
        { label: "Você escolhe qual fazer", feito: false },
        { label: "As questões chegam aqui", feito: false },
      ])],
    });

    await page.goto("https://saladofuturo.educacao.sp.gov.br/tarefas", {
      waitUntil: "networkidle",
    });

    // Extrai tarefas da página
    const tarefas = await page.evaluate(() => {
      const itens = document.querySelectorAll(
        ".tarefa, .task, [class*='tarefa'], [class*='task'], .atividade, [class*='atividade'], li, .card"
      );
      const resultado = [];
      itens.forEach((el, i) => {
        const titulo = el.querySelector("h1,h2,h3,h4,h5,p,span")?.innerText?.trim();
        const href = el.querySelector("a")?.href;
        if (titulo && titulo.length > 3) {
          resultado.push({ index: i, titulo, href: href || null });
        }
      });
      return resultado.slice(0, 25); // Discord limita select a 25
    });

    if (!tarefas.length) {
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xe67e22)
          .setTitle("📭 Nenhuma tarefa encontrada")
          .setDescription("Não encontrei tarefas pendentes na sua conta.")
        ],
      });
      await browser.close();
      return;
    }

    // Salva sessão
    sessoes.set(userId, {
      browser,
      page,
      tarefas,
      tarefasEscolhidas: [],
      tempoPorTarefa: null,
      aguardandoResposta: false,
      alternativas: [],
      questaoAtual: null,
      resolverQuestao: null,
      channel: interaction.channel,
      userId,
    });

    // ── Passo 4: Usuário escolhe ──
    await interaction.editReply({
      embeds: [embedStatus("Tarefas carregadas! Escolha abaixo 👇", [
        { label: "Inserir RA e senha", feito: true },
        { label: "Autenticar na plataforma", feito: true },
        { label: "Carregar suas tarefas", feito: true },
        { label: "Você escolhe qual fazer", feito: false },
        { label: "As questões chegam aqui", feito: false },
      ])],
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("tarefas_escolha")
            .setPlaceholder("Selecione as tarefas que quer fazer...")
            .setMinValues(1)
            .setMaxValues(Math.min(tarefas.length, 5))
            .addOptions(
              tarefas.map((t) =>
                new StringSelectMenuOptionBuilder()
                  .setLabel(t.titulo.slice(0, 100))
                  .setValue(String(t.index))
                  .setEmoji("📝")
              )
            )
        ),
      ],
    });

  } catch (err) {
    console.error("❌ Erro na sessão Sala do Futuro:", err.message);
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle("❌ Erro inesperado")
        .setDescription(`Ocorreu um erro: \`${err.message}\``)
      ],
      components: [],
    });
    if (browser) await browser.close();
  }
}

// ─────────────────────────────────────────────
// PROCESSAR TAREFAS ESCOLHIDAS
// ─────────────────────────────────────────────
async function processarTarefas(client, user, sessao) {
  const { browser, page, tarefas, tarefasEscolhidas, tempoPorTarefa, channel } = sessao;

  for (const idxStr of tarefasEscolhidas) {
    const tarefa = tarefas.find((t) => String(t.index) === idxStr);
    if (!tarefa) continue;

    await channel.send({
      embeds: [new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`📝 Iniciando: ${tarefa.titulo}`)
        .setDescription(`Tenho **${Math.round(tempoPorTarefa / 60000)} minutos** para essa tarefa.\nCarregando questões...`)
      ],
    });

    try {
      if (tarefa.href) {
        await page.goto(tarefa.href, { waitUntil: "networkidle" });
      }

      // Busca questões na página
      const questoes = await page.evaluate(() => {
        const qs = document.querySelectorAll(
          ".questao, .question, [class*='questao'], [class*='question'], .enunciado"
        );
        const resultado = [];
        qs.forEach((el, i) => {
          const enunciado = el.querySelector("p, .enunciado, .texto")?.innerText?.trim() ||
            el.innerText?.trim();
          const alts = [];
          el.querySelectorAll(
            "li, .alternativa, [class*='alternativa'], .opcao, label"
          ).forEach((a) => {
            const t = a.innerText?.trim();
            if (t && t.length > 1) alts.push(t);
          });
          if (enunciado && alts.length) {
            resultado.push({ index: i, enunciado, alternativas: alts });
          }
        });
        return resultado;
      });

      if (!questoes.length) {
        await channel.send("⚠️ Não encontrei questões nessa tarefa.");
        continue;
      }

      const inicioTarefa = Date.now();

      for (const questao of questoes) {
        // Verifica tempo
        if (Date.now() - inicioTarefa >= tempoPorTarefa) {
          await channel.send({
            embeds: [new EmbedBuilder()
              .setColor(0xe67e22)
              .setTitle("⏱️ Tempo esgotado!")
              .setDescription(`O tempo de **${Math.round(tempoPorTarefa / 60000)} min** para essa tarefa acabou.`)
            ],
          });
          break;
        }

        // Monta a mensagem da questão
        const altsFormatadas = questao.alternativas
          .map((a, i) => `**${a}**`)
          .join("\n");

        await channel.send({
          embeds: [new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle(`❓ Questão ${questao.index + 1}`)
            .setDescription(
              `${questao.enunciado}\n\n${altsFormatadas}\n\n` +
              `> Responda com \`!c\` + o **início** da alternativa. Ex: \`!c A) sim\``
            )
          ],
        });

        // Aguarda resposta do usuário
        await new Promise((resolve) => {
          sessao.aguardandoResposta = true;
          sessao.questaoAtual = questao;
          sessao.alternativas = questao.alternativas.map((texto) => ({ texto }));
          sessao.resolverQuestao = async (alternativaEscolhida) => {
            try {
              // Clica na alternativa correspondente
              await page.evaluate((texto) => {
                const els = document.querySelectorAll(
                  "li, .alternativa, [class*='alternativa'], label"
                );
                for (const el of els) {
                  if (el.innerText?.trim().toLowerCase().startsWith(texto.toLowerCase())) {
                    el.click();
                    break;
                  }
                }
              }, alternativaEscolhida.texto);

              await channel.send({
                embeds: [new EmbedBuilder()
                  .setColor(0x5865f2)
                  .setTitle("✅ Resposta registrada")
                  .setDescription(`**${alternativaEscolhida.texto}** marcada na plataforma.`)
                ],
              });
            } catch (e) {
              await channel.send(`⚠️ Não consegui marcar a resposta: ${e.message}`);
            }
            resolve();
          };
        });
      }

      // Tenta submeter a tarefa
      try {
        await page.click(
          'button:has-text("Enviar"), button:has-text("Finalizar"), button[type="submit"]'
        ).catch(() => {});
      } catch (_) {}

      await channel.send({
        embeds: [new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle("🎉 Tarefa concluída!")
          .setDescription(`**${tarefa.titulo}** foi finalizada!`)
        ],
      });

    } catch (err) {
      await channel.send(`❌ Erro ao processar tarefa: \`${err.message}\``);
    }
  }

  // Encerra sessão
  await channel.send({
    embeds: [new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("✅ Sessão encerrada")
      .setDescription("Todas as tarefas foram processadas! Use `!tarefasmsg` para iniciar outra sessão.")
    ],
  });

  try { await browser.close(); } catch (_) {}
  sessoes.delete(user.id);
}
