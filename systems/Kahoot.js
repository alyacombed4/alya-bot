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

    if (!pinInput) {
      throw new Error(`Campo de PIN não encontrado. Seletores testados: ${pinSelectors.join(", ")}`);
    }

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

    if (pinBtn) {
      await page.click(pinBtn);
    } else {
      await page.keyboard.press("Enter");
    }

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

    if (!nicknameInput) {
      throw new Error("Campo de nickname não encontrado. O PIN pode estar errado ou a sala fechada.");
    }

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

    if (nickBtn) {
      await page.click(nickBtn);
    } else {
      await page.keyboard.press("Enter");
    }

    await onStep(4, "✅ Nickname inserido");

    await onStep(5, "⏳ Aguardando entrar na sala...");
    await page.waitForFunction(() => {
      return document.querySelector("[data-functional-selector='waiting-screen']") !== null
          || document.querySelector("[data-functional-selector='lobby']") !== null
          || document.body.innerText.includes("You're in!")
          || document.body.innerText.includes("Você está dentro")
          || document.body.innerText.includes("waiting");
    }, { timeout: 20000 });
    await onStep(5, "✅ Entrou na sala! Aguardando o jogo começar...");

    await new Promise(r => setTimeout(r, 300000));
  } finally {
    if (browser) await browser.close();
  }
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
          .setDescription(
            Object.values(passos).join("\n") +
            (extra ? `\n\n${extra}` : "")
          )
          .setColor(0x46178f);
      }

      await interaction.editReply({ embeds: [buildEmbed()] });

      async function onStep(num, texto) {
        passos[num] = texto;
        await interaction.editReply({ embeds: [buildEmbed()] });
        await new Promise(r => setTimeout(r, 800));
      }

      try {
        await joinKahoot(pin, nickname, onStep);
      } catch (err) {
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
