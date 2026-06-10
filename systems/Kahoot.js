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
    await page.goto("https://kahoot.it", { waitUntil: "networkidle2", timeout: 20000 });
    await onStep(2, "✅ Site carregado");

    await onStep(3, "⏳ Inserindo PIN...");
    await page.waitForSelector("input[data-functional-selector='game-input-text']", { timeout: 10000 });
    await page.click("input[data-functional-selector='game-input-text']");
    await page.type("input[data-functional-selector='game-input-text']", pin, { delay: 100 });
    await page.waitForSelector("button[data-functional-selector='join-game-pin']", { timeout: 5000 });
    await page.click("button[data-functional-selector='join-game-pin']");
    await onStep(3, "✅ PIN inserido");

    await onStep(4, "⏳ Inserindo nickname...");
    await page.waitForSelector("input[data-functional-selector='nickname-input']", { timeout: 10000 });
    await new Promise(r => setTimeout(r, 1000));
    await page.click("input[data-functional-selector='nickname-input']");
    await page.type("input[data-functional-selector='nickname-input']", nickname, { delay: 120 });
    await new Promise(r => setTimeout(r, 500));
    await page.waitForSelector("button[data-functional-selector='join-button-username']", { timeout: 5000 });
    await page.click("button[data-functional-selector='join-button-username']");
    await onStep(4, "✅ Nickname inserido");

    await onStep(5, "⏳ Aguardando entrar na sala...");
    await page.waitForFunction(() => {
      return document.querySelector("[data-functional-selector='waiting-screen']") !== null
          || document.querySelector("[data-functional-selector='lobby']") !== null
          || document.body.innerText.includes("You're in!");
    }, { timeout: 15000 });
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
