const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder } = require("discord.js");
const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");

async function getBrowser() {
  return puppeteer.launch({
    args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--single-process"],
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless
  });
}

const KAHOOT_COLORS = ["🔴", "🔵", "🟡", "🟢"];
const ANSWER_SELECTORS = [
  "div[data-functional-selector='answer-0']",
  "div[data-functional-selector='answer-1']",
  "div[data-functional-selector='answer-2']",
  "div[data-functional-selector='answer-3']",
];

// Abre página do espectador para ler perguntas/respostas
async function abrirEspectador(browser, pin) {
  const pageSpec = await browser.newPage();
  await pageSpec.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36");
  await pageSpec.goto("https://kahoot.it/spectator", { waitUntil: "networkidle2", timeout: 30000 });

  // Insere o PIN na página do espectador
  const pinSelectors = [
    "input[data-functional-selector='game-input-text']",
    "input#game-input-text", "input[name='gameId']",
    "input[placeholder*='PIN']", "input[type='number']", "input[type='text']"
  ];
  let pinInput = null;
  for (const sel of pinSelectors) {
    try { await pageSpec.waitForSelector(sel, { timeout: 3000 }); pinInput = sel; break; } catch (_) {}
  }
  if (!pinInput) throw new Error("Espectador: campo de PIN não encontrado.");
  await pageSpec.click(pinInput);
  await pageSpec.type(pinInput, pin, { delay: 100 });

  const pinBtnSelectors = ["button[data-functional-selector='join-game-pin']", "button[type='submit']"];
  let pinBtn = null;
  for (const sel of pinBtnSelectors) {
    try { await pageSpec.waitForSelector(sel, { timeout: 3000 }); pinBtn = sel; break; } catch (_) {}
  }
  if (pinBtn) await pageSpec.click(pinBtn); else await pageSpec.keyboard.press("Enter");

  // Aguarda entrar como espectador
  await pageSpec.waitForFunction(() => {
    return document.body.innerText.includes("spectator") 
        || document.body.innerText.includes("waiting")
        || document.body.innerText.includes("You're in")
        || document.querySelector("[data-functional-selector='waiting-screen']") !== null;
  }, { timeout: 15000 }).catch(() => {});

  return pageSpec;
}

async function loopPerguntas(pageJogador, pageEspectador, browser, channel) {
  let msgAtual = null;
  let coletorAtual = null;

  while (true) {
    try {
      // Espera aparecer pergunta na página do ESPECTADOR
      await pageEspectador.waitForFunction(() => {
        const sels = [
          "[data-functional-selector='question-title']",
          "[data-functional-selector='block-title']",
          ".question-title",
        ];
        return sels.some(sel => {
          const el = document.querySelector(sel);
          return el && el.innerText.trim().length > 0;
        }) || document.querySelector("[data-functional-selector='end-screen']") !== null
          || document.body.innerText.includes("podium")
          || document.body.innerText.includes("Game over");
      }, { timeout: 90000 });

      // Checa fim de jogo
      const fimDeJogo = await pageEspectador.evaluate(() => {
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

      // Pega pergunta e respostas da página do ESPECTADOR
      const { pergunta, respostas } = await pageEspectador.evaluate(() => {
        const titleSels = [
          "[data-functional-selector='question-title']",
          "[data-functional-selector='block-title']",
          ".question-title", "h1", "h2"
        ];
        let pergunta = "❓ Pergunta não identificada";
        for (const sel of titleSels) {
          const el = document.querySelector(sel);
          if (el && el.innerText.trim()) { pergunta = el.innerText.trim(); break; }
        }

        const answerSels = [
          "[data-functional-selector='answer-0']",
          "[data-functional-selector='answer-1']",
          "[data-functional-selector='answer-2']",
          "[data-functional-selector='answer-3']",
        ];
        const respostas = answerSels.map(sel => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const spans = el.querySelectorAll("span");
          for (const span of spans) {
            const t = span.innerText.trim();
            if (t) return t;
          }
          return el.innerText.trim() || null;
        });

        return { pergunta, respostas };
      });

      const respostasValidas = respostas
        .map((r, i) => ({ texto: r, index: i }))
        .filter(r => r.texto);

      if (respostasValidas.length === 0) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      const embed = new EmbedBuilder()
        .setTitle("❓ Nova Pergunta!")
        .setDescription(`**${pergunta}**`)
        .setColor(0x46178f)
        .setFooter({ text: "Escolha sua resposta abaixo!" });

      const row = new ActionRowBuilder().addComponents(
        respostasValidas.map(r =>
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

      coletorAtual = msgAtual.createMessageComponentCollector({
        filter: i => i.customId.startsWith("kahoot_answer_"),
        time: 30000,
        max: 1
      });

      await new Promise((resolve) => {
        coletorAtual.on("collect", async (btnInteraction) => {
          const index = parseInt(btnInteraction.customId.replace("kahoot_answer_", ""));
          try {
            // Clica na página do JOGADOR
            await pageJogador.click(ANSWER_SELECTORS[index]);
            await btnInteraction.update({
              embeds: [new EmbedBuilder()
                .setTitle("✅ Resposta enviada!")
                .setDescription(`Você escolheu: ${KAHOOT_COLORS[index]} **${respostasValidas.find(r => r.index === index)?.texto || "?"}**`)
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

      // Espera pergunta sumir no espectador
      await pageEspectador.waitForFunction(() => {
        const sels = [
          "[data-functional-selector='question-title']",
          "[data-functional-selector='block-title']",
        ];
        return sels.every(sel => {
          const el = document.querySelector(sel);
          return !el || !el.innerText.trim();
        });
      }, { timeout: 60000 }).catch(() => {});

      await new Promise(r => setTimeout(r, 2000));

    } catch (err) {
      if (err.message?.includes("timeout")) {
        await channel.send({
          embeds: [new EmbedBuilder()
            .setTitle("⏳ Sem atividade")
            .setDescription("Não detectei nova pergunta por 90 segundos. O jogo pode ter encerrado.")
            .setColor(0xfee75c)]
        });
        break;
      }
      throw err;
    }
  }

  await browser.close();
}

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
        2: "⬜ Conectando espectador...",
        3: "⬜ Inserindo PIN...",
        4: "⬜ Inserindo nickname...",
        5: "⬜ Entrando na sala..."
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
        await new Promise(r => setTimeout(r, 800));
      }

      let browser;
      try {
        browser = await getBrowser();

        await onStep(1, "✅ Navegador aberto");

        // Página do jogador
        const pageJogador = await browser.newPage();
        await pageJogador.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36");

        await onStep(2, "⏳ Conectando espectador...");
        const pageEspectador = await abrirEspectador(browser, pin);
        await onStep(2, "✅ Espectador conectado");

        await onStep(3, "⏳ Inserindo PIN (jogador)...");
        await pageJogador.goto("https://kahoot.it", { waitUntil: "networkidle2", timeout: 30000 });
        const pinSelectors = [
          "input[data-functional-selector='game-input-text']",
          "input#game-input-text", "input[name='gameId']",
          "input[placeholder*='PIN']", "input[type='number']", "input[type='text']"
        ];
        let pinInput = null;
        for (const sel of pinSelectors) {
          try { await pageJogador.waitForSelector(sel, { timeout: 3000 }); pinInput = sel; break; } catch (_) {}
        }
        if (!pinInput) throw new Error("Campo de PIN não encontrado.");
        await pageJogador.click(pinInput);
        await pageJogador.type(pinInput, pin, { delay: 100 });
        const pinBtnSelectors = ["button[data-functional-selector='join-game-pin']", "button[type='submit']"];
        let pinBtn = null;
        for (const sel of pinBtnSelectors) {
          try { await pageJogador.waitForSelector(sel, { timeout: 3000 }); pinBtn = sel; break; } catch (_) {}
        }
        if (pinBtn) await pageJogador.click(pinBtn); else await pageJogador.keyboard.press("Enter");
        await onStep(3, "✅ PIN inserido");

        await onStep(4, "⏳ Inserindo nickname...");
        const nicknameSelectors = [
          "input[data-functional-selector='nickname-input']",
          "input#nickname-input", "input[name='nickname']",
          "input[placeholder*='name']", "input[placeholder*='Name']"
        ];
        let nicknameInput = null;
        for (const sel of nicknameSelectors) {
          try { await pageJogador.waitForSelector(sel, { timeout: 5000 }); nicknameInput = sel; break; } catch (_) {}
        }
        if (!nicknameInput) throw new Error("Campo de nickname não encontrado.");
        await new Promise(r => setTimeout(r, 1000));
        await pageJogador.click(nicknameInput);
        await pageJogador.type(nicknameInput, nickname, { delay: 120 });
        await new Promise(r => setTimeout(r, 500));
        const nickBtnSelectors = ["button[data-functional-selector='join-button-username']", "button[type='submit']"];
        let nickBtn = null;
        for (const sel of nickBtnSelectors) {
          try { await pageJogador.waitForSelector(sel, { timeout: 3000 }); nickBtn = sel; break; } catch (_) {}
        }
        if (nickBtn) await pageJogador.click(nickBtn); else await pageJogador.keyboard.press("Enter");
        await onStep(4, "✅ Nickname inserido");

        await onStep(5, "⏳ Aguardando entrar na sala...");
        await pageJogador.waitForFunction(() => {
          return document.querySelector("[data-functional-selector='waiting-screen']") !== null
              || document.querySelector("[data-functional-selector='lobby']") !== null
              || document.body.innerText.includes("You're in!")
              || document.body.innerText.includes("waiting");
        }, { timeout: 20000 });
        await onStep(5, "✅ Entrou na sala! As perguntas vão aparecer aqui no canal.");

        await interaction.channel.send({
          embeds: [new EmbedBuilder()
            .setTitle("🎮 Kahoot conectado!")
            .setDescription(`<@${interaction.user.id}> entrou como **${nickname}**.\nQuando o jogo começar, as perguntas aparecerão aqui!`)
            .setColor(0x46178f)]
        });

        loopPerguntas(pageJogador, pageEspectador, browser, interaction.channel).catch(async (err) => {
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
