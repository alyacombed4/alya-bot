const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder
} = require("discord.js");
const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");

const KAHOOT_COLORS = ["🔴", "🔵", "🟡", "🟢"];
const ANSWER_SELECTORS = [
  "div[data-functional-selector='answer-0']",
  "div[data-functional-selector='answer-1']",
  "div[data-functional-selector='answer-2']",
  "div[data-functional-selector='answer-3']",
];

async function getBrowser() {
  return puppeteer.launch({
    args: [
      ...chromium.args,
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--single-process"
    ],
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless
  });
}

// ─────────────────────────────────────────────────────────────
// Lê pergunta + respostas da aba do APRESENTADOR
// O Kahoot do host mostra texto completo das respostas
// ─────────────────────────────────────────────────────────────
async function lerPerguntaDoHost(hostPage) {
  return hostPage.evaluate(() => {
    // ── Pergunta ──
    const qSels = [
      "[data-functional-selector='question-title']",
      "[data-functional-selector='block-title']",
      "[data-functional-selector='question-index']",
      "[class*='QuestionTitle']",
      "[class*='questionTitle']",
      "[class*='question-title']",
      ".question-title",
      "h1", "h2"
    ];
    let pergunta = null;
    for (const sel of qSels) {
      const el = document.querySelector(sel);
      if (el && el.innerText.trim()) { pergunta = el.innerText.trim(); break; }
    }

    // ── Respostas ──
    // No host, os seletores podem ser diferentes — tenta os padrões do host primeiro
    const hostASels = [
      // Seletores do host/apresentador
      "[data-functional-selector='answer-0']",
      "[data-functional-selector='answer-1']",
      "[data-functional-selector='answer-2']",
      "[data-functional-selector='answer-3']",
    ];

    let respostas = hostASels.map((sel, i) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      // Ignora SVGs e pega só texto
      const spans = [...el.querySelectorAll("span, p, div")];
      for (const span of spans) {
        if (span.children.length === 0) { // nó folha = só texto
          const t = span.innerText.trim();
          if (t && t.length > 0 && !/^\s*$/.test(t)) return { texto: t, index: i };
        }
      }
      const t = el.innerText.replace(/\s+/g, " ").trim();
      return t ? { texto: t, index: i } : null;
    }).filter(Boolean);

    // Se não achou, tenta seletores genéricos do host
    if (respostas.length === 0) {
      const genericSels = [
        "[class*='Answer']", "[class*='answer']",
        "[class*='Choice']", "[class*='choice']",
        "[class*='Option']", "[class*='option']"
      ];
      let els = [];
      for (const sel of genericSels) {
        els = [...document.querySelectorAll(sel)];
        if (els.length >= 2) break;
      }
      respostas = els.slice(0, 4).map((el, i) => {
        const t = el.innerText.replace(/\s+/g, " ").trim();
        return t ? { texto: t, index: i } : null;
      }).filter(Boolean);
    }

    // Debug HTML se ainda não achou
    const debugHTML = respostas.length === 0
      ? document.body.innerHTML.substring(0, 3000)
      : null;

    return { pergunta, respostas, debugHTML };
  });
}

// ─────────────────────────────────────────────────────────────
// Loop principal — lê do HOST, clica no PLAYER
// ─────────────────────────────────────────────────────────────
async function loopPerguntas(hostPage, playerPage, browser, channel) {
  let msgAtual = null;
  let coletorAtual = null;

  while (true) {
    try {
      // Espera pergunta aparecer na aba do JOGADOR (que tem os botões clicáveis)
      await playerPage.waitForFunction(() => {
        return document.querySelector("[data-functional-selector='answer-0']") !== null
            || document.querySelector("[data-functional-selector='end-screen']") !== null
            || document.body.innerText.includes("podium")
            || document.body.innerText.includes("Game over");
      }, { timeout: 60000 });

      // Checa fim de jogo
      const fimDeJogo = await playerPage.evaluate(() => {
        return document.querySelector("[data-functional-selector='end-screen']") !== null
            || document.body.innerText.includes("Game over")
            || document.body.innerText.includes("podium");
      });

      if (fimDeJogo) {
        await channel.send({
          embeds: [new EmbedBuilder()
            .setTitle("🏁 Jogo encerrado!")
            .setDescription("O Kahoot terminou. Obrigado por jogar!")
            .setColor(0x46178f)]
        });
        break;
      }

      // Delay pra host page renderizar junto
      await new Promise(r => setTimeout(r, 1000));

      // Lê pergunta + respostas da aba do HOST
      const { pergunta, respostas, debugHTML } = await lerPerguntaDoHost(hostPage);

      if (debugHTML) {
        // Manda debug no canal pra ver o HTML do host
        const chunks = debugHTML.match(/.{1,900}/g) || [];
        await channel.send({
          embeds: [new EmbedBuilder()
            .setTitle("⚠️ Debug: não achei respostas no host")
            .setDescription("```html\n" + (chunks[0] || "") + "\n```")
            .setColor(0xfee75c)]
        });
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      if (respostas.length === 0) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      // Monta embed com dados do HOST
      const embed = new EmbedBuilder()
        .setTitle("❓ Nova Pergunta!")
        .setDescription(`**${pergunta || "❓ Pergunta não identificada"}**`)
        .setColor(0x46178f)
        .setFooter({ text: "Escolha sua resposta abaixo!" });

      const row = new ActionRowBuilder().addComponents(
        respostas.map(r =>
          new ButtonBuilder()
            .setCustomId(`kahoot_answer_${r.index}`)
            .setLabel(`${KAHOOT_COLORS[r.index]} ${r.texto}`.substring(0, 80))
            .setStyle(ButtonStyle.Primary)
        )
      );

      if (coletorAtual) coletorAtual.stop();

      if (msgAtual) {
        await msgAtual.edit({ embeds: [embed], components: [row] });
      } else {
        msgAtual = await channel.send({ embeds: [embed], components: [row] });
      }

      // Coletor — clica na aba do JOGADOR
      coletorAtual = msgAtual.createMessageComponentCollector({
        filter: i => i.customId.startsWith("kahoot_answer_"),
        time: 30000,
        max: 1
      });

      await new Promise((resolve) => {
        coletorAtual.on("collect", async (btnInteraction) => {
          const index = parseInt(btnInteraction.customId.replace("kahoot_answer_", ""));
          try {
            await playerPage.click(ANSWER_SELECTORS[index]);
            await btnInteraction.update({
              embeds: [new EmbedBuilder()
                .setTitle("✅ Resposta enviada!")
                .setDescription(`Você escolheu: ${KAHOOT_COLORS[index]} **${respostas.find(r => r.index === index)?.texto || "?"}**`)
                .setColor(0x57f287)],
              components: []
            });
          } catch {
            await btnInteraction.update({
              embeds: [new EmbedBuilder()
                .setTitle("⚠️ Não consegui clicar")
                .setDescription("A resposta pode ter expirado.")
                .setColor(0xfee75c)],
              components: []
            });
          }
          resolve();
        });

        coletorAtual.on("end", async (collected) => {
          if (collected.size === 0 && msgAtual) {
            await msgAtual.edit({
              embeds: [new EmbedBuilder()
                .setTitle("⏰ Tempo esgotado!")
                .setDescription("Você não respondeu a tempo.")
                .setColor(0xed4245)],
              components: []
            });
          }
          resolve();
        });
      });

      // Espera botões sumirem no JOGADOR (próxima fase)
      await playerPage.waitForFunction((sels) => {
        return sels.every(sel => document.querySelector(sel) === null);
      }, { timeout: 60000 }, ANSWER_SELECTORS).catch(() => {});

      await new Promise(r => setTimeout(r, 2000));

    } catch (err) {
      if (err.message?.includes("timeout")) {
        await channel.send({
          embeds: [new EmbedBuilder()
            .setTitle("⏳ Sem atividade")
            .setDescription("Não detectei nova pergunta por 60s. O jogo pode ter encerrado.")
            .setColor(0xfee75c)]
        });
        break;
      }
      throw err;
    }
  }

  await browser.close();
}

// ─────────────────────────────────────────────────────────────
// Entra na sala com 2 abas:
// - playerPage  → kahoot.it (jogador, clica nas respostas)
// - hostPage    → kahoot.it/game-host?pin=XXX (lê perguntas)
// ─────────────────────────────────────────────────────────────
async function entrarNaSala(pin, nickname, onStep, browser) {
  // ── ABA 1: JOGADOR ──
  const playerPage = await browser.newPage();
  await playerPage.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36");

  await onStep(1, "✅ Navegador aberto");

  await onStep(2, "⏳ Acessando kahoot.it (jogador)...");
  await playerPage.goto("https://kahoot.it", { waitUntil: "networkidle2", timeout: 30000 });
  await onStep(2, "✅ Site do jogador carregado");

  await onStep(3, "⏳ Inserindo PIN...");
  const pinSelectors = [
    "input[data-functional-selector='game-input-text']",
    "input#game-input-text", "input[name='gameId']",
    "input[placeholder*='PIN']", "input[placeholder*='pin']",
    "input[type='number']", "input[type='text']"
  ];
  let pinInput = null;
  for (const sel of pinSelectors) {
    try { await playerPage.waitForSelector(sel, { timeout: 3000 }); pinInput = sel; break; } catch (_) {}
  }
  if (!pinInput) throw new Error("Campo de PIN não encontrado.");
  await playerPage.click(pinInput);
  await playerPage.type(pinInput, pin, { delay: 100 });
  const pinBtnSelectors = [
    "button[data-functional-selector='join-game-pin']",
    "button[type='submit']"
  ];
  let pinBtn = null;
  for (const sel of pinBtnSelectors) {
    try { await playerPage.waitForSelector(sel, { timeout: 3000 }); pinBtn = sel; break; } catch (_) {}
  }
  if (pinBtn) await playerPage.click(pinBtn); else await playerPage.keyboard.press("Enter");
  await onStep(3, "✅ PIN inserido");

  await onStep(4, "⏳ Inserindo nickname...");
  const nicknameSelectors = [
    "input[data-functional-selector='nickname-input']",
    "input#nickname-input", "input[name='nickname']",
    "input[placeholder*='name']", "input[placeholder*='Name']"
  ];
  let nicknameInput = null;
  for (const sel of nicknameSelectors) {
    try { await playerPage.waitForSelector(sel, { timeout: 5000 }); nicknameInput = sel; break; } catch (_) {}
  }
  if (!nicknameInput) throw new Error("Campo de nickname não encontrado.");
  await new Promise(r => setTimeout(r, 1000));
  await playerPage.click(nicknameInput);
  await playerPage.type(nicknameInput, nickname, { delay: 120 });
  await new Promise(r => setTimeout(r, 500));
  const nickBtnSelectors = [
    "button[data-functional-selector='join-button-username']",
    "button[type='submit']"
  ];
  let nickBtn = null;
  for (const sel of nickBtnSelectors) {
    try { await playerPage.waitForSelector(sel, { timeout: 3000 }); nickBtn = sel; break; } catch (_) {}
  }
  if (nickBtn) await playerPage.click(nickBtn); else await playerPage.keyboard.press("Enter");
  await onStep(4, "✅ Nickname inserido");

  await onStep(5, "⏳ Aguardando entrar na sala...");
  await playerPage.waitForFunction(() => {
    return document.querySelector("[data-functional-selector='waiting-screen']") !== null
        || document.querySelector("[data-functional-selector='lobby']") !== null
        || document.body.innerText.includes("You're in!")
        || document.body.innerText.includes("waiting");
  }, { timeout: 20000 });
  await onStep(5, "✅ Jogador entrou na sala!");

  // ── ABA 2: HOST (apresentador) ──
  await onStep(6, "⏳ Abrindo aba do apresentador...");
  const hostPage = await browser.newPage();
  await hostPage.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36");

  // Tenta a URL do host viewer — funciona sem login em alguns modos
  // Se o host não habilitou, cai no fallback
  const hostUrls = [
    `https://kahoot.it/game-host?pin=${pin}`,
    `https://kahoot.it/v2/game-host?pin=${pin}`,
    `https://play.kahoot.it/v2/gameblock?pin=${pin}`,
    `https://kahoot.it/?pin=${pin}&role=spectator`,
  ];

  let hostCarregou = false;
  for (const url of hostUrls) {
    try {
      await hostPage.goto(url, { waitUntil: "networkidle2", timeout: 15000 });
      // Verifica se carregou algo útil (não caiu em página de erro)
      const ok = await hostPage.evaluate(() => {
        return !document.body.innerText.includes("404")
            && !document.body.innerText.includes("Not found")
            && document.body.innerHTML.length > 500;
      });
      if (ok) { hostCarregou = true; break; }
    } catch (_) {}
  }

  if (!hostCarregou) {
    // Último fallback: abre o kahoot.it normal na segunda aba
    await hostPage.goto("https://kahoot.it", { waitUntil: "networkidle2", timeout: 30000 });
    await onStep(6, "⚠️ Host view não disponível — usando fallback");
  } else {
    await onStep(6, "✅ Aba do apresentador aberta!");
  }

  return { playerPage, hostPage };
}

// ─────────────────────────────────────────────────────────────
// Setup do bot
// ─────────────────────────────────────────────────────────────
function setup(client) {
  client.on("messageCreate", async (msg) => {
    if (msg.author.bot) return;
    if (msg.content === "!kahootmsg") {
      const embed = new EmbedBuilder()
        .setTitle("🎮 Kahoot Bot")
        .setDescription("Clique no botão abaixo para entrar em uma sala do Kahoot!")
        .setColor(0x46178f)
        .setFooter({ text: "Kahoot Bot • Controla o site de verdade" });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("kahoot_join")
          .setLabel("🚀 Entrar na Sala")
          .setStyle(ButtonStyle.Primary)
      );

      await msg.channel.send({ embeds: [embed], components: [row] });
    }
  });

  client.on("interactionCreate", async (interaction) => {
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
            .setPlaceholder("Ex: 355 2907")
            .setMinLength(6).setMaxLength(9).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("nickname")
            .setLabel("Seu Nickname")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Ex: Player1")
            .setMinLength(1).setMaxLength(15).setRequired(true)
        )
      );

      await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === "kahoot_modal") {
      const pin = interaction.fields.getTextInputValue("pin").trim().replace(/\s+/g, "");
      const nickname = interaction.fields.getTextInputValue("nickname").trim();

      await interaction.deferReply({ ephemeral: true });

      const passos = {
        1: "⬜ Abrindo navegador...",
        2: "⬜ Acessando kahoot.it...",
        3: "⬜ Inserindo PIN...",
        4: "⬜ Inserindo nickname...",
        5: "⬜ Entrando na sala...",
        6: "⬜ Abrindo aba do apresentador..."
      };

      function buildEmbed(extra = "") {
        return new EmbedBuilder()
          .setTitle("🎮 Entrando no Kahoot...")
          .setDescription(Object.values(passos).join("\n") + (extra ? `\n\n${extra}` : ""))
          .setColor(0x46178f);
      }

      await interaction.editReply({ embeds: [buildEmbed()] });

      async function onStep(num, texto) {
        passos[num] = texto;
        await interaction.editReply({ embeds: [buildEmbed()] });
        await new Promise(r => setTimeout(r, 600));
      }

      let browser;
      try {
        browser = await getBrowser();

        const { playerPage, hostPage } = await entrarNaSala(pin, nickname, onStep, browser);

        await interaction.channel.send({
          embeds: [new EmbedBuilder()
            .setTitle("🎮 Kahoot conectado!")
            .setDescription(
              `<@${interaction.user.id}> entrou como **${nickname}**.\n` +
              `📺 Lendo perguntas da aba do apresentador.\n` +
              `🎯 Clicando respostas pela aba do jogador.\n` +
              `Quando o jogo começar, as perguntas aparecerão aqui!`
            )
            .setColor(0x46178f)]
        });

        loopPerguntas(hostPage, playerPage, browser, interaction.channel).catch(async (err) => {
          await interaction.channel.send({
            embeds: [new EmbedBuilder()
              .setTitle("❌ Erro no jogo")
              .setDescription(err.message || String(err))
              .setColor(0xed4245)]
          });
          await browser.close().catch(() => {});
        });

      } catch (err) {
        if (browser) await browser.close().catch(() => {});
        await interaction.editReply({
          embeds: [new EmbedBuilder()
            .setTitle("❌ Erro ao entrar")
            .setDescription(`${err.message || err}`)
            .setColor(0xed4245)
            .setFooter({ text: "Verifique o PIN e tente novamente" })]
        });
      }
    }
  });
}

module.exports = { setup };
