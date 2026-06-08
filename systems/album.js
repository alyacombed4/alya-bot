// systems/album.js
// Sistema completo de figurinhas — dados salvos em systems/data.json
// Integrado ao padrão: module.exports = (client) => { ... }

'use strict';

const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const fs   = require('fs');
const path = require('path');

// ─── CONFIGURAÇÕES ─────────────────────────────────────────────────────────────
const PRECO_PACOTE    = parseInt(process.env.ECONOMIA_PRECO_PACOTE || '500');
const DATA_FILE       = path.join(__dirname, 'data.json'); // systems/data.json

// ─── RARIDADES ─────────────────────────────────────────────────────────────────
const RARIDADE_CONFIG = {
  comum:    { label: 'Comum',    chance: 55, cor: '#9e9e9e' },
  rara:     { label: 'Rara',     chance: 28, cor: '#2196f3' },
  epica:    { label: 'Épica',    chance: 12, cor: '#9c27b0' },
  lendaria: { label: 'Lendária', chance:  4, cor: '#ff9800' },
  cromada:  { label: 'Cromada',  chance:  1, cor: '#ffd700' },
};

const RARIDADE_EMOJI = {
  comum: '⚪', rara: '🔵', epica: '🟣', lendaria: '🟠', cromada: '⭐',
};

const PRECO_RARIDADE = {
  comum: 50, rara: 150, epica: 400, lendaria: 1000, cromada: 3000,
};

// ═══════════════════════════════════════════════════════════════════════════════
// BANCO DE DADOS JSON
// Estrutura de systems/data.json:
// {
//   "users": {
//     "<userId>": {
//       "colecao":  { "<figId>": <quantidade> },
//       "pacotes":  { "quantidade": N, "total_abertos": N },
//       "stats":    { "trocas_realizadas": N, "total_figurinhas": N },
//       "moedas":   N
//     }
//   },
//   "trocas": {
//     "<id>": { id, solicitante_id, receptor_id, figurinha_oferta_id, figurinha_pedido_id, status, criado_em }
//   },
//   "next_troca_id": 1,
//   "figurinhas": { "<id>": { id, nome, pais, posicao, overall, raridade, grupo, tipo, cor_primaria } }
// }
// ═══════════════════════════════════════════════════════════════════════════════

let _db = null;

function loadDB() {
  if (_db) return _db;
  if (fs.existsSync(DATA_FILE)) {
    try { _db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
    catch { _db = {}; }
  } else {
    _db = {};
  }
  if (!_db.users)         _db.users         = {};
  if (!_db.trocas)        _db.trocas        = {};
  if (!_db.next_troca_id) _db.next_troca_id = 1;
  if (!_db.figurinhas)    _db.figurinhas    = buildFigurinhas();
  return _db;
}

function saveDB() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(_db, null, 2), 'utf8');
}

// ─── GERADOR DO CATÁLOGO (980 figurinhas fixas geradas 1x e salvas no JSON) ───
function buildFigurinhas() {
  const PAISES = [
    'Brasil','Argentina','França','Alemanha','Espanha','Portugal','Inglaterra',
    'Itália','Holanda','Bélgica','Croácia','Uruguai','México','EUA','Japão',
    'Coreia do Sul','Austrália','Senegal','Marrocos','Gana','Camarões','Tunísia',
    'Equador','Qatar','Polônia','Dinamarca','Suíça','Sérvia','Gales','Irã',
    'Costa Rica','Arábia Saudita',
  ];
  const POSICOES = ['GOL','ZAG','LAD','LAE','VOL','MEC','MEI','ATA','PNT'];
  const GRUPOS   = ['A','B','C','D','E','F','G','H'];
  const NOMES = [
    'Neymar','Messi','Mbappé','Benzema','Cristiano Ronaldo','Modric','De Bruyne',
    'Salah','Lewandowski','Kane','Vinicius Jr','Raphinha','Richarlison','Alisson',
    'Marquinhos','Thiago Silva','Casemiro','Fred','Fabinho','Antony','Gabriel Jesus',
    'Pedri','Gavi','Busquets','Jordi Alba','Ter Stegen','Kimmich','Müller',
    'Gnabry','Werner','Havertz','Rüdiger','Neuer','Goretzka','Musiala',
    'Griezmann','Giroud','Hernandez','Varane','Lloris','Benzema','Tchouaméni',
    'Firmino','Militão','Éder Militão','Danilo','Alex Sandro','Paquetá',
    'Son','Ronaldo','Bruno Fernandes','Ruben Dias','Cancelo','Otávio',
  ];

  const out = {};
  const raridades = Object.keys(RARIDADE_CONFIG);
  const totalCh   = raridades.reduce((s, r) => s + RARIDADE_CONFIG[r].chance, 0);

  const pickRaridade = () => {
    let roll = Math.random() * totalCh;
    for (const r of raridades) {
      roll -= RARIDADE_CONFIG[r].chance;
      if (roll <= 0) return r;
    }
    return 'comum';
  };

  for (let id = 1; id <= 980; id++) {
    const raridade = pickRaridade();
    const baseName = NOMES[(id - 1) % NOMES.length];
    const nome     = id <= NOMES.length ? baseName : `${baseName} #${id}`;
    out[id] = {
      id,
      nome,
      pais:        PAISES[(id - 1) % PAISES.length],
      posicao:     POSICOES[(id - 1) % POSICOES.length],
      overall:
        raridade === 'cromada'  ? 95 + Math.floor(Math.random() * 5)  :
        raridade === 'lendaria' ? 88 + Math.floor(Math.random() * 7)  :
        raridade === 'epica'    ? 80 + Math.floor(Math.random() * 8)  :
        raridade === 'rara'     ? 70 + Math.floor(Math.random() * 10) :
                                  55 + Math.floor(Math.random() * 15),
      raridade,
      grupo:       GRUPOS[(id - 1) % GRUPOS.length],
      tipo:        id % 15 === 0 ? 'escudo' : id % 20 === 0 ? 'estadio' : 'jogador',
      cor_primaria: RARIDADE_CONFIG[raridade].cor,
    };
  }
  return out;
}

// ─── HELPERS DE USUÁRIO ───────────────────────────────────────────────────────
function ensureUser(userId) {
  const db = loadDB();
  if (!db.users[userId]) {
    db.users[userId] = {
      colecao: {},
      pacotes: { quantidade: 0, total_abertos: 0 },
      stats:   { trocas_realizadas: 0, total_figurinhas: 0 },
      moedas:  0,
    };
    saveDB();
  }
  return db.users[userId];
}

function getFigurinha(id) {
  return loadDB().figurinhas[id] || null;
}

function getAllFigurinhas() {
  return Object.values(loadDB().figurinhas);
}

function getUserFigurinha(userId, figId) {
  const u   = ensureUser(userId);
  const qtd = u.colecao[figId] || 0;
  return qtd > 0 ? { figurinha_id: figId, quantidade: qtd, raridade: getFigurinha(figId)?.raridade } : null;
}

function getColecaoUser(userId) {
  const u = ensureUser(userId);
  return Object.entries(u.colecao)
    .filter(([, q]) => q > 0)
    .map(([id, quantidade]) => {
      const fig = getFigurinha(parseInt(id));
      return { figurinha_id: parseInt(id), quantidade, raridade: fig?.raridade };
    });
}

function addFigurinhaToUser(userId, figId) {
  const db = loadDB();
  const u  = ensureUser(userId);
  u.colecao[figId]         = (u.colecao[figId] || 0) + 1;
  u.stats.total_figurinhas = (u.stats.total_figurinhas || 0) + 1;
  db.users[userId] = u;
  saveDB();
}

function removeFigurinhaUser(userId, figId) {
  const db = loadDB();
  const u  = ensureUser(userId);
  if ((u.colecao[figId] || 0) > 0) u.colecao[figId]--;
  if (u.colecao[figId] <= 0) delete u.colecao[figId];
  db.users[userId] = u;
  saveDB();
}

function getPacotesUser(userId) {
  return ensureUser(userId).pacotes;
}

function addPacotesUser(userId, qtd) {
  const db = loadDB();
  const u  = ensureUser(userId);
  u.pacotes.quantidade = (u.pacotes.quantidade || 0) + qtd;
  db.users[userId] = u;
  saveDB();
}

function getPercentualAlbum(userId) {
  const col    = getColecaoUser(userId);
  const unicas = col.length;
  const total  = Object.keys(loadDB().figurinhas).length;
  return { unicas, total, percentual: total ? ((unicas / total) * 100).toFixed(1) : '0.0' };
}

function getRanking() {
  const db = loadDB();
  return Object.entries(db.users)
    .map(([userId, u]) => {
      const col = Object.entries(u.colecao).filter(([, q]) => q > 0);
      return {
        user_id:           userId,
        figurinhas_unicas: col.length,
        cromadas:  col.filter(([id]) => db.figurinhas[id]?.raridade === 'cromada').length,
        lendarias: col.filter(([id]) => db.figurinhas[id]?.raridade === 'lendaria').length,
      };
    })
    .filter(r => r.figurinhas_unicas > 0)
    .sort((a, b) => b.figurinhas_unicas - a.figurinhas_unicas)
    .slice(0, 10);
}

// ─── ABRIR PACOTE ─────────────────────────────────────────────────────────────
function abrirPacote(userId) {
  const db = loadDB();
  const u  = ensureUser(userId);
  if (u.pacotes.quantidade <= 0) return null;

  u.pacotes.quantidade--;
  u.pacotes.total_abertos = (u.pacotes.total_abertos || 0) + 1;
  db.users[userId] = u;
  saveDB();

  const ids    = Object.keys(db.figurinhas);
  const raras  = ids.filter(id => ['rara','epica','lendaria','cromada'].includes(db.figurinhas[id].raridade));
  const totalCh = Object.values(RARIDADE_CONFIG).reduce((a, r) => a + r.chance, 0);
  const figurinhas = [];

  for (let i = 0; i < 7; i++) {
    let id;
    if (i === 0 && raras.length) {
      // Garante ao menos 1 rara ou melhor
      id = parseInt(raras[Math.floor(Math.random() * raras.length)]);
    } else {
      let roll = Math.random() * totalCh;
      let raridade = 'comum';
      for (const [r, cfg] of Object.entries(RARIDADE_CONFIG)) {
        roll -= cfg.chance;
        if (roll <= 0) { raridade = r; break; }
      }
      const pool = ids.filter(x => db.figurinhas[x].raridade === raridade);
      id = parseInt(pool.length ? pool[Math.floor(Math.random() * pool.length)] : ids[Math.floor(Math.random() * ids.length)]);
    }
    addFigurinhaToUser(userId, id);
    figurinhas.push(db.figurinhas[id]);
  }

  return figurinhas;
}

// ─── TROCAS ───────────────────────────────────────────────────────────────────
function criarTroca(solicitanteId, receptorId, figOfertaId, figPedidoId) {
  const db = loadDB();
  const id = db.next_troca_id++;
  db.trocas[id] = {
    id,
    solicitante_id:      solicitanteId,
    receptor_id:         receptorId,
    figurinha_oferta_id: figOfertaId,
    figurinha_pedido_id: figPedidoId,
    status:    'pendente',
    criado_em: new Date().toISOString(),
  };
  saveDB();
  return id;
}

function getTroca(id) {
  return loadDB().trocas[id] || null;
}

function atualizarTroca(id, status) {
  const db = loadDB();
  if (db.trocas[id]) { db.trocas[id].status = status; saveDB(); }
}

function executarTroca(trocaId) {
  const db    = loadDB();
  const troca = db.trocas[trocaId];
  if (!troca || troca.status !== 'pendente') return false;

  const colOferta = getUserFigurinha(troca.solicitante_id, troca.figurinha_oferta_id);
  const colPedido = getUserFigurinha(troca.receptor_id,    troca.figurinha_pedido_id);
  if (!colOferta || colOferta.quantidade < 1) return false;
  if (!colPedido || colPedido.quantidade < 1) return false;

  removeFigurinhaUser(troca.solicitante_id, troca.figurinha_oferta_id);
  addFigurinhaToUser(troca.receptor_id,    troca.figurinha_oferta_id);
  removeFigurinhaUser(troca.receptor_id,    troca.figurinha_pedido_id);
  addFigurinhaToUser(troca.solicitante_id, troca.figurinha_pedido_id);

  troca.status = 'aceita';
  db.users[troca.solicitante_id].stats.trocas_realizadas = (db.users[troca.solicitante_id].stats.trocas_realizadas || 0) + 1;
  db.users[troca.receptor_id   ].stats.trocas_realizadas = (db.users[troca.receptor_id   ].stats.trocas_realizadas || 0) + 1;
  saveDB();
  return true;
}

// ─── HELPERS DISCORD ─────────────────────────────────────────────────────────

function embed(titulo, desc, cor = '#e53935') {
  return new EmbedBuilder()
    .setTitle(titulo)
    .setDescription(desc)
    .setColor(cor)
    .setTimestamp()
    .setFooter({ text: '⚽ Álbum da Copa 2022' });
}

function isAdmin(message) {
  return message.member?.permissions.has('Administrator') ||
         message.member?.permissions.has('ManageGuild');
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT PADRÃO DO PROJETO: module.exports = (client) => { ... }
// ═══════════════════════════════════════════════════════════════════════════════
module.exports = (client) => {

  // Inicializa o DB ao carregar o módulo
  loadDB();
  console.log('✅ [Album] Sistema de figurinhas carregado. DB:', DATA_FILE);

  client.on('messageCreate', async (message) => {
    if (!message.guild || message.author.bot) return;

    const content = message.content.trim();
    if (!content.startsWith('!')) return;

    const args    = content.slice(1).split(/\s+/);
    const comando = args.shift().toLowerCase();

    // ── Comandos de usuário ──────────────────────────────────────────────────
    switch (comando) {

      // ─────────────────────────────────────────────────────────────────────
      case 'abrirpacote': {
        
        const userId = message.author.id;
        ensureUser(userId);

        if (getPacotesUser(userId).quantidade <= 0) {
          return message.reply({ embeds: [embed(
            '❌ Sem Pacotes!',
            'Você não tem pacotes!\n\n**Como conseguir:**\n• 🛒 `!comprarpacote`\n• 👑 Peça a um admin',
            '#c62828'
          )] });
        }

        const msg = await message.reply({ embeds: [embed('⏳ Abrindo pacote...', 'Gerando suas figurinhas...')] });
        try {
          const figurinhas = abrirPacote(userId);
          if (!figurinhas) return msg.edit({ embeds: [embed('❌ Erro', 'Não foi possível abrir o pacote.')] });

          const novas = figurinhas.filter(f => {
            const col = getUserFigurinha(userId, f.id);
            return col && col.quantidade === 1;
          });

          const destaques = figurinhas
            .filter(f => ['lendaria','cromada','epica'].includes(f.raridade))
            .map(f => `${RARIDADE_EMOJI[f.raridade]} **${f.nome}** (${f.pais}) — ${RARIDADE_CONFIG[f.raridade].label}`)
            .join('\n') || 'Nenhum destaque desta vez...';

          const pacotesRestantes = getPacotesUser(userId);

          const e = new EmbedBuilder()
            .setTitle('📦 Pacote Aberto!')
            .setDescription(`**Destaques:**\n${destaques}\n\n✨ **${novas.length} nova(s)** figurinha(s) adicionada(s)!`)
            .addFields(
              { name: '📦 Pacotes Restantes', value: String(pacotesRestantes.quantidade), inline: true },
              { name: '📊 Figurinhas Ganhas', value: String(figurinhas.length),           inline: true },
              { name: '🆕 Novas',             value: String(novas.length),                inline: true },
            )
            .setColor('#e53935')
            .setTimestamp()
            .setFooter({ text: '⚽ Álbum da Copa 2022 • Use !album para ver sua coleção' });

          // Lista das figurinhas ganhas
          const lista = figurinhas
            .map(f => `${RARIDADE_EMOJI[f.raridade]} **${f.nome}** (${f.pais}) — OVR ${f.overall} — ID \`#${f.id}\``)
            .join('\n');
          e.addFields({ name: '🎴 Figurinhas', value: lista, inline: false });

          await msg.edit({ embeds: [e] });
        } catch (err) {
          console.error('[Album] Erro abrirpacote:', err);
          await msg.edit({ embeds: [embed('❌ Erro interno', 'Ocorreu um erro ao gerar as figurinhas.')] });
        }
        break;
      }

      // ─────────────────────────────────────────────────────────────────────
      case 'figurinha': {
        
        const id = parseInt(args[0]);
        if (isNaN(id) || id < 1 || id > 980) {
          return message.reply({ embeds: [embed('❌ ID inválido', 'Use: `!figurinha <id>`\nEx: `!figurinha 42` (IDs: 1–980)')] });
        }

        const fig = getFigurinha(id);
        if (!fig) return message.reply({ embeds: [embed('❌ Não encontrada', `Figurinha #${id} não existe.`)] });

        const naColecao = getUserFigurinha(message.author.id, id);
        const cfg       = RARIDADE_CONFIG[fig.raridade] || RARIDADE_CONFIG.comum;

        const e = new EmbedBuilder()
          .setTitle(`${RARIDADE_EMOJI[fig.raridade]} ${fig.nome}`)
          .addFields(
            { name: '🌍 País',    value: fig.pais,                              inline: true },
            { name: '🎯 Posição', value: fig.posicao,                           inline: true },
            { name: '⭐ Overall', value: String(fig.overall),                   inline: true },
            { name: '💎 Raridade',value: cfg.label,                             inline: true },
            { name: '🏆 Grupo',   value: fig.grupo || 'N/A',                    inline: true },
            { name: '📁 Tipo',    value: (fig.tipo || 'jogador').toUpperCase(), inline: true },
            {
              name:  '📦 Na sua coleção',
              value: naColecao
                ? `✅ Você tem **${naColecao.quantidade}x** desta figurinha`
                : '❌ Você não tem esta figurinha',
              inline: false,
            },
          )
          .setColor(fig.cor_primaria || '#e53935')
          .setTimestamp()
          .setFooter({ text: `Figurinha #${String(id).padStart(4, '0')} • ⚽ Álbum da Copa 2022` });

        await message.reply({ embeds: [e] });
        break;
      }

      // ─────────────────────────────────────────────────────────────────────
      case 'colecao': {
        
        const userId = message.author.id;
        ensureUser(userId);

        const colecao = getColecaoUser(userId);
        if (colecao.length === 0) {
          return message.reply({ embeds: [embed('📂 Coleção Vazia', 'Você ainda não tem figurinhas!\nAbra pacotes com `!abrirpacote`')] });
        }

        const { unicas, total, percentual } = getPercentualAlbum(userId);
        const pagina       = Math.max(1, parseInt(args[0]) || 1);
        const itensPorPag  = 20;
        const allFigs      = getAllFigurinhas();
        const totalPaginas = Math.ceil(allFigs.length / itensPorPag);
        const colMap       = new Map(colecao.map(c => [c.figurinha_id, c]));

        const paginaFigs = allFigs
          .slice((pagina - 1) * itensPorPag, pagina * itensPorPag);

        const linhas = paginaFigs.map(f => {
          const tem = colMap.has(f.id);
          const qtd = tem ? ` (${colMap.get(f.id).quantidade}x)` : '';
          return `${tem ? RARIDADE_EMOJI[f.raridade] : '🔲'} \`#${String(f.id).padStart(4,'0')}\` ${tem ? `**${f.nome}**` : `~~${f.nome}~~`}${qtd}`;
        }).join('\n');

        const porRaridade = colecao.reduce((acc, f) => {
          acc[f.raridade] = (acc[f.raridade] || 0) + 1; return acc;
        }, {});
        const resumo = Object.entries(porRaridade).map(([r, n]) => `${RARIDADE_EMOJI[r]} ${n}`).join(' • ');

        const e = new EmbedBuilder()
          .setTitle(`📖 Coleção de ${message.author.username}`)
          .setDescription(`**Progresso:** ${unicas}/${total} únicas (${percentual}%)\n${resumo}\n\n${linhas}`)
          .addFields(
            { name: '📄 Página',        value: `${pagina}/${totalPaginas}`,                                        inline: true },
            { name: '📦 Total coletado', value: String(colecao.reduce((a, c) => a + c.quantidade, 0)),             inline: true },
            { name: '✅ Únicas',         value: String(unicas),                                                     inline: true },
          )
          .setColor('#e53935')
          .setFooter({ text: `Use !colecao <página> para navegar • Página ${pagina} de ${totalPaginas}` })
          .setTimestamp();

        await message.reply({ embeds: [e] });
        break;
      }

      // ─────────────────────────────────────────────────────────────────────
      case 'album': {
        
        const userId = message.author.id;
        ensureUser(userId);

        const { unicas, total, percentual } = getPercentualAlbum(userId);
        const pacotes  = getPacotesUser(userId);
        const stats    = loadDB().users[userId].stats || {};
        const colecao  = getColecaoUser(userId);
        const db       = loadDB();
        const moedas   = db.users[userId].moedas || 0;

        const porRaridade = { comum: 0, rara: 0, epica: 0, lendaria: 0, cromada: 0 };
        for (const { figurinha_id } of colecao) {
          const fig = db.figurinhas[figurinha_id];
          if (fig) porRaridade[fig.raridade] = (porRaridade[fig.raridade] || 0) + 1;
        }

        const barLen = 20;
        const filled = Math.round((unicas / total) * barLen);
        const barra  = '█'.repeat(filled) + '░'.repeat(barLen - filled);

        const e = new EmbedBuilder()
          .setTitle(`📖 Álbum de ${message.author.username}`)
          .setThumbnail(message.author.displayAvatarURL())
          .setDescription(`**Progresso Geral**\n\`[${barra}]\` ${percentual}%\n${unicas} de ${total} figurinhas únicas`)
          .addFields(
            { name: '⚪ Comuns',         value: String(porRaridade.comum),             inline: true },
            { name: '🔵 Raras',          value: String(porRaridade.rara),              inline: true },
            { name: '🟣 Épicas',         value: String(porRaridade.epica),             inline: true },
            { name: '🟠 Lendárias',      value: String(porRaridade.lendaria),          inline: true },
            { name: '⭐ Cromadas',        value: String(porRaridade.cromada),           inline: true },
            { name: '💰 Moedas',          value: String(moedas),                        inline: true },
            { name: '📦 Pacotes',         value: String(pacotes.quantidade),            inline: true },
            { name: '📦 Pacotes Abertos', value: String(pacotes.total_abertos || 0),   inline: true },
            { name: '🔄 Trocas',          value: String(stats.trocas_realizadas || 0), inline: true },
            { name: '📊 Total Coletado',  value: String(stats.total_figurinhas || 0),  inline: true },
          )
          .setColor('#e53935')
          .setTimestamp()
          .setFooter({ text: '⚽ Álbum da Copa 2022 • Use !colecao para ver suas figurinhas' });

        await message.reply({ embeds: [e] });
        break;
      }

      // ─────────────────────────────────────────────────────────────────────
      case 'trocar': {
        
        const receptor = message.mentions.users.first();
        if (!receptor) return message.reply({ embeds: [embed('❌', 'Uso: `!trocar @usuario <id_sua> <id_quer>`')] });
        if (receptor.id === message.author.id) return message.reply({ embeds: [embed('❌', 'Você não pode trocar consigo mesmo!')] });

        const idOferta = parseInt(args[1]);
        const idPedido = parseInt(args[2]);
        if (isNaN(idOferta) || isNaN(idPedido)) return message.reply({ embeds: [embed('❌', 'IDs inválidos.\nUso: `!trocar @usuario <id_oferta> <id_pedido>`')] });

        const figOferta = getFigurinha(idOferta);
        const figPedido = getFigurinha(idPedido);
        if (!figOferta || !figPedido) return message.reply({ embeds: [embed('❌', 'Uma das figurinhas não existe.')] });

        const colOferta = getUserFigurinha(message.author.id, idOferta);
        if (!colOferta || colOferta.quantidade < 1) return message.reply({ embeds: [embed('❌', `Você não tem **${figOferta.nome}** (ID: ${idOferta})!`)] });
        if (colOferta.quantidade < 2) return message.reply({ embeds: [embed('⚠️ Atenção', `Você só tem 1x **${figOferta.nome}**.\nSe quiser trocar mesmo assim, use \`!confirmartroca ${idOferta} ${idPedido} ${receptor.id}\``)] });

        const trocaId = criarTroca(message.author.id, receptor.id, idOferta, idPedido);

        const e = new EmbedBuilder()
          .setTitle('🔄 Proposta de Troca!')
          .setDescription(`${receptor}, você recebeu uma proposta de ${message.author}!\n\`!aceitartroca ${trocaId}\` para aceitar | \`!recusartroca ${trocaId}\` para recusar`)
          .addFields(
            { name: `📤 ${message.author.username} oferece`, value: `${RARIDADE_EMOJI[figOferta.raridade]} **${figOferta.nome}** (${figOferta.pais}) — OVR ${figOferta.overall}\nID: \`#${idOferta}\``, inline: true },
            { name: '📥 Quer receber',                       value: `${RARIDADE_EMOJI[figPedido.raridade]} **${figPedido.nome}** (${figPedido.pais}) — OVR ${figPedido.overall}\nID: \`#${idPedido}\``, inline: true },
            { name: '📋 ID da Troca', value: `\`#${trocaId}\``, inline: false },
          )
          .setColor('#ff9800')
          .setTimestamp();

        await message.reply({ content: `${receptor}`, embeds: [e] });
        break;
      }

      // ─────────────────────────────────────────────────────────────────────
      case 'aceitartroca': {
        
        const trocaId = parseInt(args[0]);
        if (isNaN(trocaId)) return message.reply({ embeds: [embed('❌', 'ID inválido.')] });

        const troca = getTroca(trocaId);
        if (!troca)                                  return message.reply({ embeds: [embed('❌', 'Troca não encontrada.')] });
        if (troca.receptor_id !== message.author.id) return message.reply({ embeds: [embed('❌', 'Essa troca não é para você!')] });
        if (troca.status !== 'pendente')             return message.reply({ embeds: [embed('❌', `Essa troca já foi ${troca.status}.`)] });

        const colPedido = getUserFigurinha(message.author.id, troca.figurinha_pedido_id);
        if (!colPedido || colPedido.quantidade < 1) return message.reply({ embeds: [embed('❌', 'Você não tem a figurinha pedida!')] });

        if (!executarTroca(trocaId)) return message.reply({ embeds: [embed('❌ Falha', 'A troca falhou. Verifique se ambas as figurinhas estão disponíveis.')] });

        const figOferta = getFigurinha(troca.figurinha_oferta_id);
        const figPedido = getFigurinha(troca.figurinha_pedido_id);

        await message.reply({ embeds: [embed(
          '✅ Troca Realizada!',
          `**Troca #${trocaId} concluída!**\n\n<@${troca.solicitante_id}> recebeu: ${RARIDADE_EMOJI[figPedido.raridade]} **${figPedido.nome}**\n<@${troca.receptor_id}> recebeu: ${RARIDADE_EMOJI[figOferta.raridade]} **${figOferta.nome}**`,
          '#4caf50'
        )] });
        break;
      }

      // ─────────────────────────────────────────────────────────────────────
      case 'recusartroca': {
        
        const trocaId = parseInt(args[0]);
        if (isNaN(trocaId)) return message.reply({ embeds: [embed('❌', 'ID inválido.')] });

        const troca = getTroca(trocaId);
        if (!troca) return message.reply({ embeds: [embed('❌', 'Troca não encontrada.')] });
        if (troca.receptor_id !== message.author.id && troca.solicitante_id !== message.author.id)
          return message.reply({ embeds: [embed('❌', 'Você não faz parte dessa troca!')] });
        if (troca.status !== 'pendente') return message.reply({ embeds: [embed('❌', `Essa troca já foi ${troca.status}.`)] });

        atualizarTroca(trocaId, 'recusada');
        await message.reply({ embeds: [embed('❌ Troca Recusada', `A troca #${trocaId} foi cancelada.`, '#f44336')] });
        break;
      }

      // ─────────────────────────────────────────────────────────────────────
      case 'darfigurinha': {
        
        const receptor = message.mentions.users.first();
        if (!receptor)                          return message.reply({ embeds: [embed('❌', 'Uso: `!darfigurinha @usuario <id>`')] });
        if (receptor.id === message.author.id)  return message.reply({ embeds: [embed('❌', 'Você não pode dar para si mesmo!')] });

        const id  = parseInt(args[1]);
        if (isNaN(id)) return message.reply({ embeds: [embed('❌', 'ID inválido.')] });

        const fig = getFigurinha(id);
        if (!fig) return message.reply({ embeds: [embed('❌', 'Figurinha não encontrada.')] });

        const col = getUserFigurinha(message.author.id, id);
        if (!col || col.quantidade < 1)  return message.reply({ embeds: [embed('❌', `Você não tem **${fig.nome}**!`)] });
        if (col.quantidade < 2)          return message.reply({ embeds: [embed('⚠️', 'Você só tem 1x desta figurinha. Use `!trocar` para uma troca oficial.')] });

        removeFigurinhaUser(message.author.id, id);
        addFigurinhaToUser(receptor.id, id);

        await message.reply({ embeds: [embed('🎁 Figurinha Enviada!', `${message.author} deu ${RARIDADE_EMOJI[fig.raridade]} **${fig.nome}** para ${receptor}!`, '#4caf50')] });
        break;
      }

      // ─────────────────────────────────────────────────────────────────────
      case 'venderfigurinha': {
        
        const id  = parseInt(args[0]);
        const qtd = parseInt(args[1]) || 1;
        if (isNaN(id)) return message.reply({ embeds: [embed('❌', 'Uso: `!venderfigurinha <id> [quantidade]`')] });

        const fig = getFigurinha(id);
        if (!fig) return message.reply({ embeds: [embed('❌', 'Figurinha não encontrada.')] });

        const col = getUserFigurinha(message.author.id, id);
        if (!col || col.quantidade < qtd + 1)
          return message.reply({ embeds: [embed('❌', `Você precisa ter pelo menos ${qtd + 1}x para vender ${qtd}x (mantendo 1 cópia).`)] });

        const preco = (PRECO_RARIDADE[fig.raridade] || 50) * qtd;
        for (let i = 0; i < qtd; i++) removeFigurinhaUser(message.author.id, id);

        const db = loadDB();
        db.users[message.author.id].moedas = (db.users[message.author.id].moedas || 0) + preco;
        saveDB();

        await message.reply({ embeds: [embed('💰 Vendido!', `Você vendeu **${qtd}x ${fig.nome}** por **${preco} moedas**!\n💰 Saldo: **${db.users[message.author.id].moedas} moedas**`, '#ffc107')] });
        break;
      }

      // ─────────────────────────────────────────────────────────────────────
      case 'comprarpacote': {
        
        const qtd   = Math.min(parseInt(args[0]) || 1, 10);
        const total = PRECO_PACOTE * qtd;
        const userId = message.author.id;
        ensureUser(userId);

        const db     = loadDB();
        const moedas = db.users[userId].moedas || 0;

        if (moedas < total) {
          return message.reply({ embeds: [embed('❌ Moedas insuficientes',
            `Você tem **${moedas} moedas** e precisa de **${total} moedas**.\n\nVenda figurinhas repetidas com \`!venderfigurinha\` para ganhar moedas!`
          )] });
        }

        db.users[userId].moedas -= total;
        saveDB();
        addPacotesUser(userId, qtd);

        await message.reply({ embeds: [embed('🛒 Comprado!', `Você comprou **${qtd}x pacote(s)** por **${total} moedas**!\n💰 Saldo: **${db.users[userId].moedas} moedas**\n\nUse \`!abrirpacote\`!`, '#4caf50')] });
        break;
      }

      // ─────────────────────────────────────────────────────────────────────
      case 'rankingalbum': {
        
        const ranking = getRanking();
        if (ranking.length === 0) return message.reply({ embeds: [embed('🏆 Ranking', 'Ninguém tem figurinhas ainda!')] });

        const medals = ['🥇','🥈','🥉'];
        const total  = getAllFigurinhas().length;
        let desc = '';

        for (let i = 0; i < ranking.length; i++) {
          const r     = ranking[i];
          const medal = medals[i] || `**${i + 1}.**`;
          const pct   = ((r.figurinhas_unicas / total) * 100).toFixed(1);
          try {
            const user = await message.client.users.fetch(r.user_id);
            desc += `${medal} **${user.username}** — ${r.figurinhas_unicas}/${total} únicas (${pct}%) | ⭐${r.cromadas} cromadas | 🟠${r.lendarias} lendárias\n`;
          } catch {
            desc += `${medal} \`${r.user_id}\` — ${r.figurinhas_unicas} únicas (${pct}%)\n`;
          }
        }

        const e = new EmbedBuilder()
          .setTitle('🏆 Ranking do Álbum da Copa')
          .setDescription(desc)
          .setColor('#ffd700')
          .setTimestamp()
          .setFooter({ text: '⚽ Álbum da Copa 2022 • Top 10 colecionadores' });

        await message.reply({ embeds: [e] });
        break;
      }

      // ─────────────────────────────────────────────────────────────────────
      case 'datac': {
        
        if (!isAdmin(message)) return message.reply({ embeds: [embed('❌ Sem Permissão', 'Somente administradores podem baixar o banco de dados!')] });

        try {
          const dbSnapshot  = loadDB();
          const jsonContent = JSON.stringify(dbSnapshot, null, 2);
          const buffer      = Buffer.from(jsonContent, 'utf8');
          const timestamp   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const attachment  = new AttachmentBuilder(buffer, { name: `data_backup_${timestamp}.json` });

          const info = `📦 **Backup — ${new Date().toLocaleString('pt-BR')}**\n\n` +
                       `• **Usuários:** ${Object.keys(dbSnapshot.users).length}\n` +
                       `• **Trocas:** ${Object.keys(dbSnapshot.trocas).length}\n` +
                       `• **Figurinhas no catálogo:** ${Object.keys(dbSnapshot.figurinhas).length}\n\n` +
                       `⚠️ Guarde este arquivo em local seguro!`;

          try {
            await message.author.send({ content: info, files: [attachment] });
            await message.reply({ embeds: [embed('✅ Enviado!', `\`data.json\` enviado na sua DM! 📬`, '#4caf50')] });
          } catch {
            // DM bloqueada — envia no canal
            await message.reply({ content: '⚠️ Suas DMs estão fechadas. Enviando aqui:', files: [attachment] });
          }
        } catch (err) {
          console.error('[Album] Erro datac:', err);
          await message.reply({ embeds: [embed('❌ Erro', 'Ocorreu um erro ao gerar o backup.')] });
        }
        break;
      }

      // ─────────────────────────────────────────────────────────────────────
      case 'ajuda':
      case 'helpalbum': {
        

        const e = new EmbedBuilder()
          .setTitle('⚽ Álbum da Copa 2022 — Comandos')
          .addFields(
            {
              name: '📦 Pacotes',
              value: [
                '`!abrirpacote` — Abrir 1 pacote (7 figurinhas)',
                '`!comprarpacote [qtd]` — Comprar pacotes com moedas (máx. 10)',
              ].join('\n'),
            },
            {
              name: '📖 Álbum & Coleção',
              value: [
                '`!album` — Ver seu álbum e estatísticas',
                '`!colecao [página]` — Ver sua coleção (20 por página)',
                '`!figurinha <id>` — Ver detalhes de uma figurinha',
                '`!rankingalbum` — Top 10 colecionadores',
              ].join('\n'),
            },
            {
              name: '🔄 Trocas & Doações',
              value: [
                '`!trocar @user <id_sua> <id_quer>` — Propor troca',
                '`!aceitartroca <id>` — Aceitar proposta',
                '`!recusartroca <id>` — Recusar/cancelar proposta',
                '`!darfigurinha @user <id>` — Dar figurinha (precisa 2+ cópias)',
                '`!venderfigurinha <id> [qtd]` — Vender repetidas por moedas',
              ].join('\n'),
            },
            {
              name: '👑 Admin',
              value: [
                '`!addpacotes @user <qtd>` — Dar pacotes',
                '`!darfigurinhaadm @user <id>` — Dar figurinha',
                '`!addmoedas @user <qtd>` — Dar moedas',
                '`!resetalbum @user` — Resetar álbum',
                '`!datac` — Download do banco de dados (DM)',
              ].join('\n'),
            },
            {
              name: '🌟 Raridades',
              value: '⚪ Comum (55%) • 🔵 Rara (28%) • 🟣 Épica (12%) • 🟠 Lendária (4%) • ⭐ Cromada (1%)',
            },
            {
              name: '💰 Economia',
              value: [
                `1 pacote = ${PRECO_PACOTE} moedas`,
                'Venda figurinhas repetidas para ganhar moedas',
                'Preços: ⚪50 • 🔵150 • 🟣400 • 🟠1000 • ⭐3000 por figurinha',
              ].join('\n'),
            },
          )
          .setColor('#e53935')
          .setTimestamp()
          .setFooter({ text: '980 figurinhas para colecionar!' });

        await message.reply({ embeds: [e] });
        break;
      }

      // ── Comandos admin ────────────────────────────────────────────────────
      case 'addpacotes': {
        if (!isAdmin(message)) return message.reply({ embeds: [embed('❌', 'Sem permissão!')] });
        const target = message.mentions.users.first();
        const qtd    = parseInt(args[1]) || 1;
        if (!target) return message.reply({ embeds: [embed('❌', 'Uso: `!addpacotes @usuario <qtd>`')] });
        addPacotesUser(target.id, qtd);
        await message.reply({ embeds: [embed('✅', `**${qtd}x pacote(s)** adicionado(s) para ${target}!`, '#4caf50')] });
        break;
      }

      case 'darfigurinhaadm': {
        if (!isAdmin(message)) return message.reply({ embeds: [embed('❌', 'Sem permissão!')] });
        const target = message.mentions.users.first();
        const id     = parseInt(args[1]);
        if (!target || isNaN(id)) return message.reply({ embeds: [embed('❌', 'Uso: `!darfigurinhaadm @usuario <id>`')] });
        const fig = getFigurinha(id);
        if (!fig) return message.reply({ embeds: [embed('❌', 'Figurinha não encontrada.')] });
        addFigurinhaToUser(target.id, id);
        await message.reply({ embeds: [embed('✅', `${RARIDADE_EMOJI[fig.raridade]} **${fig.nome}** adicionada para ${target}!`, '#4caf50')] });
        break;
      }

      case 'addmoedas': {
        if (!isAdmin(message)) return message.reply({ embeds: [embed('❌', 'Sem permissão!')] });
        const target = message.mentions.users.first();
        const qtd    = parseInt(args[1]) || 0;
        if (!target || qtd <= 0) return message.reply({ embeds: [embed('❌', 'Uso: `!addmoedas @usuario <quantidade>`')] });
        const db = loadDB();
        ensureUser(target.id);
        db.users[target.id].moedas = (db.users[target.id].moedas || 0) + qtd;
        saveDB();
        await message.reply({ embeds: [embed('✅', `**${qtd} moedas** adicionadas para ${target}!\n💰 Saldo: **${db.users[target.id].moedas} moedas**`, '#4caf50')] });
        break;
      }

      case 'resetalbum': {
        if (!isAdmin(message)) return message.reply({ embeds: [embed('❌', 'Sem permissão!')] });
        const target = message.mentions.users.first();
        if (!target) return message.reply({ embeds: [embed('❌', 'Mencione um usuário.')] });
        const db = loadDB();
        db.users[target.id] = {
          colecao: {},
          pacotes: { quantidade: 0, total_abertos: 0 },
          stats:   { trocas_realizadas: 0, total_figurinhas: 0 },
          moedas:  0,
        };
        saveDB();
        await message.reply({ embeds: [embed('✅', `Álbum de ${target} resetado!`, '#4caf50')] });
        break;
      }

      default:
        break;
    }
  });

};
