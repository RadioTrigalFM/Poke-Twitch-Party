import globals from 'globals';

/* =========================================================
   CONFIGURACIÓN DE ESLINT
   -----------------------------------------------------------
   `npm run lint`. Está deliberadamente ajustada a lo que ya escribe el
   proyecto (no impone estilo: ni comillas, ni punto y coma, ni sangrado),
   solo busca errores reales: variables que no existen, claves duplicadas
   en un objeto, código inalcanzable, casos de switch que se cuelan al
   siguiente, asignaciones dentro de un if... Es el tipo de red que habría
   avisado, por ejemplo, de que modeLauncher.js seguía limpiando dos
   campos (bossAttackTimer, zoneTimeoutId) que ya no existían en ningún
   modo.

   Los "avisos" (warn) no rompen el comando; los "errores" sí, para poder
   encadenarlo a un build o a un hook de git más adelante si interesa.
   ========================================================= */
export default [
  {
    ignores: ['js/bundle.js', 'node_modules/**'],
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'no-undef': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-dupe-else-if': 'error',
      'no-duplicate-case': 'error',
      'no-unreachable': 'error',
      'no-self-compare': 'error',
      'no-fallthrough': 'error',
      'no-cond-assign': 'error',
      'no-func-assign': 'error',
      'no-import-assign': 'error',
      'no-async-promise-executor': 'error',
      'no-constant-condition': 'warn',
      'no-sparse-arrays': 'warn',
      'no-loss-of-precision': 'warn',
      'require-atomic-updates': 'warn',
      // Los catch vacíos con `catch (e) { /* noop */ }` son un patrón
      // habitual y deliberado del proyecto (localStorage no disponible,
      // sprite ya destruido...), así que no se avisa de ellos.
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
    },
  },
];
