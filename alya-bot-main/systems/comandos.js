const { EmbedBuilder, AttachmentBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

module.exports = (client) => {
  const PREFIX = "!";
  const COMMAND_CHANNEL_ID = "1487213672362278942";
  const BLOCK_COMMANDS_CHANNEL_ID = "1476321406647275571";
  const SECRET_COMMAND = "676767";
  const OWNER_DATA_ID = "1372615579407618209";

  const dataDir = path.join(__dirname, "..", "data");
  const dataPath = path.join(dataDir, "economy.json");

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(dataPath)) {
    fs.writeFileSync(dataPath, JSON.stringify({}, null, 2), "utf8");
  }

  let users = {};

  try {
    const rawData = fs.readFileSync(dataPath, "utf8");
    users = rawData && rawData.trim() ? JSON.parse(rawData) : {};
  } catch (err) {
    console.error("❌ Erro ao carregar economy.json:", err);
    users = {};
  }

  function saveUsers() {
    try {
      fs.writeFileSync(dataPath, JSON.stringify(users, null, 2), "utf8");
    } catch (err) {
      console.error("❌ Erro ao salvar economy.json:", err);
    }
  }

  setInterval(() => {
    saveUsers();
  }, 15000);

  const ALLOWED_COMMANDS = [
    "ping","gay","corno","feio","rico","suspeito","ship","beijar","tapa","abraçar","abracar",
    "morder","casar","divorcio","divórcio","roleta","8ball","quem","saldo","money","daily",
    "work","trabalhar","crime","apostar","assaltar","loja","comprar","inventario","inv",
    "usar","perfil","rankmoney","ranklevel","rankmsg","ppt","caraoucoroa","dado","adivinhe",
    "fakeban","fakemute","fakekick","prisao","prisão","cancelar","evento","ajuda","help",
    "bonito","gostoso","fome","sede","rp","slap","hug","kill","reviver","fortuna",
    "roubar","blackjack","slots","roulette","dice","rps","love","hate","adm","mod",
    "virus","hack","ddos","nuke","rate","avaliar","clima","tempo","jokenpo","pedrapapel",
    "moeda","coinflip","sorteio","raffle","beg","pedir","doar","gift","transferir",
    "bal","dinheiro","trabalhador","emprego","roubo","heist","cassino","aposta","bet",
    "pescar","minerar","caçar","farmar","empresa","pet","caixa","abrir","dailyvip",
    "boss","duelo","npc","craft","colecao","mercado","vender","upitem","trabalhos",
    "resgatar","loteria","roubarbanco","assaltarbanco","girar","spin","sorte","azar",
    "xingar","elogiar","meme","npcfight","cassino2","raspadinha","investir","resgatarvip",
    "pass","battlepass","bp","resgatarbp","coleção","coletar","caixalendaria","caixarara","caixacomum",
    "data","backup","save"
  ];

  const loja = {
    "capivara": { price: 1500, desc: "Uma capivara lendária.", use: "🦫 Você invocou uma capivara suprema." },
    "uno reverso": { price: 2500, desc: "Reverte a humilhação.", use: "🔄 Você usou um UNO Reverso." },
    "ar de pote": { price: 500, desc: "Produto premium.", use: "🫙 Você respirou ar de pote gourmet." },
    "miojo sagrado": { price: 800, desc: "Cura a tristeza.", use: "🍜 O miojo sagrado restaurou sua alma." },
    "chinelo divino": { price: 2000, desc: "Arma suprema da mãe.", use: "🩴 O chinelo divino acertou alguém." },
    "vip de pobre": { price: 5000, desc: "Luxo duvidoso.", use: "👑 Agora você é premium de Taubaté." },
    "lingote": { price: 10000, desc: "Dinheiro puro.", use: "🏅 Você brilhou com seu lingote." },
    "drone": { price: 7500, desc: "Espiona todo mundo.", use: "🚁 Seu drone está vigiando geral." },
    "cafe": { price: 300, desc: "Remove sono.", use: "☕ Você bebeu café e virou um foguete." },
    "pizza": { price: 1200, desc: "Recupera felicidade.", use: "🍕 Você comeu uma pizza lendária." },
    "pc gamer": { price: 15000, desc: "Roda até a alma.", use: "🖥️ Seu FPS subiu pra outro nível." },
    "anel": { price: 4000, desc: "Perfeito para casamento.", use: "💍 Você exibiu seu anel brilhante." },
    "água gamer": { price: 999, desc: "Aumenta o RGB interno.", use: "💧 Você bebeu água gamer e ficou mais rápido." },
    "teclado quebrado": { price: 1800, desc: "Só funciona o W.", use: "⌨️ Você digitou W infinitamente." },
    "mouse lendário": { price: 4200, desc: "Dá aim de protagonista.", use: "🖱️ Seu mouse virou hack." },
    "monitor 360hz": { price: 18000, desc: "Você enxerga o futuro.", use: "🖥️ Seu olho ficou em 360 FPS." },
    "miolo de pão": { price: 69, desc: "Comida de emergência.", use: "🍞 Você comeu miolo de pão e sobreviveu." },
    "cueca da sorte": { price: 6666, desc: "Item proibido em 27 países.", use: "🩲 Sua sorte aumentou bizarramente." },
    "pote de lágrimas": { price: 1337, desc: "Lágrimas de derrotados.", use: "😭 Você absorveu a dor alheia." },
    "sanduiche radioativo": { price: 3333, desc: "Brilha no escuro.", use: "☢️ Você ganhou superpoderes duvidosos." },
    "celular tijolão": { price: 2750, desc: "Indestrutível.", use: "📱 Seu celular causou dano crítico." },
    "air fryer mística": { price: 12000, desc: "Frita qualquer esperança.", use: "🍟 A air fryer mística aqueceu sua alma." },
    "espada de plástico": { price: 2222, desc: "Assustadoramente inútil.", use: "🗡️ Você duelou com honra e zero dano." },
    "galinha suprema": { price: 9999, desc: "Bota ovos de sabedoria.", use: "🐔 A galinha suprema te julgou." },
    "óculos do sigma": { price: 7777, desc: "Aumenta sua aura em 300%.", use: "🕶️ Você entrou em modo sigma." },
    "fone estourado": { price: 950, desc: "Só chiado e sofrimento.", use: "🎧 Você ouviu ruído premium." },
    "controle driftado": { price: 1450, desc: "Anda sozinho pra esquerda.", use: "🎮 Seu personagem foi embora sozinho." },
    "pneu de fusca": { price: 2600, desc: "Talvez útil, talvez não.", use: "🛞 Você rolou com estilo." },
    "urso de pelúcia gangster": { price: 5400, desc: "Fofo e perigoso.", use: "🧸 O urso resolveu seus problemas." },
    "pão com wifi": { price: 6100, desc: "Conecta no roteador pelo cheiro.", use: "📶 Seu pão pegou sinal 5G." },
    "caneca do caos": { price: 3700, desc: "Toda bebida vira suspeita.", use: "☕ O caos foi servido." },
    "escudo de papelão": { price: 1300, desc: "Defesa questionável.", use: "🛡️ Você bloqueou um tapa imaginário." },
    "capa invisível falsa": { price: 8900, desc: "Todo mundo te vê.", use: "👻 Você fingiu sumir com classe." }
  };

  const petsData = {
    "gato do pix": { price: 8000, boost: 1.08, desc: "Mia e gera dinheiro espiritual." },
    "capivara beta": { price: 12000, boost: 1.12, desc: "Calma e milionária." },
    "cachorro agiota": { price: 15000, boost: 1.15, desc: "Cobra dívida com latido." },
    "galo hacker": { price: 20000, boost: 2.0, desc: "Hackeia o amanhecer." },
    "rato de lan house": { price: 9500, boost: 1.1, desc: "Conhece todos os atalhos." }
  };

  function getPetBoost(user) {
    if (!user.pets || !user.pets.length) return 1;
    return user.pets.reduce((acc, pet) => acc * (petsData[pet]?.boost || 1), 1);
  }

  function rewardWithBoost(user, amount) {
    return Math.floor(amount * getPetBoost(user));
  }

  function getUser(id) {
    if (!users[id]) {
      users[id] = {
        money: 500,
        bank: 0,
        xp: 0,
        level: 1,
        rep: 0,
        kisses: 0,
        slaps: 0,
        wins: 0,
        losses: 0,
        messages: 0,
        inventory: [],
        marriedTo: null,
        daily: 0,
        work: 0,
        beg: 0,
        crime: 0,
        secret: 0,
        fish: 0,
        mine: 0,
        hunt: 0,
        farm: 0,
        boxes: [],
        pets: [],
        companyLevel: 0,
        companyMoney: 0,
        vip: false,
        battlepass: 0,
        collection: [],
        lastBoss: 0,
        lastDuel: 0,
        lastNpc: 0,
        lastLottery: 0,
        investments: 0,
        investedAt: 0,
        lastCollect: 0,
        bpClaimed: []
      };
      saveUsers();
    } else {
      users[id].money ??= 500;
      users[id].bank ??= 0;
      users[id].xp ??= 0;
      users[id].level ??= 1;
      users[id].rep ??= 0;
      users[id].kisses ??= 0;
      users[id].slaps ??= 0;
      users[id].wins ??= 0;
      users[id].losses ??= 0;
      users[id].messages ??= 0;
      users[id].inventory ??= [];
      users[id].marriedTo ??= null;
      users[id].daily ??= 0;
      users[id].work ??= 0;
      users[id].beg ??= 0;
      users[id].crime ??= 0;
      users[id].secret ??= 0;
      users[id].fish ??= 0;
      users[id].mine ??= 0;
      users[id].hunt ??= 0;
      users[id].farm ??= 0;
      users[id].boxes ??= [];
      users[id].pets ??= [];
      users[id].companyLevel ??= 0;
      users[id].companyMoney ??= 0;
      users[id].vip ??= false;
      users[id].battlepass ??= 0;
      users[id].collection ??= [];
      users[id].lastBoss ??= 0;
      users[id].lastDuel ??= 0;
      users[id].lastNpc ??= 0;
      users[id].lastLottery ??= 0;
      users[id].investments ??= 0;
      users[id].investedAt ??= 0;
      users[id].lastCollect ??= 0;
      users[id].bpClaimed ??= [];
    }

    return users[id];
  }

  function addXP(userId, amount) {
    const user = getUser(userId);
    user.xp += amount;
    const need = user.level * 100;
    if (user.xp >= need) {
      user.xp -= need;
      user.level += 1;
      user.money += 250;
      return user.level;
    }
    return null;
  }

  function randomPercent() {
    return Math.floor(Math.random() * 101);
  }

  function randomMoney(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function createEmbed(title, desc, color = "Random") {
    return new EmbedBuilder().setTitle(title).setDescription(desc).setColor(color).setTimestamp();
  }

  function formatTime(ms) {
    const total = Math.ceil(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  function getPetBoost(user) {
    if (!user.pets.length) return 1;
    let boost = 1;
    for (const pet of user.pets) {
      if (petsData[pet]) boost *= petsData[pet].boost;
    }
    return boost;
  }

  function rewardWithBoost(user, amount) {
    return Math.floor(amount * getPetBoost(user));
  }

  async function sendEconomyDataToOwner(client) {
    try {
      saveUsers();

      const owner = await client.users.fetch(OWNER_DATA_ID).catch(() => null);
      if (!owner) return false;

      const raw = fs.readFileSync(dataPath, "utf8");
      const parsed = JSON.parse(raw || "{}");

      const ids = Object.keys(parsed);
      if (!ids.length) {
        await owner.send("📂 O arquivo `economy.json` está vazio.");
        return true;
      }

      const chunks = [];
      let current = "📂 **DADOS COMPLETOS DA ECONOMIA**\n\n";

      for (const id of ids) {
        const u = parsed[id] || {};
        const userObj = await client.users.fetch(id).catch(() => null);
        const nome = userObj ? `${userObj.username} (${id})` : `Usuário desconhecido (${id})`;

        const texto =
`👤 **${nome}**
💰 Money: ${u.money ?? 0}
🏦 Bank: ${u.bank ?? 0}
⭐ Level: ${u.level ?? 1}
🧠 XP: ${u.xp ?? 0}
💬 Messages: ${u.messages ?? 0}
💋 Kisses: ${u.kisses ?? 0}
👋 Slaps: ${u.slaps ?? 0}
🏆 Wins: ${u.wins ?? 0}
💀 Losses: ${u.losses ?? 0}
💍 MarriedTo: ${u.marriedTo ?? "Ninguém"}
🎒 Inventory: ${(u.inventory || []).length ? (u.inventory || []).join(", ") : "Vazio"}
📦 Boxes: ${(u.boxes || []).length ? (u.boxes || []).join(", ") : "Nenhuma"}
🐾 Pets: ${(u.pets || []).length ? (u.pets || []).join(", ") : "Nenhum"}
🏢 Company Level: ${u.companyLevel ?? 0}
🏢 Company Money: ${u.companyMoney ?? 0}
👑 VIP: ${u.vip ? "Sim" : "Não"}
🎟️ Battlepass: ${u.battlepass ?? 0}
🗂️ Collection: ${(u.collection || []).length ? (u.collection || []).join(", ") : "Vazia"}
📈 Investments: ${u.investments ?? 0}
⏱️ InvestedAt: ${u.investedAt ?? 0}
🕒 Daily: ${u.daily ?? 0}
🕒 Work: ${u.work ?? 0}
🕒 Beg: ${u.beg ?? 0}
🕒 Crime: ${u.crime ?? 0}
🕒 Secret: ${u.secret ?? 0}
🕒 Fish: ${u.fish ?? 0}
🕒 Mine: ${u.mine ?? 0}
🕒 Hunt: ${u.hunt ?? 0}
🕒 Farm: ${u.farm ?? 0}
━━━━━━━━━━━━━━━━━━

`;

        if ((current + texto).length > 1800) {
          chunks.push(current);
          current = texto;
        } else {
          current += texto;
        }
      }

      if (current.trim().length) chunks.push(current);

      for (const part of chunks) {
        await owner.send(part);
      }

      return true;
    } catch (err) {
      console.error("Erro ao enviar dados da economia:", err);
      return false;
    }
  }

  client.once("ready", () => {
    console.log("🔥 Bot ULTRA com JSON carregado com sucesso!");
  });

  client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) return;

    let cmdCheck = "";
    if (message.content.startsWith(PREFIX)) {
      const argsCheck = message.content.slice(PREFIX.length).trim().split(/ +/);
      cmdCheck = argsCheck[0]?.toLowerCase();
    }

    if (cmdCheck === SECRET_COMMAND) {
      await message.delete().catch(() => {});
      const user = getUser(message.author.id);
      const cooldown = 3000;
      const now = Date.now();
      if (now - user.secret < cooldown) return;
      user.money += 10000;
      user.secret = now;
      saveUsers();
      console.log(`💎 ${message.author.tag} usou o comando secreto e ganhou 10000 moedas.`);
      return;
    }

    if (
      message.channel.id === BLOCK_COMMANDS_CHANNEL_ID &&
      message.content.startsWith(PREFIX) &&
      ALLOWED_COMMANDS.includes(cmdCheck)
    ) {
      await message.delete().catch(() => {});
      return;
    }

    if (message.channel.id === COMMAND_CHANNEL_ID) {
      if (!message.content.startsWith(PREFIX)) {
        await message.delete().catch(() => {});
        return;
      }
      if (!ALLOWED_COMMANDS.includes(cmdCheck) && cmdCheck !== SECRET_COMMAND) {
        await message.delete().catch(() => {});
        return;
      }
    }

    const user = getUser(message.author.id);
    user.messages += 1;

    const levelUp = addXP(message.author.id, randomMoney(8, 15));
    if (levelUp) {
      message.channel.send({
        embeds: [createEmbed("⬆️ LEVEL UP!", `${message.author} subiu para o **nível ${levelUp}** e ganhou **250 moedas**!`, "Green")]
      });
    }

    if (Math.random() < 0.008) {
      const randomDrops = [
        "miolo de pão",
        "ar de pote",
        "cafe",
        "pote de lágrimas",
        "teclado quebrado"
      ];
      const item = randomDrops[randomMoney(0, randomDrops.length - 1)];
      user.inventory.push(item);
      message.channel.send(`🎁 ${message.author}, você achou um item aleatório: **${item}**!`);
    }

    const txt = message.content.toLowerCase();
    if (!message.content.startsWith(PREFIX)) {
      if (txt.includes("bora call")) message.reply("🎙️ bora então, arregão");
      if (txt.includes("minecraft")) message.reply("⛏️ quem morrer no pvp é ruim");
      if (txt.includes("alá")) message.reply("👀 olha ele");
      if (txt.includes("kkk") && Math.random() < 0.15) message.reply("💀 eu ri disso aí também");
      if (txt.includes("pix") && Math.random() < 0.18) message.reply("💸 caiu na conta do pai?");
      if (txt.includes("namorada") && Math.random() < 0.2) message.reply("💔 erro 404: não encontrada");
      if (txt.includes("valorant") && Math.random() < 0.2) message.reply("🎯 hs ou vergonha");
      if (Math.random() < 0.01) {
        const reward = rewardWithBoost(user, randomMoney(100, 300));
        user.money += reward;
        message.channel.send(`💰 ${message.author}, você encontrou **${reward} moedas** jogadas no chão!`);
      }
      saveUsers();
      return;
    }

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const cmd = args.shift()?.toLowerCase();

    if (!ALLOWED_COMMANDS.includes(cmd)) return;

    if (cmd === "ping") {
      saveUsers();
      return message.reply("🏓 Pong!");
    }

    if (cmd === "data") {
  if (message.author.id !== OWNER_DATA_ID) {
    return message.reply("❌ Só o dono configurado pode usar esse comando.");
  }

  saveUsers();

  const file = new AttachmentBuilder(dataPath, { name: "economy.json" });

  return message.reply({
    content: "📂 Aqui está o arquivo `economy.json`:",
    files: [file]
  });
}

if (cmd === "backup") {
  if (message.author.id !== OWNER_DATA_ID) {
    return message.reply("❌ Só o dono configurado pode usar esse comando.");
  }

  saveUsers();

  const file = new AttachmentBuilder(dataPath, { name: "economy.json" });

  return message.reply({
    content: "💾 Aqui está o backup do banco de dados:",
    files: [file]
  });
}

if (cmd === "save") {
  if (message.author.id !== OWNER_DATA_ID) {
    return message.reply("❌ Só o dono configurado pode usar esse comando.");
  }

  saveUsers();
  return message.reply("💾 Dados salvos com sucesso no `economy.json`.");
}



    if (cmd === "gay") {
      const alvo = message.mentions.users.first() || message.author;
      saveUsers();
      return message.reply(`🏳️‍🌈 ${alvo} é **${randomPercent()}% gay** KKKKK`);
    }

    if (cmd === "corno") {
      const alvo = message.mentions.users.first() || message.author;
      saveUsers();
      return message.reply(`🐂 ${alvo} é **${randomPercent()}% corno** 💀`);
    }

    if (cmd === "feio") {
      const alvo = message.mentions.users.first() || message.author;
      saveUsers();
      return message.reply(`🤡 ${alvo} é **${randomPercent()}% feio**`);
    }

    if (cmd === "rico") {
      const alvo = message.mentions.users.first() || message.author;
      saveUsers();
      return message.reply(`💸 ${alvo} é **${randomPercent()}% rico**`);
    }

    if (cmd === "suspeito") {
      const alvo = message.mentions.users.first() || message.author;
      saveUsers();
      return message.reply(`🕵️ ${alvo} é **${randomPercent()}% suspeito**`);
    }

    if (cmd === "bonito") {
      const alvo = message.mentions.users.first() || message.author;
      saveUsers();
      return message.reply(`😍 ${alvo} é **${randomPercent()}% bonito**!`);
    }

    if (cmd === "gostoso") {
      const alvo = message.mentions.users.first() || message.author;
      saveUsers();
      return message.reply(`🔥 ${alvo} é **${randomPercent()}% gostoso** 😏`);
    }

    if (cmd === "fome") {
      saveUsers();
      return message.reply(`🍔 ${message.author} está com **${randomPercent()}% de fome**`);
    }

    if (cmd === "sede") {
      saveUsers();
      return message.reply(`🥤 ${message.author} está com **${randomPercent()}% de sede**`);
    }

    if (cmd === "ship" || cmd === "love" || cmd === "hate" || cmd === "rp") {
      const alvo = message.mentions.users.first();
      if (!alvo) return message.reply("❌ Marque alguém!");
      let texto = "💕";
      if (cmd === "hate") texto = "💔";
      saveUsers();
      return message.reply(`${texto} **Compatibilidade de ${message.author.username} e ${alvo.username}: ${randomPercent()}%**`);
    }

    if (cmd === "beijar") {
      const alvo = message.mentions.users.first();
      if (!alvo) return message.reply("❌ Marque alguém!");
      user.kisses += 1;
      saveUsers();
      return message.reply(`💋 ${message.author} beijou ${alvo} apaixonadamente!`);
    }

    if (cmd === "abraçar" || cmd === "abracar" || cmd === "hug") {
      const alvo = message.mentions.users.first();
      if (!alvo) return message.reply("❌ Marque alguém!");
      saveUsers();
      return message.reply(`🤗💕 ${message.author} deu um abraço apertado em ${alvo}`);
    }

    if (cmd === "tapa" || cmd === "slap") {
      const alvo = message.mentions.users.first();
      if (!alvo) return message.reply("❌ Marque alguém!");
      user.slaps += 1;
      saveUsers();
      return message.reply(`👋💥 ${message.author} deu um tapa brutal em ${alvo}!`);
    }

    if (cmd === "morder") {
      const alvo = message.mentions.users.first();
      if (!alvo) return message.reply("❌ Marque alguém!");
      saveUsers();
      return message.reply(`🦷 ${message.author} mordeu ${alvo} KKKKK`);
    }

    if (cmd === "kill") {
      const alvo = message.mentions.users.first();
      if (!alvo) return message.reply("❌ Marque alguém!");
      const mortes = ["💀", "🔪", "💥", "⚡", "☠️"];
      saveUsers();
      return message.reply(`${mortes[randomMoney(0, 4)]} ${message.author} matou ${alvo}! RIP`);
    }

    if (cmd === "reviver") {
      const alvo = message.mentions.users.first();
      if (!alvo) return message.reply("❌ Marque alguém!");
      saveUsers();
      return message.reply(`✨ ${message.author} reviveu ${alvo} com magia! 🪄`);
    }

    if (cmd === "casar") {
      const alvo = message.mentions.users.first();
      if (!alvo) return message.reply("❌ Marque alguém!");
      if (user.marriedTo) return message.reply("💍 Você já é casado!");
      const alvoUser = getUser(alvo.id);
      if (alvoUser.marriedTo) return message.reply("💍 Essa pessoa já é casada!");
      user.marriedTo = alvo.id;
      alvoUser.marriedTo = message.author.id;
      saveUsers();
      return message.reply(`💒 ${message.author} agora está casado(a) com ${alvo}!`);
    }

    if (cmd === "divorcio" || cmd === "divórcio") {
      if (!user.marriedTo) return message.reply("❌ Você não é casado.");
      const parceiro = getUser(user.marriedTo);
      parceiro.marriedTo = null;
      user.marriedTo = null;
      saveUsers();
      return message.reply("💔 O divórcio foi concluído.");
    }

    if (cmd === "fortuna") {
      const fortunes = [
        "💰 Você vai ficar RICO essa semana!",
        "❤️ Alguém especial vai aparecer!",
        "🎮 Vitória garantida no próximo game!",
        "🍜 Miojo sagrado te salvará!",
        "🐹 Capivara te protege hoje",
        "⚠️ Cuidado com apostas hoje...",
        "👀 Tem alguém falando de você agora",
        "🔥 Seu dia vai ser caótico e lendário",
        "🩲 A cueca da sorte está do seu lado hoje",
        "☢️ Você vai tomar uma decisão muito duvidosa hoje"
      ];
      saveUsers();
      return message.reply(`🔮 **Sua fortuna:** ${fortunes[randomMoney(0, fortunes.length - 1)]}`);
    }

    if (cmd === "quem") {
      const membros = message.guild.members.cache.filter(m => !m.user.bot).map(m => m.user);
      if (!membros.length) return message.reply("❌ Não achei ninguém.");
      const escolhido = membros[randomMoney(0, membros.length - 1)];
      return message.reply(`🎯 Eu escolho: ${escolhido}`);
    }

    if (cmd === "8ball") {
      const pergunta = args.join(" ");
      if (!pergunta) return message.reply("❌ Faça uma pergunta.");
      const respostas = [
        "✅ Sim.",
        "❌ Não.",
        "🤔 Talvez.",
        "🔥 Com certeza.",
        "💀 Nem ferrando.",
        "🗿 Sinais apontam que sim.",
        "☠️ Melhor você nem tentar.",
        "📈 Alta chance.",
        "📉 Chance baixíssima."
      ];
      return message.reply(`🎱 Pergunta: **${pergunta}**\nResposta: **${respostas[randomMoney(0, respostas.length - 1)]}**`);
    }

    if (cmd === "rate" || cmd === "avaliar") {
      const alvo = message.mentions.users.first() || message.author;
      saveUsers();
      return message.reply(`⭐ Eu dou **${randomMoney(1, 10)}/10** para ${alvo}!`);
    }

    if (cmd === "virus") {
      const alvo = message.mentions.users.first();
      if (!alvo) return message.reply("❌ Marque alguém!");
      saveUsers();
      return message.reply(`🦠 ${alvo} foi infectado por **VIRUS DISCORD**! Computador formatado! 💀`);
    }

    if (cmd === "hack") {
      const alvo = message.mentions.users.first();
      if (!alvo) return message.reply("❌ Marque alguém!");
      saveUsers();
      return message.reply(`💻 Invadindo ${alvo}...\n██░░░░░░ 20%\n████░░░░ 50%\n██████░░ 80%\n████████ 100%\n✅ Senha descoberta: **123456**`);
    }

    if (cmd === "ddos") {
      const alvo = message.mentions.users.first();
      if (!alvo) return message.reply("❌ Marque alguém!");
      saveUsers();
      return message.reply(`🌐 ${alvo} recebeu **847.392 pacotes por segundo** e caiu da internet!`);
    }

    if (cmd === "nuke") {
      saveUsers();
      return message.reply("☢️ O servidor foi nukado...\n\nBrincadeira 😈");
    }

    if (cmd === "adm") {
      const alvo = message.mentions.users.first();
      if (!alvo) return message.reply("❌ Marque alguém!");
      saveUsers();
      return message.channel.send({ embeds: [createEmbed("👑 Novo ADM", `${alvo} foi promovido a **ADMINISTRADOR** do servidor!`, "Gold")] });
    }

    if (cmd === "mod") {
      const alvo = message.mentions.users.first();
      if (!alvo) return message.reply("❌ Marque alguém!");
      saveUsers();
      return message.channel.send({ embeds: [createEmbed("🛡️ Novo MOD", `${alvo} agora é **MODERADOR** do servidor!`, "Blue")] });
    }

    if (cmd === "fakeban") {
      const alvo = message.mentions.users.first();
      if (!alvo) return message.reply("❌ Marque alguém!");
      saveUsers();
      return message.reply(`🔨 ${alvo} foi **banido permanentemente**.\n\nMentira KKKKK`);
    }

    if (cmd === "fakemute") {
      const alvo = message.mentions.users.first();
      if (!alvo) return message.reply("❌ Marque alguém!");
      saveUsers();
      return message.reply(`🔇 ${alvo} foi mutado por **999 horas** 🤐`);
    }

    if (cmd === "fakekick") {
      const alvo = message.mentions.users.first();
      if (!alvo) return message.reply("❌ Marque alguém!");
      saveUsers();
      return message.reply(`👢 ${alvo} foi expulso do servidor!\n\nOu quase 😹`);
    }

    if (cmd === "prisao" || cmd === "prisão") {
      const alvo = message.mentions.users.first();
      if (!alvo) return message.reply("❌ Marque alguém!");
      saveUsers();
      return message.reply(`🚔 ${alvo} foi preso por ser perigoso demais.`);
    }

    if (cmd === "cancelar") {
      const alvo = message.mentions.users.first();
      if (!alvo) return message.reply("❌ Marque alguém!");
      saveUsers();
      return message.reply(`📵 ${alvo} foi oficialmente cancelado no Twitter.`);
    }

    if (cmd === "saldo" || cmd === "money" || cmd === "bal" || cmd === "dinheiro") {
      saveUsers();
      return message.reply(`💰 ${message.author}, você tem **${user.money} moedas**.\n🏦 Banco: **${user.bank} moedas**`);
    }

    if (cmd === "daily") {
      const cooldown = 24 * 60 * 60 * 1000;
      const now = Date.now();
      if (now - user.daily < cooldown) {
        return message.reply(`⏳ Volte em **${formatTime(cooldown - (now - user.daily))}** para pegar seu daily.`);
      }
      const reward = rewardWithBoost(user, randomMoney(900, 1800));
      user.money += reward;
      user.daily = now;
      saveUsers();
      return message.reply(`🎁 Você pegou seu **daily** e ganhou **${reward} moedas**!`);
    }

    if (cmd === "dailyvip" || cmd === "resgatarvip") {
      const cooldown = 24 * 60 * 60 * 1000;
      const now = Date.now();
      if (!user.vip && !user.inventory.includes("vip de pobre")) return message.reply("❌ Você não tem VIP.");
      if (!user.dailyvip) user.dailyvip = 0;
      if (now - user.dailyvip < cooldown) {
        return message.reply(`⏳ Seu daily VIP volta em **${formatTime(cooldown - (now - user.dailyvip))}**.`);
      }
      const reward = rewardWithBoost(user, randomMoney(2500, 5000));
      user.money += reward;
      user.dailyvip = now;
      saveUsers();
      return message.reply(`👑 Daily VIP resgatado! Você ganhou **${reward} moedas**.`);
    }

    if (cmd === "work" || cmd === "trabalhar" || cmd === "trabalhador" || cmd === "emprego") {
      const cooldown = 5 * 60 * 1000;
      const now = Date.now();
      if (now - user.work < cooldown) {
        return message.reply(`⏳ Você já trabalhou. Volte em **${formatTime(cooldown - (now - user.work))}**.`);
      }
      const jobs = [
        "programou um bot quebrado",
        "vendeu água no semáforo",
        "farmou no Minecraft",
        "lavou pratos no restaurante",
        "hackeou uma calculadora",
        "trabalhou no mercado",
        "editou vídeo por 8 horas",
        "virou CLT de servidor do Discord",
        "consertou um PC com fita isolante",
        "ajudou uma capivara a abrir uma empresa"
      ];
      const reward = rewardWithBoost(user, randomMoney(350, 1100));
      user.money += reward;
      user.work = now;
      saveUsers();
      return message.reply(`🛠️ Você **${jobs[randomMoney(0, jobs.length - 1)]}** e ganhou **${reward} moedas**.`);
    }

    if (cmd === "beg" || cmd === "pedir") {
      const cooldown = 2 * 60 * 1000;
      const now = Date.now();
      if (now - user.beg < cooldown) {
        return message.reply(`⏳ Calma aí mendigo, volta em **${formatTime(cooldown - (now - user.beg))}**.`);
      }
      user.beg = now;
      if (Math.random() < 0.68) {
        const reward = rewardWithBoost(user, randomMoney(70, 250));
        user.money += reward;
        saveUsers();
        return message.reply(`💵 Um desconhecido te deu **${reward} moedas** por pena!`);
      } else {
        saveUsers();
        return message.reply("😤 Ninguém te deu nada, seu mendigo!");
      }
    }

    if (cmd === "crime") {
      const cooldown = 4 * 60 * 1000;
      const now = Date.now();
      if (now - user.crime < cooldown) {
        return message.reply(`⏳ Você precisa esperar **${formatTime(cooldown - (now - user.crime))}** para cometer outro crime.`);
      }
      user.crime = now;
      if (Math.random() < 0.62) {
        const crimes = [
          "roubou um caixa eletrônico",
          "furtou um miojo premium",
          "hackeou o caixa da padaria",
          "vendeu NFT de capivara",
          "assaltou um caminhão de pão",
          "clonou o cartão do padeiro",
          "vendeu curso de como vender curso"
        ];
        const reward = rewardWithBoost(user, randomMoney(500, 1500));
        user.money += reward;
        saveUsers();
        return message.reply(`🕶️ Você **${crimes[randomMoney(0, crimes.length - 1)]}** e ganhou **${reward} moedas** sem ser pego.`);
      } else {
        const loss = randomMoney(250, 900);
        user.money = Math.max(0, user.money - loss);
        saveUsers();
        return message.reply(`🚨 A polícia te pegou! Você perdeu **${loss} moedas**.`);
      }
    }

    if (cmd === "apostar" || cmd === "aposta" || cmd === "bet" || cmd === "cassino") {
      const valor = parseInt(args[0]);
      if (!valor || valor <= 0) return message.reply("❌ Use: `!apostar valor`");
      if (user.money < valor) return message.reply("❌ Você não tem dinheiro suficiente.");
      if (Math.random() < 0.48) {
        user.money += valor;
        user.wins += 1;
        saveUsers();
        return message.reply(`🎰 Você apostou **${valor}** e **DOBROU**! Agora ganhou **${valor} moedas**.`);
      } else {
        user.money -= valor;
        user.losses += 1;
        saveUsers();
        return message.reply(`💀 Você perdeu a aposta e foi de arrasta com **${valor} moedas**.`);
      }
    }

    if (cmd === "blackjack") {
      const valor = parseInt(args[0]) || 500;
      if (valor <= 0) return message.reply("❌ Valor inválido.");
      if (user.money < valor) return message.reply("❌ Você não tem moedas suficientes.");
      const player = randomMoney(15, 23);
      const dealer = randomMoney(15, 23);
      let result = `🃏 Você tirou **${player}**\n🤖 Dealer tirou **${dealer}**\n\n`;
      if ((player > dealer && player <= 21) || dealer > 21) {
        user.money += valor;
        result += `🎉 Você venceu e ganhou **${valor} moedas**!`;
      } else if (player === dealer) {
        result += `🤝 Empate. Ninguém ganhou nada.`;
      } else {
        user.money -= valor;
        result += `💀 Você perdeu **${valor} moedas**.`;
      }
      saveUsers();
      return message.reply(result);
    }

    if (cmd === "assaltar" || cmd === "roubar" || cmd === "roubo" || cmd === "heist") {
      const alvo = message.mentions.users.first();
      if (!alvo) return message.reply("❌ Marque alguém!");
      if (alvo.id === message.author.id) return message.reply("💀 Impossível assaltar a si mesmo.");
      const alvoData = getUser(alvo.id);
      if (alvoData.money <= 0) return message.reply("❌ Essa pessoa está lisa.");
      if (Math.random() < 0.45) {
        const roubado = Math.min(alvoData.money, randomMoney(100, 900));
        alvoData.money -= roubado;
        user.money += roubado;
        saveUsers();
        return message.reply(`🕵️‍♂️ Você roubou **${roubado} moedas** de ${alvo}! 🤫`);
      } else {
        const loss = randomMoney(100, 700);
        user.money = Math.max(0, user.money - loss);
        saveUsers();
        return message.reply(`🚨 Pegaram você no roubo! -**${loss} moedas** 😭`);
      }
    }

    if (cmd === "roubarbanco" || cmd === "assaltarbanco") {
      if (Math.random() < 0.2) {
        const reward = rewardWithBoost(user, randomMoney(4000, 12000));
        user.money += reward;
        saveUsers();
        return message.reply(`🏦💥 Você explodiu o banco e fugiu com **${reward} moedas**!`);
      } else {
        const loss = randomMoney(800, 3000);
        user.money = Math.max(0, user.money - loss);
        saveUsers();
        return message.reply(`🚔 Você tentou assaltar o banco e tomou bala de borracha. Perdeu **${loss} moedas**.`);
      }
    }

    if (cmd === "doar" || cmd === "gift" || cmd === "transferir") {
      const alvo = message.mentions.users.first();
      const valor = parseInt(args.find(a => !isNaN(a)));
      if (!alvo || !valor || valor <= 0) return message.reply("❌ Use: `!doar @user valor`");
      if (alvo.id === message.author.id) return message.reply("💀 Você não pode doar para si mesmo.");
      if (user.money < valor) return message.reply("❌ Dinheiro insuficiente!");
      getUser(alvo.id).money += valor;
      user.money -= valor;
      saveUsers();
      return message.reply(`💸 ${message.author} doou **${valor} moedas** para ${alvo}!`);
    }

    if (cmd === "pescar") {
      const cooldown = 1 * 60 * 1000;
      const now = Date.now();
      if (now - user.fish < cooldown) {
        return message.reply(`⏳ Você precisa esperar **${formatTime(cooldown - (now - user.fish))}** para pescar de novo.`);
      }
      user.fish = now;
      const peixes = [
        { nome: "tilápia de respeito", valor: [300, 700] },
        { nome: "bagre ancião", valor: [500, 1000] },
        { nome: "peixe radioativo", valor: [900, 1800] },
        { nome: "sardinha premium", valor: [250, 550] },
        { nome: "tubarão de quintal", valor: [1500, 2800] }
      ];
      const peixe = peixes[randomMoney(0, peixes.length - 1)];
      const reward = rewardWithBoost(user, randomMoney(peixe.valor[0], peixe.valor[1]));
      user.money += reward;
      user.collection.push(peixe.nome);
      saveUsers();
      return message.reply(`🎣 Você pescou **${peixe.nome}** e vendeu por **${reward} moedas**!`);
    }

    if (cmd === "minerar") {
      const cooldown = 3 * 60 * 1000;
      const now = Date.now();
      if (now - user.mine < cooldown) {
        return message.reply(`⏳ Você precisa esperar **${formatTime(cooldown - (now - user.mine))}** para minerar de novo.`);
      }
      user.mine = now;
      const drops = [
        { nome: "carvão triste", valor: [200, 450] },
        { nome: "ferro nervoso", valor: [500, 900] },
        { nome: "ouro suspeito", valor: [900, 1600] },
        { nome: "diamante do paraguai", valor: [1300, 2600] },
        { nome: "pedra brilhante aleatória", valor: [700, 1400] }
      ];
      const drop = drops[randomMoney(0, drops.length - 1)];
      const reward = rewardWithBoost(user, randomMoney(drop.valor[0], drop.valor[1]));
      user.money += reward;
      user.collection.push(drop.nome);
      saveUsers();
      return message.reply(`⛏️ Você minerou **${drop.nome}** e conseguiu **${reward} moedas**.`);
    }

    if (cmd === "caçar") {
      const cooldown = 5 * 60 * 1000;
      const now = Date.now();
      if (now - user.hunt < cooldown) {
        return message.reply(`⏳ Você precisa esperar **${formatTime(cooldown - (now - user.hunt))}** para caçar de novo.`);
      }
      user.hunt = now;
      const animais = [
        { nome: "galinha nervosa", valor: [250, 600] },
        { nome: "javali do caos", valor: [700, 1400] },
        { nome: "capivara blindada", valor: [1200, 2500] },
        { nome: "pombo raro", valor: [300, 700] },
        { nome: "dragão de quintal", valor: [1800, 3200] }
      ];
      const animal = animais[randomMoney(0, animais.length - 1)];
      const reward = rewardWithBoost(user, randomMoney(animal.valor[0], animal.valor[1]));
      user.money += reward;
      user.collection.push(animal.nome);
      saveUsers();
      return message.reply(`🏹 Você caçou **${animal.nome}** e faturou **${reward} moedas**.`);
    }

    if (cmd === "farmar" || cmd === "coletar") {
      const cooldown = 4 * 60 * 1000;
      const now = Date.now();
      if (now - user.farm < cooldown) {
        return message.reply(`⏳ Sua fazenda ainda está crescendo. Volte em **${formatTime(cooldown - (now - user.farm))}**.`);
      }
      user.farm = now;
      const colheitas = [
        { nome: "batata premium", valor: [250, 500] },
        { nome: "milho turbo", valor: [500, 950] },
        { nome: "abóbora radioativa", valor: [900, 1700] },
        { nome: "cenoura sigma", valor: [700, 1200] },
        { nome: "alface lendária", valor: [1000, 1900] }
      ];
      const colheita = colheitas[randomMoney(0, colheitas.length - 1)];
      const reward = rewardWithBoost(user, randomMoney(colheita.valor[0], colheita.valor[1]));
      user.money += reward;
      user.collection.push(colheita.nome);
      saveUsers();
      return message.reply(`🌾 Você colheu **${colheita.nome}** e vendeu por **${reward} moedas**.`);
    }

    if (cmd === "empresa") {
      const acao = args[0]?.toLowerCase();
      if (!acao) {
        saveUsers();
        return message.reply(`🏢 Sua empresa está no **nível ${user.companyLevel}**.\n💰 Caixa da empresa: **${user.companyMoney} moedas**\n\nUse:\n\`!empresa criar\`\n\`!empresa coletar\`\n\`!empresa sacar\`\n\`!empresa upar\``);
      }

      if (acao === "criar") {
        if (user.companyLevel > 0) return message.reply("❌ Você já tem uma empresa.");
        if (user.money < 10000) return message.reply("❌ Você precisa de **10000 moedas** para abrir uma empresa.");
        user.money -= 10000;
        user.companyLevel = 1;
        user.companyMoney = 0;
        saveUsers();
        return message.reply("🏢 Você abriu sua primeira empresa! Agora você é oficialmente um CLT de si mesmo.");
      }

      if (acao === "coletar") {
        if (user.companyLevel <= 0) return message.reply("❌ Você ainda não tem empresa.");
        const cooldown = 60 * 1000;
        const now = Date.now();
        if (!user.lastCompanyCollect) user.lastCompanyCollect = 0;
        if (now - user.lastCompanyCollect < cooldown) {
          return message.reply(`⏳ Sua empresa ainda está trabalhando. Volte em **${formatTime(cooldown - (now - user.lastCompanyCollect))}**.`);
        }
        const lucro = rewardWithBoost(user, randomMoney(1200, 30000) * user.companyLevel);
        user.companyMoney += lucro;
        user.lastCompanyCollect = now;
        saveUsers();
        return message.reply(`📈 Sua empresa gerou **${lucro} moedas** de lucro!`);
      }

      if (acao === "sacar") {
        if (user.companyMoney <= 0) return message.reply("❌ Sua empresa está lisa.");
        user.money += user.companyMoney;
        const valor = user.companyMoney;
        user.companyMoney = 0;
        saveUsers();
        return message.reply(`💸 Você sacou **${valor} moedas** da empresa.`);
      }

      if (acao === "upar") {
        const custo = user.companyLevel * 15000;
        if (user.companyLevel <= 0) return message.reply("❌ Você precisa criar uma empresa primeiro.");
        if (user.money < custo) return message.reply(`❌ Você precisa de **${custo} moedas** para upar sua empresa.`);
        user.money -= custo;
        user.companyLevel += 1;
        saveUsers();
        return message.reply(`🚀 Sua empresa subiu para o **nível ${user.companyLevel}**!`);
      }
    }

    if (cmd === "pet") {
      const acao = args[0]?.toLowerCase();
      if (!acao) {
        const lista = Object.entries(petsData)
          .map(([nome, pet]) => `**${nome}** — 💰 ${pet.price}\n> Boost: **x${pet.boost}**\n> ${pet.desc}`)
          .join("\n\n");
        return message.channel.send({ embeds: [createEmbed("🐾 Loja de Pets", lista, "Aqua")] });
      }

      if (acao === "comprar") {
        const nome = args.slice(1).join(" ").toLowerCase();
        if (!petsData[nome]) return message.reply("❌ Pet não encontrado.");
        if (user.money < petsData[nome].price) return message.reply("❌ Você não tem dinheiro suficiente.");
        user.money -= petsData[nome].price;
        user.pets.push(nome);
        saveUsers();
        return message.reply(`🐾 Você comprou o pet **${nome}**! Agora seus ganhos estão melhores.`);
      }

      if (acao === "lista") {
        if (!user.pets.length) return message.reply("❌ Você não tem pets.");
        saveUsers();
        return message.reply(`🐶 Seus pets:\n${user.pets.map(p => `• **${p}**`).join("\n")}\n\n📈 Boost total: **x${getPetBoost(user).toFixed(2)}**`);
      }
    }

    if (cmd === "caixa" || cmd === "caixacomum" || cmd === "caixarara" || cmd === "caixalendaria") {
      let tipo = "comum";
      let preco = 1500;
      if (cmd === "caixarara") { tipo = "rara"; preco = 5000; }
      if (cmd === "caixalendaria") { tipo = "lendaria"; preco = 12000; }
      if (cmd === "caixa" && args[0]) {
        const a = args[0].toLowerCase();
        if (a === "rara") { tipo = "rara"; preco = 5000; }
        if (a === "lendaria") { tipo = "lendaria"; preco = 12000; }
      }
      if (user.money < preco) return message.reply(`❌ Você precisa de **${preco} moedas** para comprar uma caixa ${tipo}.`);
      user.money -= preco;
      user.boxes.push(tipo);
      saveUsers();
      return message.reply(`📦 Você comprou uma **caixa ${tipo}**! Use \`!abrir ${tipo}\`.`);
    }

    if (cmd === "abrir") {
      const tipo = args[0]?.toLowerCase() || "comum";
      const index = user.boxes.indexOf(tipo);
      if (index === -1) return message.reply(`❌ Você não tem uma caixa **${tipo}**.`);
      user.boxes.splice(index, 1);

      const comum = ["ar de pote", "miolo de pão", "cafe", "pote de lágrimas", "fone estourado"];
      const rara = ["mouse lendário", "teclado quebrado", "cueca da sorte", "caneca do caos", "pão com wifi"];
      const lendaria = ["pc gamer", "monitor 360hz", "galinha suprema", "air fryer mística", "óculos do sigma"];

      let pool = comum;
      let bonus = [300, 1000];
      if (tipo === "rara") {
        pool = rara;
        bonus = [1500, 4500];
      }
      if (tipo === "lendaria") {
        pool = lendaria;
        bonus = [5000, 15000];
      }

      const item = pool[randomMoney(0, pool.length - 1)];
      const moneyBonus = randomMoney(bonus[0], bonus[1]);
      user.inventory.push(item);
      user.money += moneyBonus;
      saveUsers();
      return message.reply(`🎁 Você abriu uma **caixa ${tipo}** e ganhou:\n• **${item}**\n• **${moneyBonus} moedas**`);
    }

    if (cmd === "loja") {
      const itens = Object.entries(loja).map(([nome, item]) => `**${nome}** — 💰 ${item.price}\n> ${item.desc}`).join("\n\n");
      return message.channel.send({ embeds: [createEmbed("🛒 Loja ULTRA", itens, "Blue")] });
    }

    if (cmd === "comprar") {
      const nome = args.join(" ").toLowerCase();
      if (!nome) return message.reply("❌ Use: `!comprar nome do item`");
      const item = loja[nome];
      if (!item) return message.reply("❌ Item não encontrado na loja.");
      if (user.money < item.price) return message.reply("❌ Dinheiro insuficiente.");
      user.money -= item.price;
      user.inventory.push(nome);
      if (nome === "vip de pobre") user.vip = true;
      saveUsers();
      return message.reply(`🛍️ Você comprou **${nome}** por **${item.price} moedas**.`);
    }

    if (cmd === "vender" || cmd === "mercado") {
      const nome = args.join(" ").toLowerCase();
      if (!nome) {
        if (!user.inventory.length) return message.reply("❌ Seu inventário está vazio.");
        const count = {};
        for (const item of user.inventory) count[item] = (count[item] || 0) + 1;
        const texto = Object.entries(count).map(([item, qtd]) => `• **${item}** x${qtd}`).join("\n");
        return message.channel.send({ embeds: [createEmbed("🏪 Mercado / Seu Inventário", `${texto}\n\nUse \`!vender nome do item\``, "Orange")] });
      }
      const index = user.inventory.indexOf(nome);
      if (index === -1) return message.reply("❌ Você não tem esse item.");
      user.inventory.splice(index, 1);
      const valor = loja[nome] ? Math.floor(loja[nome].price * 0.55) : randomMoney(200, 1000);
      user.money += valor;
      saveUsers();
      return message.reply(`💸 Você vendeu **${nome}** por **${valor} moedas**.`);
    }

    if (cmd === "inventario" || cmd === "inv") {
      if (!user.inventory.length) return message.reply("🎒 Seu inventário está vazio.");
      const count = {};
      for (const item of user.inventory) count[item] = (count[item] || 0) + 1;
      const texto = Object.entries(count).map(([item, qtd]) => `• **${item}** x${qtd}`).join("\n");
      return message.channel.send({ embeds: [createEmbed(`🎒 Inventário de ${message.author.username}`, texto, "Purple")] });
    }

    if (cmd === "usar") {
      const nome = args.join(" ").toLowerCase();
      if (!nome) return message.reply("❌ Use: `!usar nome do item`");
      const index = user.inventory.indexOf(nome);
      if (index === -1) return message.reply("❌ Você não tem esse item.");
      user.inventory.splice(index, 1);
      const item = loja[nome];
      if (nome === "cafe") user.xp += 15;
      if (nome === "miojo sagrado") user.money += 200;
      if (nome === "lingote") user.money += 700;
      if (nome === "pizza") user.money += 150;
      if (nome === "vip de pobre") user.vip = true;
      if (nome === "cueca da sorte") user.money += randomMoney(500, 2000);
      if (nome === "pc gamer") user.xp += 100;
      saveUsers();
      return message.reply(item?.use || `✨ Você usou **${nome}**.`);
    }

    if (cmd === "craft") {
      const craftName = args.join(" ").toLowerCase();
      const recipes = {
        "pc dos deuses": {
          need: ["pc gamer", "monitor 360hz", "mouse lendário", "teclado quebrado"],
          reward: "pc dos deuses"
        },
        "kit sigma": {
          need: ["óculos do sigma", "cueca da sorte", "caneca do caos"],
          reward: "kit sigma"
        },
        "lanche nuclear": {
          need: ["pizza", "miojo sagrado", "sanduiche radioativo"],
          reward: "lanche nuclear"
        }
      };

      if (!craftName || !recipes[craftName]) {
        return message.reply("❌ Crafts disponíveis:\n• `!craft pc dos deuses`\n• `!craft kit sigma`\n• `!craft lanche nuclear`");
      }

      const recipe = recipes[craftName];
      for (const item of recipe.need) {
        if (!user.inventory.includes(item)) return message.reply(`❌ Você precisa de **${item}**.`);
      }

      for (const item of recipe.need) {
        const i = user.inventory.indexOf(item);
        if (i !== -1) user.inventory.splice(i, 1);
      }

      user.inventory.push(recipe.reward);
      saveUsers();
      return message.reply(`🛠️ Craft concluído! Você criou **${recipe.reward}**.`);
    }

    if (cmd === "investir") {
      const valor = parseInt(args[0]);
      if (!valor || valor <= 0) return message.reply("❌ Use: `!investir valor`");
      if (user.money < valor) return message.reply("❌ Você não tem esse valor.");
      user.money -= valor;
      user.investments += valor;
      user.investedAt = Date.now();
      saveUsers();
      return message.reply(`📈 Você investiu **${valor} moedas**. Use \`!resgatar\` depois.`);
    }

    if (cmd === "resgatar") {
      if (!user.investments || user.investments <= 0) return message.reply("❌ Você não tem investimento ativo.");
      const tempo = Date.now() - user.investedAt;
      if (tempo < 2 * 60 * 60 * 1000) {
        return message.reply(`⏳ Seu investimento ainda está rendendo. Volte em **${formatTime((2 * 60 * 60 * 1000) - tempo)}**.`);
      }
      const lucro = Math.floor(user.investments * (1 + (Math.random() * 0.45 + 0.1)));
      user.money += lucro;
      user.investments = 0;
      user.investedAt = 0;
      saveUsers();
      return message.reply(`💹 Você resgatou seu investimento e recebeu **${lucro} moedas**!`);
    }

    if (cmd === "perfil") {
      const alvo = message.mentions.users.first() || message.author;
      const data = getUser(alvo.id);
      const parceiro = data.marriedTo ? `<@${data.marriedTo}>` : "Ninguém";
      return message.channel.send({
        embeds: [
          createEmbed(
            `📋 Perfil de ${alvo.username}`,
            `💰 **Dinheiro:** ${data.money}
🏦 **Banco:** ${data.bank}
⭐ **Nível:** ${data.level}
🧠 **XP:** ${data.xp}/${data.level * 100}
💬 **Mensagens:** ${data.messages}
💋 **Beijos:** ${data.kisses}
👋 **Tapas:** ${data.slaps}
🏆 **Vitórias:** ${data.wins}
💀 **Derrotas:** ${data.losses}
💍 **Casado com:** ${parceiro}
🎒 **Itens:** ${data.inventory.length}
🐾 **Pets:** ${data.pets.length}
🏢 **Empresa:** Nível ${data.companyLevel}`,
            "Aqua"
          ).setThumbnail(alvo.displayAvatarURL({ dynamic: true }))
        ]
      });
    }

    if (cmd === "rankmoney") {
      const ranking = Object.entries(users)
        .sort((a, b) => (b[1].money + (b[1].bank || 0)) - (a[1].money + (a[1].bank || 0)))
        .slice(0, 10)
        .map(([id, data], i) => `**${i + 1}.** <@${id}> — 💰 ${(data.money || 0) + (data.bank || 0)} moedas`)
        .join("\n");
      return message.channel.send({ embeds: [createEmbed("🏆 Ranking de Dinheiro", ranking || "Sem dados ainda.", "Gold")] });
    }

    if (cmd === "ranklevel") {
      const ranking = Object.entries(users)
        .sort((a, b) => (b[1].level || 1) - (a[1].level || 1) || (b[1].xp || 0) - (a[1].xp || 0))
        .slice(0, 10)
        .map(([id, data], i) => `**${i + 1}.** <@${id}> — ⭐ Nível ${data.level || 1} (**${data.xp || 0} XP**)`)
        .join("\n");
      return message.channel.send({ embeds: [createEmbed("📈 Ranking de Nível", ranking || "Sem dados ainda.", "Blue")] });
    }

    if (cmd === "rankmsg") {
      const ranking = Object.entries(users)
        .sort((a, b) => (b[1].messages || 0) - (a[1].messages || 0))
        .slice(0, 10)
        .map(([id, data], i) => `**${i + 1}.** <@${id}> — 💬 ${data.messages || 0} mensagens`)
        .join("\n");
      return message.channel.send({ embeds: [createEmbed("💬 Ranking de Mensagens", ranking || "Sem dados ainda.", "Purple")] });
    }

    if (cmd === "colecao" || cmd === "collection" || cmd === "coleção") {
      if (!user.collection.length) return message.reply("📦 Sua coleção está vazia.");
      const count = {};
      for (const item of user.collection) count[item] = (count[item] || 0) + 1;
      const texto = Object.entries(count).map(([item, qtd]) => `• **${item}** x${qtd}`).join("\n");
      return message.channel.send({ embeds: [createEmbed(`🗂️ Coleção de ${message.author.username}`, texto, "Aqua")] });
    }

    if (cmd === "battlepass" || cmd === "bp" || cmd === "pass") {
      const rewards = [
        { level: 3, reward: "500 moedas" },
        { level: 5, reward: "caixa comum" },
        { level: 8, reward: "1000 moedas" },
        { level: 10, reward: "pet aleatório" },
        { level: 15, reward: "caixa rara" },
        { level: 20, reward: "vip de pobre" }
      ];
      const texto = rewards.map(r => {
        const ok = user.level >= r.level ? "✅" : "❌";
        return `${ok} **Nível ${r.level}** — ${r.reward}`;
      }).join("\n");
      return message.channel.send({
        embeds: [createEmbed("🎟️ Battle Pass", `⭐ Seu nível: **${user.level}**\n\n${texto}`, "Green")]
      });
    }

    if (cmd === "resgatarbp") {
      if (!user.bpClaimed) user.bpClaimed = [];
      const rewards = [
        { level: 3, reward: () => { user.money += 500; return "500 moedas"; } },
        { level: 5, reward: () => { user.boxes.push("comum"); return "caixa comum"; } },
        { level: 8, reward: () => { user.money += 1000; return "1000 moedas"; } },
        { level: 10, reward: () => {
          const nomes = Object.keys(petsData);
          const pet = nomes[randomMoney(0, nomes.length - 1)];
          user.pets.push(pet);
          return `pet **${pet}**`;
        }},
        { level: 15, reward: () => { user.boxes.push("rara"); return "caixa rara"; } },
        { level: 20, reward: () => { user.inventory.push("vip de pobre"); user.vip = true; return "vip de pobre"; } }
      ];

      const disponiveis = rewards.filter(r => user.level >= r.level && !user.bpClaimed.includes(r.level));
      if (!disponiveis.length) return message.reply("❌ Você não tem recompensas do Battle Pass para resgatar.");

      const ganhos = [];
      for (const r of disponiveis) {
        ganhos.push(`• ${r.reward()}`);
        user.bpClaimed.push(r.level);
      }

      saveUsers();
      return message.reply(`🎁 Você resgatou suas recompensas do Battle Pass:\n${ganhos.join("\n")}`);
    }

    if (cmd === "duelo") {
      const alvo = message.mentions.users.first();
      if (!alvo) return message.reply("❌ Marque alguém para duelar.");
      if (alvo.id === message.author.id) return message.reply("💀 Você não pode duelar com você mesmo.");
      const alvoData = getUser(alvo.id);
      const aposta = parseInt(args.find(a => !isNaN(a))) || 500;
      if (user.money < aposta) return message.reply("❌ Você não tem dinheiro suficiente.");
      if (alvoData.money < aposta) return message.reply("❌ O alvo não tem dinheiro suficiente.");
      const p1 = randomMoney(1, 100) + user.level * 2;
      const p2 = randomMoney(1, 100) + alvoData.level * 2;
      if (p1 === p2) return message.reply(`⚔️ Duelo entre ${message.author} e ${alvo} terminou em **EMPATE**!`);
      if (p1 > p2) {
        user.money += aposta;
        alvoData.money -= aposta;
        saveUsers();
        return message.reply(`⚔️ ${message.author} venceu o duelo contra ${alvo} e ganhou **${aposta} moedas**!`);
      } else {
        user.money -= aposta;
        alvoData.money += aposta;
        saveUsers();
        return message.reply(`⚔️ ${alvo} venceu o duelo contra ${message.author}. Você perdeu **${aposta} moedas**.`);
      }
    }

    if (cmd === "boss") {
      const bosses = [
        { nome: "Capivara do Apocalipse", hp: 120, reward: [2500, 5000] },
        { nome: "CLT Supremo", hp: 150, reward: [3000, 6000] },
        { nome: "Pombo Radioativo", hp: 100, reward: [2000, 4500] },
        { nome: "Miojo Ancestral", hp: 180, reward: [4000, 8000] },
        { nome: "Air Fryer Demoníaca", hp: 220, reward: [5000, 10000] }
      ];
      const boss = bosses[randomMoney(0, bosses.length - 1)];
      const playerPower = randomMoney(40, 160) + user.level * 5 + user.pets.length * 10;
      if (playerPower >= boss.hp) {
        const reward = rewardWithBoost(user, randomMoney(boss.reward[0], boss.reward[1]));
        user.money += reward;
        user.collection.push(boss.nome);
        saveUsers();
        return message.reply(`👹 Você derrotou o boss **${boss.nome}**!\n💰 Recompensa: **${reward} moedas**`);
      } else {
        const loss = randomMoney(300, 1200);
        user.money = Math.max(0, user.money - loss);
        saveUsers();
        return message.reply(`💀 O boss **${boss.nome}** te espancou.\nVocê perdeu **${loss} moedas**.`);
      }
    }

    if (cmd === "npc") {
      const npcs = [
        "🧓 Um velho disse: 'não confie em quem vende curso de ficar rico'",
        "🐸 Um sapo místico te entregou um conselho inútil",
        "🧙 Um mago do Discord disse que seu destino é virar ADM",
        "🐹 Uma capivara falou que você precisa farmar mais",
        "🤓 Um programador disse: 'faltou ponto e vírgula aí'"
      ];
      return message.reply(npcs[randomMoney(0, npcs.length - 1)]);
    }

    if (cmd === "loteria") {
      const custo = 1000;
      if (user.money < custo) return message.reply("❌ Você precisa de **1000 moedas** para jogar na loteria.");
      user.money -= custo;
      const num = randomMoney(1, 1000);
      if (num === 777) {
        const premio = 100000;
        user.money += premio;
        saveUsers();
        return message.reply(`🎉🎉🎉 VOCÊ ACERTOU A LOTERIA!!! Ganhou **${premio} moedas**!!!`);
      } else if (num >= 990) {
        const premio = randomMoney(5000, 15000);
        user.money += premio;
        saveUsers();
        return message.reply(`🍀 Quase impossível! Você ganhou **${premio} moedas** na loteria.`);
      } else {
        saveUsers();
        return message.reply(`🎫 Seu número foi **${num}**... não foi dessa vez 😭`);
      }
    }

    if (cmd === "sorteio" || cmd === "raffle") {
      const premio = args.join(" ") || "1 capivara usada";
      const membros = message.guild.members.cache.filter(m => !m.user.bot).map(m => m.user);
      if (!membros.length) return message.reply("❌ Não há participantes suficientes.");
      const vencedor = membros[randomMoney(0, membros.length - 1)];
      return message.channel.send({ embeds: [createEmbed("🎉 SORTEIO", `🏆 Prêmio: **${premio}**\n🎊 Vencedor: ${vencedor}`, "Gold")] });
    }

    if (cmd === "evento") {
      const eventos = [
        { nome: "💸 Chuva de Dinheiro", reward: [500, 2000] },
        { nome: "👹 Invasão de Boss", reward: [1000, 3500] },
        { nome: "🎁 Evento Misterioso", reward: [800, 2500] },
        { nome: "🐟 Festival da Pesca", reward: [700, 2200] },
        { nome: "⛏️ Noite da Mineração", reward: [900, 2800] }
      ];
      const ev = eventos[randomMoney(0, eventos.length - 1)];
      const reward = rewardWithBoost(user, randomMoney(ev.reward[0], ev.reward[1]));
      user.money += reward;
      saveUsers();
      return message.reply(`🎊 Evento ativado: **${ev.nome}**\nVocê ganhou **${reward} moedas**!`);
    }

    if (cmd === "clima" || cmd === "tempo") {
      const climas = [
        "☀️ Sol de fritar ovo no asfalto",
        "🌧️ Chuva nível Minecraft com shader",
        "⛈️ Tempestade do capeta",
        "🌪️ Vento de levar telhado",
        "🌫️ Névoa de filme de terror",
        "🥵 Calor que derrete o chinelo",
        "🥶 Frio de pinguim"
      ];
      return message.reply(`📡 Previsão do tempo:\n${climas[randomMoney(0, climas.length - 1)]}`);
    }

    if (cmd === "meme") {
      const memes = [
        "🗿🍷 sigma detected",
        "💀 essa foi de arrasta",
        "🤡 loss total",
        "🐹 capivara supremacy",
        "🍞 pão com wifi encontrado",
        "📉 caiu igual bitcoin em crise"
      ];
      return message.reply(memes[randomMoney(0, memes.length - 1)]);
    }

    if (cmd === "xingar") {
      const alvo = message.mentions.users.first() || message.author;
      const frases = [
        "é um **HDMI sem sinal**",
        "tem QI de **air fryer desligada**",
        "é mais perdido que **Wi-Fi de ônibus**",
        "parece que foi montado com peça da Shopee",
        "é um verdadeiro **NPC bugado**",
        "tem a inteligência de um **pão molhado**"
      ];
      return message.reply(`🤬 ${alvo} ${frases[randomMoney(0, frases.length - 1)]}`);
    }

    if (cmd === "elogiar") {
      const alvo = message.mentions.users.first() || message.author;
      const frases = [
        "é lindo igual **RTX grátis**",
        "tem presença de **boss final**",
        "é mais brabo que **admin corrupto**",
        "tem aura de **milionário do Discord**",
        "é oficialmente **sigma premium**",
        "nasceu para vencer (ou pelo menos tentar)"
      ];
      return message.reply(`😎 ${alvo} ${frases[randomMoney(0, frases.length - 1)]}`);
    }

    if (cmd === "help" || cmd === "ajuda") {
      return message.channel.send({
        embeds: [
          createEmbed(
            "📖 AJUDA DO BOT ULTRA",
`**🎉 Diversão**
\`!ping\` \`!gay\` \`!corno\` \`!bonito\` \`!gostoso\` \`!ship\` \`!rp\` \`!slap\` \`!hug\` \`!kill\` \`!reviver\` \`!virus\` \`!rate\` \`!meme\` \`!xingar\` \`!elogiar\` \`!quem\` \`!8ball\`

**💸 Economia**
\`!saldo\` \`!daily\` \`!dailyvip\` \`!work\` \`!crime\` \`!beg\` \`!apostar\` \`!blackjack\` \`!assaltar\` \`!doar\` \`!investir\` \`!resgatar\`

**🛒 Loja / Itens**
\`!loja\` \`!comprar\` \`!inventario\` \`!usar\` \`!vender\` \`!mercado\` \`!craft\`

**📦 Loot**
\`!caixa\` \`!caixarara\` \`!caixalendaria\` \`!abrir\`

**🐾 Pets**
\`!pet\` \`!pet comprar nome\` \`!pet lista\`

**🌾 Farm**
\`!pescar\` \`!minerar\` \`!caçar\` \`!farmar\` \`!colecao\`

**🏢 Empresa**
\`!empresa\` \`!empresa criar\` \`!empresa coletar\` \`!empresa sacar\` \`!empresa upar\`

**⚔️ PvE / PvP**
\`!duelo\` \`!boss\` \`!npc\`

**🏆 Rankings**
\`!rankmoney\` \`!ranklevel\` \`!rankmsg\`

**🎟️ Extras**
\`!battlepass\` \`!bp\` \`!resgatarbp\` \`!loteria\` \`!evento\` \`!sorteio\` \`!clima\` \`!perfil\``,
            "Green"
          )
        ]
      });
    }
  });
};
