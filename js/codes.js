import { state } from './state.js';
import { $, normalizeAnswer, toast } from './utils.js';

/* =========================================================
   CÓDIGOS (Ajustes)
   -----------------------------------------------------------
   Cuadro de texto de la pantalla de Ajustes donde el streamer puede
   introducir códigos secretos. Cada código desbloquea un modo de juego,
   que pasa a aparecer en la pantalla de selección de modo (las tarjetas
   con data-unlock="<modo>" en index.html están ocultas hasta entonces).
   Los desbloqueos se guardan en localStorage, así que se conservan entre
   sesiones, igual que el resto de preferencias de Ajustes.
   ========================================================= */

const UNLOCKS_STORAGE_KEY = 'pokekukoro_unlocked_modes';

// código (normalizado: sin tildes ni mayúsculas) -> modo que desbloquea.
const CODES = {
  shinycolo: { mode: 'charca', label: 'La Charca' },
};

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
  if (state.unlockedModes.has(entry.mode)) {
    showCodeFeedback(`ℹ️ Ya tenías desbloqueado el modo «${entry.label}».`, 'is-info');
    return;
  }
  state.unlockedModes.add(entry.mode);
  saveUnlockedModes();
  syncUnlockedModeCards();
  showCodeFeedback(`✅ ¡Código aceptado! Nuevo modo de juego desbloqueado: «${entry.label}».`, 'is-ok');
  toast(`🔓 Modo desbloqueado: ${entry.label}`);
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
