import { addChatMessage } from './chat.js';
import { playModeMusic, stopModeMusic } from './audio.js';
import { exitSceneFullscreen } from './fullscreen.js';
import { runModeCleanup } from './modeCleanup.js';
import { startArena } from './modes/arena.js';
import { startAvalugg } from './modes/avalugg.js';
import { startExtranjeria } from './modes/extranjeria.js';
import { startBoss } from './modes/boss.js';
import { startPasapalabra } from './modes/pasapalabra.js';
import { startPokerus } from './modes/pokerus.js';
import { startRayoSolar } from './modes/rayosolar.js';
import { startSafari } from './modes/safari.js';
import { startVistaLince } from './modes/vistalince.js';
import { startVoltorbExplosivo } from './modes/voltorbexplosivo.js';
import { startVolcan } from './modes/volcan.js';
import { startZoroarks } from './modes/zoroarks.js';
import { state } from './state.js';
import { $, showScreen } from './utils.js';

/* =========================================================
   MODE LAUNCHER
   ========================================================= */
// Pista de música de fondo (ver MODE_MUSIC_SRC en audio.js) asociada a cada
// modo. Pokerus empieza sonando con la pista del primer día (pokerus1); el
// propio modo se encarga de pasar a pokerus2 en cuanto arranca el segundo
// día (ver startPokerusRound en pokerus.js). El modo Boss no aparece aquí:
// su música depende del nivel/fase en curso, así que la gestiona él mismo
// (ver updateBossMusic en modes/boss.js) en vez de esta tabla de una sola
// pista fija por modo.
const MODE_MUSIC_KEY = {
  zoroarks: 'zoroarks',
  safari: 'zona-safari',
  volcan: 'volcan',
  vistalince: 'vista-lince',
  extranjeria: 'extranjeria',
  voltorb: 'voltorb-explosivo',
  avalugg: 'glaciar',
  pokerus: 'pokerus1',
  arena: 'arena',
  rayosolar: 'rayosolar',
  pasapalabra: 'pasapalabra',
};

// Modos cuya pantalla previa de inscripción (lobby, antes de pulsar
// "Comenzar Partida"/"Comenzar Combate") NO debe interrumpir la música del
// menú principal con la propia del modo: esta sigue sonando la de 'menu'
// (ver playModeMusic('menu') más abajo) mientras se apuntan los viewers, y
// es cada modo el que arranca su música (playModeMusic con la clave de
// MODE_MUSIC_KEY) en el momento en que el lobby se cierra y empieza el
// juego de verdad (ver startXxxMatch/startBossFight en su módulo). El modo
// Boss no está aquí porque, al no tener una pista fija en MODE_MUSIC_KEY,
// ya gestiona esto él mismo (updateBossMusic solo se llama al cerrarse el
// lobby, nunca durante la inscripción).
const MODES_WITHOUT_LOBBY_MUSIC = new Set([
  'rayosolar', 'zoroarks', 'safari', 'boss', 'pokerus', 'volcan', 'vistalince', 'voltorb', 'avalugg',
]);

// Título (con icono) de cada modo de juego.
export const MODE_TITLES = {
  pasapalabra: '🎯 Pasapalabra',
  rayosolar: '☀️ Rayo Solar',
  arena: '⚔️ Arena Pokémon',
  zoroarks: '🦊 Zoroarks',
  safari: '🌿 Zona Safari',
  boss: '👹 Boss Cooperativo',
  pokerus: '🧬 Pokerus',
  volcan: '🌋 El Volcán',
  vistalince: '🦅 Vista Lince',
  extranjeria: '🛂 Control de Extranjería',
  voltorb: '💣 Voltorb Explosivo',
  avalugg: '❄️ Glaciar de Avalugg',
};

export function launchMode(mode) {
  state.currentMode = mode;
  state.scores = {};
  $('game-title').textContent = MODE_TITLES[mode];
  showScreen('game-screen');
  $('chat-messages').innerHTML = '';
  addChatMessage(null, `🎮 Iniciando ${MODE_TITLES[mode]}...`, 'system', { mirror: false });
  switch (mode) {
    case 'pasapalabra': startPasapalabra(); break;
    case 'rayosolar': startRayoSolar(); break;
    case 'arena': startArena(); break;
    case 'zoroarks': startZoroarks(); break;
    case 'safari': startSafari(); break;
    case 'boss': startBoss(); break;
    case 'pokerus': startPokerus(); break;
    case 'volcan': startVolcan(); break;
    case 'vistalince': startVistaLince(); break;
    case 'extranjeria': startExtranjeria(); break;
    case 'voltorb': startVoltorbExplosivo(); break;
    case 'avalugg': startAvalugg(); break;
  }
  // El modo Boss no tiene una única pista fija: depende del nivel/fase con
  // que arranque (ver updateBossMusic en modes/boss.js, llamada desde el
  // propio startBoss() de arriba), así que aquí se le deja gestionar su
  // propia música en vez de aplicarle esta tabla genérica.
  if (mode === 'boss') {
    // no-op: startBoss() ya ha puesto en marcha la pista que corresponda
    // (o ninguna, si el lobby inicial no debe sonar con música propia).
  } else if (MODES_WITHOUT_LOBBY_MUSIC.has(mode)) {
    // Estos modos no arrancan su música al lanzarse: la pantalla de
    // inscripción sigue sonando con la del menú, y es el propio modo quien
    // llama a playModeMusic() al cerrarse el lobby (ver startXxxMatch en su
    // módulo).
  } else {
    const musicKey = MODE_MUSIC_KEY[mode];
    if (musicKey) playModeMusic(musicKey); else stopModeMusic();
  }
  // Se avisa con un evento (en vez de importar directamente la lógica de
  // pantalla completa desde eventListeners.js) para no crear una
  // dependencia circular entre módulos: eventListeners.js ya importa
  // launchMode desde aquí. El listener decide si corresponde pedir
  // pantalla completa automática según la preferencia guardada.
  document.dispatchEvent(new CustomEvent('pk-mode-launched'));
}

export function backToMenu() {
  // Si la escena del modo que se abandona estaba en pantalla completa
  // (nativa o simulada con ".fs-fallback"), hay que salir explícitamente
  // ANTES de cambiar de pantalla con showScreen() más abajo. Si no se hace,
  // el elemento fullscreen nativo queda en el "top layer" del navegador
  // -que ignora el display:none que showScreen() le pone a #game-screen al
  // desactivarlo- y se sigue viendo (y bloqueando toda interacción) por
  // encima del menú recién mostrado, aunque la interfaz ya "crea" que se ha
  // salido del modo. En el caso del fallback simulado (position:fixed) el
  // efecto es el mismo si nadie llama a exitFallbackFullscreen().
  exitSceneFullscreen();
  state.currentMode = null;
  // Al volver al menú principal (pantalla de selección de modo) suena su
  // propia pista de fondo (ver 'menu' en MODE_MUSIC_SRC, audio.js), en vez
  // de quedarse en silencio: playModeMusic ya hace el cruce de fundidos con
  // la que estuviera sonando en el modo que se acaba de abandonar.
  playModeMusic('menu');
  // Toda la limpieza del modo (temporizadores, sprites, overlays sueltos
  // fuera de #game-content...) la declara cada modo en su propio
  // startXxx() con registerModeCleanup(); aquí solo se dispara. Ver
  // modeCleanup.js para el porqué y para el barrido automático de
  // temporizadores que sirve de red de seguridad.
  runModeCleanup();
  state.modeState = null;
  showScreen('menu-screen');
}
