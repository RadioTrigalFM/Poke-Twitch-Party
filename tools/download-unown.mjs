/* =========================================================
   DESCARGA DE LOS SPRITES DE UNOWN
   -----------------------------------------------------------
   Genera assets/pasapalabra/unown/unown-<letra>.png (a-z, sin ñ: el
   propio Pokémon Unown no tiene esa forma) a partir de los sprites
   oficiales que sirve el repositorio de PokeAPI, la misma fuente que ya
   usa el proyecto en otros sitios (ver getPokemonSprite en
   data/pokemonDb.js). Son los sprites que se ven en el centro del rosco
   de Pasapalabra (ver #pp-unown / updatePpUnown en modes/pasapalabra.js),
   cambiando según la letra que esté activa en cada momento.

   No hace falta ejecutarlo para jugar -las 26 imágenes ya están
   incluidas en el proyecto- ni forma parte de `npm run build`. Está aquí
   solo por si algún día hiciera falta volver a descargarlas (p.ej. si
   PokeAPI cambia sus rutas, o si se quisiera probar otra variante:
   shiny, versión de otro juego...).

   Uso: node tools/download-unown.mjs
   ========================================================= */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'assets/pasapalabra/unown');
mkdirSync(outDir, { recursive: true });

const BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');

// La forma "a" es la variante por defecto de la especie (id 201, sin
// sufijo); el resto de formas van como "201-<letra>.png" (ver
// pokeapi.co/api/v2/pokemon-form/{id}, forms 10001..10025 para b..z).
function urlFor(letter) {
  return letter === 'a' ? `${BASE}/201.png` : `${BASE}/201-${letter}.png`;
}

for (const letter of LETTERS) {
  const res = await fetch(urlFor(letter));
  if (!res.ok) throw new Error(`Fallo al descargar la letra ${letter}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(resolve(outDir, `unown-${letter}.png`), buf);
  console.log(`unown-${letter}.png (${buf.length} bytes)`);
}
console.log('Listo: 26 sprites en assets/pasapalabra/unown/');
