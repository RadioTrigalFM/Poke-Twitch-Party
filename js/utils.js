import { currentFullscreenElement } from './fullscreen.js';
import { state } from './state.js';

/* =========================================================
   UTILITIES
   ========================================================= */
export function $(id) { return document.getElementById(id); }
export function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}
export function toast(msg, duration = 2500) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, duration);
}
// El modal (#modal) vive al final del <body>, fuera de cualquier
// .game-scene. Cuando una escena está en pantalla completa (nativa o
// simulada), el navegador solo pinta lo que cuelga de ese elemento, así
// que un modal "hijo de body" se queda invisible aunque tenga z-index alto.
// Para poder abrir el pasaporte (u otro modal) mientras se juega en
// pantalla completa, lo movemos dentro de la escena activa justo antes de
// mostrarlo, y lo devolvemos a <body> en cuanto se sale de pantalla
// completa (ver eventListeners.js).
export function relocateModal() {
  const modal = $('modal');
  if (!modal) return;
  const target = currentFullscreenElement() || document.body;
  if (modal.parentElement !== target) target.appendChild(modal);
}

// Complemento de relocateModal: al salir de pantalla completa, devuelve el
// modal a <body> si se había movido dentro de #game-content mientras
// estaba en pantalla completa (ver el comentario de relocateModal). Lo
// usan los distintos modos de juego al cerrar su escena.
export function detachModalFromGameContent() {
  const modal = $('modal');
  const content = $('game-content');
  if (modal && content && content.contains(modal)) {
    document.body.appendChild(modal);
  }
}

// `wide`: usa la variante ancha (.modal--wide) del modal genérico, para
// contenido más denso de lo habitual (p.ej. el panel informativo del
// Token OAuth). Como el modal es un único elemento reutilizado por todos
// los modales del juego, esta clase se resetea en cada llamada -si no,
// un modal ancho dejaría "contagiada" esa anchura al siguiente modal
// normal que se abra después-.
export function showModal(title, body, actions = [], { wide = false } = {}) {
  relocateModal();
  $('modal-title').textContent = title;
  $('modal-body').innerHTML = body;
  const actionsEl = $('modal-actions');
  actionsEl.innerHTML = '';
  actions.forEach(a => {
    const b = document.createElement('button');
    b.className = a.class || 'btn-primary';
    b.textContent = a.label;
    b.onclick = () => { $('modal').classList.remove('show'); a.onClick && a.onClick(); };
    actionsEl.appendChild(b);
  });
  const modalEl = document.querySelector('#modal .modal');
  if (modalEl) modalEl.classList.toggle('modal--wide', wide);
  $('modal').classList.add('show');
}
export function addScore(user, points) {
  state.scores[user] = (state.scores[user] || 0) + points;
}
// Quita tildes/diacríticos para poder comparar respuestas con o sin acentos
// (p.ej. "pikachu" debe aceptarse igual que "pikáchu").
export function normalizeAnswer(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
export function getRanking() {
  return Object.entries(state.scores)
    .map(([u,s]) => ({ user: u, score: s }))
    .sort((a,b) => b.score - a.score);
}
export function renderRanking(container, limit = 10, title = '🏆 Ranking') {
  const ranking = getRanking().slice(0, limit);
  container.innerHTML = `<div class="ranking-title">${title}</div>`;
  if (ranking.length === 0) {
    container.innerHTML += '<p style="font-size:12px;color:var(--muted);text-align:center;padding:10px;">Sin puntuaciones aún</p>';
    return;
  }
  ranking.forEach((r, i) => {
    const row = document.createElement('div');
    row.className = 'ranking-row' + (i === 0 ? ' gold' : i === 1 ? ' silver' : i === 2 ? ' bronze' : '');
    row.innerHTML = `
      <span class="ranking-pos">${i+1}</span>
      <span class="ranking-name">@${r.user}</span>
      <span class="ranking-score">${r.score} pts</span>
    `;
    container.appendChild(row);
  });
}
