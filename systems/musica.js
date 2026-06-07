/**
 * Sistema de Música — Discord.js v14
 * ════════════════════════════════════════════════════════
 * Fluxo de busca:
 *   1. Spotify API (Client Credentials) → metadados precisos
 *   2. youtubei.js (InnerTube) → busca "Artista - Título" no YT
 *   3. youtubei.js → stream de áudio (sem ytdl, sem 429)
 *
 * Variáveis de ambiente necessárias (.env):
 *   SPOTIFY_CLIENT_ID=...
 *   SPOTIFY_CLIENT_SECRET=...
 *
 * Dependências:
 *   npm install @discordjs/voice youtubei.js ffmpeg-static sodium-native
 * ════════════════════════════════════════════════════════
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

/* ─────────────────────────────────────────────
   CONFIGURAÇÃO
───────────────────────────────────────────── */
const AFK_CHANNEL_ID   = "1476321416470335659";
const IDLE_TIMEOUT_MS  = 30_000;

const SPOTIFY_CLIENT_ID     = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

/* ─────────────────────────────────────────────
   ESTADO GLOBAL
───────────────────────────────────────────── */

/** @type {Map<string, GuildQueue>} */
const queues = new Map();

/**
 * @typedef {Object} Song
 * @property {string} title        Título formatado "Artista - Música"
 * @property {string} url          URL do YouTube
 * @property {number} duration     Duração em segundos
 * @property {string} requestedBy  Tag do usuário
 * @property {string} [thumb]      Thumbnail do Spotify (opcional)
 */

/**
 * @typedef {Object} GuildQueue
 * @property {Song[]}    songs
 * @property {import("@discordjs/voice").AudioPlayer|null}      player
 * @property {import("@discordjs/voice").VoiceConnection|null}  connection
 * @property {boolean}   playing
 * @property {NodeJS.Timeout|null} idleTimer
 * @property {boolean}   destroyed
 */

/* ─────────────────────────────────────────────
   INNERTUBE — instância única reutilizável
───────────────────────────────────────────── */
let _innertube = null;

async function getInnertube() {
  if (!_innertube) {
    _innertube = await Innertube.create({ generate_session_locally: true });
  }
  return _innertube;
}

/* ─────────────────────────────────────────────
   SPOTIFY — autenticação Client Credentials
   Token é cacheado e renovado automaticamente.
───────────────────────────────────────────── */
let _spotifyToken = null;
let _spotifyTokenExpiry = 0;

async function getSpotifyToken() {
  if (_spotifyToken && Date.now() < _spotifyTokenExpiry) return _spotifyToken;

  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    throw new Error("SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET não definidos no .env");
  }

  const credentials = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64");

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`Spotify auth falhou: ${res.status}`);

  const data = await res.json();
  _spotifyToken = data.access_token;
  // Renova 60s antes de expirar
  _spotifyTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;

  return _spotifyToken;
}

/* ─────────────────────────────────────────────
   SPOTIFY — resolução de URLs e pesquisa
───────────────────────────────────────────── */

/**
 * Extrai o tipo e ID de uma URL do Spotify.
 * Suporta track, album e playlist.
 * @param {string} url
 * @returns {{ type: string, id: string }|null}
 */
function parseSpotifyUrl(url) {
  const match = url.match(/spotify\.com\/(track|album|playlist)\/([A-Za-z0-9]+)/);
  if (!match) return null;
  return { type: match[1], id: match[2] };
}

/**
 * Busca metadados de uma faixa do Spotify.
 * @param {string} trackId
 * @returns {Promise<{ title: string, artist: string, duration: number, thumb: string }|null>}
 */
async function getSpotifyTrack(trackId) {
  const token = await getSpotifyToken();
  const res = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return {
    title: data.name,
    artist: data.artists.map((a) => a.name).join(", "),
    duration: Math.floor(data.duration_ms / 1000),
    thumb: data.album?.images?.[0]?.url ?? null,
  };
}

/**
 * Busca as faixas de um álbum do Spotify (máx 50).
 * @param {string} albumId
 * @returns {Promise<Array<{ title: string, artist: string, duration: number, thumb: string }>>}
 */
async function getSpotifyAlbumTracks(albumId) {
  const token = await getSpotifyToken();

  // Pega capa do álbum separadamente
  const albumRes = await fetch(`https://api.spotify.com/v1/albums/${albumId}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  const albumData = albumRes.ok ? await albumRes.json() : null;
  const thumb = albumData?.images?.[0]?.url ?? null;
  const albumArtist = albumData?.artists?.[0]?.name ?? "";

  const res = await fetch(`https://api.spotify.com/v1/albums/${albumId}/tracks?limit=50`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return [];
  const data = await res.json();

  return data.items.map((t) => ({
    title: t.name,
    artist: t.artists.map((a) => a.name).join(", ") || albumArtist,
    duration: Math.floor(t.duration_ms / 1000),
    thumb,
  }));
}

/**
 * Busca as faixas de uma playlist do Spotify (máx 50).
 * @param {string} playlistId
 * @returns {Promise<Array<{ title: string, artist: string, duration: number, thumb: string }>>}
 */
async function getSpotifyPlaylistTracks(playlistId) {
  const token = await getSpotifyToken();
  const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return [];
  const data = await res.json();

  return data.items
    .filter((item) => item?.track?.type === "track")
    .map((item) => ({
      title: item.track.name,
      artist: item.track.artists.map((a) => a.name).join(", "),
      duration: Math.floor(item.track.duration_ms / 1000),
      thumb: item.track.album?.images?.[0]?.url ?? null,
    }));
}

/**
 * Pesquisa uma música no Spotify por nome e retorna a melhor correspondência.
 * @param {string} query
 * @returns {Promise<{ title: string, artist: string, duration: number, thumb: string }|null>}
 */
async function searchSpotify(query) {
  const token = await getSpotifyToken();
  const q = encodeURIComponent(query);
  const res = await fetch(`https://api.spotify.com/v1/search?q=${q}&type=track&limit=1`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const track = data.tracks?.items?.[0];
  if (!track) return null;
  return {
    title: track.name,
    artist: track.artists.map((a) => a.name).join(", "),
    duration: Math.floor(track.duration_ms / 1000),
    thumb: track.album?.images?.[0]?.url ?? null,
  };
}

/* ─────────────────────────────────────────────
   YOUTUBE — busca pelo InnerTube
───────────────────────────────────────────── */

/**
 * Encontra o vídeo do YouTube mais relevante para "Artista - Título".
 * @param {string} artist
 * @param {string} title
 * @param {number} expectedDuration  Duração esperada em segundos (filtra ao vivo/covers)
 * @returns {Promise<{ url: string, ytTitle: string }|null>}
 */
async function findOnYouTube(artist, title, expectedDuration) {
  const yt = await getInnertube();
  const query = `${artist} - ${title} official audio`;

  try {
    const results = await yt.search(query, { type: "video" });
    const videos = results.videos ?? [];

    if (videos.length === 0) return null;

    // Prefere vídeo cuja duração seja próxima da esperada (±15s)
    // para evitar pegar versões ao vivo ou remixes longos
    const best =
      expectedDuration > 0
        ? videos.find((v) => {
            const sec =
              typeof v.duration?.seconds === "number"
                ? v.duration.seconds
                : parseDurationText(v.duration?.text ?? "");
            return Math.abs(sec - expectedDuration) <= 15;
          }) ?? videos[0]
        : videos[0];

    return {
      url: `https://www.youtube.com/watch?v=${best.id}`,
      ytTitle: best.title?.text ?? title,
    };
  } catch (err) {
    console.error("[Music] Erro na busca YouTube:", err.message);
    return null;
  }
}

/* ─────────────────────────────────────────────
   RESOLUÇÃO PRINCIPAL DE QUERY
   Retorna Song ou array de Song (para álbuns/playlists)
───────────────────────────────────────────── */

/**
 * Converte qualquer query em uma ou mais Song prontas para a fila.
 * @param {string} query
 * @param {string} requestedBy
 * @returns {Promise<Song[]>}
 */
async function resolveQuery(query, requestedBy) {
  // ── Link do Spotify ──────────────────────────────────────────────────────
  if (query.includes("spotify.com")) {
    const parsed = parseSpotifyUrl(query);
    if (!parsed) return [];

    if (parsed.type === "track") {
      const track = await getSpotifyTrack(parsed.id);
      if (!track) return [];
      return [await buildSong(track, requestedBy)].filter(Boolean);
    }

    if (parsed.type === "album") {
      const tracks = await getSpotifyAlbumTracks(parsed.id);
      const songs = await Promise.all(tracks.map((t) => buildSong(t, requestedBy)));
      return songs.filter(Boolean);
    }

    if (parsed.type === "playlist") {
      const tracks = await getSpotifyPlaylistTracks(parsed.id);
      const songs = await Promise.all(tracks.map((t) => buildSong(t, requestedBy)));
      return songs.filter(Boolean);
    }

    return [];
  }

  // ── Pesquisa por nome (usa Spotify para enriquecer, depois acha no YT) ──
  const spotifyTrack = await searchSpotify(query);

  if (spotifyTrack) {
    const song = await buildSong(spotifyTrack, requestedBy);
    return song ? [song] : [];
  }

  // ── Fallback: busca direta no YouTube sem Spotify ────────────────────────
  console.warn("[Music] Spotify não retornou resultado, caindo para busca direta no YT.");
  const yt = await getInnertube();
  try {
    const results = await yt.search(query, { type: "video" });
    const first = results.videos?.[0];
    if (!first) return [];
    const duration =
      typeof first.duration?.seconds === "number"
        ? first.duration.seconds
        : parseDurationText(first.duration?.text ?? "");
    return [{
      title: first.title?.text ?? "Título desconhecido",
      url: `https://www.youtube.com/watch?v=${first.id}`,
      duration,
      requestedBy,
      thumb: null,
    }];
  } catch {
    return [];
  }
}

/**
 * Constrói um objeto Song completo a partir dos metadados do Spotify.
 * Localiza o vídeo correspondente no YouTube.
 * @param {{ title: string, artist: string, duration: number, thumb: string|null }} track
 * @param {string} requestedBy
 * @returns {Promise<Song|null>}
 */
async function buildSong(track, requestedBy) {
  const yt = await findOnYouTube(track.artist, track.title, track.duration);
  if (!yt) return null;
  return {
    title: `${track.artist} - ${track.title}`,
    url: yt.url,
    duration: track.duration,
    requestedBy,
    thumb: track.thumb,
  };
}

/* ─────────────────────────────────────────────
   STREAMING — InnerTube nativo sem login
   Estratégia:
     1. getInfo() → pega lista de formatos disponíveis
     2. Escolhe formato de áudio sem restrição de login
     3. Faz fetch direto da URL com os headers do InnerTube
     4. Passa o stream para o FFmpeg via StreamType.Arbitrary
───────────────────────────────────────────── */

const { Readable } = require("stream");

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
  } catch { /* ignorado */ }
  return null;
}

/**
 * Cria um AudioResource usando a InnerTube API do youtubei.js.
 *
 * Por que não usar yt.download() diretamente?
 *   Alguns formatos retornados pelo InnerTube são marcados como
 *   "login required" quando o cliente padrão é o WEB. Usar o
 *   cliente ANDROID ou IOS contorna isso porque o YouTube serve
 *   URLs de stream diretas nesses clientes sem exigir autenticação.
 *
 * @param {string} url
 * @returns {Promise<import("@discordjs/voice").AudioResource>}
 */
async function createYouTubeResource(url) {
  const videoId = extractYouTubeId(url);
  if (!videoId) throw new Error(`URL inválida: ${url}`);

  // Cria instância com cliente ANDROID — retorna URLs de stream sem login
  const yt = await Innertube.create({
    client_type: "ANDROID",          // contorna "login required"
    generate_session_locally: true,
    retrieve_player: true,
  });

  const info = await yt.getBasicInfo(videoId, "ANDROID");

  // Pega o melhor formato de áudio disponível (sem vídeo)
  const format = info.chooseFormat({
    type: "audio",
    quality: "best",
  });

  if (!format) throw new Error("Nenhum formato de áudio disponível.");

  // Decodifica a URL do stream (o InnerTube pode retornar URLs cifradas)
  const streamUrl = format.decipher(yt.session.player);

  // Faz fetch com headers adequados para não ser bloqueado
  const response = await fetch(streamUrl, {
    headers: {
      "User-Agent":
        "com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip",
      "Accept-Language": "en-US,en;q=0.9",
      Range: "bytes=0-",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Fetch do stream falhou: HTTP ${response.status}`);
  }

  // Converte Web ReadableStream → Node.js Readable
  const nodeStream = Readable.fromWeb(response.body);

  return createAudioResource(nodeStream, {
    inputType: StreamType.Arbitrary,
  });
}

/* ─────────────────────────────────────────────
   GERENCIAMENTO DE FILAS
───────────────────────────────────────────── */

/** @returns {GuildQueue} */
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

function destroyQueue(guildId) {
  const queue = queues.get(guildId);
  if (!queue) return;
  queue.destroyed = true;
  clearTimeout(queue.idleTimer);
  queue.player?.removeAllListeners();
  queue.player?.stop(true);
  queue.connection?.removeAllListeners();
  queue.connection?.destroy();
  queues.delete(guildId);
}

/* ─────────────────────────────────────────────
   CANAL AFK
───────────────────────────────────────────── */

function reconnectToAFK(guild) {
  const afkChannel = guild.channels.cache.get(AFK_CHANNEL_ID);
  if (!afkChannel) return;
  try {
    const existing = getVoiceConnection(guild.id);
    if (existing) existing.destroy();
    joinVoiceChannel({
      channelId: afkChannel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: true,
    });
    console.log("[Music] ✅ Reconectado no canal AFK.");
  } catch (err) {
    console.error("[Music] Erro ao reconectar AFK:", err.message);
  }
}

/* ─────────────────────────────────────────────
   PLAYER PRINCIPAL
───────────────────────────────────────────── */

/**
 * @param {import("discord.js").TextBasedChannel} channel
 * @param {import("discord.js").Guild} guild
 */
async function playSong(channel, guild) {
  const queue = queues.get(guild.id);
  if (!queue || queue.destroyed) return;

  if (queue.songs.length === 0) {
    queue.playing = false;
    clearTimeout(queue.idleTimer);
    queue.idleTimer = setTimeout(() => {
      const q = queues.get(guild.id);
      if (!q || q.songs.length === 0) {
        destroyQueue(guild.id);
        reconnectToAFK(guild);
      }
    }, IDLE_TIMEOUT_MS);
    return;
  }

  const song = queue.songs[0];
  queue.playing = true;

  // Remove listeners antigos (evita duplicação)
  queue.player.removeAllListeners(AudioPlayerStatus.Idle);
  queue.player.removeAllListeners("error");

  try {
    const resource = await createYouTubeResource(song.url);
    queue.player.play(resource);

    // Monta embed-like com thumbnail se disponível
    const thumbLine = song.thumb ? `\n🖼️ ${song.thumb}` : "";
    channel.send(
      `🎵 Tocando agora: **${song.title}** (${formatDuration(song.duration)})\n🔗 ${song.url}${thumbLine}`
    ).catch(() => {});

    queue.player.once(AudioPlayerStatus.Idle, () => {
      if (!queue.destroyed) {
        queue.songs.shift();
        playSong(channel, guild);
      }
    });

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
    setTimeout(() => playSong(channel, guild), 1_000);
  }
}

/* ─────────────────────────────────────────────
   FORMATAÇÃO
───────────────────────────────────────────── */

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

function parseDurationText(text) {
  if (!text) return 0;
  const parts = text.split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

/* ─────────────────────────────────────────────
   HANDLER DE COMANDOS
───────────────────────────────────────────── */

module.exports = (client) => {

  // Warm-up: inicializa Innertube e token do Spotify quando o bot ligar
  client.once("ready", async () => {
    try {
      await getInnertube();
      await getSpotifyToken();
      console.log("[Music] ✅ Innertube e Spotify prontos.");
    } catch (err) {
      console.error("[Music] ⚠️  Falha no warm-up:", err.message);
    }
  });

  client.on("messageCreate", async (message) => {
    if (!message.guild) return;
    if (message.author.bot) return;
    if (!message.content.startsWith("!")) return;

    const args = message.content.slice(1).trim().split(/\s+/);
    const command = args.shift().toLowerCase();
    const guildId = message.guild.id;

    /* ══════════════════════════════════════
       !p — Tocar / Adicionar à fila
       Aceita: nome, link Spotify (track/album/playlist)
    ══════════════════════════════════════ */
    if (command === "p") {
      const voiceChannel = message.member?.voice?.channel;
      if (!voiceChannel)
        return message.reply("❌ Entre em um canal de voz primeiro!");

      const query = args.join(" ").trim();
      if (!query)
        return message.reply(
          "❌ Informe o nome da música ou um link do Spotify.\nEx: `!p Blinding Lights` ou `!p https://open.spotify.com/track/...`"
        );

      const searching = await message.reply("🔍 Pesquisando no Spotify...");

      try {
        const songs = await resolveQuery(query, message.author.tag);

        if (!songs.length)
          return searching.edit("❌ Nenhum resultado encontrado.");

        const queue = getQueue(guildId);

        // Conecta ao canal de voz se necessário
        if (!queue.connection) {
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

          connection.on(VoiceConnectionStatus.Disconnected, async () => {
            if (queue.destroyed) return;
            try {
              await Promise.race([
                entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
              ]);
            } catch {
              console.warn("[Music] Conexão perdida, destruindo fila.");
              destroyQueue(guildId);
            }
          });

          connection.once(VoiceConnectionStatus.Destroyed, () => {
            if (!queue.destroyed) destroyQueue(guildId);
          });
        }

        // Adiciona à fila
        for (const song of songs) queue.songs.push(song);
        clearTimeout(queue.idleTimer);

        if (songs.length === 1) {
          if (queue.playing) {
            await searching.edit(
              `✅ **${songs[0].title}** (${formatDuration(songs[0].duration)}) adicionado à fila!\n📋 Posição: ${queue.songs.length}`
            );
          } else {
            await searching.edit("✅ Música encontrada! Iniciando...");
            playSong(message.channel, message.guild);
          }
        } else {
          // Álbum ou playlist
          const wasPlaying = queue.playing;
          if (!wasPlaying) playSong(message.channel, message.guild);
          await searching.edit(
            `✅ **${songs.length} músicas** adicionadas à fila!\n▶️ ${songs[0].title}${songs.length > 1 ? `\n...e mais ${songs.length - 1}` : ""}`
          );
        }

      } catch (err) {
        console.error("[Music] Erro no comando !p:", err);
        searching.edit("❌ Ocorreu um erro. Verifique as credenciais do Spotify no `.env`.").catch(() => {});
      }
    }

    /* ══════════════════════════════════════
       !skip — Pular música atual
    ══════════════════════════════════════ */
    else if (command === "skip") {
      const queue = queues.get(guildId);
      if (!queue?.playing)
        return message.reply("❌ Nenhuma música tocando no momento.");
      queue.player.stop();
      message.reply("⏭️ Música pulada!");
    }

    /* ══════════════════════════════════════
       !stop — Parar tudo
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

      const header = "📋 **Fila de músicas:**\n\n";
      const content = header + list;
      message.reply(content.length <= 2000 ? content : content.slice(0, 1970) + "\n*(lista truncada)*");
    }

    /* ══════════════════════════════════════
       !pause — Pausar
    ══════════════════════════════════════ */
    else if (command === "pause") {
      const queue = queues.get(guildId);
      if (!queue?.playing)
        return message.reply("❌ Nenhuma música tocando no momento.");
      const ok = queue.player.pause();
      message.reply(ok ? "⏸️ Pausado. Use `!resume` para continuar." : "❌ Não foi possível pausar.");
    }

    /* ══════════════════════════════════════
       !resume — Continuar
    ══════════════════════════════════════ */
    else if (command === "resume") {
      const queue = queues.get(guildId);
      if (!queue) return message.reply("❌ Nenhuma música na fila.");
      const ok = queue.player.unpause();
      message.reply(ok ? "▶️ Continuando!" : "❌ Não foi possível retomar.");
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
