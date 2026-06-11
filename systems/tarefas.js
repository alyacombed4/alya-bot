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

const { jfetch } = require("./http.js");
const { SED, EDUSP: EDUSP_BASE } = require("./config.js");
const { getSedKey, invalidateSedKey } = require("./sed-key.js");

// ─────────────────────────────────────────────
// AUTENTICAÇÃO SED (RA + dígito + UF + senha) → token EDUSP
// ─────────────────────────────────────────────
function sedHeaders(apimKey, extra = {}) {
  return {
    "content-type": "application/json",
    "accept": "application/json, text/plain, */*",
    "ocp-apim-subscription-key": apimKey,
    "x-product-name": "SalaDoFuturo",
    ...extra,
  };
}

// monta o "user" no formato que a SED espera: RA + dígito + UF, tudo junto e maiúsculo.
// ex.: ra=123456789 dg=X uf=sp -> "123456789XSP"
function montarUser(ra, dg, uf) {
  return `${String(ra).trim()}${String(dg || "").trim()}${String(uf || "").trim()}`.toUpperCase();
}

// passo 1: autentica no SED (BFF do Sala do Futuro), cai pro legado se 404.
// usa a chave da APIM descoberta do app oficial; se tomar 401/403 (chave
// rotacionada), invalida o cache, re-descobre e tenta de novo uma vez.
async function sedLogin(user, password, _retry = true) {
  const paths = [
    "/saladofuturobffapi/credenciais/api/LoginCompletoToken",
    "/credenciais/api/LoginCompletoToken",
  ];

  const apimKey = await getSedKey();

  let ultimoErro = null;
  for (const path of paths) {
    try {
      const resp = await jfetch(`${SED}${path}`, {
        method: "POST",
        headers: sedHeaders(apimKey),
        body: JSON.stringify({ user, senha: password }),
      });

      const token =
        resp?.token ||
        resp?.access_token ||
        resp?.accessToken ||
        resp?.data?.token ||
        resp?.data?.access_token;

      if (!token) {
        throw new Error(`Resposta sem token: ${JSON.stringify(resp).slice(0, 200)}`);
      }

      return { sedToken: token, raw: resp };
    } catch (err) {
      const status = err.status || 0;

      // chave da APIM expirada/rotacionada -> re-descobre uma vez e tenta de novo
      if ((status === 401 || status === 403) && _retry) {
        await invalidateSedKey();
        return sedLogin(user, password, false);
      }

      // senha incorreta
      if (status === 401 || status === 403) {
        throw new Error("RA, dígito, UF ou senha incorretos.");
      }

      // 404 -> tenta o próximo path
      if (status === 404) {
        ultimoErro = err;
        continue;
      }

      ultimoErro = err;
    }
  }

  throw new Error(`Falha ao autenticar na SED: ${ultimoErro?.message}`);
}

// passo 2: troca o token da SED por um token de sessão da EDUSP (ip.tv),
// que é o que a API de tarefas/questões do Sala do Futuro aceita.
async function edusToken(sedToken) {
  const resp = await jfetch(`${EDUSP_BASE}/registration/edusp/token`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "accept": "application/json, text/plain, */*",
      "x-api-realm": "edusp",
      "x-api-platform": "webclient",
    },
    body: JSON.stringify({ token: sedToken }),
  });

  const token =
    resp?.auth_token ||
    resp?.token ||
    resp?.access_token ||
    resp?.data?.auth_token;

  if (!token) {
    throw new Error(`Token EDUSP não encontrado na resposta: ${JSON.stringify(resp).slice(0, 200)}`);
  }

  return token;
}

// fluxo completo: RA + dígito + UF + senha -> token pronto para chamar a EDUSP
async function autenticarAluno(ra, dg, uf, senha) {
  const user = montarUser(ra, dg, uf);
  const { sedToken } = await sedLogin(user, senha);
  const token = await edusToken(sedToken);
  return { token, user };
}

// ─────────────────────────────────────────────
// CONSTANTES DA API EDUSP (tarefas/questões)
// ─────────────────────────────────────────────
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const CACHE_TTL = 1000 * 60 * 60 * 6; // 6 h

const EDUSP = "https://edusp-api.ip.tv";

// Rotas conhecidas da EDUSP — ajuste aqui se mudar (DevTools → Network em cmspweb.ip.tv)
const ROTAS = {
  tarefas: [
    `${EDUSP}/api/student/tasks`,
    `${EDUSP}/api/tarefas`,
    `${EDUSP}/api/atividades`,
  ],
  questoes: [
    `${EDUSP}/api/student/tasks/:id/questions`,
    `${EDUSP}/api/tarefas/:id/questoes`,
    `${EDUSP}/api/atividades/:id/questoes`,
  ],
  responder: `${EDUSP}/api/student/tasks/:tarefaId/questions/:questaoId/answer`,
  finalizar: `${EDUSP}/api/student/tasks/:id/submit`,
};

// Sessões ativas por usuário e cache de tarefas
const sessoes = new Map();
const tarefasCache = new Map();

// ─────────────────────────────────────────────
// CLIENTE HTTP CENTRALIZADO (EDUSP)
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
        id: t.id || t.taskId || t.tarefaId || String(i),
        titulo: (t.title || t.titulo || t.name || t.nome || `Tarefa ${i + 1}`).slice(0, 100),
        disciplina: t.subject || t.disciplina || t.materia || null,
        dataLimite: t.dueDate || t.dataLimite || t.prazo || null,
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
          id: a.id || a.alternativeId || a.alternativaId || null,
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

const PASSOS_BASE = [
  { label: "Inserir RA, dígito, UF e senha", feito: false },
  { label: "Autenticar na plataforma", feito: false },
  { label: "Carregar suas tarefas", feito: false },
  { label: "Você escolhe qual fazer", feito: false },
  { label: "As questões chegam aqui", feito: false },
];

function passos(...prontos) {
  return PASSOS_BASE.map((p, i) => ({ ...p, feito: i < prontos.length ? prontos[i] : false }));
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
            "⬜  Inserir RA, dígito, UF e senha\n" +
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
            .setLabel("RA (Registro do Aluno, só números)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Ex: 123456789")
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("dg")
            .setLabel("Dígito do RA")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Ex: 1 ou X")
            .setMaxLength(1)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("uf")
            .setLabel("UF")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Ex: SP")
            .setMaxLength(2)
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
      const dg    = interaction.fields.getTextInputValue("dg").trim();
      const uf    = interaction.fields.getTextInputValue("uf").trim();
      const senha = interaction.fields.getTextInputValue("senha").trim();

      await interaction.reply({
        embeds: [embedStatus("Iniciando sessão...", passos(true))],
        ephemeral: true,
      });

      iniciarSessao(client, interaction, ra, dg, uf, senha);
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
async function iniciarSessao(client, interaction, ra, dg, uf, senha) {
  const userId = interaction.user.id;

  try {
    // Passo 2: Autenticando
    await interaction.editReply({
      embeds: [embedStatus("Autenticando na plataforma...", passos(true, false))],
    });

    let auth;
    try {
      auth = await autenticarAluno(ra, dg, uf, senha);
    } catch (err) {
      const isCredentials =
        err.message.includes("RA, dígito") ||
        err.message.includes("incorretos");

      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("❌ Falha no login")
          .setDescription(
            isCredentials
              ? "RA, dígito, UF ou senha incorretos. Use `!tarefasmsg` para tentar novamente."
              : `Erro ao autenticar: \`${err.message}\`\n\n` +
                "**Dica:** verifique se a chave da APIM/SED ainda é válida " +
                "(`getSedKey`/`invalidateSedKey` em `sed-key.js`)."
          )
        ],
        components: [],
      });
      return;
    }

    const { token } = auth;

    // Passo 3: Carregando tarefas
    await interaction.editReply({
      embeds: [embedStatus("Carregando suas tarefas...", passos(true, true, false))],
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
      embeds: [embedStatus("Tarefas carregadas! Escolha abaixo 👇", passos(true, true, true))],
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
          sessao.questaoAtual = questao;
          sessao.alternativas = questao.alternativas;

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
