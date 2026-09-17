import { state } from './state.js';

/* =========================================================
   LIMPIEZA AL SALIR DE UN MODO
   -----------------------------------------------------------
   Antes, backToMenu() (ver modeLauncher.js) llevaba a mano una lista de
   ~40 campos internos de los 12 modos de juego -temporizadores, sprites,
   overlays sueltos del <body>...- que había que cancelar al volver al
   menú. Eso tenía dos problemas: el lanzador acababa conociendo las
   tripas de todos los modos, y en cuanto un modo añadía un temporizador
   nuevo había que acordarse de tocar también modeLauncher.js (cosa que ya
   había pasado: roundTimer/nightTimeout de Zoroarks, turnTimeout de
   Voltorb, eyes.countdownInterval de la Zona Safari... seguían corriendo
   después de salir al menú, incluidos los pitidos de cuenta atrás, y
   quedaban dos campos -bossAttackTimer, zoneTimeoutId- que ya no existían
   en ningún modo).

   Ahora cada modo declara su propia limpieza justo después de crear su
   state.modeState, con registerModeCleanup(), y backToMenu() solo llama a
   runModeCleanup(). Como red de seguridad, runModeCleanup() además barre
   automáticamente cualquier campo de modeState cuyo nombre acabe en
   Timer/Timeout/Interval (o su plural) y contenga un id de temporizador,
   así que un temporizador nuevo que siga la convención de nombres del
   proyecto queda cubierto sin tocar nada más.
   ========================================================= */

// Campo interno donde se acumulan las funciones de limpieza del modo en
// curso. Va colgado del propio modeState (y no de un array de módulo) a
// propósito: cada partida crea un modeState nuevo, así que al reiniciar un
// modo ("Nueva Partida") la lista se vacía sola sin poder arrastrar
// callbacks de la partida anterior.
const CLEANUP_KEY = '__cleanups';

// Registra una función que se ejecutará al abandonar el modo (volver al
// menú). Pensada para llamarse desde el startXxx() de cada modo, justo
// después de asignar state.modeState. Si en ese momento no hay modeState
// no hace nada.
export function registerModeCleanup(fn) {
  const ms = state.modeState;
  if (!ms || typeof fn !== 'function') return;
  if (!ms[CLEANUP_KEY]) ms[CLEANUP_KEY] = [];
  ms[CLEANUP_KEY].push(fn);
}

// Envoltorios de setTimeout/setInterval para temporizadores que NO se
// guardan en ningún campo de modeState (los típicos "quita esta clase
// dentro de 400ms", "pasa a la siguiente pregunta dentro de 1,5s"...).
// Hacen dos cosas que el setTimeout pelado no hacía:
//   1. registran su cancelación, así que salir al menú los mata;
//   2. comprueban antes de ejecutarse que sigue activo EL MISMO modeState
//      con el que se programaron, para que un callback rezagado no toque
//      un estado ya destruido (era la causa del TypeError al salir al menú
//      justo después de acertar una letra en Pasapalabra).
export function modeSetTimeout(fn, delayMs) {
  const ms = state.modeState;
  const id = setTimeout(() => {
    if (state.modeState !== ms) return;
    fn();
  }, delayMs);
  registerModeCleanup(() => clearTimeout(id));
  return id;
}

export function modeSetInterval(fn, delayMs) {
  const ms = state.modeState;
  const id = setInterval(() => {
    if (state.modeState !== ms) return;
    fn();
  }, delayMs);
  registerModeCleanup(() => clearInterval(id));
  return id;
}

// Nombres de campo que se consideran temporizadores en el barrido
// automático de más abajo (ms.timer, ms.nextRoundTimeout,
// ms.turnTickInterval, ms.fallTimeouts, ms.eyes.countdownInterval...).
const TIMER_KEY_RE = /(timer|timeout|interval)s?$/i;

function clearTimerValue(value) {
  // No se sabe si el id venía de setTimeout o de setInterval, y en los
  // navegadores comparten espacio de ids: limpiar por las dos vías es
  // inofensivo y evita tener que distinguirlos.
  if (typeof value === 'number') {
    clearTimeout(value);
    clearInterval(value);
    return;
  }
  if (Array.isArray(value)) value.forEach(clearTimerValue);
}

// ¿Es un objeto "normal" en el que merece la pena entrar? Se excluyen
// nodos del DOM, sprites, Set/Map/Array y cualquier instancia de clase,
// para no recorrer estructuras enormes ni tocar objetos con getters.
function isPlainObject(value) {
  return !!value
    && typeof value === 'object'
    && (value.constructor === Object || Object.getPrototypeOf(value) === null);
}

function sweepTimers(obj, depth) {
  Object.keys(obj).forEach(key => {
    if (key === CLEANUP_KEY) return;
    const value = obj[key];
    if (TIMER_KEY_RE.test(key)) {
      clearTimerValue(value);
      return;
    }
    if (depth > 0 && isPlainObject(value)) sweepTimers(value, depth - 1);
  });
}

// Ejecuta toda la limpieza del modo activo: primero lo que haya declarado
// el propio modo, después el barrido automático de temporizadores. No
// toca state.modeState: de eso se encarga quien llama (backToMenu).
export function runModeCleanup() {
  const ms = state.modeState;
  if (!ms) return;
  const fns = ms[CLEANUP_KEY] || [];
  ms[CLEANUP_KEY] = [];
  fns.forEach(fn => {
    // Una limpieza que falle (un sprite ya destruido, un nodo ya fuera del
    // DOM...) no debe impedir que se ejecuten las demás.
    try { fn(); } catch (e) { /* noop */ }
  });
  // Profundidad 1 = se revisan los campos de modeState y los de sus
  // objetos planos directos (ms.eyes.countdownInterval,
  // ms.venusaur.wanderTimeout, ms.afkVote.tickInterval...). Lo que quede
  // más adentro (p.ej. ms.fieldSprites[usuario].arriveTimeout) lo declara
  // explícitamente su modo con registerModeCleanup.
  sweepTimers(ms, 1);
}
