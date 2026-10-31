import { addChatMessage, escapeHtml } from '../chat.js';
import {
  playCountdownBeep, playModeMusic, playVeDraw, playVeJoin, playVeLifeLost,
  playVeMatchStart, playVeRoundComplete, playVeVictory,
} from '../audio.js';
import { getPokemonSprite } from '../data/pokemonDb.js';
import { currentFullscreenElement, requestSceneFullscreen } from '../fullscreen.js';
import { toggleLobbyExpelPopover } from '../lobbyExpel.js';
import { backToMenu } from '../modeLauncher.js';
import { PMDSprite, PMD_DIR, pmdPreload } from '../pmdSprite.js';
import { state } from '../state.js';
import { isCharcaTazaUnlocked, UNLOCKS_CHANGED_EVENT } from '../codes.js';
import { $, detachModalFromGameContent, toast } from '../utils.js';
import { modeSetInterval, modeSetTimeout, registerModeCleanup, runModeCleanup } from '../modeCleanup.js';

/* =========================================================
   MODO LA CHARCA — "Ludicolo: Simón Dice" (modo secreto, se desbloquea
   con el código "Shinycolo" desde Ajustes, ver js/codes.js)
   -----------------------------------------------------------
   - Lobby: los viewers se apuntan con !participo (mín. 2 para poder
     empezar, máx. 10 jugadores), igual que en Voltorb Explosivo / Glaciar de
     Avalugg. Cada uno aparece en el lobby con el sprite PMD de
     Lotad.
   - Escena: el mapa de fondo (sin plataformas visibles) con Ludicolo
     (sprite PMD) en el centro, algo elevado respecto al punto medio, y
     10 posiciones para los Lotad repartidas por igual en la mitad
     inferior (2 filas x 5). Cada jugador inscrito ocupa una posición,
     por orden de inscripción, con el sprite PMD de Lotad; las
     posiciones que sobran quedan vacías.
   - Juego (Simón Dice): en cada ronda el streamer elige, con los
     botones de su panel, una secuencia de N pasos de baile (N = nº
     de ronda) entre !giro !paso !roto !salto !agito. Ludicolo la
     demuestra, y tras el cartel «Turno de Lotad» los jugadores tienen
     20 s para escribir esos mismos comandos en el chat. Después, tras
     el cartel «A Bailar», Ludicolo repite la secuencia y cada Lotad
     ejecuta la que su jugador escribió; quien no la haya repetido
     exactamente (mismos pasos, mismo nº y mismo orden) queda
     eliminado. Se sigue con una ronda más larga hasta que quede un
     solo jugador vivo o ninguno (o se alcance CHARCA_MAX_ROUNDS, si se
     activa).
   - Flujo de una ronda (fases de ms.phase):
       round-notice → selecting → attention-notice → demo → turn-notice → answering →
       dance-notice → replay → checking → (round-notice | ended)
   - Animaciones de baile: cada paso reproduce UNA vez, mirando hacia
     abajo, la animación PMD de su sprite (ver CHARCA_STEPS.anim y
     performCharcaStep()):
        !giro → Swing · !roto → Rotate · !salto → Hop · !paso → Attack
        !agito → Shake (Lotad) / Emit (Ludicolo)
     Sus datos viven en js/data/pmdCharcaAnimDb.js y la lógica de
     tiempos espera a que termine cada animación.
   ========================================================= */

const CHARCA_MAX_PLAYERS = 10;
const CHARCA_MIN_PLAYERS = 2; // jugadores inscritos necesarios para poder empezar la partida
const CHARCA_LUDICOLO_DEX = 272;
const CHARCA_LOTAD_DEX = 270;
const CHARCA_ANIM_SPEED = 2.6; // animación "Walk" lenta = de pie quieto, como en el resto de modos

// Anchura de referencia (px) del escenario para la que están pensados los
// tamaños fijos del CSS de .charca-*: el escenario publica en --ch-k
// (ancho real / esta referencia) el factor por el que escalar sprites y
// textos, para que se vean proporcionados en cualquier tamaño de ventana
// y en pantalla completa (ver observeCharcaStageScale).
const CHARCA_STAGE_REF_WIDTH = 960;
const CHARCA_STAGE_REF_HEIGHT = 540;

// Posición de Ludicolo (en % del escenario): en el centro horizontal y algo
// por encima del centro vertical (50%). Es el punto donde apoya los pies.
const CHARCA_LUDICOLO_POS = { x: 50, y: 52 };

// 10 posiciones para los Lotad repartidas por igual en la MITAD INFERIOR del
// escenario: 2 filas x 5 columnas. Coordenadas (en %) del punto donde apoya
// los pies el sprite de cada jugador.
// Desplazamiento vertical (en %) que se resta a esa posición para colocar el
// nombre y el contador de pasos del jugador.
const CHARCA_PLAYER_SLOT_DY = -3;
const CHARCA_PLAYER_SLOTS = (() => {
  const xs = [10, 30, 50, 70, 90];
  const ys = [64, 87];
  const slots = [];
  ys.forEach(y => xs.forEach(x => slots.push({ x, y })));
  return slots;
})();

/* ---------------------------------------------------------
   CONSTANTES DEL JUEGO
   --------------------------------------------------------- */

// Pasos de baile. El orden es el de los botones del panel del streamer. Para
// añadir/quitar un paso basta con tocar esta lista (el icono es solo visual).
// `color` / `dark` son el color del paso (arriba y abajo del degradado): lo usan
// su botón, su casilla en la secuencia y la notificación de Ludicolo.
// `anim` es la animación PMD que reproduce el paso; si cambia según el
// Pokémon, es un objeto { [dex]: nombre } (ver charcaStepAnimName).
const CHARCA_STEPS = [
  { cmd: '!giro',  label: 'Giro',  icon: '🌀', color: '#2f9be8', dark: '#1b5fa6', anim: 'Swing' },
  { cmd: '!paso',  label: 'Paso',  icon: '👣', color: '#46b552', dark: '#1f7a30', anim: 'Attack' },
  { cmd: '!roto',  label: 'Roto',  icon: '🔃', color: '#a35be0', dark: '#5e24a8', anim: 'Rotate' },
  { cmd: '!salto', label: 'Salto', icon: '⬆️', color: '#ff8a3d', dark: '#d6410f', anim: 'Hop' },
  { cmd: '!agito', label: 'Agito', icon: '🙌', color: '#ec4a8b', dark: '#a61e58', anim: { [CHARCA_LOTAD_DEX]: 'Shake', [CHARCA_LUDICOLO_DEX]: 'Emit' } },
];
// Animaciones de baile que se precargan de cada Pokémon (Walk es la de reposo).
const CHARCA_DANCE_ANIMS = {
  [CHARCA_LOTAD_DEX]: ['Walk', 'Swing', 'Attack', 'Rotate', 'Hop', 'Shake'],
  [CHARCA_LUDICOLO_DEX]: ['Walk', 'Swing', 'Attack', 'Rotate', 'Hop', 'Emit'],
};
// Map y no objeto: con un objeto, un mensaje de chat como "constructor"
// encontraría Object.prototype.constructor y se tomaría por un paso válido.
const CHARCA_STEP_BY_CMD = new Map(CHARCA_STEPS.map(step => [step.cmd, step]));

// Tiempos (ms). Los de los carteles son el tiempo VISIBLE (entre el final de
// la animación de entrada y el principio de la de salida); las animaciones
// de entrada/salida duran CHARCA_BANNER_IN_MS / _OUT_MS y deben casar con
// "charcaBannerIn" / "charcaBannerOut" del CSS.
const CHARCA_ANSWER_SECONDS = 20;        // tiempo de los jugadores para escribir su secuencia
const CHARCA_BANNER_IN_MS = 500;
const CHARCA_BANNER_OUT_MS = 400;
const CHARCA_BANNER_TURN_HOLD_MS = 2500; // «Turno de Lotad»
const CHARCA_BANNER_DANCE_HOLD_MS = 1500; // «A Bailar»
const CHARCA_BANNER_ATTENTION_HOLD_MS = 1500; // «Atentos» (antes de que Ludicolo enseñe la secuencia)
const CHARCA_BANNER_ROUND_HOLD_MS = 2000; // cambio de ronda (por definir en el diseño)
const CHARCA_DANCE_ANIM_SPEED = 2;       // velocidad de la animación de cada paso (1 = la original de PMD; 2 = el doble de lenta)
const CHARCA_STEP_GAP_MS = 300;          // pausa (en reposo) tras cada paso, para distinguir pasos repetidos
const CHARCA_STEP_NOTE_OUT_MS = 250;     // salida de la notificación del paso (debe casar con "charcaStepNoteOut" del CSS)
const CHARCA_STEP_SAFETY_MS = 4000;      // red de seguridad: si una animación no avisa de que acabó, se sigue igualmente
const CHARCA_PHASE_GAP_MS = 500;         // respiro entre fases (p.ej. tras acabar de bailar)
const CHARCA_RESULT_PAUSE_MS = 2200;     // tiempo para ver quién ha caído antes del cartel de la ronda siguiente
const CHARCA_COUNTDOWN_BEEP_FROM = 5;    // pitidos de cuenta atrás en los últimos N segundos del turno

// Límite de rondas. 0 = sin límite (gana el último jugador en pie, que es la
// condición principal). Con un valor > 0, al terminar esa ronda la partida
// acaba aunque queden varios jugadores, y todos los supervivientes comparten
// la victoria.
const CHARCA_MAX_ROUNDS = 0;

// Comandos de baile que se guardan por jugador por encima de la longitud de
// la secuencia. Con uno más ya basta para saber que "se ha pasado"; el margen
// solo sirve para que, al reproducir, se vea el baile (algo) largo de quien
// ha escrito de más, sin que un spammer haga bailar a su Lotad eternamente.
const CHARCA_MAX_EXTRA_ANSWERS = 3;

// Solo para depuración: muestra además una burbuja con el paso que se está
// ejecutando. Ya no hace falta ahora que los sprites tienen su animación.
const CHARCA_SHOW_STEP_BUBBLES = false;

// Textos de la barra de estado (HUD) según la fase. Las fases de cartel no
// llevan texto: ya hay un cartel en pantalla.
const CHARCA_PHASE_TEXT = {
  selecting: 'El streamer elige los pasos',
  demo: 'Ludicolo baila: ¡memoriza!',
  answering: '¡Repite los pasos en el chat!',
  replay: 'Comparando los bailes…',
  checking: 'Comprobando…',
};

// Preferencia (guardada entre sesiones) de usar la canción «Taza» en lugar de
// la de La Charca (ver el botón ☕ del lobby). Solo tiene efecto si el código
// "soyunataza" está desbloqueado (ver codes.js).
const CHARCA_TAZA_PREF_KEY = 'pokekukoro_charca_taza_song';

function isCharcaTazaSongOn() {
  if (!isCharcaTazaUnlocked()) return false;
  try {
    return localStorage.getItem(CHARCA_TAZA_PREF_KEY) === '1';
  } catch (e) {
    return false;
  }
}

function setCharcaTazaSongOn(on) {
  try {
    localStorage.setItem(CHARCA_TAZA_PREF_KEY, on ? '1' : '0');
  } catch (e) {
    // sin persistencia: solo vale para esta sesión
    charcaTazaSessionFallback = on;
  }
}
let charcaTazaSessionFallback = false;

// Muestra/oculta el botón ☕ del lobby según el desbloqueo y refleja si la
// canción «Taza» está activada. Se llama al pintar el lobby y cuando un
// código desbloquea algo (UNLOCKS_CHANGED_EVENT).
function syncCharcaTazaButton() {
  const btn = $('charca-taza-btn');
  if (!btn) return;
  const unlocked = isCharcaTazaUnlocked();
  btn.style.display = unlocked ? '' : 'none';
  const on = isCharcaTazaSongOn() || (unlocked && charcaTazaSessionFallback);
  btn.classList.toggle('active', on);
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.title = on
    ? 'Canción «Taza» activada: clic para volver a la canción de La Charca'
    : 'Clic para usar la canción «Taza» en lugar de la de La Charca';
}
document.addEventListener(UNLOCKS_CHANGED_EVENT, syncCharcaTazaButton);

export function startCharca() {
  // Igual que en Voltorb Explosivo / El Volcán: si la escena anterior
  // estaba en pantalla completa, se guarda para restaurarla sobre el lobby
  // nuevo (que reemplaza todo el contenido de #game-content).
  const wasFullscreen = !!currentFullscreenElement();
  // "Nueva Partida" llama otra vez a esta función SIN pasar por backToMenu():
  // se limpia aquí la partida anterior (temporizadores del turno, sprites...)
  // para que no siga corriendo nada en segundo plano.
  if (state.modeState && state.modeState.mode === 'charca') runModeCleanup();
  state.modeState = {
    mode: 'charca',
    phase: 'lobby',        // 'lobby' | 'round-notice' | 'selecting' | 'attention-notice' | 'demo' | 'turn-notice' | 'answering' | 'dance-notice' | 'replay' | 'checking' | 'ended'
    players: {},            // user -> { user, alive, answers: [cmd], overflow }
    order: [],               // orden de inscripción = orden de las posiciones
    lobbySprites: {},        // user -> { el, sprite } — Lotad del lobby
    // Usuarios expulsados del lobby por el streamer: no pueden volver a
    // apuntarse en ESTA partida.
    expelledUsers: new Set(),
    lobbyExpelPopoverUser: null,
    lobbyExpelPopoverEl: null,
    fieldSprites: [],        // sprites PMD de la escena (Ludicolo + Lotad)
    scaleObserver: null,     // ResizeObserver que mantiene --ch-k en el escenario
    // Elementos de la escena (se rellenan en renderCharcaField):
    // ludicolo = { el, sprite }; players[user] = { el, sprite, labelEl, countEl }
    actors: { ludicolo: null, players: {} },
    initialCount: 0,         // jugadores con los que empezó la partida
    round: 0,                // ronda en curso (= nº de pasos de la secuencia)
    selection: [],           // pasos que el streamer lleva elegidos en esta ronda
    sequence: [],            // secuencia ya cerrada de la ronda (la que baila Ludicolo)
    answerDeadline: 0,       // Date.now() en el que se cierra el turno de los jugadores
    lastBeepSecond: null,    // último segundo para el que ya sonó el pitido de cuenta atrás
    turnTickInterval: null,  // intervalo que vigila la cuenta atrás del turno
    result: null,            // resultado final: { type: 'winner' | 'none' | 'limit', ... }
  };

  // Limpieza al abandonar el modo (ver modeCleanup.js). Los temporizadores
  // del juego (carteles, pasos, cuenta atrás) se programan con
  // modeSetTimeout/modeSetInterval, que ya se cancelan solos.
  registerModeCleanup(() => {
    const ms = state.modeState;
    if (!ms) return;
    Object.values(ms.lobbySprites).forEach(d => d.sprite && d.sprite.destroy());
    ms.fieldSprites.forEach(s => s.destroy());
    ms.fieldSprites = [];
    if (ms.scaleObserver) { ms.scaleObserver.disconnect(); ms.scaleObserver = null; }
  });

  pmdPreload(CHARCA_LOTAD_DEX, CHARCA_DANCE_ANIMS[CHARCA_LOTAD_DEX]);
  pmdPreload(CHARCA_LUDICOLO_DEX, CHARCA_DANCE_ANIMS[CHARCA_LUDICOLO_DEX]);
  renderCharcaLobby();
  if (wasFullscreen) requestSceneFullscreen($('charca-lobby-scene'));
  addChatMessage(null, `🐸 ¡La Charca está abierta! Escribe !participo para apuntarte (máx. ${CHARCA_MAX_PLAYERS} jugadores)`, 'system');
}

/* ---------------------------------------------------------
   COMANDOS DE CHAT
   --------------------------------------------------------- */
export function handleCharcaCmd(user, cmd, parts = [cmd]) {
  const ms = state.modeState;
  if (!ms) return;
  if (cmd === '!participo') { joinCharca(user); return; }
  // Comandos de baile: solo cuentan durante el turno de los jugadores (ver
  // recordCharcaAnswers). Fuera de él se ignoran sin avisar.
  if (CHARCA_STEP_BY_CMD.has(cmd)) recordCharcaAnswers(user, parts);
}

function joinCharca(user) {
  const ms = state.modeState;
  if (ms.phase !== 'lobby') {
    addChatMessage(null, `${user}: la partida ya ha comenzado, ¡espera a la siguiente!`, 'system', { mirror: false });
    return;
  }
  if (ms.expelledUsers.has(user)) {
    addChatMessage(null, `${user}: el streamer te ha expulsado de esta partida, no puedes volver a apuntarte hasta la siguiente`, 'system', { mirror: false });
    return;
  }
  if (ms.players[user]) return;
  if (ms.order.length >= CHARCA_MAX_PLAYERS) {
    addChatMessage(null, `${user}: la charca está llena (${CHARCA_MAX_PLAYERS}/${CHARCA_MAX_PLAYERS})`, 'system', { mirror: false });
    return;
  }
  ms.players[user] = { user, alive: true, answers: [], overflow: false };
  ms.order.push(user);
  addChatMessage(null, `✅ ${user} se apunta a La Charca! (${ms.order.length}/${CHARCA_MAX_PLAYERS})`, 'correct', { mirror: false });
  playVeJoin();
  renderCharcaLobbyGrid();
}

// Guarda, en orden de llegada, los comandos de baile que un jugador escribe
// durante el turno. Se acepta más de un comando por mensaje ("!giro !paso"):
// cada palabra que sea un paso cuenta, el resto del mensaje se ignora. Lo que
// se guarda NO se puede modificar ni borrar; la comprobación se hace al
// final con exactamente lo registrado aquí (ver evaluateCharcaAnswer).
function recordCharcaAnswers(user, parts) {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'answering' || Date.now() >= ms.answerDeadline) return;
  const player = ms.players[user];
  if (!player || !player.alive) return;
  const max = ms.sequence.length + CHARCA_MAX_EXTRA_ANSWERS;
  let changed = false;
  parts.forEach(word => {
    const step = CHARCA_STEP_BY_CMD.get(String(word).toLowerCase());
    if (!step) return;
    if (player.answers.length >= max) { player.overflow = true; changed = true; return; }
    player.answers.push(step.cmd);
    changed = true;
  });
  if (changed) updateCharcaAnswerCounts();
}

/* ---------------------------------------------------------
   LOBBY
   --------------------------------------------------------- */
function renderCharcaLobby() {
  // Ver detachModalFromGameContent() en utils.js.
  detachModalFromGameContent();
  const content = $('game-content');
  content.innerHTML = `
    <div class="charca-lobby-box game-scene" id="charca-lobby-scene">
      <div class="charca-lobby-head">
        <div class="charca-lobby-icon">🐸</div>
        <div class="big-count pixel" id="charca-count">0</div>
        <div style="color:var(--muted);font-size:12px;">/ ${CHARCA_MAX_PLAYERS} jugadores apuntados (mín. ${CHARCA_MIN_PLAYERS}) · escribe <b style="color:var(--yellow)">!participo</b> en el chat</div>
      </div>
      <div class="charca-lobby-grid" id="charca-lobby-grid">
        <div class="charca-lobby-empty">Esperando a que el chat se apunte...</div>
      </div>
      <button class="charca-start-btn" id="charca-start-btn" disabled>▶ Comenzar Partida</button>
      <button type="button" class="charca-taza-btn" id="charca-taza-btn" style="display:none;" aria-label="Canción Taza">☕</button>
    </div>
  `;
  $('charca-start-btn').onclick = () => startCharcaMatch();
  $('charca-taza-btn').onclick = () => {
    const turnOn = !(isCharcaTazaSongOn() || charcaTazaSessionFallback);
    charcaTazaSessionFallback = turnOn;
    setCharcaTazaSongOn(turnOn);
    syncCharcaTazaButton();
    toast(turnOn ? '☕ Canción «Taza» activada' : '🐸 Canción de La Charca activada');
  };
  syncCharcaTazaButton();
  renderCharcaLobbyGrid();
}

function renderCharcaLobbyGrid() {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'lobby') return;
  const grid = $('charca-lobby-grid');
  const countEl = $('charca-count');
  const btn = $('charca-start-btn');
  if (!grid) return;
  const players = ms.order.map(u => ms.players[u]);
  if (countEl) countEl.textContent = players.length;
  if (btn) btn.disabled = players.length < CHARCA_MIN_PLAYERS;

  if (players.length === 0) {
    grid.innerHTML = '<div class="charca-lobby-empty">Esperando a que el chat se apunte...</div>';
    return;
  }
  const emptyMsg = grid.querySelector('.charca-lobby-empty');
  if (emptyMsg) emptyMsg.remove();

  players.forEach(p => {
    if (ms.lobbySprites[p.user]) return; // ya tiene tarjeta creada
    const el = document.createElement('div');
    el.className = 'charca-lobby-card';
    el.title = 'Clic para expulsar de la partida';
    el.innerHTML = `
      <div class="pmd-slot pmd-mini"></div>
      <div class="p-user">@${escapeHtml(p.user)}</div>
    `;
    // El streamer puede hacer clic en cualquier jugador inscrito para que
    // aparezca un pequeño botón "Expulsar" sobre su tarjeta.
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      toggleLobbyExpelPopover(ms, p.user, el, expelFromCharcaLobby);
    });
    grid.appendChild(el);
    const sprite = new PMDSprite(el.querySelector('.pmd-slot'), getPokemonSprite(CHARCA_LOTAD_DEX));
    sprite.setDex(CHARCA_LOTAD_DEX);
    sprite.play('Walk', PMD_DIR.down, true, null, CHARCA_ANIM_SPEED);
    ms.lobbySprites[p.user] = { el, sprite };
  });
}

// Expulsa a un jugador inscrito del lobby (acción del streamer): se retira
// de la partida y no puede volver a apuntarse hasta la siguiente.
function expelFromCharcaLobby(user) {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'lobby' || !ms.players[user]) return;
  const idx = ms.order.indexOf(user);
  if (idx !== -1) ms.order.splice(idx, 1);
  delete ms.players[user];
  const entry = ms.lobbySprites[user];
  if (entry) {
    if (entry.sprite) entry.sprite.destroy();
    if (entry.el) entry.el.remove();
  }
  delete ms.lobbySprites[user];
  ms.expelledUsers.add(user);
  addChatMessage(null, `🚫 @${user} ha sido expulsado de la partida por el streamer`, 'system', { mirror: false });
  renderCharcaLobbyGrid();
}

/* ---------------------------------------------------------
   INICIO DE PARTIDA Y ESCENA
   --------------------------------------------------------- */
function startCharcaMatch() {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'lobby') return;
  if (ms.order.length < CHARCA_MIN_PLAYERS) {
    toast(`Se necesitan al menos ${CHARCA_MIN_PLAYERS} jugadores para empezar`);
    return;
  }
  // El lobby se destruye al pintar la escena: se descartan sus sprites.
  Object.values(ms.lobbySprites).forEach(d => d.sprite && d.sprite.destroy());
  ms.lobbySprites = {};
  ms.initialCount = ms.order.length;
  ms.phase = 'round-notice';
  renderCharcaField();
  // La música de la partida empieza aquí, al cerrarse la inscripción (el
  // lobby sigue con la música del menú, ver MODES_WITHOUT_LOBBY_MUSIC en
  // modeLauncher.js). Suena en bucle hasta salir del modo: al volver al
  // menú, backToMenu() la sustituye por la del menú.
  playModeMusic(isCharcaTazaSongOn() || (isCharcaTazaUnlocked() && charcaTazaSessionFallback) ? 'charca-taza' : 'charca');
  addChatMessage(null, `🐸 ¡Comienza La Charca con ${ms.order.length} jugador${ms.order.length === 1 ? '' : 'es'}!`, 'system', { mirror: false });
  playVeMatchStart();
  charcaFlow(beginCharcaRound());
}

function actorHtml(pos, extraClass) {
  // z-index según la fila (y): los de más abajo se pintan por encima.
  return `
    <div class="charca-actor ${extraClass}" style="left:${pos.x}%;top:${pos.y}%;z-index:${Math.round(pos.y)}">
      <div class="pmd-slot pmd-mini"></div>
    </div>`;
}

function renderCharcaField() {
  detachModalFromGameContent();
  const ms = state.modeState;
  const content = $('game-content');
  const sceneInner = `
      <button class="scene-fullscreen-btn" title="Pantalla completa" aria-label="Pantalla completa">⛶</button>
      <div class="charca-stage" id="charca-stage">
        <div class="charca-water"></div>
        ${actorHtml(CHARCA_LUDICOLO_POS, 'charca-ludicolo')}
        <div id="charca-players-layer"></div>
        <div class="charca-hud" id="charca-hud"></div>
      </div>
  `;

  // Si el lobby está en pantalla completa, NO se destruye su elemento: se
  // reutiliza como escena de la partida (nuevo id/clase + contenido). Si se
  // reemplazara #game-content con innerHTML, el elemento que está en
  // pantalla completa desaparecería y el navegador saldría de ella por su
  // cuenta (y cualquier petición nueva en ese mismo instante la cancela
  // también): el mapa acabaría dentro de la página, con márgenes y borde en
  // lugar de ocupar toda la pantalla.
  const lobbyEl = $('charca-lobby-scene');
  if (lobbyEl && currentFullscreenElement() === lobbyEl) {
    const fallback = lobbyEl.classList.contains('fs-fallback');
    lobbyEl.id = 'charca-scene';
    lobbyEl.className = 'charca-scene game-scene' + (fallback ? ' fs-fallback' : '');
    lobbyEl.innerHTML = sceneInner;
    // Refresca el estado del botón ⛶ nuevo y el tamaño fijo de la escena.
    document.dispatchEvent(new CustomEvent('scenefsfallbackchange'));
  } else {
    content.innerHTML = `<div class="charca-scene game-scene" id="charca-scene">${sceneInner}</div>`;
  }

  const stage = $('charca-stage');
  observeCharcaStageScale(stage);

  // Ludicolo, en el centro.
  const ludiSlot = stage.querySelector('.charca-ludicolo .pmd-slot');
  const ludi = new PMDSprite(ludiSlot, getPokemonSprite(CHARCA_LUDICOLO_DEX));
  ludi.setDex(CHARCA_LUDICOLO_DEX);
  ludi.play('Walk', PMD_DIR.down, true, null, CHARCA_ANIM_SPEED);
  ms.fieldSprites.push(ludi);
  ms.actors = { ludicolo: { el: stage.querySelector('.charca-ludicolo'), sprite: ludi }, players: {} };

  // Jugadores: uno por posición, por orden de inscripción. Las posiciones
  // sobrantes se quedan vacías.
  const layer = $('charca-players-layer');
  ms.order.slice(0, CHARCA_MAX_PLAYERS).forEach((user, i) => {
    const pos = CHARCA_PLAYER_SLOTS[i];
    layer.insertAdjacentHTML('beforeend', actorHtml(pos, 'charca-lotad'));
    const actorEl = layer.lastElementChild;
    const sprite = new PMDSprite(actorEl.querySelector('.pmd-slot'), getPokemonSprite(CHARCA_LOTAD_DEX));
    sprite.setDex(CHARCA_LOTAD_DEX);
    sprite.play('Walk', PMD_DIR.down, true, null, CHARCA_ANIM_SPEED);
    ms.fieldSprites.push(sprite);
    layer.insertAdjacentHTML('beforeend', `
      <div class="charca-label" style="left:${pos.x}%;top:${pos.y + CHARCA_PLAYER_SLOT_DY}%;z-index:${Math.round(pos.y) + 1}">@${escapeHtml(user)}</div>
    `);
    const labelEl = layer.lastElementChild;
    // Contador "n/N" de pasos recibidos: solo se ve durante el turno de los
    // jugadores (ver .is-answering en el CSS).
    layer.insertAdjacentHTML('beforeend', `
      <div class="charca-count" style="left:${pos.x}%;top:${pos.y + CHARCA_PLAYER_SLOT_DY}%;z-index:${Math.round(pos.y) + 1}"></div>
    `);
    const countEl = layer.lastElementChild;
    ms.actors.players[user] = {
      el: actorEl, sprite, labelEl, countEl,
    };
  });
  updateCharcaHud();
}

// Mantiene --ch-k (ancho real del escenario / ancho de referencia) para
// que sprites y textos escalen con el escenario, también en pantalla
// completa (los tamaños en px de los sprites PMD no escalan solos).
function observeCharcaStageScale(stage) {
  const ms = state.modeState;
  if (ms.scaleObserver) ms.scaleObserver.disconnect();
  // Escala = la menor entre ancho y alto respecto al tamaño de referencia
  // 16:9 (960x540): en ventana (16:9) equivale a width/960; en pantalla
  // completa con otra proporción, evita que los sprites se salgan.
  const apply = (width, height) => {
    if (!width || !height) return;
    const k = Math.min(width / CHARCA_STAGE_REF_WIDTH, height / CHARCA_STAGE_REF_HEIGHT);
    stage.style.setProperty('--ch-k', k.toFixed(4));
  };
  const r = stage.getBoundingClientRect();
  apply(r.width, r.height);
  ms.scaleObserver = new ResizeObserver(entries => {
    const entry = entries[0];
    if (entry) apply(entry.contentRect.width, entry.contentRect.height);
  });
  ms.scaleObserver.observe(stage);
}

/* =========================================================
   FLUJO DE RONDAS
   -----------------------------------------------------------
   Cada fase espera a la anterior con `await` sobre charcaWait(), que se
   apoya en modeSetTimeout (ver modeCleanup.js): si se sale al menú o se
   empieza una partida nueva, el temporizador pendiente no llega a
   ejecutarse y la cadena de `await` queda detenida para siempre sin tocar
   nada de un estado ya destruido.
   ========================================================= */

// Espera `delay` ms. Nunca se resuelve si, mientras tanto, se abandona el modo.
function charcaWait(delay) {
  return new Promise(resolve => { modeSetTimeout(resolve, delay); });
}

// Lanza una cadena asíncrona sin esperarla, dejando en consola cualquier
// error en vez de perderlo como "unhandled rejection".
function charcaFlow(promise) {
  promise.catch(err => console.error('[La Charca]', err));
}

function alivePlayers() {
  const ms = state.modeState;
  return ms.order.map(user => ms.players[user]).filter(p => p && p.alive);
}

function setCharcaPhase(phase) {
  const ms = state.modeState;
  ms.phase = phase;
  const stage = $('charca-stage');
  if (stage) stage.classList.toggle('is-answering', phase === 'answering');
  updateCharcaHud();
}

/* ---------------------------------------------------------
   Fase 8 / inicio: aviso de ronda y selección del streamer
   --------------------------------------------------------- */
async function beginCharcaRound() {
  const ms = state.modeState;
  if (!ms) return;
  ms.round += 1;
  ms.selection = [];
  ms.sequence = [];
  alivePlayers().forEach(p => { p.answers = []; p.overflow = false; });
  setCharcaPhase('round-notice');
  await showCharcaBanner({
    kind: 'round',
    text: `Ronda ${ms.round}`,
    sub: `${ms.round} ${ms.round === 1 ? 'paso' : 'pasos'} de baile`,
    holdMs: CHARCA_BANNER_ROUND_HOLD_MS,
  });
  // Fase 1: el streamer elige los pasos.
  setCharcaPhase('selecting');
  renderCharcaPicker();
}

/* ---------------------------------------------------------
   Fase 1: panel de selección del streamer
   --------------------------------------------------------- */
// Variables CSS con el color de un paso (--st / --st-dark).
function charcaStepStyle(step) {
  return `--st:${step.color};--st-dark:${step.dark}`;
}

function renderCharcaPicker() {
  const ms = state.modeState;
  const stage = $('charca-stage');
  if (!ms || !stage) return;
  let panel = $('charca-picker');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'charca-picker';
    panel.className = 'charca-picker';
    stage.appendChild(panel);
  }
  const slots = Array.from({ length: ms.round }, (_, i) => {
    const step = CHARCA_STEP_BY_CMD.get(ms.selection[i]);
    return step
      ? `<span class="charca-slot is-filled" style="${charcaStepStyle(step)}" title="${step.label}">${step.icon}</span>`
      : '<span class="charca-slot"></span>';
  }).join('');
  const buttons = CHARCA_STEPS.map(step => `
    <button class="charca-picker__btn" data-step="${step.cmd}" style="${charcaStepStyle(step)}">
      <span class="charca-picker__icon">${step.icon}</span>${step.label}
    </button>`).join('');
  panel.innerHTML = `
    <div class="charca-picker__title">Elige los pasos <b>${ms.selection.length}/${ms.round}</b></div>
    <div class="charca-picker__slots">${slots}</div>
    <div class="charca-picker__btns">${buttons}</div>
  `;
  panel.querySelectorAll('[data-step]').forEach(btn => {
    btn.onclick = () => pickCharcaStep(btn.dataset.step);
  });
}

function pickCharcaStep(cmd) {
  const ms = state.modeState;
  if (!ms || ms.phase !== 'selecting' || !CHARCA_STEP_BY_CMD.has(cmd)) return;
  if (ms.selection.length >= ms.round) return;
  ms.selection.push(cmd);
  if (ms.selection.length < ms.round) {
    renderCharcaPicker();
    return;
  }
  // Secuencia completa: se guarda con su orden exacto y empieza la demostración.
  ms.sequence = ms.selection.slice();
  const panel = $('charca-picker');
  if (panel) panel.remove();
  charcaFlow(runCharcaRound());
}

/* ---------------------------------------------------------
   Fases 2 a 8 de una ronda, ya con la secuencia elegida
   --------------------------------------------------------- */
async function runCharcaRound() {
  const ms = state.modeState;

  // Fase 1b: cartel «Atentos». Cuando se va, empieza la demostración.
  setCharcaPhase('attention-notice');
  await showCharcaBanner({ kind: 'attention', text: 'Atentos', holdMs: CHARCA_BANNER_ATTENTION_HOLD_MS });

  // Fase 2: Ludicolo demuestra la secuencia, paso a paso y en orden.
  setCharcaPhase('demo');
  await charcaWait(CHARCA_PHASE_GAP_MS);
  await charcaLudicoloDance(ms.sequence);
  await charcaWait(CHARCA_PHASE_GAP_MS);

  // Fase 3: cartel «Turno de Lotad».
  setCharcaPhase('turn-notice');
  await showCharcaBanner({ kind: 'turn', text: 'Turno de Lotad', holdMs: CHARCA_BANNER_TURN_HOLD_MS });

  // Fase 4: turno de los jugadores (20 s). Termina cuando se cierra el tiempo.
  await runCharcaAnswerPhase();

  // Fase 5: cartel «A Bailar».
  setCharcaPhase('dance-notice');
  await showCharcaBanner({ kind: 'dance', text: 'A Bailar', holdMs: CHARCA_BANNER_DANCE_HOLD_MS });

  // Fase 6: Ludicolo repite la secuencia y, justo después, todos los Lotad
  // ejecutan a la vez lo que escribieron sus jugadores.
  setCharcaPhase('replay');
  await charcaWait(CHARCA_PHASE_GAP_MS);
  await charcaLudicoloDance(ms.sequence);
  await charcaLotadsDance();
  await charcaWait(CHARCA_PHASE_GAP_MS);

  // Fase 7: comprobación y eliminaciones.
  setCharcaPhase('checking');
  resolveCharcaRound();

  // Fin de partida o Fase 8: siguiente ronda.
  const end = checkCharcaEnd();
  if (end) {
    await charcaWait(CHARCA_RESULT_PAUSE_MS);
    endCharcaMatch(end);
    return;
  }
  await charcaWait(CHARCA_RESULT_PAUSE_MS);
  await beginCharcaRound();
}

/* ---------------------------------------------------------
   Fase 4: turno de los jugadores
   --------------------------------------------------------- */
function runCharcaAnswerPhase() {
  const ms = state.modeState;
  return new Promise(resolve => {
    alivePlayers().forEach(p => { p.answers = []; p.overflow = false; });
    ms.answerDeadline = Date.now() + CHARCA_ANSWER_SECONDS * 1000;
    ms.lastBeepSecond = null;
    setCharcaPhase('answering');
    updateCharcaAnswerCounts();
    addChatMessage(null, `🕺 ¡Turno de Lotad! Tenéis ${CHARCA_ANSWER_SECONDS}s para repetir los ${ms.sequence.length} ${ms.sequence.length === 1 ? 'paso' : 'pasos'} en orden: ${CHARCA_STEPS.map(s => s.cmd).join(' ')}`, 'system');

    ms.turnTickInterval = modeSetInterval(() => {
      const left = Math.ceil((ms.answerDeadline - Date.now()) / 1000);
      if (left <= 0) {
        clearInterval(ms.turnTickInterval);
        ms.turnTickInterval = null;
        // A partir de aquí recordCharcaAnswers() ya no acepta nada más.
        ms.phase = 'dance-notice';
        const timerEl = $('charca-hud-timer');
        if (timerEl) timerEl.textContent = '⏱ 0';
        resolve();
        return;
      }
      const timerEl = $('charca-hud-timer');
      if (timerEl) {
        timerEl.textContent = `⏱ ${left}`;
        timerEl.classList.toggle('is-low', left <= CHARCA_COUNTDOWN_BEEP_FROM);
      }
      if (left <= CHARCA_COUNTDOWN_BEEP_FROM && left !== ms.lastBeepSecond) {
        ms.lastBeepSecond = left;
        playCountdownBeep(left);
      }
    }, 200);
  });
}

// Contador "n/N" bajo cada jugador vivo (solo visible durante el turno).
function updateCharcaAnswerCounts() {
  const ms = state.modeState;
  if (!ms) return;
  const total = ms.sequence.length;
  alivePlayers().forEach(p => {
    const actor = ms.actors.players[p.user];
    if (!actor || !actor.countEl) return;
    const done = p.answers.length;
    actor.countEl.textContent = `${Math.min(done, total)}/${total}${p.overflow || done > total ? ' ⚠' : ''}`;
    actor.countEl.classList.toggle('is-full', done === total && !p.overflow);
    actor.countEl.classList.toggle('is-over', done > total || p.overflow);
  });
}

/* ---------------------------------------------------------
   Fases 2 y 6: bailes
   --------------------------------------------------------- */
async function charcaLudicoloDance(sequence) {
  const ms = state.modeState;
  for (const cmd of sequence) {
    await performCharcaStep(ms.actors.ludicolo, CHARCA_STEP_BY_CMD.get(cmd));
  }
}

// Todos los Lotad vivos bailan A LA VEZ lo que escribió su jugador, cada uno
// en el orden en que lo envió. Termina cuando acaba el que más pasos tenga.
async function charcaLotadsDance() {
  const ms = state.modeState;
  await Promise.all(alivePlayers().map(async p => {
    const actor = ms.actors.players[p.user];
    for (const cmd of p.answers) {
      await performCharcaStep(actor, CHARCA_STEP_BY_CMD.get(cmd));
    }
  }));
}

// Ludicolo y los Lotad ejecutan sus pasos SIEMPRE a través de esta función,
// una vez por paso: reproduce UNA vez la animación del paso (mirando hacia
// abajo), espera a que termine, devuelve al sprite a su reposo (Walk lento) y
// deja una pequeña pausa para que dos pasos iguales seguidos se distingan.
async function performCharcaStep(actor, step) {
  if (!actor || !step) return;
  const bubble = CHARCA_SHOW_STEP_BUBBLES ? showCharcaStepBubble(actor, step) : null;
  // Solo Ludicolo anuncia sus pasos con la notificación de la derecha.
  const note = actor === state.modeState.actors.ludicolo ? showCharcaStepNote(step) : null;
  await playCharcaStepAnim(actor, step);
  if (bubble) bubble.remove();
  if (note) hideCharcaStepNote(note);
  actor.sprite.play('Walk', PMD_DIR.down, true, null, CHARCA_ANIM_SPEED);
  await charcaWait(CHARCA_STEP_GAP_MS);
}

// Nombre de la animación PMD de un paso para el Pokémon (dex) que lo baila.
function charcaStepAnimName(step, dex) {
  return typeof step.anim === 'string' ? step.anim : step.anim[dex];
}

// Lanza la animación del paso una sola vez y resuelve cuando termina.
function playCharcaStepAnim(actor, step) {
  return new Promise(resolve => {
    const sprite = actor.sprite;
    const animName = charcaStepAnimName(step, sprite.dexId);
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    sprite.play(animName, PMD_DIR.down, false, finish, CHARCA_DANCE_ANIM_SPEED);
    modeSetTimeout(finish, CHARCA_STEP_SAFETY_MS);
  });
}

// Notificación con el nombre del paso que Ludicolo está bailando, a su
// derecha y con el color del paso. Se crea una por paso (así la animación se
// repite aunque dos pasos iguales vayan seguidos) y sale mientras dura la
// pausa entre pasos.
function showCharcaStepNote(step) {
  const stage = $('charca-stage');
  if (!stage) return null;
  const el = document.createElement('div');
  el.className = 'charca-step-note';
  el.setAttribute('style', charcaStepStyle(step));
  el.innerHTML = `
    <span class="charca-step-note__ring"></span>
    <span class="charca-step-note__icon">${step.icon}</span>
    <span class="charca-step-note__text pixel">${escapeHtml(step.label)}</span>
  `;
  stage.appendChild(el);
  return el;
}

function hideCharcaStepNote(el) {
  el.classList.add('is-out');
  modeSetTimeout(() => el.remove(), CHARCA_STEP_NOTE_OUT_MS);
}

function showCharcaStepBubble(actor, step) {
  const bubble = document.createElement('div');
  bubble.className = 'charca-step-bubble';
  bubble.textContent = `${step.icon} ${step.label}`;
  actor.el.appendChild(bubble);
  return bubble;
}

/* ---------------------------------------------------------
   Fase 7: comprobación y eliminaciones
   --------------------------------------------------------- */
// Devuelve { ok, reason }. Se compara SOLO lo registrado durante el turno:
// la secuencia es válida únicamente si coincide paso a paso (mismo número,
// mismos pasos y mismo orden).
function evaluateCharcaAnswer(sequence, answers, overflow) {
  if (answers.length === 0) return { ok: false, reason: 'no envió ningún paso' };
  if (answers.length < sequence.length) return { ok: false, reason: 'secuencia incompleta' };
  if (overflow || answers.length > sequence.length) return { ok: false, reason: 'demasiados pasos' };
  if (answers.every((cmd, i) => cmd === sequence[i])) return { ok: true, reason: '' };
  const sameSteps = [...answers].sort().join() === [...sequence].sort().join();
  return { ok: false, reason: sameSteps ? 'orden incorrecto' : 'paso incorrecto' };
}

function resolveCharcaRound() {
  const ms = state.modeState;
  const fallen = [];
  alivePlayers().forEach(p => {
    const res = evaluateCharcaAnswer(ms.sequence, p.answers, p.overflow);
    if (!res.ok) fallen.push({ player: p, reason: res.reason });
  });
  fallen.forEach(({ player }) => eliminateCharcaPlayer(player));
  updateCharcaHud();

  if (fallen.length === 0) {
    playVeRoundComplete();
    addChatMessage(null, `✅ Ronda ${ms.round}: ¡todos los jugadores la superan!`, 'correct');
    return;
  }
  playVeLifeLost();
  addChatMessage(null, `💀 Ronda ${ms.round}: eliminados ${fallen.map(f => '@' + f.player.user).join(', ')}`, 'system');
  // El motivo de cada eliminación solo se enseña en el panel del streamer.
  fallen.forEach(f => addChatMessage(null, `   · @${f.player.user}: ${f.reason}`, 'system', { mirror: false }));
}

function eliminateCharcaPlayer(player) {
  const ms = state.modeState;
  player.alive = false;
  const actor = ms.actors.players[player.user];
  if (!actor) return;
  [actor.el, actor.labelEl, actor.countEl].forEach(el => el && el.classList.add('is-eliminated'));
}

/* ---------------------------------------------------------
   Condiciones de fin de partida
   --------------------------------------------------------- */
// null = la partida sigue. La partida termina cuando queda un solo jugador
// vivo (gana) o ninguno (nadie gana: todos fallan en la misma ronda). Con
// CHARCA_MAX_ROUNDS > 0, al llegar a esa ronda termina la partida y los que
// sigan vivos la ganan juntos.
function checkCharcaEnd() {
  const ms = state.modeState;
  const alive = alivePlayers();
  if (alive.length === 0) return { type: 'none' };
  if (alive.length === 1) return { type: 'winner', user: alive[0].user };
  if (CHARCA_MAX_ROUNDS > 0 && ms.round >= CHARCA_MAX_ROUNDS) return { type: 'limit', users: alive.map(p => p.user) };
  return null;
}

function endCharcaMatch(result) {
  const ms = state.modeState;
  if (!ms) return;
  ms.result = result;
  setCharcaPhase('ended');
  const rounds = ms.round;
  const roundsTxt = n => `${n} ${n === 1 ? 'ronda' : 'rondas'}`;
  let line;
  let sub;
  if (result.type === 'winner') {
    line = `🏆 ¡@${result.user} gana La Charca!`;
    sub = `Último Lotad en pie tras ${roundsTxt(rounds)}`;
    playVeVictory();
  } else if (result.type === 'limit') {
    const names = result.users.map(u => '@' + u).join(', ');
    line = `🏆 ¡Límite de ${roundsTxt(rounds)} alcanzado!`;
    sub = `Supervivientes: ${names}`;
    playVeVictory();
  } else {
    line = 'Todos los jugadores han sido eliminados';
    sub = `En la ronda ${rounds}`;
    playVeDraw();
  }
  addChatMessage(null, `🏁 Fin de partida: ${line.replace(/^🏆 /, '')}. ${sub}`, result.type === 'none' ? 'system' : 'correct');
  showCharcaEndCard(line, sub);
}

// Cartel de fin de partida: usa la misma animación de entrada que el resto
// de carteles, pero se queda en pantalla con los botones de siempre.
function showCharcaEndCard(line, sub) {
  const stage = $('charca-stage');
  if (!stage) return;
  const hud = $('charca-hud');
  if (hud) hud.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'charca-end';
  card.innerHTML = `
    <div class="charca-end__title pixel">Fin de partida</div>
    <div class="charca-end__line">${escapeHtml(line)}</div>
    <div class="charca-end__sub">${escapeHtml(sub)}</div>
    <div class="mode-end-actions">
      <button class="charca-start-btn" id="charca-again-btn">🔁 Nueva Partida</button>
      <button class="mode-end-menu-btn" id="charca-menu-btn">🏠 Menú Principal</button>
    </div>
  `;
  stage.appendChild(card);
  $('charca-again-btn').onclick = () => startCharca();
  $('charca-menu-btn').onclick = () => backToMenu();
}

/* ---------------------------------------------------------
   CARTELES
   --------------------------------------------------------- */
// Cartel con animación de entrada -> permanencia (holdMs) -> animación de
// salida. Todos comparten estilo y animaciones (.charca-banner en el CSS);
// solo cambian el color (kind), el texto y el tiempo visible. Se resuelve
// cuando el cartel ha desaparecido por completo.
async function showCharcaBanner({ kind, text, sub = '', holdMs }) {
  const stage = $('charca-stage');
  if (!stage) return;
  const el = document.createElement('div');
  el.className = `charca-banner charca-banner--${kind}`;
  el.innerHTML = `
    <div class="charca-banner__text pixel">${escapeHtml(text)}</div>
    ${sub ? `<div class="charca-banner__sub">${escapeHtml(sub)}</div>` : ''}
  `;
  stage.appendChild(el);
  el.classList.add('is-in');
  await charcaWait(CHARCA_BANNER_IN_MS + holdMs);
  el.classList.remove('is-in');
  el.classList.add('is-out');
  await charcaWait(CHARCA_BANNER_OUT_MS);
  el.remove();
}

/* ---------------------------------------------------------
   HUD (ronda, jugadores vivos, fase y cuenta atrás)
   --------------------------------------------------------- */
function updateCharcaHud() {
  const ms = state.modeState;
  const hud = $('charca-hud');
  if (!ms || !hud || ms.phase === 'ended') return;
  const phaseText = CHARCA_PHASE_TEXT[ms.phase] || '';
  const answering = ms.phase === 'answering';
  hud.innerHTML = `
    <div class="charca-hud__chip charca-hud__round">Ronda ${Math.max(ms.round, 1)}</div>
    <div class="charca-hud__chip">🐸 ${alivePlayers().length}/${ms.initialCount}</div>
    ${phaseText ? `<div class="charca-hud__chip charca-hud__phase">${phaseText}</div>` : ''}
    ${answering ? `
      <div class="charca-hud__chip charca-hud__timer" id="charca-hud-timer">⏱ ${CHARCA_ANSWER_SECONDS}</div>
      <div class="charca-hud__chip charca-hud__cmds">${CHARCA_STEPS.map(s => s.cmd).join(' ')}</div>` : ''}
  `;
}
