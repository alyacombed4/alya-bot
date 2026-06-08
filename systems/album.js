// systems/album.js
// Álbum da Copa do Mundo 2026 — jogadores reais convocados
// Dados salvos em systems/data.json
// Padrão: module.exports = (client) => { ... }

'use strict';

const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const fs   = require('fs');
const path = require('path');

// ─── CONFIGURAÇÕES ─────────────────────────────────────────────────────────────
const PRECO_PACOTE = parseInt(process.env.ECONOMIA_PRECO_PACOTE || '500');
const DATA_FILE    = path.join(__dirname, 'data.json');

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
// ELENCOS REAIS — Copa do Mundo 2026
// Formato: { nome, pais, posicao, overall, raridade }
// raridade definida pela importância real do jogador
// ═══════════════════════════════════════════════════════════════════════════════
const ELENCOS = [
  // ── BRASIL ──────────────────────────────────────────────────────────────────
  { nome:'Alisson',          pais:'Brasil', posicao:'GOL', overall:92, raridade:'lendaria' },
  { nome:'Ederson',          pais:'Brasil', posicao:'GOL', overall:87, raridade:'epica' },
  { nome:'Weverton',         pais:'Brasil', posicao:'GOL', overall:80, raridade:'rara' },
  { nome:'Marquinhos',       pais:'Brasil', posicao:'ZAG', overall:89, raridade:'epica' },
  { nome:'Gabriel Magalhães',pais:'Brasil', posicao:'ZAG', overall:86, raridade:'epica' },
  { nome:'Bremer',           pais:'Brasil', posicao:'ZAG', overall:84, raridade:'rara' },
  { nome:'Léo Pereira',      pais:'Brasil', posicao:'ZAG', overall:81, raridade:'rara' },
  { nome:'Danilo',           pais:'Brasil', posicao:'LAD', overall:82, raridade:'rara' },
  { nome:'Wesley',           pais:'Brasil', posicao:'LAD', overall:78, raridade:'comum' },
  { nome:'Alex Sandro',      pais:'Brasil', posicao:'LAE', overall:80, raridade:'rara' },
  { nome:'Douglas Santos',   pais:'Brasil', posicao:'LAE', overall:77, raridade:'comum' },
  { nome:'Ibañez',           pais:'Brasil', posicao:'ZAG', overall:79, raridade:'comum' },
  { nome:'Casemiro',         pais:'Brasil', posicao:'VOL', overall:88, raridade:'epica' },
  { nome:'Bruno Guimarães',  pais:'Brasil', posicao:'VOL', overall:87, raridade:'epica' },
  { nome:'Lucas Paquetá',    pais:'Brasil', posicao:'MEI', overall:86, raridade:'epica' },
  { nome:'Fabinho',          pais:'Brasil', posicao:'VOL', overall:84, raridade:'rara' },
  { nome:'Danilo Santos',    pais:'Brasil', posicao:'VOL', overall:78, raridade:'comum' },
  { nome:'Vini Jr.',         pais:'Brasil', posicao:'ATA', overall:95, raridade:'cromada' },
  { nome:'Neymar',           pais:'Brasil', posicao:'ATA', overall:92, raridade:'cromada' },
  { nome:'Raphinha',         pais:'Brasil', posicao:'ATA', overall:88, raridade:'epica' },
  { nome:'Endrick',          pais:'Brasil', posicao:'ATA', overall:83, raridade:'rara' },
  { nome:'Gabriel Martinelli',pais:'Brasil',posicao:'ATA', overall:84, raridade:'rara' },
  { nome:'Matheus Cunha',    pais:'Brasil', posicao:'ATA', overall:82, raridade:'rara' },
  { nome:'Luiz Henrique',    pais:'Brasil', posicao:'ATA', overall:79, raridade:'comum' },
  { nome:'Igor Thiago',      pais:'Brasil', posicao:'ATA', overall:78, raridade:'comum' },
  { nome:'Rayan',            pais:'Brasil', posicao:'ATA', overall:76, raridade:'comum' },

  // ── ARGENTINA ───────────────────────────────────────────────────────────────
  { nome:'Messi',            pais:'Argentina', posicao:'ATA', overall:98, raridade:'cromada' },
  { nome:'Di María',         pais:'Argentina', posicao:'ATA', overall:87, raridade:'epica' },
  { nome:'Flaco López',      pais:'Argentina', posicao:'ATA', overall:83, raridade:'rara' },
  { nome:'Lautaro Martínez', pais:'Argentina', posicao:'ATA', overall:88, raridade:'epica' },
  { nome:'Álvarez',          pais:'Argentina', posicao:'ATA', overall:84, raridade:'rara' },
  { nome:'De Paul',          pais:'Argentina', posicao:'MEI', overall:86, raridade:'epica' },
  { nome:'Mac Allister',     pais:'Argentina', posicao:'MEI', overall:85, raridade:'epica' },
  { nome:'Enzo Fernández',   pais:'Argentina', posicao:'MEI', overall:84, raridade:'rara' },
  { nome:'Molina',           pais:'Argentina', posicao:'LAD', overall:82, raridade:'rara' },
  { nome:'Tagliafico',       pais:'Argentina', posicao:'LAE', overall:81, raridade:'rara' },
  { nome:'Romero',           pais:'Argentina', posicao:'ZAG', overall:85, raridade:'epica' },
  { nome:'Otamendi',         pais:'Argentina', posicao:'ZAG', overall:83, raridade:'rara' },
  { nome:'Dibu Martínez',    pais:'Argentina', posicao:'GOL', overall:90, raridade:'lendaria' },
  { nome:'Dybala',           pais:'Argentina', posicao:'ATA', overall:86, raridade:'epica' },

  // ── FRANÇA ──────────────────────────────────────────────────────────────────
  { nome:'Mbappé',           pais:'França', posicao:'ATA', overall:96, raridade:'cromada' },
  { nome:'Griezmann',        pais:'França', posicao:'ATA', overall:88, raridade:'epica' },
  { nome:'Giroud',           pais:'França', posicao:'ATA', overall:83, raridade:'rara' },
  { nome:'Zaire-Emery',      pais:'França', posicao:'MEI', overall:82, raridade:'rara' },
  { nome:'Tchouaméni',       pais:'França', posicao:'VOL', overall:85, raridade:'epica' },
  { nome:'Camavinga',        pais:'França', posicao:'MEI', overall:84, raridade:'rara' },
  { nome:'Hernandez',        pais:'França', posicao:'LAE', overall:85, raridade:'epica' },
  { nome:'Varane',           pais:'França', posicao:'ZAG', overall:84, raridade:'rara' },
  { nome:'Lloris',           pais:'França', posicao:'GOL', overall:86, raridade:'epica' },
  { nome:'Saliba',           pais:'França', posicao:'ZAG', overall:87, raridade:'epica' },
  { nome:'Dembélé',          pais:'França', posicao:'ATA', overall:86, raridade:'epica' },

  // ── PORTUGAL ────────────────────────────────────────────────────────────────
  { nome:'Cristiano Ronaldo',pais:'Portugal', posicao:'ATA', overall:92, raridade:'cromada' },
  { nome:'Bruno Fernandes',  pais:'Portugal', posicao:'MEI', overall:88, raridade:'epica' },
  { nome:'Bernardo Silva',   pais:'Portugal', posicao:'MEI', overall:87, raridade:'epica' },
  { nome:'Ruben Dias',       pais:'Portugal', posicao:'ZAG', overall:88, raridade:'epica' },
  { nome:'Cancelo',          pais:'Portugal', posicao:'LAD', overall:85, raridade:'epica' },
  { nome:'Otávio',           pais:'Portugal', posicao:'MEI', overall:82, raridade:'rara' },
  { nome:'Rafael Leão',      pais:'Portugal', posicao:'ATA', overall:86, raridade:'epica' },
  { nome:'Diogo Jota',       pais:'Portugal', posicao:'ATA', overall:84, raridade:'rara' },
  { nome:'Rui Patrício',     pais:'Portugal', posicao:'GOL', overall:84, raridade:'rara' },

  // ── ESPANHA ─────────────────────────────────────────────────────────────────
  { nome:'Pedri',            pais:'Espanha', posicao:'MEI', overall:88, raridade:'epica' },
  { nome:'Gavi',             pais:'Espanha', posicao:'MEI', overall:87, raridade:'epica' },
  { nome:'Yamal',            pais:'Espanha', posicao:'ATA', overall:89, raridade:'epica' },
  { nome:'Morata',           pais:'Espanha', posicao:'ATA', overall:83, raridade:'rara' },
  { nome:'Nico Williams',    pais:'Espanha', posicao:'ATA', overall:85, raridade:'epica' },
  { nome:'Busquets',         pais:'Espanha', posicao:'VOL', overall:84, raridade:'rara' },
  { nome:'Rodri',            pais:'Espanha', posicao:'VOL', overall:91, raridade:'lendaria' },
  { nome:'Ter Stegen',       pais:'Espanha', posicao:'GOL', overall:87, raridade:'epica' },
  { nome:'Carvajal',         pais:'Espanha', posicao:'LAD', overall:85, raridade:'epica' },
  { nome:'Le Normand',       pais:'Espanha', posicao:'ZAG', overall:84, raridade:'rara' },

  // ── ALEMANHA ────────────────────────────────────────────────────────────────
  { nome:'Wirtz',            pais:'Alemanha', posicao:'MEI', overall:88, raridade:'epica' },
  { nome:'Musiala',          pais:'Alemanha', posicao:'MEI', overall:87, raridade:'epica' },
  { nome:'Havertz',          pais:'Alemanha', posicao:'ATA', overall:86, raridade:'epica' },
  { nome:'Kimmich',          pais:'Alemanha', posicao:'VOL', overall:88, raridade:'epica' },
  { nome:'Goretzka',         pais:'Alemanha', posicao:'MEI', overall:84, raridade:'rara' },
  { nome:'Neuer',            pais:'Alemanha', posicao:'GOL', overall:86, raridade:'epica' },
  { nome:'Rüdiger',          pais:'Alemanha', posicao:'ZAG', overall:86, raridade:'epica' },
  { nome:'Gnabry',           pais:'Alemanha', posicao:'ATA', overall:83, raridade:'rara' },
  { nome:'Sané',             pais:'Alemanha', posicao:'ATA', overall:84, raridade:'rara' },
  { nome:'Pavlovic',         pais:'Alemanha', posicao:'VOL', overall:82, raridade:'rara' },

  // ── ENGLAND ─────────────────────────────────────────────────────────────────
  { nome:'Bellingham',       pais:'Inglaterra', posicao:'MEI', overall:91, raridade:'lendaria' },
  { nome:'Kane',             pais:'Inglaterra', posicao:'ATA', overall:91, raridade:'lendaria' },
  { nome:'Saka',             pais:'Inglaterra', posicao:'ATA', overall:88, raridade:'epica' },
  { nome:'Foden',            pais:'Inglaterra', posicao:'MEI', overall:88, raridade:'epica' },
  { nome:'Rashford',         pais:'Inglaterra', posicao:'ATA', overall:84, raridade:'rara' },
  { nome:'Pickford',         pais:'Inglaterra', posicao:'GOL', overall:84, raridade:'rara' },
  { nome:'Walker',           pais:'Inglaterra', posicao:'LAD', overall:83, raridade:'rara' },
  { nome:'Stones',           pais:'Inglaterra', posicao:'ZAG', overall:84, raridade:'rara' },
  { nome:'Maguire',          pais:'Inglaterra', posicao:'ZAG', overall:82, raridade:'rara' },
  { nome:'Alexander-Arnold', pais:'Inglaterra', posicao:'LAD', overall:87, raridade:'epica' },
  { nome:'Rice',             pais:'Inglaterra', posicao:'VOL', overall:88, raridade:'epica' },

  // ── HOLANDA ─────────────────────────────────────────────────────────────────
  { nome:'Van Dijk',         pais:'Holanda', posicao:'ZAG', overall:89, raridade:'epica' },
  { nome:'De Jong',          pais:'Holanda', posicao:'MEI', overall:87, raridade:'epica' },
  { nome:'Gakpo',            pais:'Holanda', posicao:'ATA', overall:85, raridade:'epica' },
  { nome:'Depay',            pais:'Holanda', posicao:'ATA', overall:84, raridade:'rara' },
  { nome:'Reijnders',        pais:'Holanda', posicao:'MEI', overall:83, raridade:'rara' },
  { nome:'Gravenberch',      pais:'Holanda', posicao:'VOL', overall:84, raridade:'rara' },
  { nome:'Dumfries',         pais:'Holanda', posicao:'LAD', overall:82, raridade:'rara' },
  { nome:'Timber',           pais:'Holanda', posicao:'ZAG', overall:83, raridade:'rara' },
  { nome:'Verbruggen',       pais:'Holanda', posicao:'GOL', overall:82, raridade:'rara' },
  { nome:'Koopmeiners',      pais:'Holanda', posicao:'MEI', overall:85, raridade:'epica' },

  // ── BÉLGICA ─────────────────────────────────────────────────────────────────
  { nome:'De Bruyne',        pais:'Bélgica', posicao:'MEI', overall:93, raridade:'cromada' },
  { nome:'Lukaku',           pais:'Bélgica', posicao:'ATA', overall:87, raridade:'epica' },
  { nome:'Courtois',         pais:'Bélgica', posicao:'GOL', overall:91, raridade:'lendaria' },
  { nome:'Onana (Bélgica)',  pais:'Bélgica', posicao:'VOL', overall:84, raridade:'rara' },
  { nome:'De Ketelaere',     pais:'Bélgica', posicao:'MEI', overall:83, raridade:'rara' },
  { nome:'Doku',             pais:'Bélgica', posicao:'ATA', overall:84, raridade:'rara' },
  { nome:'Tielemans',        pais:'Bélgica', posicao:'MEI', overall:83, raridade:'rara' },
  { nome:'Meunier',          pais:'Bélgica', posicao:'LAD', overall:81, raridade:'comum' },
  { nome:'Debast',           pais:'Bélgica', posicao:'ZAG', overall:80, raridade:'comum' },

  // ── ITÁLIA ──────────────────────────────────────────────────────────────────
  { nome:'Donnarumma',       pais:'Itália', posicao:'GOL', overall:90, raridade:'lendaria' },
  { nome:'Barella',          pais:'Itália', posicao:'MEI', overall:87, raridade:'epica' },
  { nome:'Jorginho',         pais:'Itália', posicao:'VOL', overall:83, raridade:'rara' },
  { nome:'Verratti',         pais:'Itália', posicao:'MEI', overall:84, raridade:'rara' },
  { nome:'Immobile',         pais:'Itália', posicao:'ATA', overall:84, raridade:'rara' },
  { nome:'Chiesa',           pais:'Itália', posicao:'ATA', overall:84, raridade:'rara' },
  { nome:'Raspadori',        pais:'Itália', posicao:'ATA', overall:82, raridade:'rara' },
  { nome:'Bastoni',          pais:'Itália', posicao:'ZAG', overall:86, raridade:'epica' },

  // ── COREIA DO SUL ───────────────────────────────────────────────────────────
  { nome:'Son Heung-min',    pais:'Coreia do Sul', posicao:'ATA', overall:89, raridade:'epica' },
  { nome:'Lee Kang-in',      pais:'Coreia do Sul', posicao:'MEI', overall:84, raridade:'rara' },
  { nome:'Kim Min-jae',      pais:'Coreia do Sul', posicao:'ZAG', overall:87, raridade:'epica' },
  { nome:'Hwang Hee-chan',   pais:'Coreia do Sul', posicao:'ATA', overall:82, raridade:'rara' },
  { nome:'Bae Jun-ho',       pais:'Coreia do Sul', posicao:'MEI', overall:80, raridade:'rara' },
  { nome:'Hwang In-beom',    pais:'Coreia do Sul', posicao:'MEI', overall:79, raridade:'comum' },
  { nome:'Oh Hyeon-gyu',     pais:'Coreia do Sul', posicao:'ATA', overall:78, raridade:'comum' },
  { nome:'Kim Seung-gyu',    pais:'Coreia do Sul', posicao:'GOL', overall:80, raridade:'comum' },

  // ── JAPÃO ───────────────────────────────────────────────────────────────────
  { nome:'Kubo',             pais:'Japão', posicao:'ATA', overall:85, raridade:'epica' },
  { nome:'Doan',             pais:'Japão', posicao:'ATA', overall:82, raridade:'rara' },
  { nome:'Kamada',           pais:'Japão', posicao:'MEI', overall:82, raridade:'rara' },
  { nome:'Endo',             pais:'Japão', posicao:'VOL', overall:83, raridade:'rara' },
  { nome:'Tomiyasu',         pais:'Japão', posicao:'ZAG', overall:82, raridade:'rara' },
  { nome:'Ao Tanaka',        pais:'Japão', posicao:'MEI', overall:81, raridade:'rara' },
  { nome:'Ueda',             pais:'Japão', posicao:'ATA', overall:80, raridade:'comum' },
  { nome:'Suzuki (GOL)',     pais:'Japão', posicao:'GOL', overall:82, raridade:'rara' },
  { nome:'Itakura',          pais:'Japão', posicao:'ZAG', overall:80, raridade:'comum' },

  // ── MARROCOS ─────────────────────────────────────────────────────────────────
  { nome:'Hakimi',           pais:'Marrocos', posicao:'LAD', overall:88, raridade:'epica' },
  { nome:'Mazraoui',         pais:'Marrocos', posicao:'LAD', overall:83, raridade:'rara' },
  { nome:'Amrabat',          pais:'Marrocos', posicao:'VOL', overall:84, raridade:'rara' },
  { nome:'Ounahi',           pais:'Marrocos', posicao:'MEI', overall:82, raridade:'rara' },
  { nome:'Aguerd',           pais:'Marrocos', posicao:'ZAG', overall:83, raridade:'rara' },
  { nome:'Bounou',           pais:'Marrocos', posicao:'GOL', overall:86, raridade:'epica' },
  { nome:'Brahim Díaz',      pais:'Marrocos', posicao:'MEI', overall:83, raridade:'rara' },
  { nome:'El Kaabi',         pais:'Marrocos', posicao:'ATA', overall:82, raridade:'rara' },
  { nome:'El Khannouss',     pais:'Marrocos', posicao:'MEI', overall:79, raridade:'comum' },
  { nome:'Ezzalzouli',       pais:'Marrocos', posicao:'ATA', overall:79, raridade:'comum' },
  { nome:'Rahimi',           pais:'Marrocos', posicao:'ATA', overall:78, raridade:'comum' },

  // ── SENEGAL ─────────────────────────────────────────────────────────────────
  { nome:'Sadio Mané',       pais:'Senegal', posicao:'ATA', overall:88, raridade:'epica' },
  { nome:'Edouard Mendy',    pais:'Senegal', posicao:'GOL', overall:84, raridade:'rara' },
  { nome:'Gana Gueye',       pais:'Senegal', posicao:'VOL', overall:82, raridade:'rara' },
  { nome:'Koulibaly',        pais:'Senegal', posicao:'ZAG', overall:85, raridade:'epica' },
  { nome:'Sarr',             pais:'Senegal', posicao:'ATA', overall:82, raridade:'rara' },
  { nome:'Diatta',           pais:'Senegal', posicao:'ATA', overall:79, raridade:'comum' },

  // ── GANA ─────────────────────────────────────────────────────────────────────
  { nome:'Kudus',            pais:'Gana', posicao:'ATA', overall:84, raridade:'rara' },
  { nome:'Thomas Partey',    pais:'Gana', posicao:'VOL', overall:84, raridade:'rara' },
  { nome:'Jordan Ayew',      pais:'Gana', posicao:'ATA', overall:80, raridade:'rara' },
  { nome:'Salisu',           pais:'Gana', posicao:'ZAG', overall:79, raridade:'comum' },

  // ── COSTA DO MARFIM ─────────────────────────────────────────────────────────
  { nome:'Kessié',           pais:'Costa do Marfim', posicao:'VOL', overall:84, raridade:'rara' },
  { nome:'Pepé',             pais:'Costa do Marfim', posicao:'ATA', overall:82, raridade:'rara' },
  { nome:'Diomande',         pais:'Costa do Marfim', posicao:'ZAG', overall:82, raridade:'rara' },
  { nome:'Sangare',          pais:'Costa do Marfim', posicao:'VOL', overall:82, raridade:'rara' },
  { nome:'Adingra',          pais:'Costa do Marfim', posicao:'ATA', overall:80, raridade:'rara' },
  { nome:'Amad Diallo',      pais:'Costa do Marfim', posicao:'ATA', overall:81, raridade:'rara' },
  { nome:'Wahi',             pais:'Costa do Marfim', posicao:'ATA', overall:80, raridade:'comum' },

  // ── ESTADOS UNIDOS ───────────────────────────────────────────────────────────
  { nome:'Pulisic',          pais:'EUA', posicao:'ATA', overall:86, raridade:'epica' },
  { nome:'McKennie',         pais:'EUA', posicao:'MEI', overall:82, raridade:'rara' },
  { nome:'Reyna',            pais:'EUA', posicao:'MEI', overall:81, raridade:'rara' },
  { nome:'Adams',            pais:'EUA', posicao:'VOL', overall:83, raridade:'rara' },
  { nome:'Dest',             pais:'EUA', posicao:'LAD', overall:81, raridade:'rara' },
  { nome:'Balogun',          pais:'EUA', posicao:'ATA', overall:81, raridade:'rara' },
  { nome:'Weah',             pais:'EUA', posicao:'ATA', overall:79, raridade:'comum' },
  { nome:'Turner',           pais:'EUA', posicao:'GOL', overall:81, raridade:'rara' },

  // ── CANADÁ ───────────────────────────────────────────────────────────────────
  { nome:'Alphonso Davies',  pais:'Canadá', posicao:'LAE', overall:87, raridade:'epica' },
  { nome:'Jonathan David',   pais:'Canadá', posicao:'ATA', overall:86, raridade:'epica' },
  { nome:'Buchanan',         pais:'Canadá', posicao:'ATA', overall:81, raridade:'rara' },
  { nome:'Eustáquio',        pais:'Canadá', posicao:'MEI', overall:82, raridade:'rara' },
  { nome:'Osorio',           pais:'Canadá', posicao:'MEI', overall:79, raridade:'comum' },
  { nome:'Larin',            pais:'Canadá', posicao:'ATA', overall:79, raridade:'comum' },

  // ── MÉXICO ───────────────────────────────────────────────────────────────────
  { nome:'Jiménez',          pais:'México', posicao:'ATA', overall:83, raridade:'rara' },
  { nome:'Santiago Giménez', pais:'México', posicao:'ATA', overall:85, raridade:'epica' },
  { nome:'Ochoa',            pais:'México', posicao:'GOL', overall:82, raridade:'rara' },
  { nome:'Álvarez (MEX)',    pais:'México', posicao:'ZAG', overall:82, raridade:'rara' },
  { nome:'Alvarado',         pais:'México', posicao:'MEI', overall:80, raridade:'rara' },
  { nome:'Gutiérrez',        pais:'México', posicao:'MEI', overall:79, raridade:'comum' },
  { nome:'Mora',             pais:'México', posicao:'MEI', overall:76, raridade:'comum' },

  // ── EQUADOR ─────────────────────────────────────────────────────────────────
  { nome:'Caicedo',          pais:'Equador', posicao:'VOL', overall:87, raridade:'epica' },
  { nome:'Enner Valencia',   pais:'Equador', posicao:'ATA', overall:82, raridade:'rara' },
  { nome:'Pacho',            pais:'Equador', posicao:'ZAG', overall:83, raridade:'rara' },
  { nome:'Hincapié',         pais:'Equador', posicao:'ZAG', overall:83, raridade:'rara' },
  { nome:'Estupinan',        pais:'Equador', posicao:'LAE', overall:82, raridade:'rara' },
  { nome:'Kendry Páez',      pais:'Equador', posicao:'MEI', overall:80, raridade:'rara' },
  { nome:'Plata',            pais:'Equador', posicao:'ATA', overall:79, raridade:'comum' },

  // ── URUGUAI ─────────────────────────────────────────────────────────────────
  { nome:'Valverde',         pais:'Uruguai', posicao:'MEI', overall:87, raridade:'epica' },
  { nome:'Darwin Núñez',     pais:'Uruguai', posicao:'ATA', overall:85, raridade:'epica' },
  { nome:'Suárez',           pais:'Uruguai', posicao:'ATA', overall:83, raridade:'rara' },
  { nome:'Bentancur',        pais:'Uruguai', posicao:'MEI', overall:83, raridade:'rara' },
  { nome:'Araújo',           pais:'Uruguai', posicao:'ZAG', overall:85, raridade:'epica' },
  { nome:'Muslera',          pais:'Uruguai', posicao:'GOL', overall:82, raridade:'rara' },
  { nome:'Pellistri',        pais:'Uruguai', posicao:'ATA', overall:79, raridade:'comum' },

  // ── COLÔMBIA ────────────────────────────────────────────────────────────────
  { nome:'Luis Díaz',        pais:'Colômbia', posicao:'ATA', overall:86, raridade:'epica' },
  { nome:'Cuadrado',         pais:'Colômbia', posicao:'LAD', overall:82, raridade:'rara' },
  { nome:'Falcao',           pais:'Colômbia', posicao:'ATA', overall:80, raridade:'rara' },
  { nome:'Barrios',          pais:'Colômbia', posicao:'VOL', overall:81, raridade:'rara' },
  { nome:'Lerma',            pais:'Colômbia', posicao:'VOL', overall:80, raridade:'rara' },
  { nome:'Vidal (COL)',      pais:'Colômbia', posicao:'ZAG', overall:78, raridade:'comum' },

  // ── PARAGUAI ────────────────────────────────────────────────────────────────
  { nome:'Almirón',          pais:'Paraguai', posicao:'MEI', overall:83, raridade:'rara' },
  { nome:'Enciso',           pais:'Paraguai', posicao:'ATA', overall:81, raridade:'rara' },
  { nome:'Sanabria',         pais:'Paraguai', posicao:'ATA', overall:80, raridade:'rara' },
  { nome:'Gustavo Gómez',    pais:'Paraguai', posicao:'ZAG', overall:81, raridade:'rara' },
  { nome:'Balbuena',         pais:'Paraguai', posicao:'ZAG', overall:79, raridade:'comum' },
  { nome:'Sosa',             pais:'Paraguai', posicao:'ATA', overall:78, raridade:'comum' },

  // ── NORUEGA ─────────────────────────────────────────────────────────────────
  { nome:'Haaland',          pais:'Noruega', posicao:'ATA', overall:96, raridade:'cromada' },
  { nome:'Odegaard',         pais:'Noruega', posicao:'MEI', overall:88, raridade:'epica' },
  { nome:'Sorloth',          pais:'Noruega', posicao:'ATA', overall:83, raridade:'rara' },
  { nome:'Nusa',             pais:'Noruega', posicao:'ATA', overall:82, raridade:'rara' },
  { nome:'Ajer',             pais:'Noruega', posicao:'ZAG', overall:79, raridade:'comum' },

  // ── CROÁCIA ─────────────────────────────────────────────────────────────────
  { nome:'Modric',           pais:'Croácia', posicao:'MEI', overall:90, raridade:'lendaria' },
  { nome:'Kovacic',          pais:'Croácia', posicao:'MEI', overall:85, raridade:'epica' },
  { nome:'Livakovic',        pais:'Croácia', posicao:'GOL', overall:85, raridade:'epica' },
  { nome:'Gvardiol',         pais:'Croácia', posicao:'ZAG', overall:86, raridade:'epica' },
  { nome:'Kramaric',         pais:'Croácia', posicao:'ATA', overall:83, raridade:'rara' },
  { nome:'Perisic',          pais:'Croácia', posicao:'ATA', overall:82, raridade:'rara' },
  { nome:'Brozovic',         pais:'Croácia', posicao:'VOL', overall:83, raridade:'rara' },

  // ── SUÍÇA ───────────────────────────────────────────────────────────────────
  { nome:'Xhaka',            pais:'Suíça', posicao:'VOL', overall:84, raridade:'rara' },
  { nome:'Embolo',           pais:'Suíça', posicao:'ATA', overall:82, raridade:'rara' },
  { nome:'Ndoye',            pais:'Suíça', posicao:'ATA', overall:81, raridade:'rara' },
  { nome:'Akanji',           pais:'Suíça', posicao:'ZAG', overall:84, raridade:'rara' },
  { nome:'Kobel',            pais:'Suíça', posicao:'GOL', overall:84, raridade:'rara' },
  { nome:'Jashari',          pais:'Suíça', posicao:'MEI', overall:79, raridade:'comum' },

  // ── AUSTRÁLIA ───────────────────────────────────────────────────────────────
  { nome:'Maty Ryan',        pais:'Austrália', posicao:'GOL', overall:81, raridade:'rara' },
  { nome:'Leckie',           pais:'Austrália', posicao:'ATA', overall:79, raridade:'comum' },
  { nome:'Irvine',           pais:'Austrália', posicao:'MEI', overall:79, raridade:'comum' },
  { nome:'Hrustic',          pais:'Austrália', posicao:'MEI', overall:78, raridade:'comum' },
  { nome:'Irankunda',        pais:'Austrália', posicao:'ATA', overall:78, raridade:'comum' },

  // ── ÁRABIA SAUDITA ──────────────────────────────────────────────────────────
  { nome:'Al-Dawsari',       pais:'Arábia Saudita', posicao:'ATA', overall:80, raridade:'rara' },
  { nome:'Al-Malki',         pais:'Arábia Saudita', posicao:'MEI', overall:76, raridade:'comum' },
  { nome:'Al-Bulayhi',       pais:'Arábia Saudita', posicao:'LAE', overall:75, raridade:'comum' },

  // ── IRÃ ─────────────────────────────────────────────────────────────────────
  { nome:'Taremi',           pais:'Irã', posicao:'ATA', overall:83, raridade:'rara' },
  { nome:'Jahanbakhsh',      pais:'Irã', posicao:'ATA', overall:79, raridade:'comum' },
  { nome:'Ezatolahi',        pais:'Irã', posicao:'VOL', overall:78, raridade:'comum' },

  // ── TURQUIA ─────────────────────────────────────────────────────────────────
  { nome:'Calhanoglu',       pais:'Turquia', posicao:'VOL', overall:86, raridade:'epica' },
  { nome:'Arda Güler',       pais:'Turquia', posicao:'MEI', overall:84, raridade:'rara' },
  { nome:'Kenan Yildiz',     pais:'Turquia', posicao:'ATA', overall:82, raridade:'rara' },
  { nome:'Guler',            pais:'Turquia', posicao:'MEI', overall:83, raridade:'rara' },
  { nome:'Demiral',          pais:'Turquia', posicao:'ZAG', overall:82, raridade:'rara' },
  { nome:'Kadioglu',         pais:'Turquia', posicao:'LAE', overall:81, raridade:'rara' },
  { nome:'Kokcu',            pais:'Turquia', posicao:'MEI', overall:81, raridade:'rara' },
  { nome:'Akturkoglu',       pais:'Turquia', posicao:'ATA', overall:80, raridade:'rara' },

  // ── ESCÓCIA ─────────────────────────────────────────────────────────────────
  { nome:'McTominay',        pais:'Escócia', posicao:'MEI', overall:83, raridade:'rara' },
  { nome:'Robertson',        pais:'Escócia', posicao:'LAE', overall:85, raridade:'epica' },
  { nome:'McGinn',           pais:'Escócia', posicao:'MEI', overall:81, raridade:'rara' },
  { nome:'Gilmour',          pais:'Escócia', posicao:'MEI', overall:80, raridade:'rara' },
  { nome:'Gordon',           pais:'Escócia', posicao:'GOL', overall:79, raridade:'comum' },

  // ── BÓSNIA ──────────────────────────────────────────────────────────────────
  { nome:'Dzeko',            pais:'Bósnia', posicao:'ATA', overall:82, raridade:'rara' },
  { nome:'Demirovic',        pais:'Bósnia', posicao:'ATA', overall:81, raridade:'rara' },
  { nome:'Kolasinac',        pais:'Bósnia', posicao:'LAE', overall:80, raridade:'rara' },
  { nome:'Tahirovic',        pais:'Bósnia', posicao:'MEI', overall:78, raridade:'comum' },

  // ── CURAÇAO ─────────────────────────────────────────────────────────────────
  { nome:'Chong',            pais:'Curaçao', posicao:'ATA', overall:79, raridade:'comum' },
  { nome:'Locadia',          pais:'Curaçao', posicao:'ATA', overall:78, raridade:'comum' },
  { nome:'Bazoer',           pais:'Curaçao', posicao:'MEI', overall:79, raridade:'comum' },

  // ── ÁFRICA DO SUL ────────────────────────────────────────────────────────────
  { nome:'Williams (SAF)',   pais:'África do Sul', posicao:'GOL', overall:80, raridade:'rara' },
  { nome:'Mokoena',          pais:'África do Sul', posicao:'VOL', overall:79, raridade:'comum' },
  { nome:'Appollis',         pais:'África do Sul', posicao:'ATA', overall:78, raridade:'comum' },
  { nome:'Foster',           pais:'África do Sul', posicao:'ATA', overall:78, raridade:'comum' },
  { nome:'Mofokeng',         pais:'África do Sul', posicao:'ATA', overall:77, raridade:'comum' },

  // ── REPÚBLICA TCHECA ─────────────────────────────────────────────────────────
  { nome:'Schick',           pais:'Rep. Tcheca', posicao:'ATA', overall:83, raridade:'rara' },
  { nome:'Soucek',           pais:'Rep. Tcheca', posicao:'MEI', overall:82, raridade:'rara' },
  { nome:'Hložek',           pais:'Rep. Tcheca', posicao:'ATA', overall:80, raridade:'rara' },
  { nome:'Kovar',            pais:'Rep. Tcheca', posicao:'GOL', overall:80, raridade:'rara' },
  { nome:'Coufal',           pais:'Rep. Tcheca', posicao:'LAD', overall:79, raridade:'comum' },
  { nome:'Hlozek',           pais:'Rep. Tcheca', posicao:'ATA', overall:80, raridade:'rara' },

  // ── SUÉCIA ──────────────────────────────────────────────────────────────────
  { nome:'Gyokeres',         pais:'Suécia', posicao:'ATA', overall:87, raridade:'epica' },
  { nome:'Isak',             pais:'Suécia', posicao:'ATA', overall:86, raridade:'epica' },
  { nome:'Elanga',           pais:'Suécia', posicao:'ATA', overall:81, raridade:'rara' },
  { nome:'Bergvall',         pais:'Suécia', posicao:'MEI', overall:80, raridade:'rara' },
  { nome:'Lindelof',         pais:'Suécia', posicao:'ZAG', overall:81, raridade:'rara' },
  { nome:'Svanberg',         pais:'Suécia', posicao:'MEI', overall:79, raridade:'comum' },

  // ── ÁUSTRIA ─────────────────────────────────────────────────────────────────
  { nome:'Alaba',            pais:'Áustria', posicao:'ZAG', overall:85, raridade:'epica' },
  { nome:'Arnautovic',       pais:'Áustria', posicao:'ATA', overall:82, raridade:'rara' },
  { nome:'Sabitzer',         pais:'Áustria', posicao:'MEI', overall:82, raridade:'rara' },

  // ── CATAR ───────────────────────────────────────────────────────────────────
  { nome:'Afif',             pais:'Catar', posicao:'ATA', overall:81, raridade:'rara' },
  { nome:'Almoez Ali',       pais:'Catar', posicao:'ATA', overall:79, raridade:'comum' },
  { nome:'Assim Madibo',     pais:'Catar', posicao:'VOL', overall:78, raridade:'comum' },

  // ── HAITI ───────────────────────────────────────────────────────────────────
  { nome:'Isidor',           pais:'Haiti', posicao:'ATA', overall:78, raridade:'comum' },
  { nome:'Nazon',            pais:'Haiti', posicao:'ATA', overall:76, raridade:'comum' },
  { nome:'Bellegarde',       pais:'Haiti', posicao:'MEI', overall:77, raridade:'comum' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// BANCO DE DADOS JSON
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

function buildFigurinhas() {
  const out = {};
  ELENCOS.forEach((jogador, index) => {
    const id = index + 1;
    out[id] = {
      id,
      nome:        jogador.nome,
      pais:        jogador.pais,
      posicao:     jogador.posicao,
      overall:     jogador.overall,
      raridade:    jogador.raridade,
      cor_primaria: RARIDADE_CONFIG[jogador.raridade].cor,
    };
  });
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

function getFigurinha(id) { return loadDB().figurinhas[id] || null; }
function getAllFigurinhas() { return Object.values(loadDB().figurinhas); }

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

function getPacotesUser(userId)       { return ensureUser(userId).pacotes; }

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
  const total  = getAllFigurinhas().length;
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

  const ids     = Object.keys(db.figurinhas);
  const raras   = ids.filter(id => ['rara','epica','lendaria','cromada'].includes(db.figurinhas[id].raridade));
  const totalCh = Object.values(RARIDADE_CONFIG).reduce((a, r) => a + r.chance, 0);
  const figurinhas = [];

  for (let i = 0; i < 5; i++) {
    let id;
    if (i === 0 && raras.length) {
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
function criarTroca(s, r, fo, fp) {
  const db = loadDB();
  const id = db.next_troca_id++;
  db.trocas[id] = { id, solicitante_id:s, receptor_id:r, figurinha_oferta_id:fo, figurinha_pedido_id:fp, status:'pendente', criado_em:new Date().toISOString() };
  saveDB();
  return id;
}
function getTroca(id)           { return loadDB().trocas[id] || null; }
function atualizarTroca(id, s)  { const db=loadDB(); if(db.trocas[id]){db.trocas[id].status=s;saveDB();} }

function executarTroca(trocaId) {
  const db    = loadDB();
  const troca = db.trocas[trocaId];
  if (!troca || troca.status !== 'pendente') return false;
  const a = getUserFigurinha(troca.solicitante_id, troca.figurinha_oferta_id);
  const b = getUserFigurinha(troca.receptor_id,    troca.figurinha_pedido_id);
  if (!a || a.quantidade < 1 || !b || b.quantidade < 1) return false;
  removeFigurinhaUser(troca.solicitante_id, troca.figurinha_oferta_id);
  addFigurinhaToUser(troca.receptor_id,    troca.figurinha_oferta_id);
  removeFigurinhaUser(troca.receptor_id,    troca.figurinha_pedido_id);
  addFigurinhaToUser(troca.solicitante_id, troca.figurinha_pedido_id);
  troca.status = 'aceita';
  db.users[troca.solicitante_id].stats.trocas_realizadas = (db.users[troca.solicitante_id].stats.trocas_realizadas||0)+1;
  db.users[troca.receptor_id   ].stats.trocas_realizadas = (db.users[troca.receptor_id   ].stats.trocas_realizadas||0)+1;
  saveDB();
  return true;
}

// ─── DISCORD HELPERS ──────────────────────────────────────────────────────────
function embed(titulo, desc, cor = '#1565c0') {
  return new EmbedBuilder()
    .setTitle(titulo)
    .setDescription(desc)
    .setColor(cor)
    .setTimestamp()
    .setFooter({ text: '🌍 Álbum da Copa do Mundo 2026' });
}

function isAdmin(message) {
  return message.member?.permissions.has('Administrator') ||
         message.member?.permissions.has('ManageGuild');
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT — padrão do projeto
// ═══════════════════════════════════════════════════════════════════════════════
module.exports = (client) => {
  loadDB();
  const total = getAllFigurinhas().length;
  console.log(`✅ [Album 2026] ${total} figurinhas carregadas. DB: ${DATA_FILE}`);

  client.on('messageCreate', async (message) => {
    if (!message.guild || message.author.bot) return;
    const content = message.content.trim();
    if (!content.startsWith('!')) return;
    const args    = content.slice(1).split(/\s+/);
    const comando = args.shift().toLowerCase();

    switch (comando) {

      // ── !abrirpacote ────────────────────────────────────────────────────────
      case 'abrirpacote': {
        const userId = message.author.id;
        ensureUser(userId);
        if (getPacotesUser(userId).quantidade <= 0) {
          return message.reply({ embeds: [embed('❌ Sem Pacotes!',
            'Você não tem pacotes!\n\n**Como conseguir:**\n• 🛒 `!comprarpacote`\n• 👑 Peça a um admin', '#c62828')] });
        }
        const msg = await message.reply({ embeds: [embed('⏳ Abrindo pacote...', 'Sorteando jogadores...')] });
        try {
          const figs = abrirPacote(userId);
          if (!figs) return msg.edit({ embeds: [embed('❌ Erro', 'Não foi possível abrir o pacote.')] });

          const novas     = figs.filter(f => (getUserFigurinha(userId, f.id)?.quantidade || 0) === 1);
          const destaques = figs
            .filter(f => ['lendaria','cromada','epica'].includes(f.raridade))
            .map(f => `${RARIDADE_EMOJI[f.raridade]} **${f.nome}** — ${f.pais} — OVR ${f.overall}`)
            .join('\n') || 'Nenhum destaque desta vez...';

          const lista = figs
            .map(f => `${RARIDADE_EMOJI[f.raridade]} **${f.nome}** (${f.pais}) — ${f.posicao} — OVR ${f.overall} — ID \`#${f.id}\``)
            .join('\n');

          const e = new EmbedBuilder()
            .setTitle('📦 Pacote Aberto! — Copa 2026')
            .setDescription(`**Destaques:**\n${destaques}`)
            .addFields(
              { name: '🎴 Jogadores', value: lista, inline: false },
              { name: '📦 Pacotes Restantes', value: String(getPacotesUser(userId).quantidade), inline: true },
              { name: '🆕 Novas',             value: String(novas.length), inline: true },
            )
            .setColor('#1565c0').setTimestamp()
            .setFooter({ text: '🌍 Copa do Mundo 2026 • Use !album para ver seu progresso' });
          await msg.edit({ embeds: [e] });
        } catch (err) {
          console.error('[Album] abrirpacote:', err);
          await msg.edit({ embeds: [embed('❌ Erro', 'Erro ao abrir o pacote.')] });
        }
        break;
      }

      // ── !figurinha <id> ─────────────────────────────────────────────────────
      case 'figurinha': {
        const id  = parseInt(args[0]);
        const tot = getAllFigurinhas().length;
        if (isNaN(id) || id < 1 || id > tot)
          return message.reply({ embeds: [embed('❌ ID inválido', `Use: \`!figurinha <id>\`  (IDs: 1–${tot})`)] });

        const fig       = getFigurinha(id);
        const naColecao = getUserFigurinha(message.author.id, id);
        const cfg       = RARIDADE_CONFIG[fig.raridade];

        const e = new EmbedBuilder()
          .setTitle(`${RARIDADE_EMOJI[fig.raridade]} ${fig.nome}`)
          .addFields(
            { name: '🌍 Seleção', value: fig.pais,          inline: true },
            { name: '🎯 Posição', value: fig.posicao,        inline: true },
            { name: '⭐ Overall', value: String(fig.overall), inline: true },
            { name: '💎 Raridade',value: cfg.label,           inline: true },
            { name: '🆔 ID',      value: `#${String(id).padStart(3,'0')}`, inline: true },
            { name: '📦 Coleção', value: naColecao ? `✅ Você tem **${naColecao.quantidade}x**` : '❌ Você não tem', inline: true },
          )
          .setColor(fig.cor_primaria)
          .setTimestamp()
          .setFooter({ text: `🌍 Copa do Mundo 2026 • Figurinha #${String(id).padStart(3,'0')}` });
        await message.reply({ embeds: [e] });
        break;
      }

      // ── !colecao [página] ───────────────────────────────────────────────────
      case 'colecao': {
        const userId  = message.author.id;
        const colecao = getColecaoUser(userId);
        if (colecao.length === 0)
          return message.reply({ embeds: [embed('📂 Coleção Vazia', 'Abra pacotes com `!abrirpacote`!')] });

        const { unicas, total, percentual } = getPercentualAlbum(userId);
        const pagina       = Math.max(1, parseInt(args[0]) || 1);
        const itensPorPag  = 20;
        const allFigs      = getAllFigurinhas();
        const totalPaginas = Math.ceil(allFigs.length / itensPorPag);
        const colMap       = new Map(colecao.map(c => [c.figurinha_id, c]));

        const linhas = allFigs
          .slice((pagina - 1) * itensPorPag, pagina * itensPorPag)
          .map(f => {
            const tem = colMap.has(f.id);
            const qtd = tem ? ` (${colMap.get(f.id).quantidade}x)` : '';
            return `${tem ? RARIDADE_EMOJI[f.raridade] : '🔲'} \`#${String(f.id).padStart(3,'0')}\` ${tem ? `**${f.nome}**` : `~~${f.nome}~~`} — ${f.pais}${qtd}`;
          }).join('\n');

        const porRar = colecao.reduce((acc, f) => { acc[f.raridade]=(acc[f.raridade]||0)+1; return acc; }, {});
        const resumo = Object.entries(porRar).map(([r,n]) => `${RARIDADE_EMOJI[r]} ${n}`).join(' • ');

        const e = new EmbedBuilder()
          .setTitle(`📖 Coleção de ${message.author.username} — Copa 2026`)
          .setDescription(`**Progresso:** ${unicas}/${total} (${percentual}%)\n${resumo}\n\n${linhas}`)
          .addFields(
            { name: '📄 Página',         value: `${pagina}/${totalPaginas}`, inline: true },
            { name: '📦 Total coletado',  value: String(colecao.reduce((a,c)=>a+c.quantidade,0)), inline: true },
            { name: '✅ Únicas',          value: String(unicas), inline: true },
          )
          .setColor('#1565c0')
          .setFooter({ text: `Use !colecao <página> para navegar • Página ${pagina} de ${totalPaginas}` })
          .setTimestamp();
        await message.reply({ embeds: [e] });
        break;
      }

      // ── !album ──────────────────────────────────────────────────────────────
      case 'album': {
        const userId = message.author.id;
        ensureUser(userId);
        const { unicas, total, percentual } = getPercentualAlbum(userId);
        const pacotes = getPacotesUser(userId);
        const stats   = loadDB().users[userId].stats || {};
        const colecao = getColecaoUser(userId);
        const moedas  = loadDB().users[userId].moedas || 0;
        const db      = loadDB();

        const porRar = { comum:0, rara:0, epica:0, lendaria:0, cromada:0 };
        for (const { figurinha_id } of colecao) {
          const fig = db.figurinhas[figurinha_id];
          if (fig) porRar[fig.raridade] = (porRar[fig.raridade]||0)+1;
        }

        const barLen = 20;
        const filled = Math.round((unicas / total) * barLen);
        const barra  = '█'.repeat(filled) + '░'.repeat(barLen - filled);

        const e = new EmbedBuilder()
          .setTitle(`📖 Álbum de ${message.author.username} — Copa 2026`)
          .setThumbnail(message.author.displayAvatarURL())
          .setDescription(`**Progresso Geral**\n\`[${barra}]\` ${percentual}%\n${unicas} de ${total} figurinhas únicas`)
          .addFields(
            { name: '⚪ Comuns',         value: String(porRar.comum),              inline: true },
            { name: '🔵 Raras',          value: String(porRar.rara),               inline: true },
            { name: '🟣 Épicas',         value: String(porRar.epica),              inline: true },
            { name: '🟠 Lendárias',      value: String(porRar.lendaria),           inline: true },
            { name: '⭐ Cromadas',        value: String(porRar.cromada),            inline: true },
            { name: '💰 Moedas',          value: String(moedas),                    inline: true },
            { name: '📦 Pacotes',         value: String(pacotes.quantidade),        inline: true },
            { name: '📦 Abertos',         value: String(pacotes.total_abertos||0),  inline: true },
            { name: '🔄 Trocas',          value: String(stats.trocas_realizadas||0),inline: true },
          )
          .setColor('#1565c0').setTimestamp()
          .setFooter({ text: '🌍 Copa do Mundo 2026 • Use !colecao para ver suas figurinhas' });
        await message.reply({ embeds: [e] });
        break;
      }

      // ── !trocar ─────────────────────────────────────────────────────────────
      case 'trocar': {
        const receptor = message.mentions.users.first();
        if (!receptor) return message.reply({ embeds: [embed('❌', 'Uso: `!trocar @usuario <id_sua> <id_quer>`')] });
        if (receptor.id === message.author.id) return message.reply({ embeds: [embed('❌', 'Você não pode trocar consigo mesmo!')] });

        const idO = parseInt(args[1]), idP = parseInt(args[2]);
        if (isNaN(idO)||isNaN(idP)) return message.reply({ embeds: [embed('❌','IDs inválidos.')] });

        const figO = getFigurinha(idO), figP = getFigurinha(idP);
        if (!figO||!figP) return message.reply({ embeds: [embed('❌','Figurinha não existe.')] });

        const colO = getUserFigurinha(message.author.id, idO);
        if (!colO||colO.quantidade<1) return message.reply({ embeds: [embed('❌',`Você não tem **${figO.nome}**!`)] });
        if (colO.quantidade<2) return message.reply({ embeds: [embed('⚠️',`Você só tem 1x **${figO.nome}**. Use \`!confirmartroca ${idO} ${idP} ${receptor.id}\` para confirmar.`)] });

        const trocaId = criarTroca(message.author.id, receptor.id, idO, idP);
        const e = new EmbedBuilder()
          .setTitle('🔄 Proposta de Troca!')
          .setDescription(`${receptor}, ${message.author} quer trocar com você!\n\`!aceitartroca ${trocaId}\` aceitar | \`!recusartroca ${trocaId}\` recusar`)
          .addFields(
            { name:'📤 Oferece', value:`${RARIDADE_EMOJI[figO.raridade]} **${figO.nome}** (${figO.pais}) OVR ${figO.overall}\nID \`#${idO}\``, inline:true },
            { name:'📥 Quer',    value:`${RARIDADE_EMOJI[figP.raridade]} **${figP.nome}** (${figP.pais}) OVR ${figP.overall}\nID \`#${idP}\``, inline:true },
            { name:'📋 Troca',  value:`\`#${trocaId}\``, inline:false },
          )
          .setColor('#ff9800').setTimestamp();
        await message.reply({ content:`${receptor}`, embeds:[e] });
        break;
      }

      // ── !aceitartroca ────────────────────────────────────────────────────────
      case 'aceitartroca': {
        const trocaId = parseInt(args[0]);
        if (isNaN(trocaId)) return message.reply({ embeds:[embed('❌','ID inválido.')] });
        const troca = getTroca(trocaId);
        if (!troca)                                   return message.reply({ embeds:[embed('❌','Troca não encontrada.')] });
        if (troca.receptor_id!==message.author.id)    return message.reply({ embeds:[embed('❌','Essa troca não é para você!')] });
        if (troca.status!=='pendente')                return message.reply({ embeds:[embed('❌',`Essa troca já foi ${troca.status}.`)] });
        const colP = getUserFigurinha(message.author.id, troca.figurinha_pedido_id);
        if (!colP||colP.quantidade<1) return message.reply({ embeds:[embed('❌','Você não tem a figurinha pedida!')] });
        if (!executarTroca(trocaId)) return message.reply({ embeds:[embed('❌ Falha','Verifique se ambas as figurinhas estão disponíveis.')] });
        const figO = getFigurinha(troca.figurinha_oferta_id);
        const figP = getFigurinha(troca.figurinha_pedido_id);
        await message.reply({ embeds:[embed('✅ Troca Realizada!',
          `**Troca #${trocaId} concluída!**\n\n<@${troca.solicitante_id}> recebeu: ${RARIDADE_EMOJI[figP.raridade]} **${figP.nome}**\n<@${troca.receptor_id}> recebeu: ${RARIDADE_EMOJI[figO.raridade]} **${figO.nome}**`,
          '#4caf50')] });
        break;
      }

      // ── !recusartroca ────────────────────────────────────────────────────────
      case 'recusartroca': {
        const trocaId = parseInt(args[0]);
        if (isNaN(trocaId)) return message.reply({ embeds:[embed('❌','ID inválido.')] });
        const troca = getTroca(trocaId);
        if (!troca) return message.reply({ embeds:[embed('❌','Troca não encontrada.')] });
        if (troca.receptor_id!==message.author.id&&troca.solicitante_id!==message.author.id)
          return message.reply({ embeds:[embed('❌','Você não faz parte dessa troca!')] });
        if (troca.status!=='pendente') return message.reply({ embeds:[embed('❌',`Essa troca já foi ${troca.status}.`)] });
        atualizarTroca(trocaId,'recusada');
        await message.reply({ embeds:[embed('❌ Troca Recusada',`A troca #${trocaId} foi cancelada.`,'#f44336')] });
        break;
      }

      // ── !darfigurinha ────────────────────────────────────────────────────────
      case 'darfigurinha': {
        const receptor = message.mentions.users.first();
        if (!receptor) return message.reply({ embeds:[embed('❌','Uso: `!darfigurinha @usuario <id>`')] });
        if (receptor.id===message.author.id) return message.reply({ embeds:[embed('❌','Você não pode dar para si mesmo!')] });
        const id  = parseInt(args[1]);
        if (isNaN(id)) return message.reply({ embeds:[embed('❌','ID inválido.')] });
        const fig = getFigurinha(id);
        if (!fig) return message.reply({ embeds:[embed('❌','Figurinha não encontrada.')] });
        const col = getUserFigurinha(message.author.id, id);
        if (!col||col.quantidade<1) return message.reply({ embeds:[embed('❌',`Você não tem **${fig.nome}**!`)] });
        if (col.quantidade<2) return message.reply({ embeds:[embed('⚠️','Você só tem 1x. Use `!trocar` para uma troca oficial.')] });
        removeFigurinhaUser(message.author.id, id);
        addFigurinhaToUser(receptor.id, id);
        await message.reply({ embeds:[embed('🎁 Enviada!',`${message.author} deu ${RARIDADE_EMOJI[fig.raridade]} **${fig.nome}** para ${receptor}!`,'#4caf50')] });
        break;
      }

      // ── !venderfigurinha ─────────────────────────────────────────────────────
      case 'venderfigurinha': {
        const id  = parseInt(args[0]);
        const qtd = parseInt(args[1]) || 1;
        if (isNaN(id)) return message.reply({ embeds:[embed('❌','Uso: `!venderfigurinha <id> [qtd]`')] });
        const fig = getFigurinha(id);
        if (!fig) return message.reply({ embeds:[embed('❌','Figurinha não encontrada.')] });
        const col = getUserFigurinha(message.author.id, id);
        if (!col||col.quantidade<qtd+1) return message.reply({ embeds:[embed('❌',`Precisa ter ${qtd+1}x para vender ${qtd}x (mantendo 1).`)] });
        const preco = (PRECO_RARIDADE[fig.raridade]||50)*qtd;
        for (let i=0;i<qtd;i++) removeFigurinhaUser(message.author.id,id);
        const db = loadDB();
        db.users[message.author.id].moedas = (db.users[message.author.id].moedas||0)+preco;
        saveDB();
        await message.reply({ embeds:[embed('💰 Vendido!',`**${qtd}x ${fig.nome}** vendido por **${preco} moedas**!\n💰 Saldo: **${db.users[message.author.id].moedas} moedas**`,'#ffc107')] });
        break;
      }

      // ── !comprarpacote ───────────────────────────────────────────────────────
      case 'comprarpacote': {
        const qtd    = Math.min(parseInt(args[0])||1, 10);
        const total  = PRECO_PACOTE*qtd;
        const userId = message.author.id;
        ensureUser(userId);
        const db     = loadDB();
        const moedas = db.users[userId].moedas||0;
        if (moedas<total) return message.reply({ embeds:[embed('❌ Moedas insuficientes',`Você tem **${moedas}** e precisa de **${total} moedas**.\nVenda figurinhas repetidas com \`!venderfigurinha\`!`)] });
        db.users[userId].moedas -= total;
        saveDB();
        addPacotesUser(userId,qtd);
        await message.reply({ embeds:[embed('🛒 Comprado!',`**${qtd}x pacote(s)** por **${total} moedas**!\n💰 Saldo: **${db.users[userId].moedas} moedas**\n\nUse \`!abrirpacote\`!`,'#4caf50')] });
        break;
      }

      // ── !rankingalbum ────────────────────────────────────────────────────────
      case 'rankingalbum': {
        const ranking = getRanking();
        if (!ranking.length) return message.reply({ embeds:[embed('🏆 Ranking','Ninguém tem figurinhas ainda!')] });
        const medals = ['🥇','🥈','🥉'];
        const tot    = getAllFigurinhas().length;
        let desc = '';
        for (let i=0;i<ranking.length;i++) {
          const r     = ranking[i];
          const medal = medals[i]||`**${i+1}.**`;
          const pct   = ((r.figurinhas_unicas/tot)*100).toFixed(1);
          try {
            const user = await message.client.users.fetch(r.user_id);
            desc += `${medal} **${user.username}** — ${r.figurinhas_unicas}/${tot} (${pct}%) | ⭐${r.cromadas} cromadas | 🟠${r.lendarias} lendárias\n`;
          } catch { desc += `${medal} \`${r.user_id}\` — ${r.figurinhas_unicas} (${pct}%)\n`; }
        }
        const e = new EmbedBuilder()
          .setTitle('🏆 Ranking — Copa 2026')
          .setDescription(desc)
          .setColor('#ffd700').setTimestamp()
          .setFooter({ text:'🌍 Copa do Mundo 2026 • Top 10' });
        await message.reply({ embeds:[e] });
        break;
      }

      // ── !datac ───────────────────────────────────────────────────────────────
      case 'datac': {
        if (!isAdmin(message)) return message.reply({ embeds:[embed('❌ Sem Permissão','Somente administradores podem fazer isso!')] });
        try {
          const snap   = loadDB();
          const buf    = Buffer.from(JSON.stringify(snap,null,2),'utf8');
          const ts     = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
          const attach = new AttachmentBuilder(buf,{name:`data_backup_${ts}.json`});
          const info   = `📦 **Backup Copa 2026 — ${new Date().toLocaleString('pt-BR')}**\n\n• **Usuários:** ${Object.keys(snap.users).length}\n• **Trocas:** ${Object.keys(snap.trocas).length}\n• **Figurinhas:** ${Object.keys(snap.figurinhas).length}`;
          try {
            await message.author.send({ content:info, files:[attach] });
            await message.reply({ embeds:[embed('✅ Enviado!','`data.json` enviado na sua DM! 📬','#4caf50')] });
          } catch {
            await message.reply({ content:'⚠️ Suas DMs estão fechadas. Enviando aqui:', files:[attach] });
          }
        } catch(err) {
          console.error('[Album] datac:', err);
          await message.reply({ embeds:[embed('❌ Erro','Erro ao gerar o backup.')] });
        }
        break;
      }

      // ── !ajuda / !helpalbum ──────────────────────────────────────────────────
      case 'ajuda':
      case 'helpalbum': {
        const tot = getAllFigurinhas().length;
        const e = new EmbedBuilder()
          .setTitle('🌍 Álbum Copa do Mundo 2026 — Comandos')
          .addFields(
            { name:'📦 Pacotes',    value:'`!abrirpacote` — Abrir 1 pacote (5 figurinhas)\n`!comprarpacote [qtd]` — Comprar com moedas (máx 10)' },
            { name:'📖 Coleção',    value:'`!album` — Ver seu álbum\n`!colecao [pág]` — Ver coleção em texto\n`!figurinha <id>` — Detalhe de um jogador\n`!rankingalbum` — Top 10' },
            { name:'🔄 Trocas',     value:'`!trocar @user <id_sua> <id_quer>` — Propor\n`!aceitartroca <id>` — Aceitar\n`!recusartroca <id>` — Recusar\n`!darfigurinha @user <id>` — Dar (precisa 2+)\n`!venderfigurinha <id> [qtd]` — Vender por moedas' },
            { name:'👑 Admin',      value:'`!addpacotes @user <qtd>`\n`!darfigurinhaadm @user <id>`\n`!addmoedas @user <qtd>`\n`!resetalbum @user`\n`!datac` — Backup JSON na DM' },
            { name:'🌟 Raridades',  value:'⚪ Comum (55%) • 🔵 Rara (28%) • 🟣 Épica (12%) • 🟠 Lendária (4%) • ⭐ Cromada (1%)' },
            { name:'💰 Economia',   value:`1 pacote = ${PRECO_PACOTE} moedas\n⚪50 • 🔵150 • 🟣400 • 🟠1000 • ⭐3000 por figurinha` },
            { name:'📊 Total',      value:`**${tot} jogadores reais** da Copa 2026` },
          )
          .setColor('#1565c0').setTimestamp()
          .setFooter({ text:`🌍 ${tot} jogadores reais convocados para a Copa 2026` });
        await message.reply({ embeds:[e] });
        break;
      }

      // ── Admin: !addpacotes ───────────────────────────────────────────────────
      case 'addpacotes': {
        if (!isAdmin(message)) return message.reply({ embeds:[embed('❌','Sem permissão!')] });
        const target = message.mentions.users.first();
        const qtd    = parseInt(args[1])||1;
        if (!target) return message.reply({ embeds:[embed('❌','Uso: `!addpacotes @usuario <qtd>`')] });
        addPacotesUser(target.id,qtd);
        await message.reply({ embeds:[embed('✅',`**${qtd}x pacote(s)** adicionados para ${target}!`,'#4caf50')] });
        break;
      }

      // ── Admin: !darfigurinhaadm ──────────────────────────────────────────────
      case 'darfigurinhaadm': {
        if (!isAdmin(message)) return message.reply({ embeds:[embed('❌','Sem permissão!')] });
        const target = message.mentions.users.first();
        const id     = parseInt(args[1]);
        if (!target||isNaN(id)) return message.reply({ embeds:[embed('❌','Uso: `!darfigurinhaadm @usuario <id>`')] });
        const fig = getFigurinha(id);
        if (!fig) return message.reply({ embeds:[embed('❌','Figurinha não encontrada.')] });
        addFigurinhaToUser(target.id,id);
        await message.reply({ embeds:[embed('✅',`${RARIDADE_EMOJI[fig.raridade]} **${fig.nome}** dado para ${target}!`,'#4caf50')] });
        break;
      }

      // ── Admin: !addmoedas ────────────────────────────────────────────────────
      case 'addmoedas': {
        if (!isAdmin(message)) return message.reply({ embeds:[embed('❌','Sem permissão!')] });
        const target = message.mentions.users.first();
        const qtd    = parseInt(args[1])||0;
        if (!target||qtd<=0) return message.reply({ embeds:[embed('❌','Uso: `!addmoedas @usuario <qtd>`')] });
        const db = loadDB();
        ensureUser(target.id);
        db.users[target.id].moedas = (db.users[target.id].moedas||0)+qtd;
        saveDB();
        await message.reply({ embeds:[embed('✅',`**${qtd} moedas** para ${target}!\n💰 Saldo: **${db.users[target.id].moedas}**`,'#4caf50')] });
        break;
      }

      // ── Admin: !resetalbum ───────────────────────────────────────────────────
      case 'resetalbum': {
        if (!isAdmin(message)) return message.reply({ embeds:[embed('❌','Sem permissão!')] });
        const target = message.mentions.users.first();
        if (!target) return message.reply({ embeds:[embed('❌','Mencione um usuário.')] });
        const db = loadDB();
        db.users[target.id] = { colecao:{}, pacotes:{quantidade:0,total_abertos:0}, stats:{trocas_realizadas:0,total_figurinhas:0}, moedas:0 };
        saveDB();
        await message.reply({ embeds:[embed('✅',`Álbum de ${target} resetado!`,'#4caf50')] });
        break;
      }

      default: break;
    }
  });
};
