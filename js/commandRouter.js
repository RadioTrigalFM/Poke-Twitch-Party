import { handleArenaCmd } from './modes/arena.js';
import { handleAvaluggCmd } from './modes/avalugg.js';
import { handleBossCmd } from './modes/boss.js';
import { handleCharcaCmd } from './modes/charca.js';
import { handleExtranjeriaCmd } from './modes/extranjeria.js';
import { handlePasapalabraCmd } from './modes/pasapalabra.js';
import { handlePokerusCmd } from './modes/pokerus.js';
import { handleRayoSolarCmd } from './modes/rayosolar.js';
import { handleSafariCmd } from './modes/safari.js';
import { handleVistaLinceCmd } from './modes/vistalince.js';
import { handleVoltorbCmd } from './modes/voltorbexplosivo.js';
import { handleVolcanCmd } from './modes/volcan.js';
import { handleZoroarksCmd } from './modes/zoroarks.js';
import { addChatMessage } from './chat.js';
import { state } from './state.js';
import { ARENA_POKEMON_DB } from './data/arenaPokemonDb.js';
import { JOIN_COMMANDS_BY_MODE, isJoinCommandBlocked } from './subsMode.js';

/* ---------------------------------------------------------
   ATAJO DE INSCRIPCIÓN: "!abra" == "!pokemon abra"
   ---------------------------------------------------------
   En los modos que se inscriben con !pokemon [nombre] (Coliseo, Boss,
   Pokerus, Rayo Solar, Zona Safari y El Volcán) también vale escribir
   solo el nombre del Pokémon con la exclamación delante (!abra,
   !pikachu, !mr. mime...). Se resuelve aquí, antes del filtro del Modo
   Subs y de los handlers de cada modo, reescribiendo el mensaje al
   comando canónico: así el resto del código (lobby, bloqueos de sprites,
   shiny, cambio de Pokémon en el Boss...) no necesita saber que existe el
   atajo, y el Modo Subs también lo filtra igual que a !pokemon.
   Solo se reescribe si el texto coincide EXACTAMENTE con el nombre de un
   Pokémon (mismo criterio que ya usan los handlers: minúsculas, nombre
   completo), así que ningún comando propio del modo (!go, !atacar, !d...)
   puede confundirse con un Pokémon.
   --------------------------------------------------------- */
const POKEMON_JOIN_MODES = new Set(
  Object.keys(JOIN_COMMANDS_BY_MODE).filter(mode => JOIN_COMMANDS_BY_MODE[mode].includes('!pokemon'))
);
let pokemonByShortcut = null;

function normalizePokemonShortcut(str) {
  return String(str).trim().replace(/\s+/g, ' ').toLowerCase();
}

function findPokemonByShortcut(text) {
  if (!pokemonByShortcut) {
    pokemonByShortcut = new Map();
    ARENA_POKEMON_DB.forEach(p => {
      const key = normalizePokemonShortcut(p.name);
      if (!pokemonByShortcut.has(key)) pokemonByShortcut.set(key, p.name);
    });
  }
  if (!text.startsWith('!')) return null;
  return pokemonByShortcut.get(normalizePokemonShortcut(text.slice(1))) || null;
}

/* =========================================================
   COMMAND ROUTER
   -----------------------------------------------------------
   Punto único de entrada de los comandos del chat. Cada modo expone un
   solo handler (handleXxxCmd) que recibe TODOS sus comandos, incluido el
   de inscripción (!pokemon / !participo): antes el modo Boss era una
   excepción y su !pokemon se interceptaba envolviendo este router desde
   otro módulo (modes/pokeballSharedHandler.js), lo que duplicaba el
   filtro del Modo Subs y hacía que el orden de los imports decidiera si
   la intercepción llegaba a aplicarse o no. Ahora ese caso vive donde le
   corresponde, dentro de handleBossCmd (ver modes/boss.js).
   ========================================================= */
export function handleChatCommand(user, msg) {
  let text = msg.trim();
  let parts = text.split(/\s+/);
  let cmd = parts[0].toLowerCase();

  if (!state.currentMode) return;

  // Atajo "!<nombre del Pokémon>" -> "!pokemon <nombre>" (ver arriba).
  if (POKEMON_JOIN_MODES.has(state.currentMode) && cmd !== '!pokemon') {
    const shortcutName = findPokemonByShortcut(text);
    if (shortcutName) {
      text = '!pokemon ' + shortcutName;
      parts = text.split(/\s+/);
      cmd = '!pokemon';
    }
  }

  // Modo Subs: si está activo, solo los suscriptores (o el streamer) pueden
  // usar el comando de inscripción/participación de cada modo. El resto de
  // comandos del juego no se ven afectados.
  if (isJoinCommandBlocked(state.currentMode, cmd, user)) {
    addChatMessage(null, `🔒 @${user}: el Modo Subs está activado, solo pueden apuntarse los suscriptores del canal.`, 'system', { mirror: false });
    return;
  }

  switch (state.currentMode) {
    case 'pasapalabra': handlePasapalabraCmd(user, cmd, parts, text); break;
    case 'rayosolar': handleRayoSolarCmd(user, cmd, parts); break;
    case 'arena': handleArenaCmd(user, cmd, parts, text); break;
    case 'zoroarks': handleZoroarksCmd(user, cmd, parts, text); break;
    case 'safari': handleSafariCmd(user, cmd, parts); break;
    case 'boss': handleBossCmd(user, cmd, parts); break;
    case 'pokerus': handlePokerusCmd(user, cmd, parts); break;
    case 'volcan': handleVolcanCmd(user, cmd, parts); break;
    case 'vistalince': handleVistaLinceCmd(user, cmd, parts); break;
    case 'extranjeria': handleExtranjeriaCmd(user, cmd, parts, text); break;
    case 'voltorb': handleVoltorbCmd(user, cmd, parts, text); break;
    case 'avalugg': handleAvaluggCmd(user, cmd, parts, text); break;
    case 'charca': handleCharcaCmd(user, cmd, parts); break;
  }
}
