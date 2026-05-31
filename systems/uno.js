const { EmbedBuilder } = require("discord.js");

module.exports = (client) => {
  const PREFIX = "!";
  const COMMAND_CHANNEL_ID = "1487221808276176986";
  const unoGames = {};

  const COLORS = ["red", "yellow", "green", "blue"];
  const COLOR_EMOJIS = {
    red: "🔴",
    yellow: "🟡",
    green: "🟢",
    blue: "🔵",
    wild: "⚫"
  };

  const VALUE_NAMES = {
    skip: "Pular",
    reverse: "Reverso",
    draw2: "+2",
    wild: "Coringa",
    wild4: "+4"
  };

  function cardText(card) {
    const emoji = COLOR_EMOJIS[card.color];
    const value = VALUE_NAMES[card.value] || card.value;
    return `${emoji} ${value}`;
  }

  function buildDeck() {
    const deck = [];

    for (const color of COLORS) {
      deck.push({ color, value: "0" });

      for (let i = 1; i <= 9; i++) {
        deck.push({ color, value: String(i) });
        deck.push({ color, value: String(i) });
      }

      ["skip", "reverse", "draw2"].forEach(value => {
        deck.push({ color, value });
        deck.push({ color, value });
      });
    }

    for (let i = 0; i < 4; i++) {
      deck.push({ color: "wild", value: "wild" });
      deck.push({ color: "wild", value: "wild4" });
    }

    return shuffle(deck);
  }

  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function createGame(room, ownerId) {
    unoGames[room] = {
      owner: ownerId,
      players: [ownerId],
      started: false,
      deck: [],
      discard: [],
      hands: {},
      turn: 0,
      direction: 1,
      currentColor: null,
      currentCard: null,
      unoCalled: {},
      drawStack: 0
    };
  }

  function getGameByPlayer(userId) {
    for (const room in unoGames) {
      if (unoGames[room].players.includes(userId)) {
        return { room, game: unoGames[room] };
      }
    }
    return null;
  }

  function getCurrentPlayer(game) {
    return game.players[game.turn];
  }

  function nextTurn(game, skip = 1) {
    const len = game.players.length;
    game.turn = (game.turn + (skip * game.direction) + len) % len;
  }

  function drawCards(game, userId, amount) {
    if (!game.hands[userId]) game.hands[userId] = [];

    for (let i = 0; i < amount; i++) {
      if (game.deck.length === 0) {
        const top = game.discard.pop();
        game.deck = shuffle([...game.discard]);
        game.discard = [top];
      }

      if (game.deck.length === 0) return;
      game.hands[userId].push(game.deck.pop());
    }
  }

  function canPlay(card, game) {
    if (card.color === "wild") return true;
    if (card.color === game.currentColor) return true;
    if (card.value === game.currentCard.value) return true;
    return false;
  }

  async function sendHand(user, game) {
    if (!user) return;

    const hand = game.hands[user.id] || [];
    const desc = hand.length
      ? hand.map((c, i) => `**${i + 1}.** ${cardText(c)}`).join("\n")
      : "Sem cartas.";

    const embed = new EmbedBuilder()
      .setColor("Random")
      .setTitle("🃏 Suas cartas no UNO")
      .setDescription(
        `**Mesa:** ${cardText(game.currentCard)}\n**Cor atual:** ${COLOR_EMOJIS[game.currentColor]} ${game.currentColor}\n\n${desc}`
      )
      .setFooter({ text: "Use !uno jogar <número> [cor] | !uno comprar | !uno falar" });

    try {
      await user.send({ embeds: [embed] });
    } catch {}
  }

  async function updateAllHands(game) {
    for (const playerId of game.players) {
      const user = await client.users.fetch(playerId).catch(() => null);
      if (user) await sendHand(user, game);
    }
  }

  async function announceTurn(channel, game) {
    const currentId = getCurrentPlayer(game);
    const user = await client.users.fetch(currentId).catch(() => null);
    if (!user) return;

    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor("Blue")
          .setTitle("🎯 Vez de jogar")
          .setDescription(
            `**Jogador:** ${user}\n**Mesa:** ${cardText(game.currentCard)}\n**Cor atual:** ${COLOR_EMOJIS[game.currentColor]} ${game.currentColor}`
          )
      ]
    });

    await sendHand(user, game);
  }

  async function startGame(channel, room) {
    const game = unoGames[room];
    if (!game) return;

    game.started = true;
    game.deck = buildDeck();
    game.discard = [];
    game.hands = {};
    game.turn = 0;
    game.direction = 1;
    game.unoCalled = {};
    game.drawStack = 0;

    for (const playerId of game.players) {
      game.hands[playerId] = [];
      drawCards(game, playerId, 7);
      game.unoCalled[playerId] = false;
    }

    let firstCard = game.deck.pop();
    while (firstCard.color === "wild") {
      game.deck.unshift(firstCard);
      game.deck = shuffle(game.deck);
      firstCard = game.deck.pop();
    }

    game.currentCard = firstCard;
    game.currentColor = firstCard.color;
    game.discard.push(firstCard);

    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor("Green")
          .setTitle("🎮 UNO iniciado!")
          .setDescription(
            `**Sala:** ${room}\n**Jogadores:** ${game.players.length}\n**Carta inicial:** ${cardText(firstCard)}`
          )
      ]
    });

    await updateAllHands(game);
    await announceTurn(channel, game);
  }

  function helpEmbed() {
    return new EmbedBuilder()
      .setColor("Purple")
      .setTitle("🃏 Central de Comandos do UNO")
      .setDescription(
        [
          "**🎮 Salas**",
          "`!uno criar [nome]` → Cria uma sala",
          "`!uno entrar [nome]` → Entra em uma sala",
          "`!uno sair` → Sai da sala antes do jogo começar",
          "`!uno iniciar [nome]` → Inicia a partida",
          "`!uno status` → Mostra o status da partida",
          "`!uno cancelar` → Cancela a sala (apenas dono)",
          "",
          "**🃏 Jogo**",
          "`!uno mao` → Recebe suas cartas no PV",
          "`!uno mão` → Mesmo comando acima",
          "`!uno jogar <número>` → Joga uma carta normal",
          "`!uno jogar <número> <cor>` → Joga coringa ou +4",
          "`!uno comprar` → Compra 1 carta",
          "`!uno falar` → Grita UNO quando estiver com 1 carta",
          "`!uno denunciar @user` → Denuncia quem esqueceu UNO",
          "",
          "**🎨 Cores válidas para coringa**",
          "`azul`, `vermelho`, `verde`, `amarelo`",
          "`blue`, `red`, `green`, `yellow`",
          "",
          "**📌 Exemplo**",
          "`!uno jogar 3 azul`"
        ].join("\n")
      )
      .setFooter({ text: "OrbitStore • Sistema UNO" });
  }

  client.once("clientReady", () => {
    console.log("🃏 Sistema UNO carregado!");
  });

  client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) return;

    if (
      message.content.startsWith(`${PREFIX}uno`) &&
      message.channel.id !== COMMAND_CHANNEL_ID
    ) {
      await message.delete().catch(() => {});
      return;
    }

    if (!message.content.toLowerCase().startsWith(`${PREFIX}uno`)) return;

    const args = message.content.trim().split(/ +/).slice(1);
    const sub = (args.shift() || "").toLowerCase();

    if (sub === "help" || sub === "ajuda" || sub === "comandos") {
      return message.channel.send({
        embeds: [helpEmbed()]
      });
    }

    if (sub === "criar") {
      const room = (args[0] || `sala-${Math.floor(Math.random() * 9999)}`).toLowerCase();
      if (unoGames[room]) return message.reply("❌ Já existe uma sala com esse nome.");

      createGame(room, message.author.id);

      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor("Green")
            .setTitle("🎮 Sala de UNO criada")
            .setDescription(
              `**Sala:** ${room}\n**Dono:** ${message.author}\n\nUse \`!uno entrar ${room}\` para entrar.\nUse \`!uno iniciar ${room}\` para começar.`
            )
        ]
      });
    }

    if (sub === "entrar") {
      const room = (args[0] || "").toLowerCase();
      const game = unoGames[room];
      if (!game) return message.reply("❌ Sala não encontrada.");
      if (game.started) return message.reply("❌ Essa partida já começou.");
      if (game.players.includes(message.author.id)) return message.reply("❌ Você já está nessa sala.");

      const already = getGameByPlayer(message.author.id);
      if (already) return message.reply(`❌ Você já está na sala **${already.room}**.`);

      game.players.push(message.author.id);

      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor("Blue")
            .setTitle("✅ Jogador entrou")
            .setDescription(`${message.author} entrou na sala **${room}**.\nAgora tem **${game.players.length} jogadores**.`)
        ]
      });
    }

    if (sub === "sair") {
      const found = getGameByPlayer(message.author.id);
      if (!found) return message.reply("❌ Você não está em nenhuma sala.");

      const { room, game } = found;
      if (game.started) return message.reply("❌ Você não pode sair depois que a partida começou.");

      game.players = game.players.filter(id => id !== message.author.id);

      if (game.owner === message.author.id && game.players.length > 0) {
        game.owner = game.players[0];
      }

      if (game.players.length === 0) {
        delete unoGames[room];
        return message.reply(`🗑️ Sala **${room}** removida.`);
      }

      return message.reply(`🚪 Você saiu da sala **${room}**.`);
    }

    if (sub === "iniciar") {
      const room = (args[0] || "").toLowerCase();
      const game = unoGames[room];
      if (!game) return message.reply("❌ Sala não encontrada.");
      if (game.owner !== message.author.id) return message.reply("❌ Só o dono pode iniciar.");
      if (game.started) return message.reply("❌ Essa partida já começou.");
      if (game.players.length < 2) return message.reply("❌ Precisa de pelo menos 2 jogadores.");

      return startGame(message.channel, room);
    }

    if (sub === "status") {
      const found = getGameByPlayer(message.author.id);
      if (!found) return message.reply("❌ Você não está em nenhuma sala.");

      const { room, game } = found;
      const playersText = await Promise.all(
        game.players.map(async (id, i) => {
          const user = await client.users.fetch(id).catch(() => null);
          const handCount = game.hands[id]?.length ?? 0;
          const turnMark = game.started && getCurrentPlayer(game) === id ? " ← 🎯" : "";
          return `**${i + 1}.** ${user ? user.username : "Usuário"} — ${handCount} cartas${turnMark}`;
        })
      );

      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor("Purple")
            .setTitle(`📊 Status da sala ${room}`)
            .setDescription(
              `**Mesa:** ${game.currentCard ? cardText(game.currentCard) : "Ainda não começou"}\n**Cor atual:** ${game.currentColor ? `${COLOR_EMOJIS[game.currentColor]} ${game.currentColor}` : "Nenhuma"}\n\n${playersText.join("\n")}`
            )
        ]
      });
    }

    if (sub === "mao" || sub === "mão") {
      const found = getGameByPlayer(message.author.id);
      if (!found) return message.reply("❌ Você não está em nenhuma sala.");
      if (!found.game.started) return message.reply("❌ O jogo ainda não começou.");

      await sendHand(message.author, found.game);
      return message.reply("📩 Te mandei sua mão no PV.");
    }

    if (sub === "comprar") {
      const found = getGameByPlayer(message.author.id);
      if (!found) return message.reply("❌ Você não está em nenhuma sala.");

      const { game } = found;
      if (!game.started) return message.reply("❌ O jogo ainda não começou.");
      if (getCurrentPlayer(game) !== message.author.id) return message.reply("❌ Não é sua vez.");

      drawCards(game, message.author.id, 1);
      game.unoCalled[message.author.id] = false;

      await sendHand(message.author, game);
      nextTurn(game);
      await message.channel.send(`🃏 ${message.author} comprou 1 carta.`);
      return announceTurn(message.channel, game);
    }

    if (sub === "falar") {
      const found = getGameByPlayer(message.author.id);
      if (!found) return message.reply("❌ Você não está em nenhuma sala.");
      if (!found.game.started) return message.reply("❌ O jogo ainda não começou.");

      const hand = found.game.hands[message.author.id] || [];
      if (hand.length !== 1) return message.reply("❌ Você só pode falar UNO quando estiver com 1 carta.");

      found.game.unoCalled[message.author.id] = true;
      return message.channel.send(`📢 ${message.author} gritou **UNO!**`);
    }

    if (sub === "denunciar") {
      const alvo = message.mentions.users.first();
      if (!alvo) return message.reply("❌ Marque alguém para denunciar.");

      const found = getGameByPlayer(message.author.id);
      if (!found) return message.reply("❌ Você não está em nenhuma sala.");

      const { game } = found;
      if (!game.started) return message.reply("❌ O jogo ainda não começou.");
      if (!game.players.includes(alvo.id)) return message.reply("❌ Essa pessoa não está na partida.");

      const hand = game.hands[alvo.id] || [];
      if (hand.length !== 1) return message.reply("❌ Essa pessoa não está com 1 carta.");
      if (game.unoCalled[alvo.id]) return message.reply("❌ Essa pessoa já falou UNO.");

      drawCards(game, alvo.id, 2);
      await sendHand(alvo, game);

      return message.channel.send(`🚨 ${alvo} esqueceu de falar **UNO** e comprou **2 cartas**!`);
    }

    if (sub === "jogar") {
      const index = parseInt(args[0]);
      const chosenColor = (args[1] || "").toLowerCase();

      const found = getGameByPlayer(message.author.id);
      if (!found) return message.reply("❌ Você não está em nenhuma sala.");

      const { game } = found;
      if (!game.started) return message.reply("❌ O jogo ainda não começou.");
      if (getCurrentPlayer(game) !== message.author.id) return message.reply("❌ Não é sua vez.");
      if (!index || index < 1) return message.reply("❌ Use: `!uno jogar <número da carta> [cor]`");

      const hand = game.hands[message.author.id];
      const card = hand[index - 1];
      if (!card) return message.reply("❌ Carta inválida.");
      if (!canPlay(card, game)) return message.reply("❌ Você não pode jogar essa carta agora.");

      let finalColor = chosenColor;
      if (chosenColor === "vermelho") finalColor = "red";
      if (chosenColor === "amarelo") finalColor = "yellow";
      if (chosenColor === "verde") finalColor = "green";
      if (chosenColor === "azul") finalColor = "blue";

      if (card.color === "wild" && !COLORS.includes(finalColor)) {
        return message.reply("❌ Você precisa escolher uma cor: `vermelho`, `amarelo`, `verde`, `azul` ou `red/yellow/green/blue`.");
      }

      hand.splice(index - 1, 1);
      game.discard.push(card);
      game.currentCard = card;
      game.currentColor = card.color === "wild" ? finalColor : card.color;
      game.unoCalled[message.author.id] = false;

      await message.channel.send(`🃏 ${message.author} jogou **${cardText(card)}**${card.color === "wild" ? ` e escolheu **${COLOR_EMOJIS[finalColor]} ${finalColor}**` : ""}!`);

      if (hand.length === 1) {
        await message.channel.send(`⚠️ ${message.author} está com **1 carta**! Se ele não falar UNO, pode ser denunciado.`);
      }

      if (hand.length === 0) {
        await message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor("Gold")
              .setTitle("🏆 Temos um vencedor!")
              .setDescription(`${message.author} venceu a partida de UNO na sala **${found.room}**!`)
          ]
        });

        delete unoGames[found.room];
        return;
      }

      if (card.value === "skip") {
        nextTurn(game, 2);
        await updateAllHands(game);
        await message.channel.send(`⏭️ Próximo jogador foi pulado!`);
        return announceTurn(message.channel, game);
      }

      if (card.value === "reverse") {
        if (game.players.length === 2) {
          nextTurn(game, 2);
          await updateAllHands(game);
          await message.channel.send(`🔄 Reverso em 2 jogadores funciona como pular!`);
          return announceTurn(message.channel, game);
        } else {
          game.direction *= -1;
          nextTurn(game);
          await updateAllHands(game);
          await message.channel.send(`🔄 A direção do jogo foi invertida!`);
          return announceTurn(message.channel, game);
        }
      }

      if (card.value === "draw2") {
        nextTurn(game);
        const target = getCurrentPlayer(game);
        drawCards(game, target, 2);
        const targetUser = await client.users.fetch(target).catch(() => null);
        await sendHand(targetUser, game);
        await message.channel.send(`📥 <@${target}> comprou **2 cartas** e perdeu a vez!`);
        nextTurn(game);
        await updateAllHands(game);
        return announceTurn(message.channel, game);
      }

      if (card.value === "wild4") {
        nextTurn(game);
        const target = getCurrentPlayer(game);
        drawCards(game, target, 4);
        const targetUser = await client.users.fetch(target).catch(() => null);
        await sendHand(targetUser, game);
        await message.channel.send(`💀 <@${target}> comprou **4 cartas** e perdeu a vez!`);
        nextTurn(game);
        await updateAllHands(game);
        return announceTurn(message.channel, game);
      }

      nextTurn(game);
      await updateAllHands(game);
      return announceTurn(message.channel, game);
    }

    if (sub === "cancelar") {
      const found = getGameByPlayer(message.author.id);
      if (!found) return message.reply("❌ Você não está em nenhuma sala.");

      const { room, game } = found;
      if (game.owner !== message.author.id) return message.reply("❌ Só o dono da sala pode cancelar.");

      delete unoGames[room];
      return message.channel.send(`🗑️ A sala **${room}** foi cancelada.`);
    }

    return message.channel.send({
      embeds: [helpEmbed()]
    });
  });
};
