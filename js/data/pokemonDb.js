/* =========================================================
   POKÉMON DATABASE
   -----------------------------------------------------------
   Este fichero solo conserva getPokemonSprite(): la tabla completa de
   Pokémon que había aquí (POKEMON_DB, ~25 entradas con estadísticas y
   movimientos) quedó sustituida hace tiempo por ARENA_POKEMON_DB
   (data/arenaPokemonDb.js, con toda la Pokédex Nacional) y ya no la
   importaba nadie, igual que la tabla TYPE_COLORS que la acompañaba
   -duplicada, y esa sí en uso, como BOSS_TYPE_COLORS en modes/boss.js-.
   ========================================================= */

// URL del sprite oficial de un Pokémon por su número de Pokédex Nacional.
// Es el sprite "de ficha" (el de PokeAPI), no el sprite animado PMD que
// usan los modos de juego para mover a los Pokémon por el mapa (ese vive
// en pmdSprite.js).
export function getPokemonSprite(id) {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
}
