import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/* =========================================================
   CACHE BUSTING AUTOMÁTICO
   -----------------------------------------------------------
   index.html cargaba sus dos ficheros grandes con un número de versión
   puesto a mano (css/styles.css?v=24, js/bundle.js?v=66). Eso obligaba a
   acordarse de subir el número en cada despliegue y, si se olvidaba, los
   espectadores -y sobre todo el Browser Source de OBS, que cachea con
   ganas- seguían usando la versión vieja sin que nadie se enterara.

   Este script corre al final de `npm run build` y sustituye ese número por
   los 8 primeros caracteres del hash SHA-1 del propio fichero. Así el
   valor cambia exactamente cuando cambia el contenido: si no has tocado el
   CSS su URL no cambia y el navegador se ahorra la descarga; si lo has
   tocado, la URL cambia sola y nadie se queda con la copia antigua.
   ========================================================= */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Ficheros a versionar, tal y como aparecen en el href/src de index.html.
const ASSETS = ['css/styles.css', 'js/bundle.js'];

function shortHash(path) {
  return createHash('sha1').update(readFileSync(path)).digest('hex').slice(0, 8);
}

function escapeForRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const indexPath = resolve(root, 'index.html');
let html = readFileSync(indexPath, 'utf8');
const changed = [];

for (const asset of ASSETS) {
  const hash = shortHash(resolve(root, asset));
  // Captura la ruta del asset con o sin "?v=..." detrás, para que funcione
  // tanto la primera vez (con los números a mano que aún estuvieran
  // puestos) como en cada build posterior, sin encadenar sufijos.
  const re = new RegExp(escapeForRegExp(asset) + '(\\?v=[^"\']*)?', 'g');
  const before = html;
  html = html.replace(re, `${asset}?v=${hash}`);
  if (html !== before) changed.push(`${asset} -> ?v=${hash}`);
}

writeFileSync(indexPath, html);
console.log('index.html actualizado:\n  ' + (changed.join('\n  ') || 'sin cambios'));
