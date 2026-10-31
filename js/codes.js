import { state } from './state.js';
import { $, normalizeAnswer, toast } from './utils.js';

/* =========================================================
   CÓDIGOS (Ajustes)
   -----------------------------------------------------------
   Cuadro de texto de la pantalla de Ajustes donde el streamer puede
   introducir códigos secretos. Cada código desbloquea un modo de juego,
   que pasa a aparecer en la pantalla de selección de modo (las tarjetas
   con data-unlock="<modo>" en index.html están ocultas hasta entonces),
   o bien una función oculta (kind: 'feature'), como el botón de debug del
   Boss Cooperativo (código "wawidebug", ver BOSS_DEBUG_FLAG).
   Los desbloqueos se guardan en localStorage, así que se conservan entre
   sesiones, igual que el resto de preferencias de Ajustes.
   ========================================================= */

const UNLOCKS_STORAGE_KEY = 'pokekukoro_unlocked_modes';

// Marca (guardada junto a los modos desbloqueados, en state.unlockedModes)
// que indica que el botón de debug del Boss Cooperativo está desbloqueado
// (ver isBossDebugUnlocked y openBossDebugPanel en boss.js). No corresponde
// a ninguna tarjeta del menú, así que syncUnlockedModeCards la ignora.
const BOSS_DEBUG_FLAG = 'bossdebug';

// Marca que indica que la canción alternativa «Taza» de La Charca está
// desbloqueada (código "soyunataza", ver isCharcaTazaUnlocked y charca.js).
// Igual que BOSS_DEBUG_FLAG, no corresponde a ninguna tarjeta del menú.
const CHARCA_TAZA_FLAG = 'charcataza';

// Evento que se lanza sobre document cada vez que un código desbloquea algo
// nuevo, para que las pantallas ya abiertas (p.ej. el Boss en pleno combate)
// se actualicen al momento sin tener que reiniciarse.
export const UNLOCKS_CHANGED_EVENT = 'pk-unlocks-changed';

// código (normalizado: sin tildes ni mayúsculas) -> lo que desbloquea.
// kind: 'feature' = función oculta en vez de un modo de juego.
const CODES = {
  shinycolo: { mode: 'charca', label: 'La Charca' },
  wawidebug: { mode: BOSS_DEBUG_FLAG, label: 'Debug del Boss Cooperativo', kind: 'feature' },
  soyunataza: { mode: CHARCA_TAZA_FLAG, label: 'Canción «Taza» de La Charca', kind: 'feature' },
};

export function isCharcaTazaUnlocked() {
  return state.unlockedModes.has(CHARCA_TAZA_FLAG);
}

export function isBossDebugUnlocked() {
  return state.unlockedModes.has(BOSS_DEBUG_FLAG);
}

function loadUnlockedModes() {
  try {
    const raw = JSON.parse(localStorage.getItem(UNLOCKS_STORAGE_KEY) || '[]');
    if (Array.isArray(raw)) raw.forEach(m => state.unlockedModes.add(String(m)));
  } catch (e) {
    // localStorage puede no estar disponible o contener algo ilegible
  }
}

function saveUnlockedModes() {
  try {
    localStorage.setItem(UNLOCKS_STORAGE_KEY, JSON.stringify([...state.unlockedModes]));
  } catch (e) {
    // ignoramos si no se puede persistir
  }
}

// Muestra u oculta en el menú las tarjetas de modos secretos según lo
// desbloqueado.
function syncUnlockedModeCards() {
  document.querySelectorAll('.mode-card[data-unlock]').forEach(card => {
    card.classList.toggle('mode-locked', !state.unlockedModes.has(card.dataset.unlock));
  });
}

function showCodeFeedback(text, kind) {
  const el = $('code-feedback');
  if (!el) return;
  el.textContent = text;
  el.className = 'code-feedback is-visible ' + kind;
}

function submitCode() {
  const input = $('code-input');
  if (!input) return;
  const typed = normalizeAnswer(input.value);
  if (!typed) {
    showCodeFeedback('Escribe un código primero.', 'is-error');
    return;
  }
  const entry = CODES[typed];
  if (!entry) {
    showCodeFeedback('❌ Código no válido.', 'is-error');
    return;
  }
  input.value = '';
  const isFeature = entry.kind === 'feature';
  if (state.unlockedModes.has(entry.mode)) {
    showCodeFeedback(isFeature
      ? `ℹ️ Ya tenías desbloqueado: ${entry.label}.`
      : `ℹ️ Ya tenías desbloqueado el modo «${entry.label}».`, 'is-info');
    return;
  }
  state.unlockedModes.add(entry.mode);
  saveUnlockedModes();
  syncUnlockedModeCards();
  document.dispatchEvent(new CustomEvent(UNLOCKS_CHANGED_EVENT));
  showCodeFeedback(isFeature
    ? `✅ ¡Código aceptado! Desbloqueado: ${entry.label}.`
    : `✅ ¡Código aceptado! Nuevo modo de juego desbloqueado: «${entry.label}».`, 'is-ok');
  toast(isFeature ? `🔓 Desbloqueado: ${entry.label}` : `🔓 Modo desbloqueado: ${entry.label}`);
}

export function initCodes() {
  loadUnlockedModes();
  syncUnlockedModeCards();
  const btn = $('code-accept-btn');
  const input = $('code-input');
  if (btn) btn.onclick = submitCode;
  if (input) {
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submitCode(); });
    input.addEventListener('input', () => {
      const el = $('code-feedback');
      if (el) el.className = 'code-feedback';
    });
  }
}
