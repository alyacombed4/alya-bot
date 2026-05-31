const { Client, GatewayIntentBits } = require("discord.js");
const fs = require("fs");
const path = require("path");
const https = require("https");
const {
  backupServer,
  restoreServer,
  zipBackup,
  splitFile,
} = require("./systems/backupRestore");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const OWNER_ID = "1372615579407618209";
const BACKUP_CHANNEL_ID = "1479261311635554435";
const ZIP_URL = "https://github.com/alyacombed2/alya-bot1/archive/refs/heads/main.zip";
const ZIP_FILE_NAME = "alya-bot-main.zip";

require("./systems/main")(client);
require("./systems/gfzin")(client);
require("./systems/coco")(client);
require("./systems/comandos")(client);
require("./systems/uno")(client);

client.once("clientReady", () => {
  console.log(`✅ Bot online como ${client.user.tag}`);
});

function baixarArquivo(url, destino) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destino);

    https.get(url, (response) => {
      if (
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        file.close();
        fs.unlink(destino, () => {});
        return baixarArquivo(response.headers.location, destino)
          .then(resolve)
          .catch(reject);
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlink(destino, () => {});
        return reject(new Error(`Falha ao baixar arquivo. Status: ${response.statusCode}`));
      }

      response.pipe(file);

      file.on("finish", () => {
        file.close(resolve);
      });
    }).on("error", (err) => {
      file.close();
      fs.unlink(destino, () => {});
      reject(err);
    });
  });
}

async function enviarZipAtualizado() {
  try {
    const canal = await client.channels.fetch(BACKUP_CHANNEL_ID).catch(() => null);
    if (!canal) {
      console.log("❌ Canal de backup não encontrado.");
      return false;
    }

    const filePath = path.join(__dirname, ZIP_FILE_NAME);

    console.log("📦 Baixando ZIP atualizado do GitHub...");
    await baixarArquivo(ZIP_URL, filePath);

    await canal.send({
      content: "📦 **script gfzin.js atualizado pasta do bot atualizada**",
      files: [filePath]
    });

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    console.log("✅ ZIP atualizado enviado com sucesso.");
    return true;
  } catch (err) {
    console.log("❌ Erro ao enviar ZIP atualizado:", err.message);
    return false;
  }
}

async function enviarArquivosBackup(parts, motivo = "Backup") {
  let dmEnviada = false;
  let canalEnviado = false;

  try {
    const user = await client.users.fetch(OWNER_ID);
    const dm = await user.createDM();

    await dm.send(`⚠️ ${motivo}\n📦 Enviando backup automático...`);

    for (let i = 0; i < parts.length; i++) {
      await dm.send({
        content: `📦 Parte ${i + 1}/${parts.length}`,
        files: [parts[i]]
      });

      await new Promise(res => setTimeout(res, 1500));
    }

    await dm.send("✅ Backup enviado com sucesso!");
    dmEnviada = true;
  } catch (err) {
    console.log("❌ Erro ao enviar na DM:", err.message);
  }

  try {
    const canal = await client.channels.fetch(BACKUP_CHANNEL_ID).catch(() => null);

    if (canal) {
      await canal.send(`⚠️ ${motivo}\n📦 Enviando backup automático...`);

      for (let i = 0; i < parts.length; i++) {
        await canal.send({
          content: `📦 Parte ${i + 1}/${parts.length}`,
          files: [parts[i]]
        });

        await new Promise(res => setTimeout(res, 1500));
      }

      await canal.send("✅ Backup enviado com sucesso!");
      canalEnviado = true;
    }
  } catch (err) {
    console.log("❌ Erro ao enviar no canal:", err.message);
  }

  if (!dmEnviada && !canalEnviado) {
    console.log("❌ Não consegui enviar backup nem na DM nem no canal.");
  }
}

async function limparPartesTemporarias(parts) {
  try {
    for (const file of parts) {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    }
  } catch (err) {
    console.log("⚠️ Erro ao limpar arquivos temporários:", err.message);
  }
}

async function enviarBackupAutomatico(motivo = "Encerramento") {
  try {
    const guild = client.guilds.cache.first();
    if (!guild) return;

    console.log(`📦 Backup automático iniciado (${motivo})`);

    await backupServer(guild);
    const zipPath = await zipBackup(guild.id);
    const parts = splitFile(zipPath);

    await enviarArquivosBackup(parts, `⚠️ Bot finalizado (${motivo})`);
    await limparPartesTemporarias(parts);
  } catch (err) {
    console.log("❌ Erro backup auto:", err.message);
  }
}

process.on("SIGINT", async () => {
  console.log("🛑 SIGINT detectado");
  await enviarBackupAutomatico("SIGINT");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("🛑 SIGTERM detectado");
  await enviarBackupAutomatico("SIGTERM (Railway)");
  process.exit(0);
});

process.on("uncaughtException", async (err) => {
  console.log("💥 ERRO:", err);
  await enviarBackupAutomatico("Erro crítico");
  process.exit(1);
});

process.on("unhandledRejection", async (reason) => {
  console.log("💥 PROMISE ERROR:", reason);
  await enviarBackupAutomatico("Promise rejeitada");
});

setInterval(async () => {
  try {
    const guild = client.guilds.cache.first();
    if (!guild) return;

    console.log("💾 Backup automático periódico...");
    await backupServer(guild);
  } catch (err) {
    console.log("❌ Erro auto backup:", err.message);
  }
}, 1000 * 60 * 30);

setInterval(async () => {
  try {
    const canal = await client.channels.fetch(BACKUP_CHANNEL_ID).catch(() => null);
    if (!canal) return;

    await canal.send("📡 **Container Railway online**");
    console.log("📡 Mensagem de status do container enviada.");
  } catch (err) {
    console.log("❌ Erro ao enviar status do container:", err.message);
  }
}, 1000 * 60 * 60 * 24);

client.on("messageCreate", async (message) => {
  if (!message.guild || message.author.bot) return;
  if (message.author.id !== OWNER_ID) return;

  if (message.content === "!backup") {
    await message.reply("📦 Fazendo backup...");

    try {
      await backupServer(message.guild);
      const zipPath = await zipBackup(message.guild.id);
      const parts = splitFile(zipPath);

      await message.reply(`📤 Enviando ${parts.length} partes na DM e no canal...`);
      await enviarArquivosBackup(parts, "📦 Backup manual solicitado");
      await limparPartesTemporarias(parts);

      await message.reply("✅ Backup enviado!");
    } catch (err) {
      console.log("❌ ERRO BACKUP MANUAL:", err.message);
      await message.reply("❌ Não consegui enviar o backup!");
    }
  }

  if (message.content === "!restore") {
    await message.reply("♻️ Restaurando servidor...");

    try {
      await restoreServer(message.guild);
      await message.reply("✅ Restore concluído!");
    } catch (err) {
      console.log("❌ ERRO RESTORE:", err.message);
      await message.reply("❌ Erro ao restaurar o servidor.");
    }
  }

  

  if (message.content === "!att") {
    await message.reply("📦 Baixando e enviando atualização do bot...");

    const enviado = await enviarZipAtualizado();

    if (enviado) {
      await message.reply("✅ ZIP atualizado enviado no canal!");
    } else {
      await message.reply("❌ Não consegui enviar o ZIP atualizado.");
    }
  }
});

client.login(process.env.TOKEN);
