# Desarrollo y build

El juego se sirve como HTML estático (`index.html`), pero todo el código de
`js/` está escrito como módulos ES separados (`js/main.js`, `js/modes/*.js`,
etc.) que se compilan en un único fichero `js/bundle.js` con **esbuild**.
`index.html` solo carga `js/bundle.js`, así que cualquier cambio en los
módulos fuente no se verá reflejado en el juego hasta que se regenere ese
bundle.

## Primer uso

Necesitas Node.js instalado. Luego, en la carpeta del proyecto:

```bash
npm install
```

## Compilar para publicar

```bash
npm run build
```

Hace dos cosas:

1. Regenera `js/bundle.js` a partir de `js/main.js` y todo lo que importa,
   **minificado** (unos 1,5 MB en vez de 2,2 MB; con gzip del servidor,
   ~240 KB).
2. Ejecuta `tools/stamp-assets.mjs`, que reescribe en `index.html` el
   `?v=...` de `css/styles.css` y `js/bundle.js` con un hash del contenido
   del propio fichero. Antes esos números se subían a mano y era fácil
   olvidarlo: el navegador (y sobre todo el Browser Source de OBS, que
   cachea con ganas) se quedaba con la versión antigua. Ahora la URL cambia
   sola cuando cambia el fichero, y no cambia si no lo has tocado.

Es idempotente: si vuelves a lanzarlo sin cambiar nada, dice "sin cambios".

## Regenerar automáticamente al guardar (modo watch)

```bash
npm run watch
```

Deja este comando corriendo en una terminal mientras editas: esbuild vigila
todos los ficheros de `js/` y reescribe `js/bundle.js` cada vez que guardas
un cambio. Solo tienes que refrescar el navegador (o usar la extensión
"Live Server" de tu editor / cualquier servidor estático con auto-reload)
para ver el resultado.

Ojo: `watch` **no** minifica ni actualiza el `?v=` de `index.html` (sería
absurdo hacerlo en cada pulsación). Como el `?v=` sigue apuntando al último
`npm run build`, durante el desarrollo refresca con **Ctrl+F5** o con la
casilla "Disable cache" de las herramientas de desarrollo abierta. Antes de
publicar, lanza siempre `npm run build`.

## Comprobar el código

```bash
npm run lint
```

Pasa ESLint (`eslint.config.mjs`) sobre `js/` y `tools/`. No impone estilo
(ni comillas, ni punto y coma, ni sangrado): solo busca errores reales
—variables que no existen, claves duplicadas, código inalcanzable, `case`
que se cuelan al siguiente, asignaciones dentro de un `if`, variables sin
usar—. Conviene lanzarlo antes de cada `npm run build`.

## Jugar

No hace falta un servidor especial: basta con abrir `index.html` en el
navegador (o servir la carpeta con cualquier servidor estático) una vez
`js/bundle.js` esté generado.
