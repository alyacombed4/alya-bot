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

const puppeteer = require("puppeteer");

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

      const alternativaEscolhida = sessao.alternativas.find((alt) =>
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
      await sessao.resolverQuestao(alternativaEscolhida);
    }
  });

  // ─────────────────────────────────────────────
  // INTERAÇÕES
  // ─────────────────────────────────────────────
  client.on("interactionCreate", async (interaction) => {

    // ── Botão: abrir modal de login ──
    if (interaction.isButton() && interaction.customId === "tarefas_login") {
      const modal = new ModalBuilder()
        .setCustomId("tarefas_modal_login")
        .setTitle("Login — Sala do Futuro");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("ra")
            .setLabel("RA (Registro do Aluno)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Ex: 123456789")
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("senha")
            .setLabel("Senha")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Sua senha da plataforma")
            .setRequired(true)
        )
      );

      await interaction.showModal(modal);
    }

    // ── Submit do modal de login ──
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
    if (interaction.isStringSelectMenu() && interaction.customId === "tarefas_escolha") {
      const sessao = sessoes.get(interaction.user.id);
      if (!sessao) return;

      sessao.tarefasEscolhidas = interaction.values;

      const modal = new ModalBuilder()
        .setCustomId("tarefas_modal_tempo")
        .setTitle("Tempo por tarefa");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("tempo")
            .setLabel("Quantos minutos por tarefa?")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Ex: 30")
            .setRequired(true)
        )
      );

      await interaction.showModal(modal);
    }

    // ── Submit do tempo ──
    if (interaction.isModalSubmit() && interaction.customId === "tarefas_modal_tempo") {
      const sessao = sessoes.get(interaction.user.id);
      if (!sessao) return;

      const minutos = parseInt(interaction.fields.getTextInputValue("tempo"));
      if (isNaN(minutos) || minutos < 1) {
        await interaction.reply({ content: "❌ Tempo inválido.", ephemeral: true });
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
// EMBED DE STATUS
// ─────────────────────────────────────────────
function embedStatus(titulo, passos) {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📚  Sala do Futuro — Tarefas")
    .setDescription(
      `**${titulo}**\n\n` +
      passos.map((p) => `${p.feito ? "✅" : "⬜"}  ${p.label}`).join("\n")
    )
    .setFooter({ text: "Sala do Futuro • Seduc-SP" })
    .setTimestamp();
}

// ─────────────────────────────────────────────
// INICIAR SESSÃO COM PUPPETEER
// ─────────────────────────────────────────────
async function iniciarSessao(client, interaction, ra, senha) {
  const userId = interaction.user.id;
  const apiKey = process.env.SED_APIM_KEY;

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const page = await browser.newPage();

    if (apiKey) {
      await page.setExtraHTTPHeaders({ "x-api-key": apiKey });
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
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    // Preenche RA
    const raSelector = 'input[name="ra"], input[placeholder*="RA"], input[id*="ra"], input[type="text"]';
    await page.waitForSelector(raSelector, { timeout: 10000 });
    await page.type(raSelector.split(",")[0].trim(), ra, { delay: 40 }).catch(async () => {
      const inputs = await page.$$('input[type="text"]');
      if (inputs[0]) await inputs[0].type(ra, { delay: 40 });
    });

    // Preenche senha
    await page.type('input[type="password"]', senha, { delay: 40 });

    // Clica em enviar
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {}),
      page.click('button[type="submit"]').catch(() =>
        page.evaluate(() => document.querySelector('button[type="submit"], button:last-of-type')?.click())
      ),
    ]);

    // Verifica login
    const urlAtual = page.url();
    if (urlAtual.includes("login")) {
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
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    const tarefas = await page.evaluate(() => {
      const seletores = [
        ".tarefa", ".task", ".atividade", ".card", "li",
        "[class*='tarefa']", "[class*='task']", "[class*='atividade']",
      ];
      const resultado = [];
      for (const sel of seletores) {
        document.querySelectorAll(sel).forEach((el, i) => {
          const titulo = (
            el.querySelector("h1,h2,h3,h4,h5")?.innerText ||
            el.querySelector("p,span")?.innerText ||
            el.innerText
          )?.trim();
          const href = el.querySelector("a")?.href || null;
          if (titulo && titulo.length > 4 && !resultado.find(r => r.titulo === titulo)) {
            resultado.push({ index: resultado.length, titulo, href });
          }
        });
        if (resultado.length >= 25) break;
      }
      return resultado.slice(0, 25);
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
        .setDescription(`\`${err.message}\``)
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
        await page.goto(tarefa.href, { waitUntil: "networkidle2", timeout: 30000 });
      }

      const questoes = await page.evaluate(() => {
        const resultado = [];
        const seletores = [
          ".questao", ".question", ".enunciado",
          "[class*='questao']", "[class*='question']",
        ];
        for (const sel of seletores) {
          document.querySelectorAll(sel).forEach((el, i) => {
            const enunciado = (
              el.querySelector("p, .enunciado, .texto")?.innerText ||
              el.innerText
            )?.trim();
            const alts = [];
            el.querySelectorAll("li, .alternativa, [class*='alternativa'], .opcao, label")
              .forEach((a) => {
                const t = a.innerText?.trim();
                if (t && t.length > 1) alts.push(t);
              });
            if (enunciado && alts.length) {
              resultado.push({ index: resultado.length, enunciado, alternativas: alts });
            }
          });
          if (resultado.length) break;
        }
        return resultado;
      });

      if (!questoes.length) {
        await channel.send("⚠️ Não encontrei questões nessa tarefa.");
        continue;
      }

      const inicioTarefa = Date.now();

      for (const questao of questoes) {
        if (Date.now() - inicioTarefa >= tempoPorTarefa) {
          await channel.send({
            embeds: [new EmbedBuilder()
              .setColor(0xe67e22)
              .setTitle("⏱️ Tempo esgotado!")
              .setDescription(`O tempo de **${Math.round(tempoPorTarefa / 60000)} min** acabou.`)
            ],
          });
          break;
        }

        const altsFormatadas = questao.alternativas.map((a) => `**${a}**`).join("\n");

        await channel.send({
          embeds: [new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle(`❓ Questão ${questao.index + 1}`)
            .setDescription(
              `${questao.enunciado}\n\n${altsFormatadas}\n\n` +
              `> Responda com \`!c\` + o **início** da alternativa.\n> Ex: \`!c A) verdadeiro\``
            )
          ],
        });

        await new Promise((resolve) => {
          sessao.aguardandoResposta = true;
          sessao.questaoAtual = questao;
          sessao.alternativas = questao.alternativas.map((texto) => ({ texto }));
          sessao.resolverQuestao = async (alt) => {
            try {
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
              }, alt.texto);

              await channel.send({
                embeds: [new EmbedBuilder()
                  .setColor(0x5865f2)
                  .setTitle("✅ Resposta registrada")
                  .setDescription(`**${alt.texto}** marcada na plataforma.`)
                ],
              });
            } catch (e) {
              await channel.send(`⚠️ Não consegui marcar: ${e.message}`);
            }
            resolve();
          };
        });
      }

      // Tenta submeter
      await page.evaluate(() => {
        const btn = document.querySelector('button[type="submit"]') ||
          [...document.querySelectorAll("button")].find(
            (b) => b.innerText?.toLowerCase().includes("enviar") ||
                   b.innerText?.toLowerCase().includes("finalizar")
          );
        if (btn) btn.click();
      }).catch(() => {});

      await channel.send({
        embeds: [new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle("🎉 Tarefa concluída!")
          .setDescription(`**${tarefa.titulo}** finalizada!`)
        ],
      });

    } catch (err) {
      await channel.send(`❌ Erro ao processar tarefa: \`${err.message}\``);
    }
  }

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
