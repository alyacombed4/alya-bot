/**
 * Sistema de Música para Discord.js v14
 * ─────────────────────────────────────
 * Dependências necessárias:
 *   npm install @discordjs/voice youtubei.js @distube/ytdl-core ffmpeg-static sodium-native
 *
 * Por que youtubei.js?
 *   O play-dl usa a API pública do YouTube, que passou a exigir login (cookie) em 2024.
 *   O youtubei.js usa a InnerTube API (a mesma que o app oficial do YouTube usa),
 *   o que contorna completamente o bloqueio "Sign in to confirm you're not a bot".
 */

"use strict";

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
  StreamType,
} = require("@discordjs/voice");

const { Innertube } = require("youtubei.js");
const ytdl = require("@distube/ytdl-core");

/* ─────────────────────────────────────────────
   CONFIGURAÇÃO
───────────────────────────────────────────── */
const AFK_CHANNEL_ID = "1476321416470335659"; // Canal AFK para o bot aguardar
const IDLE_TIMEOUT_MS = 30_000;               // Tempo sem música antes de voltar ao AFK
const MAX_RECONNECT_ATTEMPTS = 3;             // Tentativas de reconexão de voz

/* ─────────────────────────────────────────────
   ESTADO GLOBAL
   Cada guild tem sua própria fila isolada.
───────────────────────────────────────────── */

/** @type {Map<string, GuildQueue>} */
const queues = new Map();

/**
 * @typedef {Object} Song
 * @property {string} title
 * @property {string} url
 * @property {number} duration
 * @property {string} requestedBy
 */

/**
 * @typedef {Object} GuildQueue
 * @property {Song[]} songs
 * @property {import("@discordjs/voice").AudioPlayer|null} player
 * @property {import("@discordjs/voice").VoiceConnection|null} connection
 * @property {boolean} playing
 * @property {NodeJS.Timeout|null} idleTimer
 * @property {boolean} destroyed
 */

/* ─────────────────────────────────────────────
   INNERTUBE (youtubei.js) – inicialização lazy
   Criamos uma única instância para toda a vida
   do processo, economizando memória e evitando
   rate-limits de autenticação.
───────────────────────────────────────────── */
let _innertube = null;

async function getInnertube() {
  if (!_innertube) {
    _innertube = await Innertube.create({
      // Sem cookies: a InnerTube API funciona sem autenticação para streaming
      generate_session_locally: true,
    });
  }
  return _innertube;
}

/* ─────────────────────────────────────────────
   BUSCA DE INFORMAÇÕES DE VÍDEO
───────────────────────────────────────────── */

/**
 * Extrai o ID de um link do YouTube.
 * @param {string} url
 * @returns {string|null}
 */
function extractYouTubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1);
    if (u.hostname.includes("youtube.com")) return u.searchParams.get("v");
  } catch {
    // URL inválida
  }
  return null;
}

/**
 * Resolve qualquer query (nome, link YT, link Spotify) para um objeto Song.
 * @param {string} query
 * @returns {Promise<Song|null>}
 */
async function resolveQuery(query) {
  const yt = await getInnertube();

  // ── Spotify: extrai nome do faixa e pesquisa no YouTube ──
  if (query.includes("spotify.com")) {
    try {
      // Tenta extrair o nome via fetch simples da URL pública (Open Graph)
      const trackName = await extractSpotifyTitle(query);
      if (!trackName) throw new Error("Não foi possível extrair título do Spotify");
      return resolveQuery(trackName); // Recursão com o nome
    } catch (err) {
      console.error("[Music] Erro Spotify:", err.message);
      return null;
    }
  }

  // ── Link direto do YouTube ──
  const videoId = extractYouTubeId(query);
  if (videoId) {
    try {
      const info = await yt.getBasicInfo(videoId);
      const details = info.basic_info;
      return {
        url: `https://www.youtube.com/watch?v=${videoId}`,
        title: details.title ?? "Título desconhecido",
        duration: details.duration ?? 0,
      };
    } catch (err) {
      console.error("[Music] Erro ao obter info do YouTube:", err.message);
      return null;
    }
  }

  // ── Pesquisa por nome ──
  try {
    const results = await yt.search(query, { type: "video" });
    const first = results.videos?.[0];
    if (!first) return null;

    const id = first.id;
    const duration =
      typeof first.duration?.seconds === "number"
        ? first.duration.seconds
        : parseDurationText(first.duration?.text ?? "");

    return {
      url: `https://www.youtube.com/watch?v=${id}`,
      title: first.title?.text ?? "Título desconhecido",
      duration,
    };
  } catch (err) {
    console.error("[Music] Erro na pesquisa:", err.message);
    return null;
  }
}

/**
 * Faz um fetch leve da página do Spotify para extrair o título via Open Graph.
 * Não depende de nenhuma lib do Spotify.
 * @param {string} spotifyUrl
 * @returns {Promise<string|null>}
 */
async function extractSpotifyTitle(spotifyUrl) {
  try {
    const res = await fetch(spotifyUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8_000),
    });
    const html = await res.text();
    const match = html.match(/<meta property="og:title" content="([^"]+)"/);
    return match ? decodeHTMLEntities(match[1]) : null;
  } catch {
    return null;
  }
}

/**
 * Decodifica entidades HTML básicas.
 * @param {string} text
 * @returns {string}
 */
function decodeHTMLEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Converte "4:32" ou "1:02:10" para segundos.
 * @param {string} text
 * @returns {number}
 */
function parseDurationText(text) {
  if (!text) return 0;
  const parts = text.split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

/* ─────────────────────────────────────────────
   STREAMING DE ÁUDIO
   Usa @distube/ytdl-core que é mantido ativamente
   e compatível com Node 22+.
───────────────────────────────────────────── */

/**
 * Cria um AudioResource a partir de uma URL do YouTube.
 * @param {string} url
 * @returns {Promise<import("@discordjs/voice").AudioResource>}
 */
async function createYouTubeResource(url) {
  // highWaterMark alto evita stuttering em conexões lentas
  const stream = ytdl(url, {
    filter: "audioonly",
    quality: "highestaudio",
    highWaterMark: 1 << 25, // 32 MB
    dlChunkSize: 0,
  });

  return createAudioResource(stream, {
    inputType: StreamType.Arbitrary,
    // inlineVolume: true, // descomente se quiser controle de volume no futuro
  });
}

/* ─────────────────────────────────────────────
   GERENCIAMENTO DE FILAS
───────────────────────────────────────────── */

/**
 * Retorna (ou cria) a fila de um guild.
 * @param {string} guildId
 * @returns {GuildQueue}
 */
function getQueue(guildId) {
  if (!queues.has(guildId)) {
    queues.set(guildId, {
      songs: [],
      player: null,
      connection: null,
      playing: false,
      idleTimer: null,
      destroyed: false,
    });
  }
  return queues.get(guildId);
}

/**
 * Remove e limpa completamente a fila de um guild.
 * @param {string} guildId
 */
function destroyQueue(guildId) {
  const queue = queues.get(guildId);
  if (!queue) return;

  queue.destroyed = true;
  clearTimeout(queue.idleTimer);

  if (queue.player) {
    queue.player.removeAllListeners();
    queue.player.stop(true);
  }

  if (queue.connection) {
    queue.connection.removeAllListeners();
    queue.connection.destroy();
  }

  queues.delete(guildId);
}

/* ─────────────────────────────────────────────
   CANAL AFK
───────────────────────────────────────────── */

/**
 * Reconecta o bot no canal AFK após encerrar a sessão de música.
 * @param {import("discord.js").Guild} guild
 */
function reconnectToAFK(guild) {
  const afkChannel = guild.channels.cache.get(AFK_CHANNEL_ID);
  if (!afkChannel) return;

  try {
    // Destrói conexão residual, se houver
    const existing = getVoiceConnection(guild.id);
    if (existing) existing.destroy();

    joinVoiceChannel({
      channelId: afkChannel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: true,
    });

    console.log("[Music] ✅ Bot reconectado no canal AFK.");
  } catch (err) {
    console.error("[Music] Erro ao reconectar AFK:", err.message);
  }
}

/* ─────────────────────────────────────────────
   PLAYER PRINCIPAL
───────────────────────────────────────────── */

/**
 * Toca a próxima música da fila.
 * Esta função é a única responsável por avançar a fila —
 * isso evita chamadas duplicadas e race conditions.
 *
 * @param {import("discord.js").TextChannel} channel  Canal de texto para enviar mensagens
 * @param {import("discord.js").Guild}       guild
 */
async function playSong(channel, guild) {
  const queue = queues.get(guild.id);

  // Fila destruída ou guild removida
  if (!queue || queue.destroyed) return;

  // Fila vazia: inicia timer de idle e volta pro AFK
  if (queue.songs.length === 0) {
    queue.playing = false;

    clearTimeout(queue.idleTimer);
    queue.idleTimer = setTimeout(() => {
      if (!queue || queue.songs.length === 0) {
        destroyQueue(guild.id);
        reconnectToAFK(guild);
      }
    }, IDLE_TIMEOUT_MS);

    return;
  }

  const song = queue.songs[0];
  queue.playing = true;

  // Remove listeners antigos para evitar duplicação
  queue.player.removeAllListeners(AudioPlayerStatus.Idle);
  queue.player.removeAllListeners("error");

  try {
    const resource = await createYouTubeResource(song.url);
    queue.player.play(resource);

    channel.send(
      `🎵 Tocando agora: **${song.title}** (${formatDuration(song.duration)})\n🔗 ${song.url}`
    ).catch(() => {}); // Ignora erro de permissão de canal

    // Avança para a próxima música quando terminar
    queue.player.once(AudioPlayerStatus.Idle, () => {
      if (!queue.destroyed) {
        queue.songs.shift();
        playSong(channel, guild);
      }
    });

    // Erro no player: pula a música problemática
    queue.player.once("error", (err) => {
      console.error("[Music] Erro no player:", err.message);
      if (!queue.destroyed) {
        queue.songs.shift();
        channel.send("⚠️ Erro ao tocar essa música, pulando...").catch(() => {});
        playSong(channel, guild);
      }
    });

  } catch (err) {
    console.error("[Music] Erro ao criar stream:", err.message);
    channel.send("❌ Não foi possível tocar essa música, pulando...").catch(() => {});
    queue.songs.shift();

    // Pequeno delay antes de tentar a próxima para evitar flood de erros
    setTimeout(() => playSong(channel, guild), 1_000);
  }
}

/* ─────────────────────────────────────────────
   FORMATAÇÃO
───────────────────────────────────────────── */

/**
 * Formata segundos como MM:SS ou HH:MM:SS.
 * @param {number} seconds
 * @returns {string}
 */
function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/* ─────────────────────────────────────────────
   HANDLER DE COMANDOS
───────────────────────────────────────────── */

module.exports = (client) => {

  // Inicializa o Innertube assim que o bot ligar (warm-up)
  client.once("ready", () => {
    getInnertube().catch((err) =>
      console.error("[Music] Falha ao inicializar Innertube:", err.message)
    );
  });

  client.on("messageCreate", async (message) => {
    if (!message.guild) return;
    if (message.author.bot) return;
    if (!message.content.startsWith("!")) return;

    const args = message.content.slice(1).trim().split(/\s+/);
    const command = args.shift().toLowerCase();
    const guildId = message.guild.id;

    /* ══════════════════════════════════════
       !p <query> — Tocar / Adicionar à fila
    ══════════════════════════════════════ */
    if (command === "p") {
      const voiceChannel = message.member?.voice?.channel;
      if (!voiceChannel)
        return message.reply("❌ Entre em um canal de voz primeiro!");

      const query = args.join(" ").trim();
      if (!query)
        return message.reply(
          "❌ Informe o nome, link do YouTube ou Spotify.\nEx: `!p lofi hip hop`"
        );

      const searching = await message.reply("🔍 Pesquisando...");

      try {
        const info = await resolveQuery(query);
        if (!info) return searching.edit("❌ Nenhum resultado encontrado.");

        /** @type {Song} */
        const song = {
          title: info.title,
          url: info.url,
          duration: info.duration || 0,
          requestedBy: message.author.tag,
        };

        const queue = getQueue(guildId);

        // ── Estabelece conexão de voz se ainda não houver ──
        if (!queue.connection) {
          // Destroi conexão AFK residual
          const existing = getVoiceConnection(guildId);
          if (existing) existing.destroy();

          const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId,
            adapterCreator: message.guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false,
          });

          const player = createAudioPlayer();
          connection.subscribe(player);

          queue.connection = connection;
          queue.player = player;

          // Lida com desconexão inesperada
          connection.on(VoiceConnectionStatus.Disconnected, async () => {
            if (queue.destroyed) return;

            try {
              // Tenta reconectar por até 5s
              await Promise.race([
                entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
              ]);
              // Se chegou aqui, reconectou — continua normalmente
            } catch {
              // Não reconectou: destrói tudo
              console.warn("[Music] Conexão de voz perdida, destruindo fila.");
              destroyQueue(guildId);
            }
          });

          // Limpa quando a conexão for destruída
          connection.once(VoiceConnectionStatus.Destroyed, () => {
            if (!queue.destroyed) destroyQueue(guildId);
          });
        }

        queue.songs.push(song);
        clearTimeout(queue.idleTimer); // Cancela timer de idle se havia um

        if (queue.playing) {
          await searching.edit(
            `✅ **${song.title}** (${formatDuration(song.duration)}) adicionado à fila!\n📋 Posição: ${queue.songs.length}`
          );
        } else {
          await searching.edit(`✅ Música encontrada! Iniciando...`);
          playSong(message.channel, message.guild);
        }

      } catch (err) {
        console.error("[Music] Erro no comando !p:", err);
        searching.edit("❌ Ocorreu um erro ao processar sua solicitação. Tente novamente.").catch(() => {});
      }
    }

    /* ══════════════════════════════════════
       !skip — Pular música atual
    ══════════════════════════════════════ */
    else if (command === "skip") {
      const queue = queues.get(guildId);
      if (!queue?.playing)
        return message.reply("❌ Nenhuma música tocando no momento.");

      queue.player.stop(); // Dispara o evento Idle → playSong avança a fila
      message.reply("⏭️ Música pulada!");
    }

    /* ══════════════════════════════════════
       !stop — Parar tudo e limpar fila
    ══════════════════════════════════════ */
    else if (command === "stop") {
      const queue = queues.get(guildId);
      if (!queue?.connection)
        return message.reply("❌ O bot não está em nenhum canal de voz.");

      destroyQueue(guildId);
      message.reply("⏹️ Música parada e fila limpa!");
      reconnectToAFK(message.guild);
    }

    /* ══════════════════════════════════════
       !queue / !q — Ver fila
    ══════════════════════════════════════ */
    else if (command === "queue" || command === "q") {
      const queue = queues.get(guildId);
      if (!queue?.songs?.length)
        return message.reply("📋 A fila está vazia.");

      const list = queue.songs
        .map((s, i) =>
          `${i === 0 ? "▶️" : `\`${i}.\``} **${s.title}** (${formatDuration(s.duration)}) — ${s.requestedBy}`
        )
        .join("\n");

      // Discord tem limite de 2000 caracteres por mensagem
      const header = "📋 **Fila de músicas:**\n\n";
      if (header.length + list.length <= 2000) {
        message.reply(header + list);
      } else {
        // Trunca a lista se for muito longa
        const truncated = list.slice(0, 1900 - header.length);
        message.reply(header + truncated + "\n*(lista truncada)*");
      }
    }

    /* ══════════════════════════════════════
       !pause — Pausar
    ══════════════════════════════════════ */
    else if (command === "pause") {
      const queue = queues.get(guildId);
      if (!queue?.playing)
        return message.reply("❌ Nenhuma música tocando no momento.");

      const paused = queue.player.pause();
      message.reply(paused ? "⏸️ Música pausada. Use `!resume` para continuar." : "❌ Não foi possível pausar.");
    }

    /* ══════════════════════════════════════
       !resume — Continuar
    ══════════════════════════════════════ */
    else if (command === "resume") {
      const queue = queues.get(guildId);
      if (!queue)
        return message.reply("❌ Nenhuma música na fila.");

      const resumed = queue.player.unpause();
      message.reply(resumed ? "▶️ Música continuando!" : "❌ Não foi possível retomar.");
    }

    /* ══════════════════════════════════════
       !np — Música tocando agora
    ══════════════════════════════════════ */
    else if (command === "np") {
      const queue = queues.get(guildId);
      if (!queue?.playing || !queue.songs.length)
        return message.reply("❌ Nenhuma música tocando no momento.");

      const song = queue.songs[0];
      message.reply(
        `🎵 **Tocando agora:**\n**${song.title}**\n⏱️ Duração: ${formatDuration(song.duration)}\n👤 Pedido por: ${song.requestedBy}\n🔗 ${song.url}`
      );
    }
  });
};
