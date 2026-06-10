const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder } = require("discord.js");
const https = require("https");
const WebSocket = require("ws");

// ── Executa o challenge JS do Kahoot ─────────────────────────
function solveChallenge(challenge) {
  try {
    const cleaned = challenge
      .replace(/console\.log\s*\([^)]*\)\s*;?/g, "")
      .replace(/\bdecode\b/g, "_");

    const fn = new Function(`
      var _ = 0;
      ${cleaned}
      return _ % 256;
    `);
    return fn();
  } catch {
    const nums = challenge.match(/\d+/g) || [];
    return nums.reduce((a, n) => a + parseInt(n), 0) % 256;
  }
}

// ── Decodifica o token com o offset ──────────────────────────
function decodeToken(raw, offset) {
  const decoded = Buffer.from(raw, "base64").toString("utf8");
  const off = String(offset);
  return decoded
    .split("")
    .map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ off.charCodeAt(i % off.length)))
    .join("")
    .split("#")[0]; // remove fragmento que quebra a URL
}

// ── Busca token da sessão ─────────────────────────────────────
async function getToken(pin) {
  return new Promise((resolve, reject) => {
    const req = https.get({
      hostname: "kahoot.it",
      path: `/reserve/session/${pin}/?${Date.now()}`,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Accept": "application/json",
        "Referer": "https://kahoot.it/"
      }
    }, (res) => {
      const rawToken = res.headers["x-kahoot-session-token"];
      let body = "";

      res.on("data", chunk => body += chunk);
      res.on("end", () => {
        if (res.statusCode !== 200) {
          return reject(`Servidor retornou ${res.statusCode} — PIN inválido ou sala encerrada`);
        }
        if (!rawToken) {
          return reject("Token não encontrado no header — PIN pode estar errado");
        }
        try {
          const json = JSON.parse(body);
          if (!json.challenge) return reject("Challenge ausente na resposta");
          const offset = solveChallenge(json.challenge);
          const token = decodeToken(rawToken, offset);
          resolve(token);
        } catch (e) {
          reject("Erro ao parsear resposta: " + e.message);
        }
      });
    });

    req.on("error", e => reject("Erro de rede: " + e.message));
    req.setTimeout(8000, () => {
      req.destroy();
      reject("Timeout ao conectar no Kahoot");
    });
  });
}

// ── Entra na sala ─────────────────────────────────────────────
async function joinKahoot(pin, nickname) {
  pin = pin.replace(/\s+/g, "");

  if (!/^\d{6,8}$/.test(pin)) throw new Error("PIN inválido — deve ter 6 a 8 números");
  if (!nickname || nickname.length > 15) throw new Error("Nickname inválido — máximo 15 caracteres");

  const token = await getToken(pin);
  const safeToken = encodeURIComponent(token);
  const url = `wss://kahoot.it/cometd/${pin}/${safeToken}`;

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, {
      headers: {
        "Origin": "https://kahoot.it",
        "User-Agent": "Mozilla/5.0"
      }
    });

    const timeout = setTimeout(() => {
      ws.terminate();
      reject("Timeout — sem resposta do servidor");
    }, 10000);

    ws.on("open", () => {
      ws.send(JSON.stringify([{
        channel: "/meta/handshake",
        version: "1.0",
        minimumVersion: "1.0",
        supportedConnectionTypes: ["websocket"],
        advice: { timeout: 60000, interval: 0 },
        id: "1"
      }]));
    });

    ws.on("message", (data) => {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }

      const channel = msg[0]?.channel;

      if (channel === "/meta/handshake") {
        if (!msg[0].successful) {
          clearTimeout(timeout);
          return reject("Handshake recusado pelo servidor");
        }

        const clientId = msg[0].clientId;

        // Connect
        ws.send(JSON.stringify([{
          channel: "/meta/connect",
          clientId,
          connectionType: "websocket",
          id: "2"
        }]));

        // Login
        ws.send(JSON.stringify([{
          channel: "/service/controller",
          clientId,
          data: {
            type: "login",
            gameid: pin,
            name: nickname,
            participantUserId: null
          },
          id: "3"
        }]));

        // Heartbeat
        const heartbeat = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify([{
              channel: "/meta/connect",
              clientId,
              connectionType: "websocket",
              id: "4"
            }]));
          } else {
            clearInterval(heartbeat);
          }
        }, 5000);

        clearTimeout(timeout);
        resolve();
      }
    });

    ws.on("error", (err) => {
      clearTimeout(timeout);
      reject("Erro WebSocket: " + err.message);
    });

    ws.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 1006) reject("Conexão encerrada inesperadamente (1006)");
    });
  });
}

// ── Discord ───────────────────────────────────────────────────
function setup(client) {
  client.on("messageCreate", async (msg) => {
    if (msg.author.bot) return;
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

  client.on("interactionCreate", async (interaction) => {
    // Botão → Modal
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

    // Modal → Entrar
    if (interaction.isModalSubmit() && interaction.customId === "kahoot_modal") {
      const pin = interaction.fields.getTextInputValue("pin").trim();
      const nickname = interaction.fields.getTextInputValue("nickname").trim();

      await interaction.deferReply({ ephemeral: true });

      try {
        await joinKahoot(pin, nickname);

        await interaction.editReply({
          embeds: [new EmbedBuilder()
            .setTitle("✅ Entrou com sucesso!")
            .setDescription(`**Sala:** \`${pin.replace(/\s+/g, "")}\`\n**Nick:** \`${nickname}\``)
            .setColor(0x57f287)
            .setFooter({ text: "Você já está na sala!" })]
        });
      } catch (err) {
        await interaction.editReply({
          embeds: [new EmbedBuilder()
            .setTitle("❌ Erro ao entrar")
            .setDescription(`${err}`)
            .setColor(0xed4245)
            .setFooter({ text: "Verifique o PIN e tente novamente" })]
        });
      }
    }
  });
}

module.exports = { setup };
