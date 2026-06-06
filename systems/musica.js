const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
} = require("@discordjs/voice");
const playdl = require("play-dl");

/* =========================
   MUSIC SYSTEM
========================= */

const queues = new Map();

async function getVideoInfo(query) {
  // Spotify
  if (query.includes("spotify.com")) {
    try {
      const spotifyData = await playdl.spotify(query);
      const searchQuery = `${spotifyData.name} ${spotifyData.artists[0].name}`;
      const results = await playdl.search(searchQuery, { limit: 1 });
      if (!results || results.length === 0) return null;
      return { url: results[0].url, title: results[0].title, duration: results[0].durationInSec };
    } catch (err) {
      console.error("Erro ao converter Spotify:", err);
      return null;
    }
  }

  // Link do YouTube direto
  if (query.includes("youtube.com") || query.includes("youtu.be")) {
    try {
      const info = await playdl.video_info(query);
      return {
        url: query,
        title: info.video_details.title,
        duration: info.video_details.durationInSec,
      };
    } catch (err) {
      console.error("Erro ao obter info do YouTube:", err);
      return null;
    }
  }

  // Pesquisa por nome
  const results = await playdl.search(query, { limit: 1 });
  if (!results || results.length === 0) return null;
  return {
    url: results[0].url,
    title: results[0].title,
    duration: results[0].durationInSec,
  };
}

function getQueue(guildId) {
  if (!queues.has(guildId)) {
    queues.set(guildId, { songs: [], player: null, connection: null, playing: false });
  }
  return queues.get(guildId);
}

async function playSong(message, queue) {
  if (queue.songs.length === 0) {
    queue.playing = false;
    setTimeout(() => {
      if (queue.songs.length === 0 && queue.connection) {
        queue.connection.destroy();
        queues.delete(message.guild.id);
      }
    }, 30_000);
    return;
  }

  const song = queue.songs[0];
  queue.playing = true;

  try {
    const stream = await playdl.stream(song.url, { quality: 2 });
    const resource = createAudioResource(stream.stream, { inputType: stream.type });

    queue.player.play(resource);

    const durMin = Math.floor(song.duration / 60);
    const durSec = String(song.duration % 60).padStart(2, "0");
    message.channel.send(`🎵 Tocando agora: **${song.title}** (${durMin}:${durSec})\n🔗 ${song.url}`);

    queue.player.once(AudioPlayerStatus.Idle, () => {
      queue.songs.shift();
      playSong(message, queue);
    });

    queue.player.on("error", (err) => {
      console.error("Erro no player:", err);
      queue.songs.shift();
      playSong(message, queue);
    });

  } catch (err) {
    console.error("Erro ao tocar:", err);
    message.channel.send("❌ Erro ao tocar essa música, pulando...");
    queue.songs.shift();
    playSong(message, queue);
  }
}

module.exports = (client) => {

  client.on("messageCreate", async (message) => {
    if (!message.guild) return;
    if (message.author.bot) return;
    if (!message.content.startsWith("!")) return;

    const args = message.content.split(" ");
    const command = args.shift().toLowerCase();

    // ========== !p - TOCAR MÚSICA ==========
    if (command === "!p") {
      const voiceChannel = message.member?.voice?.channel;
      if (!voiceChannel)
        return message.reply("❌ Entre em um canal de voz primeiro!");

      const query = args.join(" ");
      if (!query)
        return message.reply("❌ Informe o nome, link do YouTube ou Spotify.\nEx: `!p lofi hip hop`");

      const searching = await message.reply("🔍 Pesquisando...");

      try {
        const info = await getVideoInfo(query);
        if (!info) return searching.edit("❌ Nenhum resultado encontrado.");

        const song = {
          title: info.title,
          url: info.url,
          duration: info.duration || 0,
          requestedBy: message.author.tag,
        };

        const queue = getQueue(message.guild.id);

        // Conecta na call se ainda não estiver
        if (!queue.connection) {
          queue.connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: message.guild.id,
            adapterCreator: message.guild.voiceAdapterCreator,
            selfDeaf: true,
          });

          queue.player = createAudioPlayer();
          queue.connection.subscribe(queue.player);

          queue.connection.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
              await Promise.race([
                entersState(queue.connection, VoiceConnectionStatus.Signalling, 5_000),
                entersState(queue.connection, VoiceConnectionStatus.Connecting, 5_000),
              ]);
            } catch {
              queue.connection.destroy();
              queues.delete(message.guild.id);
            }
          });
        }

        queue.songs.push(song);

        const durMin = Math.floor(song.duration / 60);
        const durSec = String(song.duration % 60).padStart(2, "0");

        if (queue.playing) {
          await searching.edit(
            `✅ Adicionado à fila: **${song.title}** (${durMin}:${durSec})\n📋 Posição na fila: ${queue.songs.length}`
          );
        } else {
          await searching.edit("✅ Música encontrada! Iniciando...");
          playSong(message, queue);
        }

      } catch (err) {
        console.error(err);
        searching.edit("❌ Erro ao tocar a música. Tente novamente.");
      }
    }

    // ========== !skip - PULAR ==========
    if (command === "!skip") {
      const queue = queues.get(message.guild.id);
      if (!queue || !queue.playing)
        return message.reply("❌ Nenhuma música tocando.");

      queue.player.stop();
      message.reply("⏭️ Música pulada!");
    }

    // ========== !stop - PARAR ==========
    if (command === "!stop") {
      const queue = queues.get(message.guild.id);
      if (!queue || !queue.connection)
        return message.reply("❌ O bot não está em nenhuma call.");

      queue.songs = [];
      queue.player?.stop();
      queue.connection.destroy();
      queues.delete(message.guild.id);
      message.reply("⏹️ Música parada e fila limpa!");
    }

    // ========== !queue / !q - VER FILA ==========
    if (command === "!queue" || command === "!q") {
      const queue = queues.get(message.guild.id);
      if (!queue || queue.songs.length === 0)
        return message.reply("📋 A fila está vazia.");

      const list = queue.songs
        .map((s, i) => {
          const durMin = Math.floor(s.duration / 60);
          const durSec = String(s.duration % 60).padStart(2, "0");
          return `${i === 0 ? "▶️" : `${i}.`} **${s.title}** (${durMin}:${durSec}) — pedido por ${s.requestedBy}`;
        })
        .join("\n");

      message.reply(`📋 **Fila de músicas:**\n\n${list}`);
    }

    // ========== !pause - PAUSAR ==========
    if (command === "!pause") {
      const queue = queues.get(message.guild.id);
      if (!queue || !queue.playing)
        return message.reply("❌ Nenhuma música tocando.");

      queue.player.pause();
      message.reply("⏸️ Música pausada. Use `!resume` para continuar.");
    }

    // ========== !resume - CONTINUAR ==========
    if (command === "!resume") {
      const queue = queues.get(message.guild.id);
      if (!queue)
        return message.reply("❌ Nenhuma música na fila.");

      queue.player.unpause();
      message.reply("▶️ Música continuando!");
    }

    // ========== !np - MÚSICA ATUAL ==========
    if (command === "!np") {
      const queue = queues.get(message.guild.id);
      if (!queue || !queue.playing || queue.songs.length === 0)
        return message.reply("❌ Nenhuma música tocando.");

      const song = queue.songs[0];
      const durMin = Math.floor(song.duration / 60);
      const durSec = String(song.duration % 60).padStart(2, "0");

      message.reply(
        `🎵 **Tocando agora:**\n**${song.title}**\n⏱️ Duração: ${durMin}:${durSec}\n👤 Pedido por: ${song.requestedBy}\n🔗 ${song.url}`
      );
    }

  });
};
