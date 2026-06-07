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

const AFK_CHANNEL_ID  = "1476321416470335659";
const IDLE_TIMEOUT_MS = 30_000;

const SPOTIFY_CLIENT_ID     = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

const queues = new Map();

let _innertube = null;

async function getInnertube() {
  if (!_innertube) {
    _innertube = await Innertube.create({ generate_session_locally: true });
  }
  return _innertube;
}

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
  _spotifyTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;

  return _spotifyToken;
}

function parseSpotifyUrl(url) {
  const match = url.match(/spotify\.com\/(track|album|playlist)\/([A-Za-z0-9]+)/);
  if (!match) return null;
  return { type: match[1], id: match[2] };
}

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

async function getSpotifyAlbumTracks(albumId) {
  const token = await getSpotifyToken();

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

async function findOnYouTube(artist, title, expectedDuration) {
  const yt = await getInnertube();
  const query = `${artist} - ${title} official audio`;

  try {
    const results = await yt.search(query, { type: "video" });
    const videos = results.videos ?? [];

    if (videos.length === 0) return null;

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

async function resolveQuery(query, requestedBy) {
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

  // Link direto do YouTube
  if (query.includes("youtube.com/watch") || query.includes("youtu.be/")) {
    const yt = await getInnertube();
    try {
      const videoId = extractYouTubeId(query);
      if (!videoId) return [];
      const info = await yt.getInfo(videoId);
      const details = info.basic_info;
      return [{
        title: details.title ?? "Título desconhecido",
        url: query,
        duration: details.duration ?? 0,
        requestedBy,
        thumb: details.thumbnail?.[0]?.url ?? null,
      }];
    } catch {
      return [];
    }
  }

  const spotifyTrack = await searchSpotify(query);

  if (spotifyTrack) {
    const song = await buildSong(spotifyTrack, requestedBy);
    return song ? [song] : [];
  }

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

function extractYouTubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1);
    if (u.hostname.includes("youtube.com")) return u.searchParams.get("v");
  } catch { /* ignorado */ }
  return null;
}

async function createYouTubeResource(url) {
  const stream = ytdl(url, {
    filter: "audioonly",
    quality: "highestaudio",
    highWaterMark: 1 << 25,
  });

  const resource = createAudioResource(stream, {
    inputType: StreamType.Arbitrary,
  });

  const cleanup = () => {};

  return { resource, cleanup };
}

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
  try {
    queue.connection?.destroy();
  } catch { /* já destruída */ }
  queues.delete(guildId);
}

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

  queue.player.removeAllListeners(AudioPlayerStatus.Idle);
  queue.player.removeAllListeners("error");

  try {
    channel.send(`⬇️ Baixando: **${song.title}**...`).catch(() => {});

    const { resource, cleanup } = await createYouTubeResource(song.url);

    queue.player.play(resource);

    const thumbLine = song.thumb ? `\n🖼️ ${song.thumb}` : "";
    channel.send(
      `🎵 Tocando agora: **${song.title}** (${formatDuration(song.duration)})\n🔗 ${song.url}${thumbLine}`
    ).catch(() => {});

    queue.player.once(AudioPlayerStatus.Idle, () => {
      cleanup();
      if (!queue.destroyed) {
        queue.songs.shift();
        playSong(channel, guild);
      }
    });

    queue.player.once("error", (err) => {
      console.error("[Music] Erro no player:", err.message);
      cleanup();
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

module.exports = (client) => {

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

    if (command === "p") {
      const voiceChannel = message.member?.voice?.channel;
      if (!voiceChannel)
        return message.reply("❌ Entre em um canal de voz primeiro!");

      const query = args.join(" ").trim();
      if (!query)
        return message.reply(
          "❌ Informe o nome da música ou um link do Spotify/YouTube.\nEx: `!p Blinding Lights` ou `!p https://open.spotify.com/track/...`"
        );

      const searching = await message.reply("🔍 Pesquisando...");

      try {
        const songs = await resolveQuery(query, message.author.tag);

        if (!songs.length)
          return searching.edit("❌ Nenhum resultado encontrado.");

        const queue = getQueue(guildId);

        if (!queue.connection) {
          const existing = getVoiceConnection(guildId);
          if (existing) {
            try { existing.destroy(); } catch { /* ignorado */ }
          }

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

        for (const song of songs) queue.songs.push(song);
        clearTimeout(queue.idleTimer);

        if (songs.length === 1) {
          if (queue.playing) {
            await searching.edit(
              `✅ **${songs[0].title}** (${formatDuration(songs[0].duration)}) adicionado à fila!\n📋 Posição: ${queue.songs.length}`
            );
          } else {
            await searching.edit("✅ Música encontrada! Iniciando download...");
            playSong(message.channel, message.guild);
          }
        } else {
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

    else if (command === "skip") {
      const queue = queues.get(guildId);
      if (!queue?.playing)
        return message.reply("❌ Nenhuma música tocando no momento.");
      queue.player.stop();
      message.reply("⏭️ Música pulada!");
    }

    else if (command === "stop") {
      const queue = queues.get(guildId);
      if (!queue?.connection)
        return message.reply("❌ O bot não está em nenhum canal de voz.");
      destroyQueue(guildId);
      message.reply("⏹️ Música parada e fila limpa!");
      reconnectToAFK(message.guild);
    }

    else if (command === "queue" || command === "q") {
      const queue = queues.get(guildId);
      if (!queue?.songs?.length)
        return message.reply("📋 A fila está vazia.");

      const list = queue.songs
        .map((s, i) =>
          `${i === 0 ? "▶️" : `\`${i}.\``} **${s.title}** (${formatDuration(s.duration)}) — ${s.requestedBy}`
        )
        .join("\n");

      const content = "📋 **Fila de músicas:**\n\n" + list;
      message.reply(content.length <= 2000 ? content : content.slice(0, 1970) + "\n*(lista truncada)*");
    }

    else if (command === "pause") {
      const queue = queues.get(guildId);
      if (!queue?.playing)
        return message.reply("❌ Nenhuma música tocando no momento.");
      const ok = queue.player.pause();
      message.reply(ok ? "⏸️ Pausado. Use `!resume` para continuar." : "❌ Não foi possível pausar.");
    }

    else if (command === "resume") {
      const queue = queues.get(guildId);
      if (!queue) return message.reply("❌ Nenhuma música na fila.");
      const ok = queue.player.unpause();
      message.reply(ok ? "▶️ Continuando!" : "❌ Não foi possível retomar.");
    }

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
