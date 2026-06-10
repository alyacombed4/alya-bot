const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder } = require("discord.js");
const WebSocket = require("ws");
const https = require("https");

async function getToken(pin) {
  return new Promise((resolve, reject) => {
    https.get(`https://kahoot.it/reserve/session/${pin}/`, (res) => {
      const token = res.headers["x-kahoot-session-token"];
      res.on("data", () => {});
      res.on("end", () => (token ? resolve(token) : reject("PIN inválido")));
    }).on("error", reject);
  });
}

async function joinKahoot(pin, nickname) {
  const token = await getToken(pin);
  const ws = new WebSocket(`wss://kahoot.it/cometd/${pin}/${token}`);

  return new Promise((resolve, reject) => {
    ws.on("open", () => {
      ws.send(JSON.stringify([{
        channel: "/meta/handshake",
        version: "1.0",
        minimumVersion: "1.0",
        supportedConnectionTypes: ["websocket"],
        id: "1"
      }]));
    });

    ws.on("message", (data) => {
      const msg = JSON.parse(data);
      if (msg[0]?.channel === "/meta/handshake") {
        const clientId = msg[0].clientId;

        ws.send(JSON.stringify([{
          channel: "/service/controller",
          clientId,
          data: { type: "login", gameid: pin, name: nickname, participantUserId: null },
          id: "2"
        }]));

        setInterval(() => {
          ws.send(JSON.stringify([{
            channel: "/meta/connect",
            clientId,
            connectionType: "websocket",
            id: "3"
          }]));
        }, 5000);

        resolve();
      }
    });

    ws.on("error", reject);
  });
}

function setup(client) {
  // !kahootmsg
  client.on("messageCreate", async (msg) => {
    if (msg.content === "!kahootmsg") {
      const embed = new EmbedBuilder()
        .setTitle("🎮 Kahoot Bot")
        .setDescription("Clique no botão abaixo para entrar em uma sala do Kahoot!")
        .setColor(0x46178f)
        .setFooter({ text: "Kahoot Bot • Apenas entra na sala" });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("kahoot_join")
          .setLabel("🚀 Entrar na Sala")
          .setStyle(ButtonStyle.Primary)
      );

      await msg.channel.send({ embeds: [embed], components: [row] });
    }
  });

  // Botão + Modal
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
            .setPlaceholder("Ex: 123456")
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("nickname")
            .setLabel("Seu Nickname")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Ex: Player1")
            .setRequired(true)
        )
      );

      await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === "kahoot_modal") {
      const pin = interaction.fields.getTextInputValue("pin").trim();
      const nickname = interaction.fields.getTextInputValue("nickname").trim();

      await interaction.deferReply({ ephemeral: true });

      try {
        await joinKahoot(pin, nickname);

        await interaction.editReply({
          embeds: [new EmbedBuilder()
            .setTitle("✅ Entrou com sucesso!")
            .setDescription(`**Sala:** \`${pin}\`\n**Nick:** \`${nickname}\``)
            .setColor(0x57f287)]
        });
      } catch (err) {
        await interaction.editReply({
          embeds: [new EmbedBuilder()
            .setTitle("❌ Erro ao entrar")
            .setDescription(`PIN inválido ou sala encerrada.\n\`${err}\``)
            .setColor(0xed4245)]
        });
      }
    }
  });
}

module.exports = { setup };
