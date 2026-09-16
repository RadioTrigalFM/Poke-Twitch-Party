import { $, showModal } from './utils.js';

/* =========================================================
   PANEL INFORMATIVO DEL TOKEN OAUTH
   -----------------------------------------------------------
   Accesible desde el icono "?" junto a la etiqueta "OAuth Token
   (opcional)" de la pantalla de conexión (#connect-screen). Es un modal
   de solo lectura (reutiliza el modal genérico de utils.js, showModal)
   que explica qué es el token, cómo se usa paso a paso, avisa de que no
   debe compartirse, y muestra ejemplos reales de los mensajes que el
   propio juego envía al chat de Twitch cuando el token está activo, modo
   por modo. El contenido reutiliza las clases .howto-* del módulo "Cómo
   Jugar" (howToPlay.js) para que se vea consistente con el resto del
   juego, dentro de un modal más ancho (.modal--wide) y con scroll propio
   (.oauth-info-body) al ser bastante más largo que el resto de modales.
   ========================================================= */

// Ejemplos reales de mensajes que el juego manda al chat de Twitch (vía
// addChatMessage(..., { mirror: true }, el valor por defecto) cuando hay
// un Token OAuth activo con permiso de escritura (chat:edit). Se han
// tomado literalmente del código de cada modo (js/modes/*.js), sustituyendo
// solo las partes dinámicas (nombres, números...) por placeholders entre
// corchetes. No es la lista completa de cada modo -algunos generan
// decenas de avisos distintos-, solo los más representativos: el aviso de
// apertura del lobby y el resultado final de la partida.
const MODE_MESSAGES = [
  { key: 'pasapalabra', name: '🎯 Pasapalabra', lines: [
    '🔒 El streamer ha bloqueado la participación del chat: los comandos (!<respuesta>, !puntos...) dejan de funcionar hasta que se reactive.',
  ] },
  { key: 'rayosolar', name: '☀️ Rayo Solar', lines: [
    '☀️ ¡Rayo Solar está abierto! Escribe !pokemon [nombre] para apuntarte. ¡Disponible toda la Pokédex Nacional (XXXX Pokémon)!',
    '🏆 ¡@[usuario] gana Rayo Solar con [Pokémon]!',
  ] },
  { key: 'arena', name: '⚔️ Arena Pokémon', lines: [
    '🏛️ ¡Coliseo abierto! Escribe !pokemon [nombre] para hacer cola. ¡Disponible toda la Pokédex Nacional (XXXX Pokémon)!',
    '🏆 ¡@[usuario] gana su combate y avanza en el Torneo!',
    '🏆👑 ¡@[usuario] es el CAMPEÓN DEL TORNEO!',
  ] },
  { key: 'zoroarks', name: '🦊 Zoroarks', lines: [
    '🦊 ¡Zoroarks abierto! Escribe !participo para apuntarte',
    '🏆 ¡Gana el pueblo! @[usuario], @[usuario]... era(n) hombre lobo.',
  ] },
  { key: 'safari', name: '🌿 Zona Safari', lines: [
    '🌿 ¡Zona Safari abierta! Escribe !pokemon [nombre] para apuntarte. ¡Disponible toda la Pokédex Nacional (XXXX Pokémon)!',
    '🏆 ¡@[usuario], @[usuario]... sobreviven a la Zona Safari!',
  ] },
  { key: 'boss', name: '👹 Boss Cooperativo', lines: [
    '👹 ¡[Jefe] os espera en el Nivel [N], Fase 1/15! Escribe !pokemon [nombre] para apuntarte a la lucha (máx. 16, toda la Pokédex Nacional disponible).',
    '🏆 ¡[Jefe] ha sido derrotado! MVP: @[usuario] con [X] de daño. ¡Repartidas recompensas!',
  ] },
  { key: 'pokerus', name: '🧬 Pokerus', lines: [
    '🧬 ¡Modo Pokerus abierto! Escribe !pokemon [nombre] para apuntarte (¡disponible toda la Pokédex Nacional, XXXX Pokémon!)',
    '💚 ¡El Pokerus ha sido erradicado! Sobreviven [N] jugadores',
  ] },
  { key: 'volcan', name: '🌋 El Volcán', lines: [
    '🌋 ¡El Volcán está abierto! Escribe !pokemon [nombre] para apuntarte. ¡Disponible toda la Pokédex Nacional (XXXX Pokémon)!',
    '🏆 ¡@[usuario] gana El Volcán con [Pokémon]!',
  ] },
  { key: 'vistalince', name: '🦅 Vista Lince', lines: [
    '🦅 ¡Vista Lince abierto! Escribe !participo para apuntarte',
    '🏆 ¡@[usuario] gana gracias a su vista de lince!',
  ] },
  { key: 'extranjeria', name: '🛂 Control de Extranjería', lines: [
    '🛂 ¡Control de Extranjería abierto! Escribe !participo para ponerte en la cola',
    '✅ @[usuario] ha sido admitido en el país / ⛔ ha sido rechazado en la frontera',
  ] },
  { key: 'voltorb', name: '💣 Voltorb Explosivo', lines: [
    '💣 ¡Voltorb Explosivo abierto! Escribe !participo para apuntarte (máx. 24 jugadores)',
    '🏆 ¡@[usuario] gana Voltorb Explosivo siendo el último en pie!',
  ] },
  { key: 'avalugg', name: '❄️ Glaciar de Avalugg', lines: [
    '❄️ ¡Glaciar de Avalugg abierto! Escribe !participo para apuntarte',
    '🏆 ¡@[usuario] gana Glaciar de Avalugg!',
  ] },
];

function renderModeMessagesGrid() {
  return MODE_MESSAGES.map(m => `
    <div class="oauth-mode-msg-card">
      <div class="oauth-mode-msg-name">${m.name}</div>
      ${m.lines.map(l => `<div class="oauth-mode-msg-line">${l}</div>`).join('')}
    </div>
  `).join('');
}

function renderOAuthInfoBody() {
  return `
    <div class="oauth-info-body">
      <p class="howto-intro">
        El Token OAuth es una credencial que te da Twitch para autorizar a una cuenta a leer y escribir en el chat de tu canal en tu nombre. Sin token, PokéTwitch Party solo puede <b>leer</b> el chat para procesar los comandos de los espectadores; con un token con permiso <code>chat:edit</code>, el juego actúa además como un bot que <b>escribe</b> en tu chat real de Twitch (aperturas de lobby, resultados de la partida, avisos...). Es completamente opcional: el juego funciona igual sin él, la única diferencia es que esos mensajes solo se verán en esta pantalla y no en el chat de Twitch.
      </p>

      <div class="howto-block">
        <h3 class="howto-subtitle">📋 Paso a paso para usarlo</h3>
        <div class="howto-cycle">
          <div class="howto-cycle-step">
            <div class="howto-cycle-num">1</div>
            <div class="howto-cycle-icon">🌐</div>
            <div class="howto-cycle-label">Genera el token</div>
            <div class="howto-cycle-desc">Entra en twitchtokengenerator.com, inicia sesión con la cuenta que quieras usar como bot (la tuya o una aparte) y genera un token marcando los scopes "chat:read" y "chat:edit".</div>
          </div>
          <div class="howto-cycle-arrow">→</div>
          <div class="howto-cycle-step">
            <div class="howto-cycle-num">2</div>
            <div class="howto-cycle-icon">📋</div>
            <div class="howto-cycle-label">Cópialo entero</div>
            <div class="howto-cycle-desc">Copia el token completo, incluido el prefijo "oauth:", y pégalo en el campo "Token OAuth (opcional)" de esta pantalla junto al nombre de tu canal.</div>
          </div>
          <div class="howto-cycle-arrow">→</div>
          <div class="howto-cycle-step">
            <div class="howto-cycle-num">3</div>
            <div class="howto-cycle-icon">🔌</div>
            <div class="howto-cycle-label">Conecta</div>
            <div class="howto-cycle-desc">Pulsa "Conectar y Jugar". El juego valida el token contra Twitch y avisa si está caducado, es inválido o le falta algún permiso.</div>
          </div>
          <div class="howto-cycle-arrow">→</div>
          <div class="howto-cycle-step">
            <div class="howto-cycle-num">4</div>
            <div class="howto-cycle-icon">🤖</div>
            <div class="howto-cycle-label">Juega</div>
            <div class="howto-cycle-desc">A partir de ahí, los avisos y resultados que genera cada modo se envían también, automáticamente, al chat real de Twitch como si los escribiera esa cuenta.</div>
          </div>
        </div>
      </div>

      <div class="oauth-info-warning">
        <div class="oauth-info-warning-icon">⚠️</div>
        <p class="oauth-info-warning-text">
          <b>No muestres ni compartas tu Token OAuth con nadie</b> (ni en pantalla, ni en clips, ni por chat o Discord). Quien lo tenga puede escribir en el chat de esa cuenta como si fuera ella. Si crees que alguien lo ha visto, genera uno nuevo en twitchtokengenerator.com: eso invalida el anterior.
        </p>
      </div>

      <div class="howto-block">
        <h3 class="howto-subtitle">💬 Mensajes que se envían con el Token activo, por modo</h3>
        <div class="oauth-mode-msg-grid">${renderModeMessagesGrid()}</div>
      </div>
    </div>
  `;
}

// Cablea el icono "?" de la pantalla de conexión. Se llama una sola vez al
// cargar el módulo (ver el import en eventListeners.js), igual que el
// resto de listeners de pantallas que no cambian de estado del juego.
export function initOAuthInfo() {
  const btn = $('oauth-info-btn');
  if (!btn) return;
  btn.onclick = () => {
    showModal('🔑 Token OAuth', renderOAuthInfoBody(), [
      { label: 'Cerrar', class: 'btn-primary' },
    ], { wide: true });
  };
}
