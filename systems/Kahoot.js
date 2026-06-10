const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder } = require("discord.js");
const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");

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

async function joinKahoot(pin, nickname, onStep) {
  pin = pin.replace(/\s+/g, "");
  let browser;

  try {
    await onStep(1, "⏳ Abrindo navegador...");
    browser = await getBrowser();
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36");
    await onStep(1, "✅ Navegador aberto");

    await onStep(2, "⏳ Acessando kahoot.it...");
    await page.goto("https://kahoot.it", { waitUntil: "networkidle2", timeout: 30000 });
    await onStep(2, "✅ Site carregado");

    await onStep(3, "⏳ Inserindo PIN...");

    const pinSelectors = [
      "input[data-functional-selector='game-input-text']",
      "input#game-input-text",
      "input[name='gameId']",
      "input[placeholder*='PIN']",
      "input[placeholder*='pin']",
      "input[type='number']",
      "input[type='text']"
    ];

    let pinInput = null;
    for (const sel of pinSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 3000 });
        pinInput = sel;
        break;
      } catch (_) {}
    }

    if (!pinInput) throw new Error(`Campo de PIN não encontrado.`);

    await page.click(pinInput);
    await page.type(pinInput, pin, { delay: 100 });

    const pinBtnSelectors = [
      "button[data-functional-selector='join-game-pin']",
      "button[type='submit']",
      "button#join-game-pin",
    ];

    let pinBtn = null;
    for (const sel of pinBtnSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 3000 });
        pinBtn = sel;
        break;
      } catch (_) {}
    }

    if (pinBtn) await page.click(pinBtn);
    else await page.keyboard.press("Enter");

    await onStep(3, "✅ PIN inserido");

    await onStep(4, "⏳ Inserindo nickname...");

    const nicknameSelectors = [
      "input[data-functional-selector='nickname-input']",
      "input#nickname-input",
      "input[name='nickname']",
      "input[placeholder*='name']",
      "input[placeholder*='Name']",
      "input[placeholder*='nickname']",
    ];

    let nicknameInput = null;
    for (const sel of nicknameSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 5000 });
        nicknameInput = sel;
        break;
      } catch (_) {}
    }

    if (!nicknameInput) throw new Error("Campo de nickname não encontrado. PIN errado ou sala fechada.");

    await new Promise(r => setTimeout(r, 1000));
    await page.click(nicknameInput);
    await page.type(nicknameInput, nickname, { delay: 120 });
    await new Promise(r => setTimeout(r, 500));

    const nickBtnSelectors = [
      "button[data-functional-selector='join-button-username']",
      "button[type='submit']",
      "button#join-button-username",
    ];

    let nickBtn = null;
    for (const sel of nickBtnSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 3000 });
        nickBtn = sel;
        break;
      } catch (_) {}
    }

    if (nickBtn) await page.click(nickBtn);
    else await page.keyboard.press("Enter");

    await onStep(4, "✅ Nickname inserido");
    await onStep(5, "⏳ Aguardando entrar na sala...");

    await page.waitForFunction(() => {
      return document.querySelector("[data-functional-selector='waiting-screen']") !== null
          || document.querySelector("[data-functional-selector='lobby']") !== null
          || document.body.innerText.includes("You're in!")
          || document.body.innerText.includes("waiting");
    }, { timeout: 20000 });

    await onStep(5, "✅ Entrou na sala!");

    return page; // retorna a page para o loop de perguntas
  } catch (err) {
    if (browser) await browser.close();
    throw err;
  }

  // NÃO fecha o browser aqui — vai fechar no loop de perguntas
  return { browser, page: null };
}

// Cores do Kahoot por índice de resposta
const KAHOOT_COLORS = ["🔴", "🔵", "🟡", "🟢"];
const ANSWER_SELECTORS = [
  "div[data-functional-selector='answer-0']",
  "div[data-functional-selector='answer-1']",
  "div[data-functional-selector='answer-2']",
  "div[data-functional-selector='answer-3']",
];

async function loopPerguntas(page, browser, dmChannel) {
  let rodando = true;
  let msgAtual = null;
  let coletorAtual = null;

  while (rodando) {
    try {
      // Aguarda aparecer uma pergunta ou fim de jogo
      await page.waitForFunction(() => {
        return document.querySelector("[data-functional-selector='question-title']") !== null
            || document.querySelector("[data-functional-selector='end-screen']") !== null
            || document.body.innerText.includes("podium")
            || document.body.innerText.includes("Game over");
      }, { timeout: 60000 });

      // Checa se acabou o jogo
      const fimDeJogo = await page.evaluate(() => {
        return document.querySelector("[data-functional-selector='end-screen']") !== null
            || document.body.innerText.includes("Game over")
            || document.body.innerText.includes("podium");
      });

      if (fimDeJogo) {
        await dmChannel.send({
          embeds: [new EmbedBuilder()
            .setTitle("🏁 Jogo encerrado!")
            .setDescription("O Kahoot terminou. Obrigado por jogar!")
            .setColor(0x46178f)]
        });
        break;
      }

      // Pega a pergunta
      const pergunta = await page.evaluate(() => {
        const el = document.querySelector("[data-functional-selector='question-title']");
        return el ? el.innerText.trim() : "❓ Pergunta não identificada";
      });

      // Pega as respostas disponíveis
      const respostas = await page.evaluate((sels) => {
        return sels.map(sel => {
          const el = document.querySelector(sel);
          return el ? el.innerText.trim() : null;
        });
      }, ANSWER_SELECTORS);

      const respostasValidas = respostas.map((r, i) => ({ texto: r, index: i })).filter(r => r.texto);

      // Monta embed com a pergunta
      const embed = new EmbedBuilder()
        .setTitle("❓ Nova Pergunta!")
        .setDescription(`**${pergunta}**`)
        .setColor(0x46178f)
        .setFooter({ text: "Escolha sua resposta abaixo!" });

      // Monta botões com as respostas
      const row = new ActionRowBuilder().addComponents(
        respostasValidas.map(r =>
          new ButtonBuilder()
            .setCustomId(`kahoot_answer_${r.index}`)
            .setLabel(`${KAHOOT_COLORS[r.index]} ${r.texto}`)
            .setStyle(ButtonStyle.Primary)
        )
      );

      // Remove coletor anterior se existir
      if (coletorAtual) coletorAtual.stop();

      // Edita ou manda nova mensagem
      if (msgAtual) {
        await msgAtual.edit({ embeds: [embed], components: [row] });
      } else {
        msgAtual = await dmChannel.send({ embeds: [embed], components: [row] });
      }

      // Coletor de resposta do usuário
      coletorAtual = msgAtual.createMessageComponentCollector({
        filter: i => i.customId.startsWith("kahoot_answer_"),
        time: 30000,
        max: 1
      });

      coletorAtual.on("collect", async (btnInteraction) => {
        const index = parseInt(btnInteraction.customId.replace("kahoot_answer_", ""));

        // Clica na resposta no Kahoot
        try {
          await page.click(ANSWER_SELECTORS[index]);
          await btnInteraction.update({
            embeds: [new EmbedBuilder()
              .setTitle("✅ Resposta enviada!")
              .setDescription(`Você escolheu: ${KAHOOT_COLORS[index]} **${respostasValidas.find(r => r.index === index)?.texto || "?"}**`)
              .setColor(0x57f287)],
            components: []
          });
        } catch (err) {
          await btnInteraction.update({
            embeds: [new EmbedBuilder()
              .setTitle("⚠️ Não consegui clicar")
              .setDescription("A resposta pode ter expirado.")
              .setColor(0xfee75c)],
            components: []
          });
        }
      });

      coletorAtual.on("end", async (collected) => {
        if (collected.size === 0 && msgAtual) {
          // Tempo esgotado sem resposta
          await msgAtual.edit({
            embeds: [new EmbedBuilder()
              .setTitle("⏰ Tempo esgotado!")
              .setDescription("Você não respondeu a tempo.")
              .setColor(0xed4245)],
            components: []
          });
        }
      });

      // Aguarda a próxima pergunta (espera a atual sumir)
      await page.waitForFunction(() => {
        return document.querySelector("[data-functional-selector='question-title']") === null;
      }, { timeout: 60000 }).catch(() => {});

      await new Promise(r => setTimeout(r, 2000));

    } catch (err) {
      if (err.message?.includes("timeout")) {
        // Jogo pode ter acabado ou demorou demais
        await dmChannel.send({
          embeds: [new EmbedBuilder()
            .setTitle("⏳ Sem atividade")
            .setDescription("Não detectei nova pergunta por 60 segundos. O jogo pode ter encerrado.")
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
            .setMinLength(6)
            .setMaxLength(9)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("nickname")
            .setLabel("Seu Nickname")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Ex: Player1")
            .setMinLength(1)
            .setMaxLength(15)
            .setRequired(true)
        )
      );

      await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === "kahoot_modal") {
      const pin = interaction.fields.getTextInputValue("pin").trim();
      const nickname = interaction.fields.getTextInputValue("nickname").trim();

      await interaction.deferReply({ ephemeral: true });

      const passos = {
        1: "⬜ Abrindo navegador...",
        2: "⬜ Acessando kahoot.it...",
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
        // Lança o browser separado para poder fechar depois
        browser = await getBrowser();
        const page = await browser.newPage();
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36");

        // Reutiliza joinKahoot mas passando page já criada
        await onStep(1, "✅ Navegador aberto");
        await onStep(2, "⏳ Acessando kahoot.it...");
        await page.goto("https://kahoot.it", { waitUntil: "networkidle2", timeout: 30000 });
        await onStep(2, "✅ Site carregado");

        await onStep(3, "⏳ Inserindo PIN...");
        const pinSelectors = [
          "input[data-functional-selector='game-input-text']",
          "input#game-input-text", "input[name='gameId']",
          "input[placeholder*='PIN']", "input[placeholder*='pin']",
          "input[type='number']", "input[type='text']"
        ];
        let pinInput = null;
        for (const sel of pinSelectors) {
          try { await page.waitForSelector(sel, { timeout: 3000 }); pinInput = sel; break; } catch (_) {}
        }
        if (!pinInput) throw new Error("Campo de PIN não encontrado.");
        await page.click(pinInput);
        await page.type(pinInput, pin, { delay: 100 });
        const pinBtnSelectors = [
          "button[data-functional-selector='join-game-pin']",
          "button[type='submit']", "button#join-game-pin"
        ];
        let pinBtn = null;
        for (const sel of pinBtnSelectors) {
          try { await page.waitForSelector(sel, { timeout: 3000 }); pinBtn = sel; break; } catch (_) {}
        }
        if (pinBtn) await page.click(pinBtn); else await page.keyboard.press("Enter");
        await onStep(3, "✅ PIN inserido");

        await onStep(4, "⏳ Inserindo nickname...");
        const nicknameSelectors = [
          "input[data-functional-selector='nickname-input']",
          "input#nickname-input", "input[name='nickname']",
          "input[placeholder*='name']", "input[placeholder*='Name']"
        ];
        let nicknameInput = null;
        for (const sel of nicknameSelectors) {
          try { await page.waitForSelector(sel, { timeout: 5000 }); nicknameInput = sel; break; } catch (_) {}
        }
        if (!nicknameInput) throw new Error("Campo de nickname não encontrado.");
        await new Promise(r => setTimeout(r, 1000));
        await page.click(nicknameInput);
        await page.type(nicknameInput, nickname, { delay: 120 });
        await new Promise(r => setTimeout(r, 500));
        const nickBtnSelectors = [
          "button[data-functional-selector='join-button-username']",
          "button[type='submit']", "button#join-button-username"
        ];
        let nickBtn = null;
        for (const sel of nickBtnSelectors) {
          try { await page.waitForSelector(sel, { timeout: 3000 }); nickBtn = sel; break; } catch (_) {}
        }
        if (nickBtn) await page.click(nickBtn); else await page.keyboard.press("Enter");
        await onStep(4, "✅ Nickname inserido");

        await onStep(5, "⏳ Aguardando entrar na sala...");
        await page.waitForFunction(() => {
          return document.querySelector("[data-functional-selector='waiting-screen']") !== null
              || document.querySelector("[data-functional-selector='lobby']") !== null
              || document.body.innerText.includes("You're in!")
              || document.body.innerText.includes("waiting");
        }, { timeout: 20000 });
        await onStep(5, "✅ Entrou na sala! As perguntas vão aparecer na sua DM.");

        // Abre DM com o usuário e avisa
        const dm = await interaction.user.createDM();
        await dm.send({
          embeds: [new EmbedBuilder()
            .setTitle("🎮 Kahoot conectado!")
            .setDescription(`Você está na sala como **${nickname}**.\nQuando o jogo começar, as perguntas aparecerão aqui. Clique no botão da resposta!`)
            .setColor(0x46178f)]
        });

        // Inicia loop de perguntas na DM (não bloqueia o reply)
        loopPerguntas(page, browser, dm).catch(async (err) => {
          await dm.send({
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
