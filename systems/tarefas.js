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

// ─────────────────────────────────────────────
// CONSTANTES DA API
// ─────────────────────────────────────────────
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const CACHE_TTL = 1000 * 60 * 60 * 6;

const EDUSP_HOST = "edusp-api.ip.tv";
const SED_HOST = "sedintegracoes.educacao.sp.gov.br";
const EDUSP = `https://${EDUSP_HOST}`;
const SED = `https://${SED_HOST}`;

const EFEKTA_URLS = [
  "https://learn.better.efekta.com",
  "https://api.study.better.efekta.com",
  "https://lesson-player.study.better.efekta.com",
];

const CATALYST_COOKIE_URLS = [
  "https://learn.better.efekta.com",
  "https://lesson-player.study.better.efekta.com",
  "https://api.study.better.efekta.com",
  "https://catalyst-enter.better.efekta.com",
  "https://catalyst.study.better.efekta.com",
  "https://better.efekta.com",
];

// Armazena sessões ativas por usuário
const sessoes = new Map();
// Cache de tarefas: userId → { data, fetchedAt }
const tarefasCache = new Map();

// ─────────────────────────────────────────────
// CLIENTE HTTP CENTRALIZADO
// ─────────────────────────────────────────────
async function apiFetch(url, options = {}) {
  const headers = {
    "User-Agent": UA,
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(options.headers || {}),
  };

  const res = await fetch(url, { ...options, headers });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} em ${url}: ${body.slice(0, 200)}`);
  }

  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

// ─────────────────────────────────────────────
// AUTENTICAÇÃO — LOGIN DO ALUNO
// Fluxo: SED (valida RA/senha) → EDUSP (troca token) → cookies Efekta/Catalyst
// ─────────────────────────────────────────────
async function autenticarAluno(ra, senha) {
  // 1️⃣  Login no SED (integracoes Seduc-SP)
  const sedPayload = { login: ra, senha, tipo: "aluno" };
  const sedResp = await apiFetch(`${SED}/api/login`, {
    method: "POST",
    body: JSON.stringify(sedPayload),
  });

  // Aceita tanto { token } quanto { access_token } dependendo da versão da API
  const sedToken =
    sedResp?.token || sedResp?.access_token || sedResp?.data?.token;

  if (!sedToken) {
    throw new Error("RA ou senha incorretos.");
  }

  // 2️⃣  Troca o token SED pelo token EDUSP
  const eduspResp = await apiFetch(`${EDUSP}/api/user/auth/login`, {
    method: "POST",
    headers: { Authorization: `Bearer ${sedToken}` },
    body: JSON.stringify({ token: sedToken }),
  });

  const eduspToken =
    eduspResp?.token ||
    eduspResp?.access_token ||
    eduspResp?.data?.token;

  if (!eduspToken) {
    throw new Error("Falha ao obter token EDUSP.");
  }

  // 3️⃣  Obtém cookies de sessão Efekta / Catalyst (best-effort — não bloqueia)
  const catalystCookies = {};
  try {
    const cookieResp = await apiFetch(
      `${EDUSP}/api/user/auth/catalyst-token`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${eduspToken}` },
      }
    );
    if (cookieResp?.catalystToken) {
      catalystCookies.catalystToken = cookieResp.catalystToken;
    }
  } catch (_) {
    // Ignora — nem todas as contas têm acesso Catalyst
  }

  return { sedToken, eduspToken, catalystCookies };
}

// ─────────────────────────────────────────────
// BUSCAR TAREFAS DO ALUNO
// ─────────────────────────────────────────────
async function buscarTarefas(eduspToken, userId) {
  // Verifica cache
  const cached = tarefasCache.get(userId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.data;
  }

  const resp = await apiFetch(`${EDUSP}/api/student/tasks`, {
    method: "GET",
    headers: { Authorization: `Bearer ${eduspToken}` },
  });

  // Normaliza diferentes formatos de resposta
  const lista = Array.isArray(resp)
    ? resp
    : resp?.data || resp?.tasks || resp?.tarefas || [];

  const tarefas = lista.slice(0, 25).map((t, i) => ({
    index: i,
    id: t.id || t.taskId || String(i),
    titulo:
      (t.title || t.titulo || t.name || t.nome || `Tarefa ${i + 1}`).slice(
        0,
        100
      ),
    href: t.url || t.link || null,
    disciplina: t.subject || t.disciplina || null,
    dataLimite: t.dueDate || t.dataLimite || null,
  }));

  tarefasCache.set(userId, { data: tarefas, fetchedAt: Date.now() });
  return tarefas;
}

// ─────────────────────────────────────────────
// BUSCAR QUESTÕES DE UMA TAREFA
// ─────────────────────────────────────────────
async function buscarQuestoes(eduspToken, tarefa) {
  const resp = await apiFetch(
    `${EDUSP}/api/student/tasks/${tarefa.id}/questions`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${eduspToken}` },
    }
  );

  const lista = Array.isArray(resp)
    ? resp
    : resp?.data || resp?.questions || resp?.questoes || [];

  return lista.map((q, i) => ({
    index: i,
    id: q.id || q.questionId || String(i),
    enunciado:
      q.statement ||
      q.enunciado ||
      q.text ||
      q.texto ||
      `Questão ${i + 1}`,
    alternativas: (q.alternatives || q.alternativas || q.options || []).map(
      (a) => ({
        id: a.id || a.alternativeId || null,
        texto: a.text || a.texto || a.label || String(a),
      })
    ),
  }));
}

// ─────────────────────────────────────────────
// SUBMETER RESPOSTA DE UMA QUESTÃO
// ─────────────────────────────────────────────
async function submeterResposta(eduspToken, tarefaId, questaoId, alternativaId) {
  await apiFetch(
    `${EDUSP}/api/student/tasks/${tarefaId}/questions/${questaoId}/answer`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${eduspToken}` },
      body: JSON.stringify({ alternativeId: alternativaId }),
    }
  );
}

// ─────────────────────────────────────────────
// FINALIZAR TAREFA
// ─────────────────────────────────────────────
async function finalizarTarefa(eduspToken, tarefaId) {
  await apiFetch(`${EDUSP}/api/student/tasks/${tarefaId}/submit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${eduspToken}` },
    body: JSON.stringify({}),
  }).catch(() => {}); // best-effort
}

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
// MÓDULO PRINCIPAL
// ─────────────────────────────────────────────
module.exports = (client) => {
  // ── Comando !tarefasmsg ──
  client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) return;

    // ── !tarefasmsg ──
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

    // ── !c <início da alternativa> ──
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

  // ── Interações ──
  client.on("interactionCreate", async (interaction) => {

    // Botão → abre modal de login
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

    // Submit do modal de login
    if (
      interaction.isModalSubmit() &&
      interaction.customId === "tarefas_modal_login"
    ) {
      const ra = interaction.fields.getTextInputValue("ra").trim();
      const senha = interaction.fields.getTextInputValue("senha").trim();

      await interaction.reply({
        embeds: [
          embedStatus("Iniciando sessão...", [
            { label: "Inserir RA e senha", feito: true },
            { label: "Autenticar na plataforma", feito: false },
            { label: "Carregar suas tarefas", feito: false },
            { label: "Você escolhe qual fazer", feito: false },
            { label: "As questões chegam aqui", feito: false },
          ]),
        ],
        ephemeral: true,
      });

      iniciarSessao(client, interaction, ra, senha);
    }

    // Seleção de tarefas
    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === "tarefas_escolha"
    ) {
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

    // Submit do tempo
    if (
      interaction.isModalSubmit() &&
      interaction.customId === "tarefas_modal_tempo"
    ) {
      const sessao = sessoes.get(interaction.user.id);
      if (!sessao) return;

      const minutos = parseInt(
        interaction.fields.getTextInputValue("tempo")
      );
      if (isNaN(minutos) || minutos < 1) {
        await interaction.reply({
          content: "❌ Tempo inválido.",
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
// INICIAR SESSÃO (sem Puppeteer)
// ─────────────────────────────────────────────
async function iniciarSessao(client, interaction, ra, senha) {
  const userId = interaction.user.id;

  try {
    // Passo 2: Autenticando
    await interaction.editReply({
      embeds: [
        embedStatus("Autenticando na plataforma...", [
          { label: "Inserir RA e senha", feito: true },
          { label: "Autenticar na plataforma", feito: false },
          { label: "Carregar suas tarefas", feito: false },
          { label: "Você escolhe qual fazer", feito: false },
          { label: "As questões chegam aqui", feito: false },
        ]),
      ],
    });

    let tokens;
    try {
      tokens = await autenticarAluno(ra, senha);
    } catch (err) {
      const msg = err.message || "";
      const isCredentials =
        msg.includes("RA ou senha") ||
        msg.includes("401") ||
        msg.includes("403");

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle("❌ Falha no login")
            .setDescription(
              isCredentials
                ? "RA ou senha incorretos. Use `!tarefasmsg` para tentar novamente."
                : `Erro ao autenticar: \`${msg}\`\nUse \`!tarefasmsg\` para tentar novamente.`
            ),
        ],
        components: [],
      });
      return;
    }

    const { eduspToken } = tokens;

    // Passo 3: Carregando tarefas
    await interaction.editReply({
      embeds: [
        embedStatus("Carregando suas tarefas...", [
          { label: "Inserir RA e senha", feito: true },
          { label: "Autenticar na plataforma", feito: true },
          { label: "Carregar suas tarefas", feito: false },
          { label: "Você escolhe qual fazer", feito: false },
          { label: "As questões chegam aqui", feito: false },
        ]),
      ],
    });

    const tarefas = await buscarTarefas(eduspToken, userId);

    if (!tarefas.length) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe67e22)
            .setTitle("📭 Nenhuma tarefa encontrada")
            .setDescription("Não há tarefas pendentes na sua conta."),
        ],
        components: [],
      });
      return;
    }

    // Salva sessão (sem browser/page)
    sessoes.set(userId, {
      eduspToken,
      tokens,
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

    // Passo 4: Usuário escolhe
    await interaction.editReply({
      embeds: [
        embedStatus("Tarefas carregadas! Escolha abaixo 👇", [
          { label: "Inserir RA e senha", feito: true },
          { label: "Autenticar na plataforma", feito: true },
          { label: "Carregar suas tarefas", feito: true },
          { label: "Você escolhe qual fazer", feito: false },
          { label: "As questões chegam aqui", feito: false },
        ]),
      ],
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
                  .setDescription(
                    [
                      t.disciplina,
                      t.dataLimite
                        ? `Prazo: ${new Date(t.dataLimite).toLocaleDateString("pt-BR")}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" • ")
                      .slice(0, 100) || "Tarefa escolar"
                  )
                  .setEmoji("📝")
              )
            )
        ),
      ],
    });
  } catch (err) {
    console.error("❌ Erro na sessão Sala do Futuro:", err.message);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("❌ Erro inesperado")
          .setDescription(`\`${err.message}\``),
      ],
      components: [],
    });
  }
}

// ─────────────────────────────────────────────
// PROCESSAR TAREFAS ESCOLHIDAS
// ─────────────────────────────────────────────
async function processarTarefas(client, user, sessao) {
  const {
    eduspToken,
    tarefas,
    tarefasEscolhidas,
    tempoPorTarefa,
    channel,
  } = sessao;

  for (const idxStr of tarefasEscolhidas) {
    const tarefa = tarefas.find((t) => String(t.index) === idxStr);
    if (!tarefa) continue;

    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`📝 Iniciando: ${tarefa.titulo}`)
          .setDescription(
            `Tenho **${Math.round(tempoPorTarefa / 60000)} minutos** para essa tarefa.\nCarregando questões...`
          ),
      ],
    });

    try {
      const questoes = await buscarQuestoes(eduspToken, tarefa);

      if (!questoes.length) {
        await channel.send("⚠️ Não encontrei questões nessa tarefa.");
        continue;
      }

      const inicioTarefa = Date.now();

      for (const questao of questoes) {
        if (Date.now() - inicioTarefa >= tempoPorTarefa) {
          await channel.send({
            embeds: [
              new EmbedBuilder()
                .setColor(0xe67e22)
                .setTitle("⏱️ Tempo esgotado!")
                .setDescription(
                  `O tempo de **${Math.round(tempoPorTarefa / 60000)} min** acabou.`
                ),
            ],
          });
          break;
        }

        const altsFormatadas = questao.alternativas
          .map((a) => `**${a.texto}**`)
          .join("\n");

        await channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0x2ecc71)
              .setTitle(`❓ Questão ${questao.index + 1}`)
              .setDescription(
                `${questao.enunciado}\n\n${altsFormatadas}\n\n` +
                  `> Responda com \`!c\` + o **início** da alternativa.\n> Ex: \`!c A) verdadeiro\``
              ),
          ],
        });

        await new Promise((resolve) => {
          sessao.aguardandoResposta = true;
          sessao.questaoAtual = questao;
          sessao.alternativas = questao.alternativas;

          sessao.resolverQuestao = async (alt) => {
            try {
              await submeterResposta(
                eduspToken,
                tarefa.id,
                questao.id,
                alt.id
              );

              await channel.send({
                embeds: [
                  new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle("✅ Resposta registrada")
                    .setDescription(
                      `**${alt.texto}** enviada para a plataforma.`
                    ),
                ],
              });
            } catch (e) {
              await channel.send(
                `⚠️ Não consegui registrar a resposta: \`${e.message}\``
              );
            }
            resolve();
          };
        });
      }

      // Finaliza/submete a tarefa
      await finalizarTarefa(eduspToken, tarefa.id);

      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle("🎉 Tarefa concluída!")
            .setDescription(`**${tarefa.titulo}** finalizada!`),
        ],
      });
    } catch (err) {
      await channel.send(
        `❌ Erro ao processar tarefa: \`${err.message}\``
      );
    }
  }

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("✅ Sessão encerrada")
        .setDescription(
          "Todas as tarefas foram processadas! Use `!tarefasmsg` para iniciar outra sessão."
        ),
    ],
  });

  // Limpa cache e sessão
  tarefasCache.delete(user.id);
  sessoes.delete(user.id);
}
