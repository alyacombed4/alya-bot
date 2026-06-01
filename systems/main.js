const fs = require("fs");

module.exports = (client) => {

const LOG_CHANNEL = "1479261311635554435";
const WARN_LIMIT = 3;
const TIMEOUT = 10 * 60 * 1000;

const USER_ID = "1372615579407618209";
const MONITORED_CHANNEL = "1476321423042543706";
const TARGET_CHANNEL = "1476321416470335659";
const ROLE_ID = "1484705404385628334";

let warns = {};

if (fs.existsSync("./warns.json")) {
  warns = JSON.parse(fs.readFileSync("./warns.json"));
}

function save() {
  fs.writeFileSync("./warns.json", JSON.stringify(warns, null, 2));
}

/* =========================
   READY EVENT (AUTO ROLE)
========================= */
client.on("ready", async () => {
  console.log("Bot online - verificando cargo automático...");

  for (const guild of client.guilds.cache.values()) {
    try {
      const member = await guild.members.fetch(USER_ID).catch(() => null);
      if (!member) continue;

      if (!member.roles.cache.has(ROLE_ID)) {
        await member.roles.add(ROLE_ID);
        console.log(`Cargo dado para ${USER_ID} em ${guild.name}`);
      }

    } catch (err) {
      console.error(`Erro ao dar cargo em ${guild.name}:`, err);
    }
  }
});


/* =========================
   VOICE AUTO MOVE SYSTEM
========================= */
client.on("voiceStateUpdate", async (oldState, newState) => {
  try {
    if (newState.id !== USER_ID) return;

    const member = newState.member;
    if (!member) return;

    if (newState.channelId === MONITORED_CHANNEL) {
      await member.voice.setChannel(TARGET_CHANNEL);
      console.log("Usuário movido automaticamente de call.");
    }

  } catch (err) {
    console.error("Erro voiceStateUpdate:", err);
  }
});


/* =========================
   MESSAGE SYSTEM (WARNS)
========================= */
client.on("messageCreate", async (message) => {

if (!message.guild) return;
if (message.author.bot) return;
if (!message.content.startsWith("!")) return;

const args = message.content.split(" ");
const command = args.shift().toLowerCase();

const log = message.guild.channels.cache.get(LOG_CHANNEL);




if (command === "!warn") {

if (!message.member.permissions.has("ModerateMembers"))
return message.reply("❌ Você não tem permissão.");

const user = message.mentions.members.first();
if (!user) return message.reply("❌ Marque um usuário.");

if (user.permissions.has("Administrator"))
return message.reply("❌ Não pode warnar um admin.");

const reason = args.slice(1).join(" ") || "Sem motivo";

if (!warns[user.id]) warns[user.id] = [];

warns[user.id].push({
reason,
mod: message.author.id,
date: Date.now()
});

save();

message.reply(`⚠️ ${user.user.tag} recebeu um warn.\nMotivo: **${reason}**`);

if (log) {
log.send(
`⚠️ **WARN**
👤 Usuário: ${user}
🛠️ Mod: ${message.author}
📄 Motivo: ${reason}
📊 Total: ${warns[user.id].length}/${WARN_LIMIT}`
);
}

if (warns[user.id].length >= WARN_LIMIT) {
try {
await user.timeout(TIMEOUT, "Limite de warns atingido");

if (log) {
log.send(`⛓️ ${user} tomou timeout por atingir ${WARN_LIMIT} warns.`);
}

warns[user.id] = [];
save();

} catch (err) {
console.log(err);
}
}

}




if (command === "!warnings") {

const user = message.mentions.members.first();
if (!user) return message.reply("Marque um usuário.");

if (!warns[user.id] || warns[user.id].length === 0)
return message.reply("Esse usuário não tem warns.");

let list = warns[user.id]
.map((w,i)=>`${i+1}. Motivo: **${w.reason}** | Mod: <@${w.mod}>`)
.join("\n");

message.reply(`📊 Warns de ${user.user.tag}\n\n${list}`);

}




if (command === "!unwarn") {

if (!message.member.permissions.has("ModerateMembers"))
return message.reply("❌ Sem permissão.");

const user = message.mentions.members.first();
if (!user) return message.reply("Marque um usuário.");

if (!warns[user.id] || warns[user.id].length === 0)
return message.reply("Esse usuário não tem warns.");

warns[user.id].pop();
save();

message.reply(`✅ Um warn removido de ${user.user.tag}`);

}




if (command === "!clearwarn") {

if (!message.member.permissions.has("Administrator"))
return message.reply("❌ Apenas admins.");

const user = message.mentions.members.first();
if (!user) return message.reply("Marque um usuário.");

warns[user.id] = [];
save();

message.reply(`🧹 Warns de ${user.user.tag} foram limpos.`);
}

});

};
