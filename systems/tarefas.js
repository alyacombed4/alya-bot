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
// Rotas descobertas via DevTools (Network) no app/site CMSP.
// Se mudar, ajuste aqui — não precisa mexer no resto do código.
// ─────────────────────────────────────────────
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const CACHE_TTL = 1000 * 60 * 60 * 6; // 6 h

const EDUSP  = "https://edusp-api.ip.tv";
const SED    = "https://sedintegracoes.educacao.sp.gov.br";

// ── Rotas conhecidas ──────────────────────────
// Inspecione o tráfego em https://cmspweb.ip.tv com DevTools → Network
// e ajuste qualquer rota abaixo que retornar 404.
const ROTAS = {
  // Login do aluno — tenta cada uma em ordem até obter sucesso
  loginAluno: [
    // Rota mais provável (CMSP / ip.tv)
    { url: `${EDUSP}/api/user/login`,            body: (ra, s) => ({ login: ra, password: s, type: "student" }) },
    { url: `${EDUSP}/api/user/login`,            body: (ra, s) => ({ ra, password: s }) },
    // SED integracoes — variações de campo
    { url: `${SED}/autenticacao/login`,          body: (ra, s) => ({ login: ra, senha: s, tipo: "aluno" }) },
    { url: `${SED}/v1/autenticacao/login`,       body: (ra, s) => ({ login: ra, senha: s } ) },
    { url: `${SED}/api/v1/auth/login`,           body: (ra, s) => ({ username: ra, password: s }) },
    { url: `${SED}/api/autenticacao`,            body: (ra, s) => ({ login: ra, senha: s }) },
  ],
  // Tarefas do aluno
  tarefas: [
    `${EDUSP}/api/student/tasks`,
    `${EDUSP}/api/tarefas`,
    `${EDUSP}/api/atividades`,
  ],
  // Questões de uma tarefa (:id será substituído)
  questoes: [
    `${EDUSP}/api/student/tasks/:id/questions`,
    `${EDUSP}/api/tarefas/:id/questoes`,
    `${EDUSP}/api/atividades/:id/questoes`,
  ],
  // Responder questão
  responder: `${EDUSP}/api/student/tasks/:tarefaId/questions/:questaoId/answer`,
  // Finalizar tarefa
  finalizar: `${EDUSP}/api/student/tasks/:id/submit`,
};

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
    throw new Error(`HTTP ${res.status} em ${url}: ${body.slice(0, 300)}`);
  }
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

// ─────────────────────────────────────────────
// AUTENTICAÇÃO — tenta cada rota de login em sequência
// ─────────────────────────────────────────────
async function autenticarAluno(ra, senha) {
  let ultimoErro = null;

  for (const rota of ROTAS.loginAluno) {
    try {
      const resp = await apiFetch(rota.url, {
        method: "POST",
        body: JSON.stringify(rota.body(ra, senha)),
      });

      // Aceita vários formatos de resposta
      const token =
        resp?.token        ||
        resp?.access_token ||
        resp?.accessToken  ||
        resp?.data?.token  ||
        resp?.data?.access_token;

      if (token) {
        console.log(`✅ Login OK via ${rota.url}`);
        return { token, rota: rota.url };
      }

      // Alguns retornam 200 mas com flag de erro
      if (resp?.success === false || resp?.error) {
        throw new Error(resp?.message || resp?.error || "Credenciais inválidas");
      }

      // Resposta 200 sem token reconhecível
      throw new Error(`Resposta inesperada: ${JSON.stringify(resp).slice(0, 200)}`);

    } catch (err) {
      const msg = err.message || "";
      // 401/403 = senha errada → para imediatamente
      if (msg.includes("401") || msg.includes("403") || msg.includes("Credenciais")) {
        throw new Error("RA ou senha incorretos.");
      }
      // 404/500 = rota errada → tenta a próxima
      ultimoErro = err;
      console.warn(`⚠️ Rota ${rota.url} falhou: ${msg}`);
    }
  }

  throw new Error(
    `Nenhuma rota de login funcionou. Último erro: ${ultimoErro?.message}\n` +
    `Inspecione o tráfego em cmspweb.ip.tv e ajuste ROTAS.loginAluno no código.`
  );
}

// ─────────────────────────────────────────────
// BUSCAR TAREFAS (tenta cada rota)
// ─────────────────────────────────────────────
async function buscarTarefas(token, userId) {
  const cached = tarefasCache.get(userId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) return cached.data;

  let ultimoErro = null;
  for (const url of ROTAS.tarefas) {
    try {
      const resp = await apiFetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const lista = Array.isArray(resp)
        ? resp
        : resp?.data || resp?.tasks || resp?.tarefas || resp?.atividades || [];

      const tarefas = lista.slice(0, 25).map((t, i) => ({
        index: i,
        id:    t.id || t.taskId || t.tarefaId || String(i),
        titulo: (t.title || t.titulo || t.name || t.nome || `Tarefa ${i + 1}`).slice(0, 100),
        disciplina: t.subject || t.disciplina || t.materia || null,
        dataLimite:  t.dueDate || t.dataLimite || t.prazo || null,
      }));

      tarefasCache.set(userId, { data: tarefas, fetchedAt: Date.now() });
      console.log(`✅ Tarefas via ${url}`);
      return tarefas;
    } catch (err) {
      ultimoErro = err;
      console.warn(`⚠️ Tarefas ${url} falhou: ${err.message}`);
    }
  }
  throw new Error(`Não foi possível carregar tarefas: ${ultimoErro?.message}`);
}

// ─────────────────────────────────────────────
// BUSCAR QUESTÕES (tenta cada rota)
// ─────────────────────────────────────────────
async function buscarQuestoes(token, tarefa) {
  let ultimoErro = null;
  for (const template of ROTAS.questoes) {
    const url = template.replace(":id", tarefa.id);
    try {
      const resp = await apiFetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const lista = Array.isArray(resp)
        ? resp
        : resp?.data || resp?.questions || resp?.questoes || [];

      console.log(`✅ Questões via ${url}`);
      return lista.map((q, i) => ({
        index: i,
        id: q.id || q.questionId || q.questaoId || String(i),
        enunciado: q.statement || q.enunciado || q.text || q.texto || `Questão ${i + 1}`,
        alternativas: (q.alternatives || q.alternativas || q.options || q.opcoes || []).map((a) => ({
          id:    a.id || a.alternativeId || a.alternativaId || null,
          texto: (a.text || a.texto || a.label || String(a)).trim(),
        })),
      }));
    } catch (err) {
      ultimoErro = err;
      console.warn(`⚠️ Questões ${url} falhou: ${err.message}`);
    }
  }
  throw new Error(`Não foi possível carregar questões: ${ultimoErro?.message}`);
}

// ─────────────────────────────────────────────
// SUBMETER RESPOSTA
// ─────────────────────────────────────────────
async function submeterResposta(token, tarefaId, questaoId, alternativaId) {
  const url = ROTAS.responder
    .replace(":tarefaId", tarefaId)
    .replace(":questaoId", questaoId);
  await apiFetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ alternativeId: alternativaId, alternativaId }),
  });
}

// ─────────────────────────────────────────────
// FINALIZAR TAREFA
// ─────────────────────────────────────────────
async function finalizarTarefa(token, tarefaId) {
  const url = ROTAS.finalizar.replace(":id", tarefaId);
  await apiFetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: "{}",
  }).catch((e) => console.warn(`⚠️ Finalizar tarefa: ${e.message}`));
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
  client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) return;

    // !tarefasmsg
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

      await message.reply({
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("tarefas_login")
              .setLabel("Entrar com RA e Senha")
              .setStyle(ButtonStyle.Primary)
              .setEmoji("🔐")
          ),
        ],
      });
    }

    // !c <início da alternativa>
    if (message.content.toLowerCase().startsWith("!c ")) {
      const sessao = sessoes.get(message.author.id);
      if (!sessao || !sessao.aguardandoResposta) return;

      const resposta = message.content.slice(3).trim().toLowerCase();
      const alt = sessao.alternativas.find((a) =>
        a.texto.toLowerCase().startsWith(resposta)
      );

      if (!alt) {
        await message.reply(
          "❌ Não encontrei essa alternativa. Responda com o **início** da opção em negrito."
        );
        return;
      }

      await message.reply(`✅ Alternativa **"${alt.texto}"** selecionada! Confirmando...`);
      sessao.aguardandoResposta = false;
      await sessao.resolverQuestao(alt);
    }
  });

  client.on("interactionCreate", async (interaction) => {
    // Botão → modal de login
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
            .setPlaceholder("Ex: 123456789SP")
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
    if (interaction.isModalSubmit() && interaction.customId === "tarefas_modal_login") {
      const ra    = interaction.fields.getTextInputValue("ra").trim();
      const senha = interaction.fields.getTextInputValue("senha").trim();

      await interaction.reply({
        embeds: [embedStatus("Iniciando sessão...", [
          { label: "Inserir RA e senha",       feito: true  },
          { label: "Autenticar na plataforma", feito: false },
          { label: "Carregar suas tarefas",    feito: false },
          { label: "Você escolhe qual fazer",  feito: false },
          { label: "As questões chegam aqui",  feito: false },
        ])],
        ephemeral: true,
      });

      iniciarSessao(client, interaction, ra, senha);
    }

    // Seleção de tarefas
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

    // Submit do tempo
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
// INICIAR SESSÃO
// ─────────────────────────────────────────────
async function iniciarSessao(client, interaction, ra, senha) {
  const userId = interaction.user.id;

  try {
    // Passo 2: Autenticando
    await interaction.editReply({
      embeds: [embedStatus("Autenticando na plataforma...", [
        { label: "Inserir RA e senha",       feito: true  },
        { label: "Autenticar na plataforma", feito: false },
        { label: "Carregar suas tarefas",    feito: false },
        { label: "Você escolhe qual fazer",  feito: false },
        { label: "As questões chegam aqui",  feito: false },
      ])],
    });

    let auth;
    try {
      auth = await autenticarAluno(ra, senha);
    } catch (err) {
      const isCredentials =
        err.message.includes("RA ou senha") ||
        err.message.includes("inválidos");

      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("❌ Falha no login")
          .setDescription(
            isCredentials
              ? "RA ou senha incorretos. Use `!tarefasmsg` para tentar novamente."
              : `Erro ao autenticar: \`${err.message}\`\n\n` +
                "**Dica:** Inspecione o tráfego de rede em `cmspweb.ip.tv` (DevTools → Network) " +
                "e ajuste `ROTAS.loginAluno` no arquivo `tarefas.js`."
          )
        ],
        components: [],
      });
      return;
    }

    const { token } = auth;

    // Passo 3: Carregando tarefas
    await interaction.editReply({
      embeds: [embedStatus("Carregando suas tarefas...", [
        { label: "Inserir RA e senha",       feito: true  },
        { label: "Autenticar na plataforma", feito: true  },
        { label: "Carregar suas tarefas",    feito: false },
        { label: "Você escolhe qual fazer",  feito: false },
        { label: "As questões chegam aqui",  feito: false },
      ])],
    });

    const tarefas = await buscarTarefas(token, userId);

    if (!tarefas.length) {
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xe67e22)
          .setTitle("📭 Nenhuma tarefa encontrada")
          .setDescription("Não há tarefas pendentes na sua conta.")
        ],
        components: [],
      });
      return;
    }

    // Salva sessão
    sessoes.set(userId, {
      token,
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
      embeds: [embedStatus("Tarefas carregadas! Escolha abaixo 👇", [
        { label: "Inserir RA e senha",       feito: true  },
        { label: "Autenticar na plataforma", feito: true  },
        { label: "Carregar suas tarefas",    feito: true  },
        { label: "Você escolhe qual fazer",  feito: false },
        { label: "As questões chegam aqui",  feito: false },
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
    console.error("❌ Erro na sessão:", err.message);
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle("❌ Erro inesperado")
        .setDescription(`\`${err.message}\``)
      ],
      components: [],
    });
  }
}

// ─────────────────────────────────────────────
// PROCESSAR TAREFAS ESCOLHIDAS
// ─────────────────────────────────────────────
async function processarTarefas(client, user, sessao) {
  const { token, tarefas, tarefasEscolhidas, tempoPorTarefa, channel } = sessao;

  for (const idxStr of tarefasEscolhidas) {
    const tarefa = tarefas.find((t) => String(t.index) === idxStr);
    if (!tarefa) continue;

    await channel.send({
      embeds: [new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`📝 Iniciando: ${tarefa.titulo}`)
        .setDescription(
          `Tenho **${Math.round(tempoPorTarefa / 60000)} minutos** para essa tarefa.\nCarregando questões...`
        )
      ],
    });

    try {
      const questoes = await buscarQuestoes(token, tarefa);

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

        const altsFormatadas = questao.alternativas.map((a) => `**${a.texto}**`).join("\n");

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
          sessao.questaoAtual  = questao;
          sessao.alternativas  = questao.alternativas;

          sessao.resolverQuestao = async (alt) => {
            try {
              await submeterResposta(token, tarefa.id, questao.id, alt.id);
              await channel.send({
                embeds: [new EmbedBuilder()
                  .setColor(0x5865f2)
                  .setTitle("✅ Resposta registrada")
                  .setDescription(`**${alt.texto}** enviada para a plataforma.`)
                ],
              });
            } catch (e) {
              await channel.send(`⚠️ Não consegui registrar: \`${e.message}\``);
            }
            resolve();
          };
        });
      }

      await finalizarTarefa(token, tarefa.id);

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

  tarefasCache.delete(user.id);
  sessoes.delete(user.id);
}
